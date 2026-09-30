"""The pipeline's two write helpers: small statements, and no rewrite of what already matches.

``pipeline/db.py`` is what every scheduled ingest writes through, and the scheduled job
writes to production. Two properties are pinned here, both added after the 2026-09-30
run lost production's Week 3 stats to ``canceling statement due to statement timeout``:

- **Writes go out ``WRITE_CHUNK_ROWS`` at a time.** The timeout is per statement, so the
  size of each statement is what decides how slow a day the database can have.
- **A row (or a replaced group) that already holds the incoming values is not
  rewritten.** Checked by ``ctid``, the row version's physical address: an update or a
  delete-and-insert always gives a row a new one, so an unchanged ``ctid`` proves the
  row was left alone rather than rewritten with the same values.

The pipeline module is loaded from its file, as in ``test_non_finite_scrub.py``, and its
engine is swapped for this test's connection, each of its transactions becoming a
savepoint inside a transaction that is rolled back at the end.
"""

import importlib.util
import math
from contextlib import contextmanager
from pathlib import Path

import pytest
from sqlalchemy import MetaData, Table, event, text

PIPELINE_DIR = Path(__file__).resolve().parents[2] / "pipeline"


class _JoinedEngine:
    """Stands in for the pipeline's engine: every ``begin()`` is a savepoint on one connection."""

    def __init__(self, connection) -> None:
        self._connection = connection

    @contextmanager
    def begin(self):
        with self._connection.begin_nested():
            yield self._connection


@pytest.fixture
def pipeline(_engine, monkeypatch):
    """pipeline/db.py, writing into a transaction this test rolls back."""
    spec = importlib.util.spec_from_file_location("pipeline_db_writes", PIPELINE_DIR / "db.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    connection = _engine.connect()
    transaction = connection.begin()
    monkeypatch.setattr(module, "get_engine", lambda: _JoinedEngine(connection))
    monkeypatch.setattr(
        module, "_reflect_table", lambda name: Table(name, MetaData(), autoload_with=connection)
    )
    module.connection = connection

    yield module

    transaction.rollback()
    connection.close()


def _ctids(connection, table: str, key: str) -> dict:
    """Each row's physical address, by key."""
    rows = connection.execute(text(f"SELECT {key}, ctid::text FROM {table}"))
    return dict(rows.all())


def _statements(connection, prefix: str) -> list[str]:
    """Collect every statement starting with ``prefix`` that the connection executes."""
    seen: list[str] = []

    @event.listens_for(connection, "before_cursor_execute")
    def record(conn, cursor, statement, parameters, context, executemany):
        if statement.startswith(prefix):
            seen.append(statement)

    return seen


PLAYERS = [
    {"player_id": f"00-00000{index}", "name": f"Player {index}", "position": "WR"}
    for index in range(5)
]


def _seed_teams(pipeline) -> dict[str, int]:
    pipeline.upsert(
        "teams",
        [{"abbreviation": abbr, "name": abbr} for abbr in ("AAA", "BBB")],
        ["abbreviation"],
    )
    rows = pipeline.connection.execute(text("SELECT abbreviation, team_id FROM teams"))
    return dict(rows.all())


def _staff(team_id: int, coordinator_note: str | None = None) -> dict:
    return {
        "team_id": team_id,
        "season": 2026,
        "head_coach": [["Head Coach", None]],
        "offensive_coordinator": [["Coordinator", coordinator_note]],
        "defensive_coordinator": None,
    }


class TestUpsert:
    def test_unchanged_rows_are_not_rewritten(self, pipeline):
        pipeline.upsert("players", [dict(row) for row in PLAYERS], ["player_id"])
        before = _ctids(pipeline.connection, "players", "player_id")

        pipeline.upsert("players", [dict(row) for row in PLAYERS], ["player_id"])

        assert _ctids(pipeline.connection, "players", "player_id") == before

    def test_a_changed_row_is_rewritten_and_only_it(self, pipeline):
        pipeline.upsert("players", [dict(row) for row in PLAYERS], ["player_id"])
        before = _ctids(pipeline.connection, "players", "player_id")

        changed = [dict(row) for row in PLAYERS]
        changed[2]["name"] = "Renamed"
        pipeline.upsert("players", changed, ["player_id"])

        after = _ctids(pipeline.connection, "players", "player_id")
        moved = {player_id for player_id in before if after[player_id] != before[player_id]}
        assert moved == {PLAYERS[2]["player_id"]}
        name = pipeline.connection.execute(
            text("SELECT name FROM players WHERE player_id = :id"), {"id": PLAYERS[2]["player_id"]}
        ).scalar_one()
        assert name == "Renamed"

    def test_a_null_becoming_zero_is_a_change(self, pipeline):
        """IS DISTINCT FROM, not <>: NULL against 0 is a change, NULL against NULL is not."""
        pipeline.upsert("players", [{**PLAYERS[0], "jersey_number": None}], ["player_id"])
        before = _ctids(pipeline.connection, "players", "player_id")

        pipeline.upsert("players", [{**PLAYERS[0], "jersey_number": None}], ["player_id"])
        assert _ctids(pipeline.connection, "players", "player_id") == before

        pipeline.upsert("players", [{**PLAYERS[0], "jersey_number": 0}], ["player_id"])
        assert _ctids(pipeline.connection, "players", "player_id") != before

    def test_a_partial_upsert_compares_only_its_own_columns(self, pipeline):
        """An enrichment pass sends a few columns; the rest are neither compared nor cleared."""
        pipeline.upsert("players", [dict(row) for row in PLAYERS], ["player_id"])
        before = _ctids(pipeline.connection, "players", "player_id")

        pipeline.upsert(
            "players", [{"player_id": row["player_id"], "position": "WR"} for row in PLAYERS],
            ["player_id"],
        )

        assert _ctids(pipeline.connection, "players", "player_id") == before
        names = pipeline.connection.execute(text("SELECT count(*) FROM players WHERE name IS NULL"))
        assert names.scalar_one() == 0

    def test_a_nan_sent_again_matches_the_null_stored_for_it(self, pipeline):
        """The scrub runs before the comparison, so a feed's NaN never reads as a change."""
        game = {"game_id": "2026_01_AAA_BBB", "season": 2026, "week": 1, "season_type": "REG"}
        pipeline.upsert("games", [{**game, "spread_line": math.nan}], ["game_id"])
        before = _ctids(pipeline.connection, "games", "game_id")

        pipeline.upsert("games", [{**game, "spread_line": math.nan}], ["game_id"])

        assert _ctids(pipeline.connection, "games", "game_id") == before

    def test_json_columns_compare_by_value(self, pipeline):
        """json has no equality operator in Postgres, so the guard compares it as jsonb."""
        teams = _seed_teams(pipeline)
        pipeline.upsert("team_staff", [_staff(teams["AAA"])], ["team_id", "season"])
        before = _ctids(pipeline.connection, "team_staff", "team_id")

        pipeline.upsert("team_staff", [_staff(teams["AAA"])], ["team_id", "season"])
        assert _ctids(pipeline.connection, "team_staff", "team_id") == before

        pipeline.upsert("team_staff", [_staff(teams["AAA"], "interim")], ["team_id", "season"])
        assert _ctids(pipeline.connection, "team_staff", "team_id") != before

    def test_rows_go_out_in_chunks(self, pipeline, monkeypatch):
        monkeypatch.setattr(pipeline, "WRITE_CHUNK_ROWS", 2)
        inserts = _statements(pipeline.connection, "INSERT INTO players")

        pipeline.upsert("players", [dict(row) for row in PLAYERS], ["player_id"])

        assert len(inserts) == 3, "5 rows at 2 per statement"
        count = pipeline.connection.execute(text("SELECT count(*) FROM players"))
        assert count.scalar_one() == len(PLAYERS)


class TestReplaceScoped:
    def test_unchanged_groups_are_not_rewritten(self, pipeline):
        """team_staff holds json, which is compared by value, not by identity."""
        teams = _seed_teams(pipeline)
        rows = [_staff(teams["AAA"]), _staff(teams["BBB"])]
        pipeline.replace_scoped("team_staff", [dict(row) for row in rows], ["team_id", "season"])
        before = _ctids(pipeline.connection, "team_staff", "team_id")

        pipeline.replace_scoped("team_staff", [dict(row) for row in rows], ["team_id", "season"])

        assert _ctids(pipeline.connection, "team_staff", "team_id") == before

    def test_only_the_changed_group_is_rewritten(self, pipeline):
        teams = _seed_teams(pipeline)
        pipeline.replace_scoped(
            "team_staff", [_staff(teams["AAA"]), _staff(teams["BBB"])], ["team_id", "season"]
        )
        before = _ctids(pipeline.connection, "team_staff", "team_id")

        pipeline.replace_scoped(
            "team_staff",
            [_staff(teams["AAA"], coordinator_note="since week 4"), _staff(teams["BBB"])],
            ["team_id", "season"],
        )

        after = _ctids(pipeline.connection, "team_staff", "team_id")
        assert after[teams["AAA"]] != before[teams["AAA"]]
        assert after[teams["BBB"]] == before[teams["BBB"]]
        note = pipeline.connection.execute(
            text("SELECT offensive_coordinator FROM team_staff WHERE team_id = :id"),
            {"id": teams["AAA"]},
        ).scalar_one()
        assert note == [["Coordinator", "since week 4"]]

    def test_a_row_dropped_from_a_group_is_deleted(self, pipeline):
        """The reason replace_scoped exists: a cut player stops appearing in the feed."""
        teams = _seed_teams(pipeline)
        pipeline.upsert("players", [dict(row) for row in PLAYERS[:3]], ["player_id"])

        def entry(team: str, player: dict, rank: int) -> dict:
            return {
                "season": 2026, "team_id": teams[team], "player_id": player["player_id"],
                "pos_abb": "WR", "pos_rank": rank,
            }

        pipeline.replace_scoped(
            "depth_chart_entries",
            [entry("AAA", PLAYERS[0], 1), entry("AAA", PLAYERS[1], 2), entry("BBB", PLAYERS[2], 1)],
            ["season", "team_id"],
        )
        # AAA cuts its WR2; BBB is missing from this snapshot entirely.
        pipeline.replace_scoped(
            "depth_chart_entries", [entry("AAA", PLAYERS[0], 1)], ["season", "team_id"]
        )

        left = pipeline.connection.execute(
            text("SELECT player_id FROM depth_chart_entries ORDER BY player_id")
        ).scalars().all()
        assert left == [PLAYERS[0]["player_id"], PLAYERS[2]["player_id"]], (
            "the dropped row goes; a group absent from the snapshot is left alone"
        )

    def test_scopes_are_chunked_without_splitting_a_group(self, pipeline):
        chunks = list(pipeline._scope_chunks({"a": [1, 2, 3], "b": [1], "c": [1], "d": [1, 2]}, 2))
        assert chunks == [["a"], ["b", "c"], ["d"]]
