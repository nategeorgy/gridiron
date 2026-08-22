"""Ingest games (schedule + results) into the games table.

Also carries the **betting market** columns (M6): nflverse publishes spreads, totals
and moneylines in this same feed, for finished games (closing lines) *and* for
upcoming ones, which is why the Vegas board needs no external odds API. Lines are
NULL on games the market has not priced yet — typically anything more than ~13 weeks
out — and that is a first-class state, not missing data.

Runs on the **roster** season clock (see seasons.py): the upcoming season's schedule
is published months before a snap is played, so re-running this in the spring is how
next season's games first enter the database.
"""

import argparse
import logging
from datetime import date

import nflreadpy as nfl

from db import load_team_id_map, upsert
from seasons import ROSTER, default_seasons

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("pipeline.schedules")


def _season_type(game_type: str | None) -> str | None:
    """Map nflverse game_type (REG/WC/DIV/CON/SB/PRE) to REG or POST.

    Preseason games are out of scope and return None so they are skipped.
    """
    if game_type == "REG":
        return "REG"
    if game_type in {"WC", "DIV", "CON", "SB"}:
        return "POST"
    return None


def _as_bool(value: int | None) -> bool | None:
    """Map nflverse's 0/1 integer flags to a real boolean."""
    return None if value is None else bool(value)


def _parse_date(value: str | None) -> date | None:
    """Parse an ISO date string (nflverse 'gameday') into a date."""
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def ingest_schedules(seasons: list[int]) -> int:
    """Load schedules for the given seasons and upsert them into games."""
    schedules = nfl.load_schedules(seasons)
    team_map = load_team_id_map()

    rows: dict[str, dict] = {}
    for record in schedules.iter_rows(named=True):
        season_type = _season_type(record.get("game_type"))
        if season_type is None:
            continue
        game_id = record.get("game_id")
        if not game_id:
            continue

        rows[game_id] = {
            "game_id": game_id,
            "season": record.get("season"),
            "week": record.get("week"),
            "season_type": season_type,
            "home_team_id": team_map.get(record.get("home_team")),
            "away_team_id": team_map.get(record.get("away_team")),
            "home_score": record.get("home_score"),
            "away_score": record.get("away_score"),
            "game_date": _parse_date(record.get("gameday")),
            # Betting market. spread_line is from the home team's perspective:
            # positive means the home team is favoured.
            "spread_line": record.get("spread_line"),
            "total_line": record.get("total_line"),
            "home_moneyline": record.get("home_moneyline"),
            "away_moneyline": record.get("away_moneyline"),
            "over_odds": record.get("over_odds"),
            "under_odds": record.get("under_odds"),
            # Game context.
            "roof": record.get("roof"),
            "surface": record.get("surface"),
            "div_game": _as_bool(record.get("div_game")),
        }

    written = upsert("games", list(rows.values()), conflict_columns=["game_id"])
    priced = sum(1 for row in rows.values() if row["spread_line"] is not None)
    logger.info(
        "ingested %d games for seasons %s (%d with a betting line)",
        written, seasons, priced,
    )
    return written


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest NFL schedules.")
    parser.add_argument(
        "--seasons", type=int, nargs="+", default=default_seasons(ROSTER),
        help="Seasons to ingest (default: 2020 through the current roster year).",
    )
    args = parser.parse_args()
    ingest_schedules(args.seasons)
