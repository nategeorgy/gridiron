"""Ingest NFL teams into the teams table.

Run this first — players, games, and stats all resolve team abbreviations to the
team_id created here.
"""

import logging

import nflreadpy as nfl

from db import upsert

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("pipeline.teams")


def ingest_teams() -> int:
    """Load team descriptions from nflverse and upsert them into the database."""
    teams = nfl.load_teams()

    rows: dict[str, dict] = {}
    for record in teams.iter_rows(named=True):
        abbreviation = record["team_abbr"]
        if not abbreviation:
            continue
        # Keyed by abbreviation to drop any duplicate/historical rows in-batch.
        rows[abbreviation] = {
            "abbreviation": abbreviation,
            "name": record.get("team_name"),
            "conference": record.get("team_conf"),
            "division": record.get("team_division"),
        }

    written = upsert("teams", list(rows.values()), conflict_columns=["abbreviation"])
    logger.info("ingested %d teams", written)
    return written


if __name__ == "__main__":
    ingest_teams()
