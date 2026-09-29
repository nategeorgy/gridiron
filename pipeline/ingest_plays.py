"""Ingest play-level rows for the Explore tab: every target, and designed runs by lane.

Two tables, both from nflverse play-by-play:

  play_targets       one row per targeted pass: passer, receiver, air yards, side, result,
                     EPA, down and field position. The passing network, the target
                     heatmaps and the air-yard distributions aggregate it for any weeks.
  player_run_lanes   one row per player, game and run lane: designed carries, yards,
                     successes, and how each carry ended (stuffed / 1-3 / 4-9 / 10+).

**What counts.** A target is a pass attempt with a named receiver: sacks, spikes and
two-point tries are left out. Air yards and side are stored as play-by-play gives them,
NULL on the ~1% it does not (a target caught at the line is a real 0, not a NULL). A
designed run is a rush attempt that was neither a scramble (a pass play that broke down)
nor a kneel.

**Receivers outside ``players`` are kept.** play_targets.receiver_id has no foreign key,
because a target to a fullback or a two-way defensive back is still one of the
quarterback's targets, and dropping it would skew every share. Runs keep the usual
guard instead (only stat lines we track), since player_run_lanes is keyed on a player.

Both tables are **replaced per game**, not upserted: a stat correction can remove or
renumber a play, and an upsert would keep the stale row forever. Only games present in
this download are touched, so a failed download cannot empty a season.

Team codes: play-by-play normalises every franchise to today's code (``LA``); the stored
team_id is resolved onto the schedule's code of the day with ``franchises.py``, like
``ingest_team_stats.py``.
"""

import argparse
import logging

import nflreadpy as nfl
import polars as pl
from sqlalchemy import text

from availability import FIRST_TARGET_DEPTH_SEASON
from db import get_engine, load_stat_keys, load_team_id_map, replace_scoped
from franchises import contemporary_code_map, resolve
from seasons import STATS, clamp_seasons, default_seasons

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("pipeline.plays")

# (run_location, run_gap) -> lane code, left to right across the line.
LANES = {
    ("left", "end"): "le", ("left", "tackle"): "lt", ("left", "guard"): "lg",
    ("middle", None): "mid",
    ("right", "guard"): "rg", ("right", "tackle"): "rt", ("right", "end"): "re",
}


def _flag(value) -> bool:
    """nflverse flags arrive as 1.0 / 0.0 / null."""
    return bool(value) and value == value  # NaN != NaN


def _small(value) -> int | None:
    """Round a yardage to a whole number, keeping NULL as NULL."""
    if value is None or value != value:
        return None
    return int(round(value))


def season_game_ids(season: int) -> set[str]:
    """Game ids the schedule holds for a season (the foreign key both tables need)."""
    with get_engine().connect() as connection:
        return {row[0] for row in connection.execute(text("SELECT game_id FROM games WHERE season = :season"), {"season": season})}


def collect_targets(pbp: pl.DataFrame, season: int, games: set[str], codes, team_ids) -> list[dict]:
    """One row per targeted pass in the season."""
    targets = pbp.filter(
        (pl.col("pass_attempt") == 1)
        & (pl.col("sack").fill_null(0) != 1)
        & (pl.col("two_point_attempt").fill_null(0) != 1)
        & pl.col("receiver_player_id").is_not_null()
        & pl.col("game_id").is_in(list(games))
    )
    rows = []
    for play in targets.select(
        "game_id", "play_id", "season", "week", "season_type", "posteam", "passer_player_id",
        "receiver_player_id", "air_yards", "pass_location", "complete_pass", "pass_touchdown",
        "interception", "first_down_pass", "receiving_yards", "yards_gained", "yards_after_catch",
        "epa", "down", "yardline_100",
    ).iter_rows(named=True):
        complete = _flag(play["complete_pass"])
        yards = play["receiving_yards"]
        if yards is None or yards != yards:
            yards = play["yards_gained"] if complete else 0
        rows.append({
            "game_id": play["game_id"],
            "play_id": int(play["play_id"]),
            "season": season,
            "week": int(play["week"]),
            "season_type": play["season_type"],
            "team_id": team_ids.get(resolve(codes, season, play["posteam"])),
            "passer_id": play["passer_player_id"],
            "receiver_id": play["receiver_player_id"],
            "air_yards": _small(play["air_yards"]),
            "location": play["pass_location"] if play["pass_location"] in ("left", "middle", "right") else None,
            "complete": complete,
            "touchdown": _flag(play["pass_touchdown"]),
            "interception": _flag(play["interception"]),
            "first_down": _flag(play["first_down_pass"]),
            "yards": _small(yards) or 0,
            "yards_after_catch": _small(play["yards_after_catch"]),
            "epa": play["epa"],
            "down": _small(play["down"]),
            "yardline_100": _small(play["yardline_100"]),
        })
    return rows


def collect_run_lanes(pbp: pl.DataFrame, season: int, games: set[str], stat_keys: set[tuple[str, str]]) -> list[dict]:
    """One row per player, game and run lane, for designed runs."""
    runs = pbp.filter(
        (pl.col("rush_attempt") == 1)
        & (pl.col("qb_scramble").fill_null(0) != 1)
        & (pl.col("qb_kneel").fill_null(0) != 1)
        & (pl.col("two_point_attempt").fill_null(0) != 1)
        & pl.col("rusher_player_id").is_not_null()
        & pl.col("game_id").is_in(list(games))
    )
    cells: dict[tuple[str, str, str], dict] = {}
    for play in runs.select(
        "game_id", "week", "season_type", "rusher_player_id", "run_location", "run_gap",
        "yards_gained", "success", "first_down_rush", "rush_touchdown",
    ).iter_rows(named=True):
        key_player = (play["rusher_player_id"], play["game_id"])
        if key_player not in stat_keys:
            continue
        lane = LANES.get((play["run_location"], play["run_gap"]), "unknown")
        cell = cells.setdefault((*key_player, lane), {
            "player_id": key_player[0], "game_id": key_player[1], "lane": lane,
            "season": season, "week": int(play["week"]), "season_type": play["season_type"],
            "carries": 0, "yards": 0, "successes": 0, "first_downs": 0, "touchdowns": 0,
            "stuffed": 0, "short": 0, "medium": 0, "explosive": 0,
        })
        gained = _small(play["yards_gained"]) or 0
        cell["carries"] += 1
        cell["yards"] += gained
        cell["successes"] += int(_flag(play["success"]))
        cell["first_downs"] += int(_flag(play["first_down_rush"]))
        cell["touchdowns"] += int(_flag(play["rush_touchdown"]))
        bucket = "stuffed" if gained <= 0 else "short" if gained <= 3 else "medium" if gained <= 9 else "explosive"
        cell[bucket] += 1
    return list(cells.values())


def ingest_plays(seasons: list[int]) -> tuple[int, int]:
    """Write both tables for the given seasons. Returns (targets written, lane rows written)."""
    seasons = clamp_seasons(seasons, STATS)
    too_early = [season for season in seasons if season < FIRST_TARGET_DEPTH_SEASON]
    if too_early:
        logger.info("skipping season(s) %s: play-by-play names a receiver on incompletions only from %d",
                    too_early, FIRST_TARGET_DEPTH_SEASON)
    seasons = [season for season in seasons if season >= FIRST_TARGET_DEPTH_SEASON]
    if not seasons:
        logger.info("nothing to ingest: no requested season is available")
        return 0, 0

    team_ids = load_team_id_map()
    codes = contemporary_code_map(seasons)
    stat_keys = load_stat_keys(seasons)
    written_targets = written_lanes = 0
    for season in seasons:
        games = season_game_ids(season)
        pbp = nfl.load_pbp([season])
        targets = collect_targets(pbp, season, games, codes, team_ids)
        lanes = collect_run_lanes(pbp, season, games, stat_keys)
        written_targets += replace_scoped("play_targets", targets, scope_columns=["game_id"])
        written_lanes += replace_scoped("player_run_lanes", lanes, scope_columns=["game_id"])
        logger.info("plays %d: %d targets, %d run-lane rows", season, len(targets), len(lanes))
    return written_targets, written_lanes


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest every target and designed runs by lane from play-by-play.")
    parser.add_argument(
        "--seasons", type=int, nargs="+", default=default_seasons(STATS),
        help="Seasons to ingest (default: 2009 through the latest played season).",
    )
    args = parser.parse_args()
    ingest_plays(args.seasons)
