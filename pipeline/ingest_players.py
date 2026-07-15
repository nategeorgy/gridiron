"""Ingest players (QB, RB, WR, TE) into the players table."""

import logging

import nflreadpy as nfl

from db import load_team_id_map, upsert

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("pipeline.players")

# Project scope is limited to these offensive skill positions.
SCOPE_POSITIONS = {"QB", "RB", "WR", "TE"}


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
        }

    written = upsert("players", list(rows.values()), conflict_columns=["player_id"])
    logger.info("ingested %d players (positions: %s)", written, sorted(SCOPE_POSITIONS))
    return written


if __name__ == "__main__":
    ingest_players()
