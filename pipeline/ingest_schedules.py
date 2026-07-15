"""Ingest games (schedule + results) into the games table."""

import argparse
import logging
from datetime import date

import nflreadpy as nfl

from db import load_team_id_map, upsert

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("pipeline.schedules")

DEFAULT_SEASONS = list(range(2020, 2026))


def _season_type(game_type: str | None) -> str | None:
    """Map nflverse game_type (REG/WC/DIV/CON/SB/PRE) to REG or POST.

    Preseason games are out of scope and return None so they are skipped.
    """
    if game_type == "REG":
        return "REG"
    if game_type in {"WC", "DIV", "CON", "SB"}:
        return "POST"
    return None


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
        }

    written = upsert("games", list(rows.values()), conflict_columns=["game_id"])
    logger.info("ingested %d games for seasons %s", written, seasons)
    return written


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest NFL schedules.")
    parser.add_argument(
        "--seasons", type=int, nargs="+", default=DEFAULT_SEASONS,
        help="Seasons to ingest (default: 2020-2025).",
    )
    args = parser.parse_args()
    ingest_schedules(args.seasons)
