"""Ingest players (QB, RB, WR, TE) into the players table.

Stores the **roster-bio** columns as well as identity (M6): ``load_players``
publishes 39 columns and this script used to keep 7, leaving college, draft capital,
birth date and measurables on the table. Age and where a player was drafted are
inputs to the Draft Value Board, not trivia.

The feed is a *current* view — ``latest_team`` is where a player is now, not where
he was in a given season — so re-running this is how the roster follows free agency
and the draft.
"""

import logging
from datetime import date

import nflreadpy as nfl

from db import load_team_id_map, upsert

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("pipeline.players")

# Project scope is limited to these offensive skill positions.
SCOPE_POSITIONS = {"QB", "RB", "WR", "TE"}


def _parse_date(value: str | None) -> date | None:
    """Parse an ISO date string (nflverse publishes birth_date as text)."""
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def ingest_players() -> int:
    """Load players from nflverse, filter to scope positions, and upsert them."""
    players = nfl.load_players()
    team_map = load_team_id_map()

    rows: dict[str, dict] = {}
    for record in players.iter_rows(named=True):
        if record.get("position") not in SCOPE_POSITIONS:
            continue
        player_id = record.get("gsis_id")
        if not player_id:
            continue

        jersey = record.get("jersey_number")
        rows[player_id] = {
            "player_id": player_id,
            "name": record.get("display_name"),
            "position": record.get("position"),
            "team_id": team_map.get(record.get("latest_team")),
            "jersey_number": int(jersey) if jersey is not None else None,
            "status": record.get("status"),
            "headshot_url": record.get("headshot"),
            # Biographical (M6). draft_team stays a bare abbreviation: it can name a
            # franchise that no longer exists under that code (OAK, SD, STL).
            "birth_date": _parse_date(record.get("birth_date")),
            "height": record.get("height"),
            "weight": record.get("weight"),
            "college_name": record.get("college_name"),
            "college_conference": record.get("college_conference"),
            "draft_year": record.get("draft_year"),
            "draft_round": record.get("draft_round"),
            "draft_pick": record.get("draft_pick"),
            "draft_team": record.get("draft_team"),
            "rookie_season": record.get("rookie_season"),
            "years_of_experience": record.get("years_of_experience"),
        }

    written = upsert("players", list(rows.values()), conflict_columns=["player_id"])
    with_bio = sum(1 for row in rows.values() if row["birth_date"] is not None)
    logger.info(
        "ingested %d players (positions: %s; %d with a birth date)",
        written, sorted(SCOPE_POSITIONS), with_bio,
    )
    return written


if __name__ == "__main__":
    ingest_players()
