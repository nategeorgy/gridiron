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

From 2025 (``FIRST_GAME_PAGE_SEASON``) two more tables come out of the same download,
for the game pages: ``game_plays`` (every play: the score after it, the spread-adjusted
win probability before and after, the play's own text) and ``game_drives`` (every
possession). Older seasons skip them: the pages were scoped to last season onward.

Every table is **replaced per game**, not upserted: a stat correction can remove or
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
from db import add_weeks_argument, games_in_weeks, get_engine, load_stat_keys, load_team_id_map, replace_scoped
from franchises import contemporary_code_map, resolve
from seasons import FIRST_GAME_PAGE_SEASON, STATS, clamp_seasons, default_seasons

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


def _elapsed(quarter, quarter_seconds, season_type: str) -> int | None:
    """Game seconds played before this moment: 900 per quarter, then overtime periods.

    A regular-season overtime is ten minutes (since 2017) and a playoff one fifteen, which
    is the only reason the season type is needed.
    """
    if quarter is None or quarter_seconds is None or quarter != quarter or quarter_seconds != quarter_seconds:
        return None
    quarter, quarter_seconds = int(quarter), int(quarter_seconds)
    if quarter <= 4:
        return (quarter - 1) * 900 + (900 - quarter_seconds)
    period = 600 if season_type == "REG" else 900
    return 3600 + (quarter - 5) * period + (period - quarter_seconds)


def _own_yardline(text: str | None, team: str | None) -> int | None:
    """"BUF 34" -> 34 for Buffalo, 66 for its opponent; "50" -> 50."""
    if not text or not team:
        return None
    parts = text.split()
    if len(parts) == 1:
        return int(parts[0]) if parts[0].isdigit() else None
    side, number = parts[0], parts[-1]
    if not number.isdigit():
        return None
    return int(number) if side == team else 100 - int(number)


def _minutes(text: str | None) -> int | None:
    """"7:48" -> 468 seconds."""
    if not text or ":" not in text:
        return None
    minutes, seconds = text.split(":", 1)
    return int(minutes) * 60 + int(seconds) if minutes.isdigit() and seconds.isdigit() else None


def _score_type(play: dict) -> str | None:
    """How a scoring play scored."""
    if play["sp"] != 1:
        return None
    if _flag(play["touchdown"]):
        return "TD"
    if play["field_goal_result"] == "made":
        return "FG"
    if play["extra_point_result"] == "good":
        return "XP"
    if play["two_point_conv_result"] == "success":
        return "2PT"
    if _flag(play["safety"]):
        return "SAF"
    if _flag(play["defensive_two_point_conv"]):
        return "DEF2"
    return None


def collect_game_plays(pbp: pl.DataFrame, season: int, games: set[str], codes, team_ids) -> list[dict]:
    """Every play of every game in the season, for the game pages.

    Administrative rows (the game's opening line, "END QUARTER", timeouts) carry no play
    type and are left out; a penalty that wiped a play out is kept, because it moved the
    ball and the clock.
    """
    plays = pbp.filter(
        pl.col("game_id").is_in(list(games))
        & (pl.col("play_type").is_not_null() | (pl.col("penalty").fill_null(0) == 1))
    )
    def team(code):
        return team_ids.get(resolve(codes, season, code)) if code else None

    rows = []
    for play in plays.iter_rows(named=True):
        # A two-point try is worth 2 to the players on it and nothing else: its yards and
        # its catch are not stat-line yards or receptions.
        two_point_try = _flag(play["two_point_attempt"])
        fumbler = play["fumbled_1_player_id"] if _flag(play["fumble_lost"]) else None
        score = _score_type(play)
        if score == "TD":
            scorer = play["td_team"]
        elif score in ("SAF", "DEF2"):
            scorer = play["defteam"]
        else:
            scorer = play["posteam"] if score else None
        wp = play["vegas_home_wp"]
        wpa = play["vegas_home_wpa"]
        post = wp + wpa if wp is not None and wpa is not None and wp == wp and wpa == wpa else None
        rows.append({
            "game_id": play["game_id"],
            "play_id": int(play["play_id"]),
            "season": season,
            "week": int(play["week"]),
            "season_type": play["season_type"],
            "sequence": _small(play["order_sequence"]),
            "quarter": _small(play["qtr"]),
            "clock": play["time"],
            "quarter_seconds": _small(play["quarter_seconds_remaining"]),
            "team_id": team(play["posteam"]),
            "drive": _small(play["fixed_drive"]),
            "down": _small(play["down"]),
            "distance": _small(play["ydstogo"]),
            "yardline": play["yrdln"],
            "yardline_100": _small(play["yardline_100"]),
            "play_type": play["play_type"],
            "description": play["desc"],
            "yards": _small(play["yards_gained"]),
            "epa": play["epa"],
            "success": None if play["success"] is None or play["success"] != play["success"] else bool(play["success"]),
            "is_pass": _flag(play["pass"]),
            "is_rush": _flag(play["rush"]),
            "touchdown": _flag(play["touchdown"]),
            "turnover": _flag(play["interception"]) or _flag(play["fumble_lost"]),
            "penalty": _flag(play["penalty"]),
            "home_wp": wp,
            "home_wp_post": None if post is None else min(1.0, max(0.0, post)),
            "home_score": _small(play["total_home_score"]),
            "away_score": _small(play["total_away_score"]),
            "score_type": score,
            "score_team_id": team(scorer),
            "passer_id": play["passer_player_id"],
            "rusher_id": play["rusher_player_id"],
            "receiver_id": play["receiver_player_id"],
            "fumble_lost_id": fumbler,
            "passing_yards": None if two_point_try else _small(play["passing_yards"]),
            "rushing_yards": None if two_point_try else _small(play["rushing_yards"]),
            "receiving_yards": None if two_point_try else _small(play["receiving_yards"]),
            "complete": _flag(play["complete_pass"]) and not two_point_try,
            "interception": _flag(play["interception"]),
            "pass_touchdown": _flag(play["pass_touchdown"]),
            "rush_touchdown": _flag(play["rush_touchdown"]),
            "two_point": two_point_try and play["two_point_conv_result"] == "success",
        })
    return rows


def collect_game_drives(pbp: pl.DataFrame, season: int, games: set[str], codes, team_ids) -> list[dict]:
    """Every possession of every game in the season, for the game pages."""
    plays = pbp.filter(
        pl.col("game_id").is_in(list(games)) & pl.col("posteam").is_not_null() & pl.col("fixed_drive").is_not_null()
    ).sort(["game_id", "order_sequence"])
    drives = plays.group_by(["game_id", "fixed_drive"], maintain_order=True).agg(
        pl.col("week").first(), pl.col("season_type").first(), pl.col("posteam").first(),
        pl.col("drive_quarter_start").first(), pl.col("drive_game_clock_start").first(),
        pl.col("qtr").first().alias("first_qtr"), pl.col("quarter_seconds_remaining").first().alias("first_seconds"),
        pl.col("drive_start_yard_line").first(), pl.col("drive_end_yard_line").first(),
        pl.col("drive_play_count").first(), pl.col("ydsnet").drop_nulls().first(),
        pl.col("drive_first_downs").first(), pl.col("drive_time_of_possession").first(),
        pl.col("fixed_drive_result").first(), pl.col("drive_start_transition").first(),
        pl.col("posteam_score").min().alias("score_before"), pl.col("posteam_score_post").max().alias("score_after"),
    )
    rows = []
    for drive in drives.iter_rows(named=True):
        code = drive["posteam"]
        before, after = drive["score_before"], drive["score_after"]
        points = int(after - before) if before is not None and after is not None and after == after and before == before else None
        rows.append({
            "game_id": drive["game_id"],
            "drive": int(drive["fixed_drive"]),
            "season": season,
            "week": int(drive["week"]),
            "season_type": drive["season_type"],
            "team_id": team_ids.get(resolve(codes, season, code)),
            "quarter": _small(drive["drive_quarter_start"]) or _small(drive["first_qtr"]),
            "clock": (drive["drive_game_clock_start"] or "")[:5] or None,
            "elapsed": _elapsed(drive["first_qtr"], drive["first_seconds"], drive["season_type"]),
            "start_yardline": _own_yardline(drive["drive_start_yard_line"], code),
            "end_yardline": _own_yardline(drive["drive_end_yard_line"], code),
            "plays": _small(drive["drive_play_count"]),
            "yards": _small(drive["ydsnet"]),
            "first_downs": _small(drive["drive_first_downs"]),
            "seconds": _minutes(drive["drive_time_of_possession"]),
            "result": drive["fixed_drive_result"],
            "points": max(points, 0) if points is not None else None,
            "started_by": drive["drive_start_transition"],
        })
    return rows


def ingest_plays(seasons: list[int], weeks: list[int] | None = None) -> tuple[int, int]:
    """Write the tables for the given seasons. Returns (targets written, lane rows written).

    The game-page tables are written only for seasons from ``FIRST_GAME_PAGE_SEASON``.
    """
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
    recent = games_in_weeks(seasons, weeks)
    for season in seasons:
        games = season_game_ids(season)
        if recent is not None:
            games &= recent
        pbp = nfl.load_pbp([season])
        targets = collect_targets(pbp, season, games, codes, team_ids)
        lanes = collect_run_lanes(pbp, season, games, stat_keys)
        written_targets += replace_scoped("play_targets", targets, scope_columns=["game_id"])
        written_lanes += replace_scoped("player_run_lanes", lanes, scope_columns=["game_id"])
        logger.info("plays %d: %d targets, %d run-lane rows", season, len(targets), len(lanes))
        if season >= FIRST_GAME_PAGE_SEASON:
            plays = collect_game_plays(pbp, season, games, codes, team_ids)
            drives = collect_game_drives(pbp, season, games, codes, team_ids)
            replace_scoped("game_plays", plays, scope_columns=["game_id"])
            replace_scoped("game_drives", drives, scope_columns=["game_id"])
            logger.info("game pages %d: %d plays, %d drives", season, len(plays), len(drives))
    return written_targets, written_lanes


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest every target and designed runs by lane from play-by-play.")
    parser.add_argument(
        "--seasons", type=int, nargs="+", default=default_seasons(STATS),
        help="Seasons to ingest (default: 2009 through the latest played season).",
    )
    add_weeks_argument(parser)
    args = parser.parse_args()
    ingest_plays(args.seasons, weeks=args.weeks)
