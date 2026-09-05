"""The write boundary must never let a NaN or an Infinity reach the database.

**Why this is worth a test file of its own.** PostgreSQL's ``double precision`` accepts
IEEE NaN, and unlike NULL a NaN is not skipped by aggregates — it propagates. One bad
value anywhere in ``player_stats`` makes ``AVG(target_share)`` return NaN *for the whole
table*, and ``MAX`` return NaN too, since Postgres sorts NaN above everything. Nothing
raises. A leaderboard, an Insight percentile pool and a scatter axis all just stop
producing numbers.

That is not hypothetical: ``load_player_stats`` publishes NaN in ``target_share``,
``air_yards_share`` and ``wopr`` — around 305,000 rows of it across 1999-2008, plus six
infinities — and one of them (Steve Bono, 1999 week 9) reached production and sat there.
The rest were caught only *incidentally*, by availability masking that exists to
describe what the NFL measured rather than to sanitise floats. Migration
``b3f81a5c2d47`` cleaned the survivor; ``pipeline.db.scrub_non_finite`` is what stops
the next one, and this file is what stops someone removing it.

These tests need no database — the invariant is about a pure function — which is the
same reasoning behind ``test_availability.py`` and its import shim.
"""

import importlib.util
import sys
from math import inf, nan
from pathlib import Path

import pytest

PIPELINE_DIR = Path(__file__).resolve().parents[2] / "pipeline"


def _load_pipeline_db():
    """Import pipeline/db.py without connecting to anything.

    The module reads ``DATABASE_URL`` lazily inside ``get_engine``, so importing it is
    side-effect free — but it is outside the backend package, hence the explicit load.
    """
    spec = importlib.util.spec_from_file_location("pipeline_db", PIPELINE_DIR / "db.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules.setdefault("pipeline_db", module)
    spec.loader.exec_module(module)
    return module


pipeline_db = _load_pipeline_db()
scrub_non_finite = pipeline_db.scrub_non_finite


class TestScrubNonFinite:
    """Every non-finite float becomes None; everything else is left exactly alone."""

    @pytest.mark.parametrize("value", [nan, inf, -inf])
    def test_non_finite_becomes_none(self, value):
        rows = [{"player_id": "00-0001471", "target_share": value}]
        assert scrub_non_finite(rows) == 1
        assert rows[0]["target_share"] is None
        assert rows[0]["player_id"] == "00-0001471", "identity columns must survive"

    def test_counts_every_occurrence(self):
        rows = [
            {"a": nan, "b": inf, "c": 0.5},
            {"a": 1.0, "b": -inf, "c": nan},
        ]
        assert scrub_non_finite(rows) == 4

    def test_finite_values_are_untouched(self):
        """Including the ones a careless truthiness check would clobber."""
        rows = [{
            "zero": 0.0,             # a real share of zero is not missing data
            "negative": -2.5,        # air yards differential is negative for everyone
            "tiny": 1e-300,
            "huge": 1e300,
            "integer": 0,
            "none": None,
            "text": "REG",
            "bool": False,
        }]
        before = dict(rows[0])
        assert scrub_non_finite(rows) == 0
        assert rows[0] == before

    def test_empty_input_is_safe(self):
        assert scrub_non_finite([]) == 0
        assert scrub_non_finite([{}]) == 0

    def test_a_zero_is_not_confused_with_a_nan(self):
        """The distinction the whole availability layer rests on.

        ``0`` means "none this week" and must be stored; NaN means "not a number" and
        must not. A guard written as ``if not value`` would erase both.
        """
        rows = [{"target_share": 0.0}, {"target_share": nan}]
        assert scrub_non_finite(rows) == 1
        assert rows[0]["target_share"] == 0.0
        assert rows[1]["target_share"] is None


class TestWritePathsAreGuarded:
    """Both functions that write to the database must call the scrubber.

    Asserted on the source rather than by mocking a connection: the point is that a
    *future* write helper cannot quietly skip the guard, and reading the call site is
    what catches that. ``upsert`` and ``replace_scoped`` are the only two write paths
    the pipeline has — the backend never writes to an NFL table.
    """

    def test_both_write_helpers_scrub(self):
        source = (PIPELINE_DIR / "db.py").read_text()
        for function in ("def upsert(", "def replace_scoped("):
            start = source.index(function)
            # The body runs to the next top-level def.
            end = source.find("\ndef ", start + 1)
            body = source[start:end if end != -1 else len(source)]
            assert "_scrub_and_log(" in body, (
                f"{function.strip('def (')} writes to the database without scrubbing "
                "non-finite floats — see tests/test_non_finite_scrub.py"
            )

    def test_no_unguarded_write_helper_was_added(self):
        """Any function that mutates a table must scrub first.

        Derived from the source's own AST rather than a hand-kept list, so a new write
        helper fails this test on the day it lands instead of the day a NaN reaches a
        leaderboard. Reads are excluded by construction: what marks a function as a
        writer is the mutation call it makes, not that it touches a connection —
        ``load_stat_keys`` and ``load_team_id_map`` both execute a SELECT and are
        correctly not writers.
        """
        import ast

        source = (PIPELINE_DIR / "db.py").read_text()
        tree = ast.parse(source)

        # Calls that change table contents. pg_insert builds the upsert statement;
        # .insert()/.delete()/.update() are the SQLAlchemy Core equivalents.
        MUTATORS = {"pg_insert", "insert", "delete", "update"}

        unguarded = []
        for node in tree.body:
            if not isinstance(node, ast.FunctionDef):
                continue
            calls = [
                child.func.attr if isinstance(child.func, ast.Attribute)
                else getattr(child.func, "id", None)
                for child in ast.walk(node)
                if isinstance(child, ast.Call)
            ]
            if not (MUTATORS & set(calls)):
                continue  # a reader
            if "_scrub_and_log" not in calls and "scrub_non_finite" not in calls:
                unguarded.append(node.name)

        assert not unguarded, (
            "these functions in pipeline/db.py write to a table without scrubbing "
            f"non-finite floats first: {', '.join(unguarded)}. Add _scrub_and_log() — "
            "see the module docstring in tests/test_non_finite_scrub.py for why."
        )
