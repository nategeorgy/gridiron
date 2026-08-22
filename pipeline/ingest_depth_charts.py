"""Ingest depth charts into depth_chart_entries (M6.2).

The feed is a **stream of timestamped snapshots** — 152 of them for the 2026 season by
mid-August — and this stores one row per player from the newest. Keeping all of them
would make this the largest table in the database by an order of magnitude to answer a
question nothing asks yet; the choice is reversible, because nflverse retains every
snapshot and a change-log could be backfilled from the same feed later.

**This is the one ingest that is not an upsert**, and the reason is worth stating: the
table holds *current state*. A player who is cut does not appear in the feed with a
worse rank — he stops appearing at all, so an upsert would never touch his row and he
would sit at WR3 forever. Each team's rows are therefore deleted and rewritten together
(``replace_scoped``), and only for teams the snapshot actually contains.

Scope is QB/RB/WR/TE. The feed carries the whole 53-man roster, but a fantasy product
has nothing to say about a left guard, and storing him would mean hundreds of players
whose profile pages are empty.
"""

import argparse
import logging
from datetime import datetime

import nflreadpy as nfl
import polars as pl
from sqlalchemy import text

from db import get_engine, load_team_id_map, replace_scoped
from seasons import ROSTER, latest_season

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("pipeline.depth_charts")

SCOPE_POSITIONS = {"QB", "RB", "WR", "TE"}


def _parse_snapshot(value: str | None) -> datetime | None:
    """Parse the feed's ISO timestamp ('2026-08-19T07:43:54Z')."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _existing_player_ids() -> set[str]:
    """Player ids already in players (depth_chart_entries has a real FK)."""
    with get_engine().connect() as connection:
        return {row[0] for row in connection.execute(text("SELECT player_id FROM players"))}


def ingest_depth_charts(season: int | None = None) -> int:
    """Load the newest depth-chart snapshot for a season. Returns rows written."""
    season = season or latest_season(ROSTER)
    charts = nfl.load_depth_charts([season])
    if charts.height == 0:
        logger.warning("no depth charts published for %d yet", season)
        return 0

    newest = charts["dt"].max()
    snapshot = charts.filter(
        (pl.col("dt") == newest) & pl.col("pos_abb").is_in(SCOPE_POSITIONS)
    )
    team_map = load_team_id_map()
    known_players = _existing_player_ids()
    snapshot_at = _parse_snapshot(newest)

    rows: dict[tuple, dict] = {}
    unmatched = 0
    for record in snapshot.iter_rows(named=True):
        player_id = record.get("gsis_id")
        team_id = team_map.get(record.get("team"))
        if not player_id or team_id is None or player_id not in known_players:
            unmatched += 1
            continue

        key = (season, team_id, player_id, record.get("pos_abb"))
        rows[key] = {
            "season": season,
            "team_id": team_id,
            "player_id": player_id,
            "pos_abb": record.get("pos_abb"),
            "pos_rank": record.get("pos_rank"),
            "pos_slot": record.get("pos_slot"),
            "pos_grp": record.get("pos_grp"),
            "pos_name": record.get("pos_name"),
            "snapshot_at": snapshot_at,
        }

    written = replace_scoped(
        "depth_chart_entries", list(rows.values()), scope_columns=["season", "team_id"]
    )
    logger.info(
        "ingested %d depth-chart entries for %d (snapshot %s, %d rows skipped)",
        written, season, newest, unmatched,
    )
    return written


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest NFL depth charts.")
    parser.add_argument(
        "--season", type=int, default=None,
        help="Season to ingest (default: the current roster year).",
    )
    args = parser.parse_args()
    ingest_depth_charts(args.season)
