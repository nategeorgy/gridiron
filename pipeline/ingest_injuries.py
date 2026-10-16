"""Ingest the weekly injury reports into injury_reports, for the game previews.

nflverse's ``load_injuries`` carries each team's report for each week: the game status
the team declared (Out, Doubtful, Questionable) and the practice participation behind
it. A player can be on the practice report with no game status; he is kept, since
"limited Wednesday" is news a fantasy manager wants before Friday's status exists.

**Current state per team and week, so it is replaced, never upserted.** A player taken
off a report stops appearing in the feed rather than reappearing as healthy, and an
upsert would leave him listed as Questionable forever. Each team-week in the download
is deleted and rewritten in one transaction; one missing from the download is left
alone (see ``replace_scoped``).

The report names linemen and defenders, who are not in ``players``, so ``player_id``
carries no foreign key and the name is stored beside it.

Only seasons from ``FIRST_GAME_PAGE_SEASON``: the reports serve the game pages.
"""

import argparse
import logging

import nflreadpy as nfl

from db import load_team_id_map, replace_scoped
from seasons import FIRST_GAME_PAGE_SEASON, INJURIES, clamp_seasons, latest_season

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("pipeline.injuries")


def _text(value: str | None, limit: int) -> str | None:
    """Trim a free-text field to its column, keeping NULL as NULL."""
    if value is None:
        return None
    value = str(value).strip()
    return value[:limit] or None


def collect_reports(records, team_ids: dict[str, int]) -> list[dict]:
    """One row per player per team-week report."""
    rows: dict[tuple, dict] = {}
    for record in records:
        team_id = team_ids.get(record.get("team"))
        player_id = record.get("gsis_id")
        season_type = "POST" if record.get("season_type") == "POST" else "REG"
        if team_id is None or not player_id or record.get("week") is None:
            continue
        key = (record["season"], season_type, int(record["week"]), team_id, player_id)
        rows[key] = {
            "season": record["season"],
            "season_type": season_type,
            "week": int(record["week"]),
            "team_id": team_id,
            "player_id": player_id,
            "name": _text(record.get("full_name"), 100),
            "position": _text(record.get("position"), 10),
            "status": _text(record.get("report_status"), 30),
            "injury": _text(record.get("report_primary_injury") or record.get("practice_primary_injury"), 60),
            "practice_status": _text(record.get("practice_status"), 60),
        }
    return list(rows.values())


def ingest_injuries(seasons: list[int]) -> int:
    """Replace every team-week report for the given seasons. Returns the rows supplied."""
    seasons = [season for season in clamp_seasons(seasons, INJURIES) if season >= FIRST_GAME_PAGE_SEASON]
    if not seasons:
        logger.info("nothing to ingest: no requested season is in the game pages' scope")
        return 0
    reports = nfl.load_injuries(seasons)
    rows = collect_reports(reports.iter_rows(named=True), load_team_id_map())
    written = replace_scoped("injury_reports", rows, scope_columns=["season", "season_type", "week", "team_id"])
    logger.info("injury reports %s: %d rows", seasons, len(rows))
    return written


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest the weekly injury reports.")
    parser.add_argument(
        "--seasons", type=int, nargs="+", default=[latest_season(INJURIES)],
        help="Seasons to ingest (default: the current one).",
    )
    args = parser.parse_args()
    ingest_injuries(args.seasons)
