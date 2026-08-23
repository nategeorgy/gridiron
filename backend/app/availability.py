"""When each metric actually has data behind it (M8).

Project scope reaches back to 1999, but the data does not arrive all at once: the NFL
began publishing charted passing data in 2006, Pro Football Reference began publishing
snap counts in 2013, and the participation feed that routes are built from ran only
from 2016 until nflverse stopped publishing it. There is also one true hole —
2003–2005 play-by-play names a receiver only on completions, so targets in those
seasons are unrecoverable rather than merely unpublished.

``pipeline/availability.py`` already stores NULL for all of that, so the API is honest
without this module. **This module exists so the UI can say so before the user
clicks.** A board that silently returns an empty column teaches the user the app is
broken; one that greys out "Air Yards" for 2004 and explains why teaches them
something about football. The registry is where that belongs, because the frontend
already fetches it once and caches it.

⚠️ **This is a mirror of ``pipeline/availability.py`` — change both together**, the
same way ``app/scoring.py`` mirrors ``constants/scoring.js``. The pipeline's copy
decides what gets *stored*; this one decides what the UI *offers*. If they disagree,
the UI offers a metric that is always empty, or hides one that has data.

Only metrics with a restriction are listed. Anything absent is available for the whole
range — which is most of the box score, all the fantasy scoring built on it, EPA, and
the entire rushing side (``rusher_player_id`` is complete back to 1999).
"""

from pydantic import BaseModel

# The first season nflverse publishes anything for. A metric with no entry below is
# available from here.
FIRST_SEASON = 1999


class Availability(BaseModel):
    """The seasons in which one metric has data behind it.

    ``last_season`` is None while a feed is still published. ``gaps`` are inclusive
    ranges inside the window where the data is missing anyway — the 2003–2005 target
    blackout is the only one, and the reason this is a set of ranges and not a floor.
    """

    first_season: int = FIRST_SEASON
    last_season: int | None = None
    gaps: list[tuple[int, int]] = []
    note: str = ""
    # For a feed that has *stopped*: the column to read the real ceiling from, rather
    # than hardcoding a year that goes stale the moment nflverse publishes again (or
    # doesn't). Resolved from the database when the registry is served, so "routes end
    # in 2025" is a fact about the data rather than a literal someone has to remember
    # to bump. See routers/metrics.py.
    data_ceiling_column: str | None = None

    def covers(self, season: int) -> bool:
        """True if this metric has data in ``season``."""
        if season < self.first_season:
            return False
        if self.last_season is not None and season > self.last_season:
            return False
        return not any(start <= season <= end for start, end in self.gaps)


def intersect(first: Availability, second: Availability) -> Availability:
    """The window where *both* metrics have data — for metrics built from others.

    A per-game metric is only as available as the column it divides, and a composite
    is only as available as its narrowest input. Deriving that here means a composite
    can never claim a season its own inputs do not have.
    """
    last_values = [
        value for value in (first.last_season, second.last_season) if value is not None
    ]
    notes = [note for note in (first.note, second.note) if note]
    return Availability(
        first_season=max(first.first_season, second.first_season),
        last_season=min(last_values) if last_values else None,
        gaps=sorted(set(first.gaps) | set(second.gaps)),
        note=" ".join(dict.fromkeys(notes)),
    )


# --- The measured windows (see docs/design/M8-historical-depth.md) ---

# Play-by-play names a receiver only on completions from 2003 to 2008, so an
# incompletion cannot be attributed to anyone. ffopportunity looks like it has the
# missing targets in 2006-2008 — its league total is the right size — but they sit on
# rows with no player id, and per player its rec_attempt just equals receptions. So
# this really is a six-season hole, not a three-season one.
TARGETS = Availability(
    first_season=1999, gaps=[(2003, 2008)],
    note="Play-by-play names a receiver only on completions from 2003 to 2008, so "
         "incompletions cannot be attributed and targets are unrecoverable.",
)
# Air yards are counted per target, so they need both the 2006 charting and a receiver
# named on incompletions.
RECEIVING_ADVANCED = Availability(
    first_season=2009,
    note="Needs charted air yards (2006+) and a receiver named on incomplete passes "
         "(2009+).",
)
# Charted at the passer, or counted only on completions — either way the player is
# never in doubt, so these only wait for the NFL to start charting.
CHARTED_AT_PASSER = Availability(
    first_season=2006,
    note="The NFL did not publish air yards, pass length or pass location before 2006.",
)
EXPECTED = Availability(
    first_season=2006, note="The nflverse ffopportunity model starts in 2006.",
)
# The same model's *receiving* side is fed by targets, so it runs at roughly two-thirds
# of actual in 2006-2008 (and half, for touchdowns). Anything mixing it in waits.
EXPECTED_RECEIVING = Availability(
    first_season=2009,
    note="The nflverse ffopportunity model starts in 2006, and its receiving side is "
         "fed by targets — so it runs at roughly two-thirds of actual until 2009, "
         "while incompletions cannot be attributed.",
)
SNAPS = Availability(
    first_season=2013, note="Pro Football Reference began publishing snap counts in 2013.",
)
ROUTES = Availability(
    first_season=2016, data_ceiling_column="routes_run",
    note="Built from the nflverse participation feed, which is no longer published.",
)
NEVER = Availability(
    first_season=9999, note="No free data source publishes per-player alignment.",
)

METRIC_AVAILABILITY: dict[str, Availability] = {
    # Targets and everything that divides by them
    "targets": TARGETS,
    "target_share": TARGETS,
    "yards_per_target": TARGETS,
    "red_zone_targets": TARGETS,
    # Receiving charted data
    "air_yards": RECEIVING_ADVANCED,
    "air_yards_share": RECEIVING_ADVANCED,
    "adot": RECEIVING_ADVANCED,
    "racr": RECEIVING_ADVANCED,
    "wopr": RECEIVING_ADVANCED,
    "unrealized_air_yards": RECEIVING_ADVANCED,
    "opportunity_share": RECEIVING_ADVANCED,
    # Charted at the passer, or only on completions
    "cpoe": CHARTED_AT_PASSER,
    "yards_after_catch": CHARTED_AT_PASSER,
    # Snaps and routes
    "snap_count": SNAPS,
    "snap_share": SNAPS,
    "routes_run": ROUTES,
    "route_participation": ROUTES,
    "targets_per_route_run": ROUTES,
    "yards_per_route_run": ROUTES,
    "slot_snaps": NEVER,
    # Market shares come from ffopportunity's *actual* team totals, not its model, so
    # they are sound as soon as that feed starts.
    **{metric_id: EXPECTED for metric_id in ("market_share", "rush_attempt_share")},
    # The expected family waits for 2009 as a unit, including the passing and rushing
    # components that are individually fine from 2006. Nothing consumes a component
    # alone: expected fantasy points is their sum, and a sum reads a missing part as
    # zero, so a 2007 receiver's expectation would be his rushing one and little else
    # — non-null, badly wrong, and indistinguishable from a real number.
    **{
        metric_id: EXPECTED_RECEIVING
        for metric_id in (
            "passing_yards_exp", "passing_tds_exp", "interceptions_exp",
            "rushing_yards_exp", "rushing_tds_exp",
            "receiving_yards_exp", "receiving_tds_exp", "receptions_exp",
            "two_point_conv_exp",
            "expected_fantasy_points", "expected_fantasy_ppg",
            "fantasy_points_over_expected",
        )
    },
    # Insight scores built on expected points inherit its floor. VORP does not: it is
    # measured on actual points, which exist for the whole range.
    **{
        metric_id: EXPECTED_RECEIVING
        for metric_id in (
            "expected_vorp", "expected_vorp_ppg", "replacement_expected_ppg",
            "positive_regression_index", "sell_high_index", "tds_over_expected",
            # Half expected points, half usage shares — and every share needs targets.
            "fantasy_opportunity_rating",
            # Compares opportunity share early vs late in a window.
            "opportunity_trend",
        )
    },
}

DEFAULT = Availability()


def for_metric(metric_id: str) -> Availability:
    """The window for one metric id, defaulting to the full range."""
    return METRIC_AVAILABILITY.get(metric_id, DEFAULT)


def available(metric_id: str, season: int) -> bool:
    """True if ``metric_id`` has data in ``season``."""
    return for_metric(metric_id).covers(season)
