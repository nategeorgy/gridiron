"""Ingest NFL Next Gen Stats (M11 enrichment pass).

Source: ``load_nextgen_stats(stat_type="passing" | "receiving" | "rushing")`` — the
nflverse scrape of https://nextgenstats.nfl.com, republished weekly to GitHub releases
under MIT.

**Why this feed and not the NFL's own API.** Next Gen Stats are derived from the
tracking chips in the ball and the players' shoulder pads, and the NFL's official
endpoint (``docs.ngs.nfl.com``) is a credentialed club/partner portal with no open
signup; the licensed resale route is enterprise-priced. The *aggregates* the public NGS
site publishes are a different matter — nflverse scrapes them, and they arrive through
the same library every other feed in this pipeline uses. What stays out of reach is the
raw tracking data underneath (player x/y at 10Hz), which is released only in slices for
the annual Big Data Bowl. So this script buys the derived metrics and nothing else,
which is exactly the part a fantasy site wants.

Three properties of the feed drive every decision below.

**1. Week 0 is a season aggregate, not a game.** Each stat type carries per-week rows
*and* a ``week = 0`` row holding the player's season totals. Those are dropped: this
table is per game, a week-0 row has no ``game_id`` to join to, and writing one would
double-count every player in every season aggregate the API computes.

**2. There is no game id, so the join goes through the schedule.** NGS identifies a row
by ``(player_gsis_id, season, week, season_type)``. ``player_gsis_id`` *is* our
``players.player_id``, so the crosswalk that ``ingest_usage.py`` needs for Pro Football
Reference is unnecessary here — but the game still has to be resolved, which this does
from ``player_stats`` itself. A row NGS reports for a player-week we have no stat line
for is skipped rather than inserted, the same enrichment rule as ``ingest_expected.py``.

**3. Half the percentages arrive on a 0–100 scale and half do not.** ``aggressiveness``,
``catch_percentage``, ``expected_completion_percentage``,
``percent_share_of_intended_air_yards`` and ``percent_attempts_gte_eight_defenders`` are
published as 0–100; ``rush_pct_over_expected`` is already a 0–1 fraction, and
``completion_percentage_above_expectation`` is a signed difference in percentage points.
Every share in this database is stored 0–1 (``snap_share``, ``target_share``) because
the frontend's ``pct`` formatter multiplies by 100, so the first group is divided by 100
here and the other two are stored as they arrive — ``ngs_pass_completion_pct_above_expectation``
matching the existing ``cpoe`` column's percentage-point scale. **Measured, not
assumed**: the ranges were checked against 2025 before the scaling was written.

⚠️ **The weekly feed is a biased subset of the season, and this is the thing to
remember about it.** NGS publishes only *qualified* players — in 2025, 65 quarterbacks,
212 receivers and 80 backs — and files each under a single phase, so a pass-catching
back has rushing NGS and no receiving NGS. But the sharper limit is per *week*: a
weekly row seems to need roughly 15 attempts, 5 targets or 10 carries, so a player's
quiet weeks are simply absent. Measured on 2024, a receiver's published weeks cover a
median **79%** of his targets (p25 62%) and a back's **86%** of his carries; a starting
quarterback clears the bar every week, at 100%.

The consequence is that a season aggregate built by weighting these rows describes a
player's *busier games* rather than his season. Marvin Mims in 2024 is the worked
example: 52 targets across 17 games, of which NGS published four weeks covering 23
targets — our attempt-weighted separation comes out at 5.58 against the 5.21 on NGS's
own season row. Our target counts match NGS's exactly week for week, so the weighting
is right; the sample is what differs. Quarterback and rushing metrics reproduce NGS's
season figures to within a rounding error, and receiving ones run a few percent high.

That bias is documented rather than corrected because correcting it would mean storing
NGS's season row as a second grain, and this table is per game. Both availability
tables carry the same warning so it reaches the UI.

This is an **enrichment pass**: it only updates stat lines ``ingest_stats.py`` has
already created, and it is idempotent (``INSERT ... ON CONFLICT DO UPDATE``).
"""

import argparse
import logging

import nflreadpy as nfl
import polars as pl
from sqlalchemy import text

from availability import mask_unavailable
from db import get_engine, upsert
from seasons import NEXTGEN, clamp_seasons, default_seasons

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("pipeline.nextgen")


# NGS column -> our player_stats column, per stat type. Anything not listed is either
# a duplicate of a column we already hold from a better source (``pass_yards``,
# ``receptions``) or identity noise (``player_short_name``, ``max_air_distance``).
COLUMN_MAP: dict[str, dict[str, str]] = {
    "passing": {
        "avg_time_to_throw": "ngs_pass_time_to_throw",
        "avg_completed_air_yards": "ngs_pass_completed_air_yards",
        "avg_intended_air_yards": "ngs_pass_intended_air_yards",
        "avg_air_yards_differential": "ngs_pass_air_yards_differential",
        "aggressiveness": "ngs_pass_aggressiveness",
        "avg_air_yards_to_sticks": "ngs_pass_air_yards_to_sticks",
        "expected_completion_percentage": "ngs_pass_expected_completion_pct",
        "completion_percentage_above_expectation": (
            "ngs_pass_completion_pct_above_expectation"
        ),
    },
    "receiving": {
        "avg_cushion": "ngs_rec_cushion",
        "avg_separation": "ngs_rec_separation",
        "avg_intended_air_yards": "ngs_rec_intended_air_yards",
        "percent_share_of_intended_air_yards": "ngs_rec_pct_share_intended_air_yards",
        "catch_percentage": "ngs_rec_catch_pct",
        "avg_yac": "ngs_rec_yac",
        "avg_expected_yac": "ngs_rec_expected_yac",
        "avg_yac_above_expectation": "ngs_rec_yac_above_expectation",
    },
    "rushing": {
        "efficiency": "ngs_rush_efficiency",
        "avg_time_to_los": "ngs_rush_time_to_los",
        "percent_attempts_gte_eight_defenders": (
            "ngs_rush_pct_attempts_eight_defenders"
        ),
        "expected_rush_yards": "ngs_rush_expected_yards",
        "rush_yards_over_expected": "ngs_rush_yards_over_expected",
        "rush_yards_over_expected_per_att": "ngs_rush_yards_over_expected_per_att",
        "rush_pct_over_expected": "ngs_rush_pct_over_expected",
    },
}

# Our columns that NGS publishes on a 0-100 scale and that we store as a 0-1 fraction,
# matching every other share in the table. Deliberately NOT here:
#   * ngs_pass_completion_pct_above_expectation — a signed difference in percentage
#     points (-24 to +24), stored on the same scale as the existing ``cpoe`` column.
#   * ngs_rush_pct_over_expected — already published as a 0-1 fraction. Dividing it
#     again would put every back at 0.004 and the error would be invisible on a board
#     that only ever shows one season.
PERCENT_COLUMNS: frozenset[str] = frozenset({
    "ngs_pass_aggressiveness",
    "ngs_pass_expected_completion_pct",
    "ngs_rec_pct_share_intended_air_yards",
    "ngs_rec_catch_pct",
    "ngs_rush_pct_attempts_eight_defenders",
})

# NGS's week 0 holds the player's season aggregate rather than a game.
SEASON_AGGREGATE_WEEK = 0


def load_game_lookup(seasons: list[int]) -> dict[tuple, str]:
    """Return ``(player_id, season, week, season_type) -> game_id`` from player_stats.

    NGS carries no game id, so the game has to be resolved from a stat line we already
    hold. Restricting the query to the seasons being ingested keeps this to the tens of
    thousands of rows the run can actually use rather than the whole table.
    """
    query = text(
        """
        SELECT player_id, season, week, season_type, game_id
        FROM player_stats
        WHERE season = ANY(:seasons)
        """
    )
    with get_engine().connect() as connection:
        rows = connection.execute(query, {"seasons": seasons})
        lookup = {
            (player_id, season, week, season_type): game_id
            for player_id, season, week, season_type, game_id in rows
        }
    logger.info("game lookup: %d player-weeks available to join against", len(lookup))
    return lookup


def collect(stat_type: str, seasons: list[int], games: dict[tuple, str]) -> tuple[dict, int]:
    """Return ``(player_id, game_id) -> {ngs columns}`` for one NGS stat type."""
    frame = nfl.load_nextgen_stats(seasons=seasons, stat_type=stat_type)
    frame = frame.filter(pl.col("week") != SEASON_AGGREGATE_WEEK)
    mapping = COLUMN_MAP[stat_type]

    collected: dict[tuple, dict] = {}
    unmatched = 0
    for record in frame.iter_rows(named=True):
        player_id = record.get("player_gsis_id")
        season = record.get("season")
        key = (player_id, season, record.get("week"), record.get("season_type"))
        game_id = games.get(key)
        if game_id is None:
            # A player NGS ranks who has no stat line of ours: a kicker, a defender
            # credited with a reception, or a week outside the seasons in scope.
            unmatched += 1
            continue

        row = {"player_id": player_id, "game_id": game_id}
        for source, target in mapping.items():
            value = record.get(source)
            if value is not None and target in PERCENT_COLUMNS:
                value = value / 100.0
            row[target] = value
        collected[(player_id, game_id)] = mask_unavailable(row, season)

    logger.info(
        "%s: %d player-games collected (%d NGS rows with no matching stat line)",
        stat_type, len(collected), unmatched,
    )
    return collected, unmatched


def ingest_nextgen(seasons: list[int]) -> int:
    """Load all three NGS stat types and update the ngs_* columns on player_stats."""
    seasons = clamp_seasons(seasons, NEXTGEN)
    if not seasons:
        logger.info(
            "nothing to ingest: no requested season is inside the Next Gen Stats "
            "window %s", NEXTGEN.window(),
        )
        return 0

    games = load_game_lookup(seasons)

    # The three stat types are merged per player-game before writing, so a back with
    # both rushing and receiving NGS lands in one row rather than two upserts, the
    # second of which would carry only its own columns.
    merged: dict[tuple, dict] = {}
    for stat_type in COLUMN_MAP:
        collected, _ = collect(stat_type, seasons, games)
        for key, row in collected.items():
            merged.setdefault(key, {"player_id": key[0], "game_id": key[1]}).update(row)

    # Every row is given all 23 columns, explicitly NULL where this player has no NGS
    # line for that phase. Two reasons. A quarterback genuinely has no receiving
    # separation, so NULL is the right stored value rather than a gap — and the upsert
    # builds its ON CONFLICT SET clause from the union of keys across the batch, so
    # leaving a key off some rows would make what gets written depend on which players
    # happened to be in the run.
    blank = {column: None for mapping in COLUMN_MAP.values() for column in mapping.values()}
    rows = [{**blank, **row} for row in merged.values()]

    written = upsert(
        "player_stats", rows, conflict_columns=["player_id", "game_id"],
    )
    logger.info(
        "next gen stats: updated %d stat lines for seasons %s", written, seasons,
    )
    return written


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Ingest NFL Next Gen Stats (nflverse scrape of nextgenstats.nfl.com)."
    )
    parser.add_argument(
        "--seasons", type=int, nargs="+", default=default_seasons(NEXTGEN),
        help="Seasons to ingest (default: 2016 — NGS's first season — onwards).",
    )
    args = parser.parse_args()
    ingest_nextgen(args.seasons)
