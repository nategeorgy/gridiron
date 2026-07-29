"""Ingest expected stat components and market-share metrics (M2).

Source: ``load_ff_opportunity(stat_type="weekly")`` — the nflverse **ffopportunity**
model, which estimates what a player's *usage* was worth: given where and how he was
used on each play (field position, air yards, down and distance), how many catches,
yards and touchdowns should that have produced?

Two things are stored from this feed:

1. **Expected components** (``*_exp`` columns) — expected yards, touchdowns,
   receptions, interceptions and two-point conversions. Deliberately *not* expected
   *fantasy points*: the backend scoring engine turns these components into expected
   fantasy points in whatever league scoring the user asks for, exactly as it does for
   actual points (see ``backend/app/scoring.py``). Storing a points total would lock
   xFP to one scoring system and break the comparison against actual points.

2. **Market-share metrics** — how much of the offense a player commanded. Both the
   player values and the team totals come from this same feed, so each share is
   internally consistent (numerator and denominator always from the same source):

       rush_attempt_share = carries / team carries
       opportunity_share  = (carries + targets) / team (carries + targets)
       market_share       = (rush + rec yards) / team (rush + rec yards)

This is an **enrichment pass**: it only updates stat lines ``ingest_stats.py`` has
already created, and it is idempotent (``INSERT ... ON CONFLICT DO UPDATE``).

Caveat worth remembering: these are *model estimates*, not counted events. The API
flags them as ``modelled`` in the metric registry so the UI can label them.
"""

import argparse
import logging

import nflreadpy as nfl

from db import load_stat_keys, upsert

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("pipeline.expected")

DEFAULT_SEASONS = list(range(2020, 2026))

# ffopportunity column -> our player_stats column, for the expected components that
# map one-to-one.
EXPECTED_COLUMNS: dict[str, str] = {
    "pass_yards_gained_exp": "passing_yards_exp",
    "pass_touchdown_exp": "passing_tds_exp",
    "pass_interception_exp": "interceptions_exp",
    "rush_yards_gained_exp": "rushing_yards_exp",
    "rush_touchdown_exp": "rushing_tds_exp",
    "rec_yards_gained_exp": "receiving_yards_exp",
    "rec_touchdown_exp": "receiving_tds_exp",
    "receptions_exp": "receptions_exp",
}

# Two-point conversions arrive split by play type; we store one combined estimate.
TWO_POINT_COLUMNS = (
    "pass_two_point_conv_exp",
    "rec_two_point_conv_exp",
    "rush_two_point_conv_exp",
)


def _sum_present(record: dict, columns: tuple[str, ...]) -> float | None:
    """Sum the columns that are present; None only when all of them are missing."""
    values = [record.get(column) for column in columns]
    present = [value for value in values if value is not None]
    return sum(present) if present else None


def _share(numerator: float | None, denominator: float | None) -> float | None:
    """Player share of a team total, or None when the total is missing/non-positive.

    A non-positive denominator means the share is undefined (a team can finish a game
    with negative net yards), which is different from a share of zero.
    """
    if denominator is None or denominator <= 0:
        return None
    return (numerator or 0) / denominator


def ingest_expected(seasons: list[int]) -> int:
    """Load ffopportunity weekly data and update expected + market-share columns."""
    opportunity = nfl.load_ff_opportunity(seasons=seasons, stat_type="weekly")
    stat_keys = load_stat_keys()

    rows: dict[tuple, dict] = {}
    skipped = 0
    for record in opportunity.iter_rows(named=True):
        player_id = record.get("player_id")
        game_id = record.get("game_id")
        # Enrichment only: never create a stat line that ingest_stats.py didn't.
        if (player_id, game_id) not in stat_keys:
            skipped += 1
            continue

        carries = record.get("rush_attempt")
        targets = record.get("rec_attempt")
        team_carries = record.get("rush_attempt_team")
        scrimmage_yards = _sum_present(record, ("rush_yards_gained", "rec_yards_gained"))
        team_scrimmage_yards = _sum_present(
            record, ("rush_yards_gained_team", "rec_yards_gained_team")
        )

        row = {
            "player_id": player_id,
            "game_id": game_id,
            "two_point_conv_exp": _sum_present(record, TWO_POINT_COLUMNS),
            "rush_attempt_share": _share(carries, team_carries),
            "opportunity_share": _share(
                (carries or 0) + (targets or 0),
                _sum_present(record, ("rush_attempt_team", "rec_attempt_team")),
            ),
            "market_share": _share(scrimmage_yards, team_scrimmage_yards),
        }
        for source_column, target_column in EXPECTED_COLUMNS.items():
            row[target_column] = record.get(source_column)
        rows[(player_id, game_id)] = row

    written = upsert(
        "player_stats", list(rows.values()),
        conflict_columns=["player_id", "game_id"],
    )
    logger.info(
        "expected/market-share: updated %d stat lines for seasons %s "
        "(skipped %d rows with no matching stat line)",
        written, seasons, skipped,
    )
    return written


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Ingest expected stat components + market share (ffopportunity)."
    )
    parser.add_argument(
        "--seasons", type=int, nargs="+", default=DEFAULT_SEASONS,
        help="Seasons to ingest (default: 2020-2025).",
    )
    args = parser.parse_args()
    ingest_expected(args.seasons)
