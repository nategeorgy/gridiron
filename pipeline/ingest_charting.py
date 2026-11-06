"""Ingest play charting for the player page: FTN's play types and the routes receivers ran.

Two tables, from two nflverse feeds with different calendars:

  play_charting   FTN's hand charting of every play: play action, screen, RPO, motion at
                  the snap, no huddle, the quarterback's alignment (shotgun, under center,
                  pistol) and how many players stood in the backfield. Published weekly in
                  season, so it runs with the Wednesday job. Stored from
                  ``FIRST_GAME_PAGE_SEASON`` (2025), since its only reader joins it to
                  ``game_plays``, which starts there. Credit: FTN Data via nflverse.
  play_routes     the route the targeted receiver ran on each targeted pass, from the
                  participation feed. 2016 on, and a season behind: FTN delivers a season
                  only after its post-season, so the season in progress never has routes.
                  Only targeted passes carry a route, which is all the route tree needs.

Both are **replaced per game**, like every play table: a corrected file can drop or
renumber a play, and only games present in the download are touched, so a failed
download cannot empty a season. Plays are kept only for games the schedule holds (the
foreign key), and a route only for a play that is a stored target, so the join on the
page never finds a route with nobody to give it to.

    python ingest_charting.py                     # both feeds, every season each serves
    python ingest_charting.py --seasons 2025 2026 --only charting
    python ingest_charting.py --seasons 2016 2017 2018 2019 2020 2021 2022 2023 2024 2025 --only routes
"""

import argparse
import logging

import nflreadpy as nfl
import polars as pl
from sqlalchemy import text

from db import add_weeks_argument, games_in_weeks, get_engine, replace_scoped
from seasons import FIRST_GAME_PAGE_SEASON, FTN, PARTICIPATION, clamp_seasons, default_seasons

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("pipeline.charting")

QB_LOCATIONS = {"S", "U", "P"}


def _flag(value) -> bool | None:
    """FTN flags arrive as booleans, 1/0, or null; null stays null (not charted)."""
    if value is None or value != value:
        return None
    return bool(value)


def _small(value) -> int | None:
    if value is None or value != value:
        return None
    return int(value)


def _games(season: int) -> dict[str, tuple[int, str]]:
    """The schedule's games for a season, with their week and season type."""
    with get_engine().connect() as connection:
        rows = connection.execute(
            text("SELECT game_id, week, season_type FROM games WHERE season = :season"), {"season": season}
        ).all()
    return {game_id: (week, season_type) for game_id, week, season_type in rows}


def _stored_targets(season: int) -> set[tuple[str, int]]:
    with get_engine().connect() as connection:
        rows = connection.execute(
            text("SELECT game_id, play_id FROM play_targets WHERE season = :season"), {"season": season}
        ).all()
    return {(game_id, play_id) for game_id, play_id in rows}


def collect_charting(season: int, games: dict[str, tuple[int, str]], only: set[str] | None) -> list[dict]:
    frame = nfl.load_ftn_charting([season])
    rows = []
    for play in frame.iter_rows(named=True):
        game_id = play.get("nflverse_game_id")
        if game_id not in games or (only is not None and game_id not in only):
            continue
        week, season_type = games[game_id]
        location = play.get("qb_location")
        rows.append({
            "game_id": game_id, "play_id": int(play["nflverse_play_id"]),
            "season": season, "week": week, "season_type": season_type,
            "play_action": _flag(play.get("is_play_action")),
            "screen": _flag(play.get("is_screen_pass")),
            "rpo": _flag(play.get("is_rpo")),
            "motion": _flag(play.get("is_motion")),
            "no_huddle": _flag(play.get("is_no_huddle")),
            "qb_location": location if location in QB_LOCATIONS else None,
            "backfield": _small(play.get("n_offense_backfield")),
        })
    return rows


def collect_routes(season: int, games: dict[str, tuple[int, str]], only: set[str] | None) -> list[dict]:
    frame = nfl.load_participation([season]).select("nflverse_game_id", "play_id", "route").filter(
        pl.col("route").is_not_null() & (pl.col("route") != "")
    )
    targets = _stored_targets(season)
    rows = []
    for play in frame.iter_rows(named=True):
        game_id = play["nflverse_game_id"]
        play_id = int(play["play_id"])
        if game_id not in games or (only is not None and game_id not in only) or (game_id, play_id) not in targets:
            continue
        week, season_type = games[game_id]
        rows.append({"game_id": game_id, "play_id": play_id, "season": season, "week": week,
                     "season_type": season_type, "route": str(play["route"]).upper()[:20]})
    return rows


def ingest_charting(seasons: list[int], feeds: set[str], weeks: list[int] | None = None) -> None:
    recent = games_in_weeks(seasons, weeks)
    if "charting" in feeds:
        for season in clamp_seasons([s for s in seasons if s >= FIRST_GAME_PAGE_SEASON], FTN):
            rows = collect_charting(season, _games(season), recent)
            replace_scoped("play_charting", rows, scope_columns=["game_id"])
            logger.info("charting %d: %d plays", season, len(rows))
    if "routes" in feeds:
        for season in clamp_seasons(seasons, PARTICIPATION):
            rows = collect_routes(season, _games(season), recent)
            replace_scoped("play_routes", rows, scope_columns=["game_id"])
            logger.info("routes %d: %d targets with a route", season, len(rows))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest FTN play charting and participation routes.")
    parser.add_argument(
        "--seasons", type=int, nargs="+", default=None,
        help="Seasons to ingest (default: every season each feed serves from 2025 for charting, "
             "the newest participation season for routes).",
    )
    parser.add_argument("--only", choices=("charting", "routes"), default=None, help="Just one of the two feeds.")
    add_weeks_argument(parser)
    args = parser.parse_args()
    feeds = {args.only} if args.only else {"charting", "routes"}
    seasons = args.seasons
    if seasons is None:
        # Charting from the game pages' first season; routes only for the newest season the
        # participation feed serves (older ones are a one-off backfill, named explicitly).
        seasons = sorted(set(default_seasons(FTN)) | {PARTICIPATION.latest()})
    ingest_charting(seasons, feeds, weeks=args.weeks)
