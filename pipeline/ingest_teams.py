"""Ingest NFL teams into the teams table.

Run this first — players, games, and stats all resolve team abbreviations to the
team_id created here.

**Only teams that actually play a season we cover.** `load_teams()` returns 36 rows,
not 32: it carries historical franchise codes alongside current ones (LAR beside LA,
OAK beside LV, SD beside LAC, STL beside LA). Those four never appear in a game from
2020 onward, so storing them means every surface built from `SELECT * FROM teams` shows
four teams that do not exist — which is exactly how the strength-of-schedule board came
to rank 36 teams and put four empty schedules at the top of its "easiest" list.

The filter is derived from the schedule rather than from a list of abbreviations to
exclude. A hardcoded list would be wrong twice: it goes stale the next time a franchise
moves, and it silently bakes in today's `FIRST_SEASON`, so extending the scope back to
2015 would leave St. Louis missing from seasons it really did play. Asking the schedule
"who plays?" is correct at any scope and needs no maintenance.
"""

import logging

import nflreadpy as nfl

from db import upsert
from seasons import ROSTER, default_seasons

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("pipeline.teams")


def playing_abbreviations(seasons: list[int]) -> set[str]:
    """Every team abbreviation that appears in the schedule for these seasons.

    Reads the schedule feed directly rather than the database, so this still works on
    the first run of an empty database — teams have to exist before games can be
    ingested against them.
    """
    schedules = nfl.load_schedules(seasons)
    home = set(schedules["home_team"].drop_nulls().to_list())
    away = set(schedules["away_team"].drop_nulls().to_list())
    return home | away


def ingest_teams(seasons: list[int] | None = None) -> int:
    """Load team descriptions from nflverse and upsert the ones that play."""
    seasons = seasons or default_seasons(ROSTER)
    teams = nfl.load_teams()
    playing = playing_abbreviations(seasons)

    rows: dict[str, dict] = {}
    skipped: list[str] = []
    for record in teams.iter_rows(named=True):
        abbreviation = record["team_abbr"]
        if not abbreviation:
            continue
        if abbreviation not in playing:
            skipped.append(abbreviation)
            continue
        # Keyed by abbreviation to drop any duplicate/historical rows in-batch.
        rows[abbreviation] = {
            "abbreviation": abbreviation,
            "name": record.get("team_name"),
            "conference": record.get("team_conf"),
            "division": record.get("team_division"),
        }

    written = upsert("teams", list(rows.values()), conflict_columns=["abbreviation"])
    logger.info(
        "ingested %d teams for seasons %s (skipped %d that play none: %s)",
        written, seasons, len(skipped), ", ".join(sorted(skipped)) or "none",
    )
    return written


if __name__ == "__main__":
    ingest_teams()
