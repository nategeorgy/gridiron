"""Ingest per-player, per-game stats into the player_stats table.

Sources:
  - load_player_stats(week): general, advanced, and fantasy metrics
  - load_pbp: red-zone rushing/target derivations (see CLAUDE.md)

Metrics sourced from PFR/NGS/snap-count feeds (routes run, snap share, slot
snaps, etc.) are left NULL here and populated by a later enrichment pass.
"""

import argparse
import logging

import nflreadpy as nfl

from db import get_engine, load_team_id_map, upsert

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("pipeline.stats")

DEFAULT_SEASONS = list(range(2020, 2026))
SCOPE_POSITIONS = {"QB", "RB", "WR", "TE"}
RED_ZONE_YARDLINE = 20  # yards from the opponent's goal line


def _existing_ids(table_name: str, column: str) -> set:
    """Return the set of values for a column, used to guard foreign keys."""
    from sqlalchemy import text

    with get_engine().connect() as connection:
        result = connection.execute(text(f"SELECT {column} FROM {table_name}"))
        return {row[0] for row in result}


def passer_rating(
    completions: int | None,
    attempts: int | None,
    passing_yards: int | None,
    passing_tds: int | None,
    interceptions: int | None,
) -> float | None:
    """Compute the NFL passer rating; returns None when there are no attempts."""
    if not attempts:
        return None
    comp = completions or 0
    yards = passing_yards or 0
    tds = passing_tds or 0
    ints = interceptions or 0

    def clamp(value: float) -> float:
        return max(0.0, min(value, 2.375))

    a = clamp((comp / attempts - 0.3) * 5)
    b = clamp((yards / attempts - 3) * 0.25)
    c = clamp((tds / attempts) * 20)
    d = clamp(2.375 - (ints / attempts) * 25)
    return round((a + b + c + d) / 6 * 100, 1)


def _safe_div(numerator: float | None, denominator: float | None) -> float | None:
    """Divide, returning None when the denominator is missing or zero."""
    if not denominator:
        return None
    return (numerator or 0) / denominator


def _total_epa(record: dict) -> float | None:
    """Sum available EPA components; None only if all three are missing."""
    components = [record.get(key) for key in ("passing_epa", "rushing_epa", "receiving_epa")]
    present = [value for value in components if value is not None]
    return sum(present) if present else None


def compute_red_zone(seasons: list[int]) -> tuple[dict, dict, dict]:
    """Derive red-zone rush/target counts from play-by-play.

    Returns three lookups:
      player_rush[(game_id, player_id)]  -> red-zone rush attempts
      player_targets[(game_id, player_id)] -> red-zone targets
      team_rush[(game_id, team)]         -> team red-zone rush attempts
    """
    pbp = nfl.load_pbp(seasons).select(
        ["game_id", "posteam", "yardline_100", "rush_attempt", "pass_attempt",
         "rusher_player_id", "receiver_player_id"]
    )
    red_zone = pbp.filter(pbp["yardline_100"] <= RED_ZONE_YARDLINE)

    def counts(frame, group_columns: list[str]) -> dict:
        grouped = frame.group_by(group_columns).len()
        result = {}
        for row in grouped.iter_rows(named=True):
            key = tuple(row[column] for column in group_columns)
            if any(part is None for part in key):
                continue
            result[key] = row["len"]
        return result

    rushes = red_zone.filter(red_zone["rush_attempt"] == 1)
    passes = red_zone.filter(red_zone["pass_attempt"] == 1)

    player_rush = counts(rushes, ["game_id", "rusher_player_id"])
    team_rush = counts(rushes, ["game_id", "posteam"])
    player_targets = counts(passes, ["game_id", "receiver_player_id"])
    logger.info("red-zone: %d player-rush, %d player-target game rows",
                len(player_rush), len(player_targets))
    return player_rush, player_targets, team_rush


def ingest_stats(seasons: list[int], include_red_zone: bool = True) -> int:
    """Load weekly stats for the given seasons and upsert player_stats rows."""
    weekly = nfl.load_player_stats(seasons, summary_level="week")
    team_map = load_team_id_map()
    valid_players = _existing_ids("players", "player_id")
    valid_games = _existing_ids("games", "game_id")

    if include_red_zone:
        player_rush, player_targets, team_rush = compute_red_zone(seasons)
    else:
        player_rush, player_targets, team_rush = {}, {}, {}

    rows: dict[tuple, dict] = {}
    skipped = 0
    for record in weekly.iter_rows(named=True):
        if record.get("position") not in SCOPE_POSITIONS:
            continue
        player_id = record.get("player_id")
        game_id = record.get("game_id")
        # Guard foreign keys: player and game must already exist.
        if player_id not in valid_players or game_id not in valid_games:
            skipped += 1
            continue

        team_abbr = record.get("team")
        targets = record.get("targets")
        receptions = record.get("receptions")
        receiving_yards = record.get("receiving_yards")
        receiving_air_yards = record.get("receiving_air_yards")

        rz_rush = player_rush.get((game_id, player_id))
        team_rz_rush = team_rush.get((game_id, team_abbr))

        std = record.get("fantasy_points")
        ppr = record.get("fantasy_points_ppr")
        half = (std + ppr) / 2 if std is not None and ppr is not None else None

        rows[(player_id, game_id)] = {
            "player_id": player_id,
            "game_id": game_id,
            "team_id": team_map.get(team_abbr),
            "season": record.get("season"),
            "week": record.get("week"),
            "season_type": record.get("season_type"),
            # General
            "passing_yards": record.get("passing_yards"),
            "passing_tds": record.get("passing_tds"),
            "interceptions": record.get("passing_interceptions"),
            "completions": record.get("completions"),
            "attempts": record.get("attempts"),
            "rushing_yards": record.get("rushing_yards"),
            "rushing_tds": record.get("rushing_tds"),
            "carries": record.get("carries"),
            "receiving_yards": receiving_yards,
            "receiving_tds": record.get("receiving_tds"),
            "receptions": receptions,
            "targets": targets,
            "fumbles": record.get("fumbles_total"),
            "fumbles_lost": record.get("fumbles_lost_total"),
            # Advanced (direct)
            "epa": _total_epa(record),
            "cpoe": record.get("passing_cpoe"),
            "air_yards": receiving_air_yards,
            "air_yards_share": record.get("air_yards_share"),
            "target_share": record.get("target_share"),
            "racr": record.get("racr"),
            "wopr": record.get("wopr"),
            "yards_after_catch": record.get("receiving_yards_after_catch"),
            "rushing_epa": record.get("rushing_epa"),
            "receiving_epa": record.get("receiving_epa"),
            # Advanced (derived)
            "adot": _safe_div(receiving_air_yards, targets),
            "passer_rating": passer_rating(
                record.get("completions"), record.get("attempts"),
                record.get("passing_yards"), record.get("passing_tds"),
                record.get("passing_interceptions"),
            ),
            "yards_per_target": _safe_div(receiving_yards, targets),
            "yards_per_reception": _safe_div(receiving_yards, receptions),
            # Advanced (red zone from pbp)
            "red_zone_rush_attempts": rz_rush,
            "red_zone_targets": player_targets.get((game_id, player_id)),
            "red_zone_rush_share": _safe_div(rz_rush, team_rz_rush),
            # Fantasy
            "fantasy_points_std": std,
            "fantasy_points_ppr": ppr,
            "fantasy_points_half": half,
        }

    written = upsert(
        "player_stats", list(rows.values()),
        conflict_columns=["player_id", "game_id"],
    )
    logger.info(
        "ingested %d player_stats rows for seasons %s (skipped %d unmatched)",
        written, seasons, skipped,
    )
    return written


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest per-game player stats.")
    parser.add_argument(
        "--seasons", type=int, nargs="+", default=DEFAULT_SEASONS,
        help="Seasons to ingest (default: 2020-2025).",
    )
    parser.add_argument(
        "--skip-red-zone", action="store_true",
        help="Skip the play-by-play red-zone derivation (faster).",
    )
    args = parser.parse_args()
    ingest_stats(args.seasons, include_red_zone=not args.skip_red_zone)
