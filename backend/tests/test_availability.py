"""Metric availability (M8) — the windows, and the mirror that must not drift.

Project scope reaches back to 1999, but the data does not arrive all at once. Two
tables describe that: ``pipeline/availability.py`` decides what gets *stored*, and
``app/availability.py`` decides what the UI *offers*. They are separate because the
pipeline and the API are separate deployables, which is exactly the arrangement that
lets them drift — and a drift is silent in both directions. Either the UI offers a
metric that is always empty, or it hides one that has data.

These tests are cheap and need no database, which is the point: the invariant is about
two Python tables agreeing, and it should fail in CI the moment someone edits one of
them alone.
"""

import importlib.util
import sys
from pathlib import Path

import pytest

from app.availability import METRIC_AVAILABILITY, Availability, intersect
from app.metrics import REGISTRY, REGISTRY_BY_ID

SEASONS = range(1999, 2027)
PIPELINE_DIR = Path(__file__).resolve().parents[2] / "pipeline"


def _load_pipeline_availability():
    """Import pipeline/availability.py without importing the pipeline's dependencies.

    The module imports ``seasons``, which imports nflreadpy — a pipeline dependency the
    API environment does not have. Only ``PARTICIPATION.latest()`` is used from it, so a stub
    stands in: this test is about the windows agreeing, not about nflreadpy.
    """
    if "seasons" not in sys.modules:
        stub = type(sys)("seasons")

        class _Participation:
            @staticmethod
            def latest() -> int:
                return 9999  # the ceiling is asserted separately, from data

        stub.PARTICIPATION = _Participation()
        sys.modules["seasons"] = stub

    spec = importlib.util.spec_from_file_location(
        "pipeline_availability", PIPELINE_DIR / "availability.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pipeline_availability = _load_pipeline_availability()


class TestMirror:
    """The pipeline's table and the API's must describe the same seasons."""

    def test_every_stored_column_agrees(self):
        """No stored column may be available in one table and not the other.

        Columns whose ceiling is resolved from the database at request time are
        compared on their floor only — the static table deliberately does not know
        where a discontinued feed stopped.
        """
        disagreements = []
        for column, window in pipeline_availability.COLUMN_AVAILABILITY.items():
            api_window = METRIC_AVAILABILITY.get(column)
            if api_window is None:
                disagreements.append(f"{column}: missing from the API table entirely")
                continue
            for season in SEASONS:
                stored = window.covers(season)
                offered = api_window.covers(season)
                if stored == offered:
                    continue
                # A discontinued feed's ceiling is filled in from data by the router.
                if api_window.data_ceiling_column and not stored:
                    continue
                disagreements.append(
                    f"{column} in {season}: pipeline stores={stored}, API offers={offered}"
                )
        assert not disagreements, "availability tables have drifted:\n" + "\n".join(
            disagreements
        )

    def test_api_extras_are_derived_metrics_only(self):
        """Anything in the API table but not the pipeline's must not be a stored column.

        The API table also covers metrics computed at query time (expected points, the
        Insight scores), which have no column to store. What it must never contain is a
        stored column the pipeline has forgotten to mask.
        """
        stored_columns = set(pipeline_availability.COLUMN_AVAILABILITY)
        for metric_id in set(METRIC_AVAILABILITY) - stored_columns:
            metric = REGISTRY_BY_ID.get(metric_id)
            assert metric is not None, f"{metric_id} is not in the registry"
            assert metric.aggregation not in ("sum", "avg"), (
                f"{metric_id} is a stored column ({metric.aggregation}) that the API "
                "restricts but the pipeline does not mask"
            )


class TestWindows:
    """The measured facts themselves, so a careless edit has to argue with a test."""

    @pytest.mark.parametrize(
        "metric_id, season, expected",
        [
            # The receiver blackout: play-by-play names a receiver only on completions
            # from 2003 to 2008. ffopportunity looks like it can rescue 2006-2008 and
            # cannot — its rec_attempt just equals receptions there.
            ("targets", 2002, True),
            ("targets", 2003, False),
            ("targets", 2006, False),
            ("targets", 2008, False),
            ("targets", 2009, True),
            # Charting starts in 2006 at the passer, but receiving air yards also need
            # a receiver on incompletions.
            ("cpoe", 2005, False),
            ("cpoe", 2006, True),
            ("air_yards", 2006, False),
            ("air_yards", 2009, True),
            # Complete for the whole range: rusher ids never broke, and a completion
            # always names its receiver.
            ("rushing_yards", 1999, True),
            ("receiving_yards", 2004, True),
            ("receptions", 2004, True),
            ("fantasy_points", 1999, True),
            ("epa", 1999, True),
            ("vorp", 1999, True),
            # Later feeds.
            ("snap_count", 2012, False),
            ("snap_count", 2013, True),
            ("routes_run", 2015, False),
            ("routes_run", 2016, True),
        ],
    )
    def test_measured_window(self, metric_id, season, expected):
        from app.availability import available

        assert available(metric_id, season) is expected

    def test_derived_metrics_inherit_their_inputs(self):
        """A composite may never claim a season one of its inputs does not have."""
        composite = REGISTRY_BY_ID["high_value_touches_per_game"]
        # red_zone_targets carries the receiver blackout; the composite must too.
        assert composite.availability.covers(2002)
        assert not composite.availability.covers(2005)
        assert composite.availability.covers(2009)

        per_game = REGISTRY_BY_ID["routes_run_per_game"]
        assert per_game.availability.first_season == 2016

    def test_every_registry_metric_has_availability(self):
        """The registry is what the UI reads; a metric with no window is a hole."""
        missing = [metric.id for metric in REGISTRY if metric.availability is None]
        assert not missing, f"metrics with no availability: {missing}"


class TestIntersect:
    """Deriving a window from several inputs takes the narrowest of each end."""

    def test_takes_the_later_floor_and_earlier_ceiling(self):
        combined = intersect(
            Availability(first_season=2006, last_season=2020),
            Availability(first_season=2013, last_season=None),
        )
        assert combined.first_season == 2013
        assert combined.last_season == 2020

    def test_unions_gaps(self):
        combined = intersect(
            Availability(first_season=1999, gaps=[(2003, 2008)]),
            Availability(first_season=1999, gaps=[(2011, 2012)]),
        )
        assert combined.gaps == [(2003, 2008), (2011, 2012)]
        assert not combined.covers(2005)
        assert not combined.covers(2011)
        assert combined.covers(2010)
