"""Ingest per-player, per-game stats into the player_stats table.

Sources:
  - load_player_stats(week): general, advanced, and fantasy metrics
  - load_pbp: red-zone, inside-yardline, and unrealized-air-yard derivations

Two sibling scripts enrich these rows afterwards: ``ingest_expected.py`` (expected
components + market share) and ``ingest_usage.py`` (snaps + routes). ``slot_snaps``
stays NULL — no free data source provides per-player alignment.
"""

import argparse
import logging

import nflreadpy as nfl
import polars as pl

from db import get_engine, load_team_id_map, upsert
from availability import mask_unavailable, unavailable_columns
from franchises import contemporary_code_map, resolve
from seasons import STATS, clamp_seasons, default_seasons

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("pipeline.stats")

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


def compute_pbp_derived(seasons: list[int]) -> dict[str, dict]:
    """Derive the play-by-play metrics that no weekly feed provides.

    Returns a dict of lookups, all keyed by ``(game_id, player_id)`` except the team
    red-zone total:

      rz_rush          -> red-zone rush attempts
      rz_targets       -> red-zone targets
      rz_team_rush     -> team red-zone rush attempts, keyed ``(game_id, team)``
      inside_10/5/2    -> rush attempts from inside the opponent's 10 / 5 / 2
      unrealized_air   -> air yards on the player's *incomplete* targets
    """
    pbp = nfl.load_pbp(seasons).select(
        ["game_id", "posteam", "yardline_100", "rush_attempt", "pass_attempt",
         "complete_pass", "air_yards", "rusher_player_id", "receiver_player_id"]
    )

    def counts(frame, group_columns: list[str]) -> dict:
        grouped = frame.group_by(group_columns).len()
        result = {}
        for row in grouped.iter_rows(named=True):
            key = tuple(row[column] for column in group_columns)
            if any(part is None for part in key):
                continue
            result[key] = row["len"]
        return result

    rushes = pbp.filter(pbp["rush_attempt"] == 1)
    red_zone = pbp.filter(pbp["yardline_100"] <= RED_ZONE_YARDLINE)
    rz_rushes = red_zone.filter(red_zone["rush_attempt"] == 1)
    rz_passes = red_zone.filter(red_zone["pass_attempt"] == 1)

    def rushes_inside(yardline: int) -> dict:
        inside = rushes.filter(rushes["yardline_100"] <= yardline)
        return counts(inside, ["game_id", "rusher_player_id"])

    # Unrealized air yards: how much downfield opportunity was thrown at a player and
    # not converted — a target that fell incomplete still bought him nothing.
    incomplete = pbp.filter((pbp["pass_attempt"] == 1) & (pbp["complete_pass"] == 0))
    # `sum()` over an all-null group returns 0 in polars, not null — which in a season
    # with no charted air yards at all would invent "0 unrealized air yards" for every
    # receiver. Only sum where at least one value is actually present.
    unrealized = (
        incomplete.group_by(["game_id", "receiver_player_id"])
        .agg(
            air_yards=pl.when(pl.col("air_yards").is_not_null().any())
            .then(pl.col("air_yards").sum())
            .otherwise(None)
        )
    )
    unrealized_air = {
        (row["game_id"], row["receiver_player_id"]): row["air_yards"]
        for row in unrealized.iter_rows(named=True)
        if row["game_id"] is not None and row["receiver_player_id"] is not None
    }

    derived = {
        "rz_rush": counts(rz_rushes, ["game_id", "rusher_player_id"]),
        "rz_targets": counts(rz_passes, ["game_id", "receiver_player_id"]),
        "rz_team_rush": counts(rz_rushes, ["game_id", "posteam"]),
        "inside_10": rushes_inside(10),
        "inside_5": rushes_inside(5),
        "inside_2": rushes_inside(2),
        "unrealized_air": unrealized_air,
    }
    logger.info(
        "play-by-play derived: %d red-zone rush rows, %d inside-5 rows, %d unrealized-air rows",
        len(derived["rz_rush"]), len(derived["inside_5"]), len(unrealized_air),
    )
    return derived


def ingest_stats(seasons: list[int], include_pbp: bool = True) -> int:
    """Load weekly stats for the given seasons and upsert player_stats rows."""
    # This feed has nothing for a season that has not kicked off yet, and the
    # loaders take every season in one call — so an unavailable season would fail
    # the whole run rather than part of it. See seasons.py.
    seasons = clamp_seasons(seasons, STATS)
    if not seasons:
        logger.info("nothing to ingest: no requested season is available yet")
        return 0

    weekly = nfl.load_player_stats(seasons, summary_level="week")
    team_map = load_team_id_map()
    # The stats and play-by-play feeds normalise every franchise to its *current* code
    # (the 2004 Rams arrive as LA); the schedule, and therefore `games` and `teams`,
    # uses the code that was actually in use (STL). Reconcile onto the schedule's
    # answer so a stat line and its fixture point at the same team. See franchises.py.
    franchise_codes = contemporary_code_map(seasons)
    valid_players = _existing_ids("players", "player_id")
    valid_games = _existing_ids("games", "game_id")

    pbp_derived = compute_pbp_derived(seasons) if include_pbp else {}

    def lookup(name: str, key: tuple) -> float | int | None:
        return pbp_derived.get(name, {}).get(key)

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

        # Two codes, deliberately. `team_abbr` stays as the feed wrote it, because the
        # play-by-play lookups below are keyed by the same normalised code; only the
        # stored team_id is resolved back to the one the schedule uses.
        season = record.get("season")
        team_abbr = record.get("team")
        team_id = team_map.get(resolve(franchise_codes, season, team_abbr))
        targets = record.get("targets")
        receptions = record.get("receptions")
        receiving_yards = record.get("receiving_yards")
        receiving_air_yards = record.get("receiving_air_yards")

        rz_rush = lookup("rz_rush", (game_id, player_id))
        team_rz_rush = lookup("rz_team_rush", (game_id, team_abbr))

        std = record.get("fantasy_points")
        ppr = record.get("fantasy_points_ppr")
        half = (std + ppr) / 2 if std is not None and ppr is not None else None

        # A feed reports an unavailable stat as 0, not as missing — see
        # availability.py. Mask before storing so a season that never recorded
        # targets stores NULL rather than a zero that sorts and averages.
        rows[(player_id, game_id)] = mask_unavailable({
            "player_id": player_id,
            "game_id": game_id,
            "team_id": team_id,
            "season": season,
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
            # Advanced (derived from play-by-play)
            "red_zone_rush_attempts": rz_rush,
            "red_zone_targets": lookup("rz_targets", (game_id, player_id)),
            "red_zone_rush_share": _safe_div(rz_rush, team_rz_rush),
            "rush_att_inside_10": lookup("inside_10", (game_id, player_id)),
            "rush_att_inside_5": lookup("inside_5", (game_id, player_id)),
            "rush_att_inside_2": lookup("inside_2", (game_id, player_id)),
            "unrealized_air_yards": lookup("unrealized_air", (game_id, player_id)),
            # Fantasy
            "fantasy_points_std": std,
            "fantasy_points_ppr": ppr,
            "fantasy_points_half": half,
        }, season)

    written = upsert(
        "player_stats", list(rows.values()),
        conflict_columns=["player_id", "game_id"],
    )
    logger.info(
        "ingested %d player_stats rows for seasons %s (skipped %d unmatched)",
        written, seasons, skipped,
    )
    for season in seasons:
        masked = unavailable_columns(season)
        if masked:
            logger.info("%d: stored NULL for %d column(s) with no data that season: %s",
                        season, len(masked), ", ".join(masked))
    return written


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest per-game player stats.")
    parser.add_argument(
        "--seasons", type=int, nargs="+", default=default_seasons(STATS),
        help="Seasons to ingest (default: 2020 through the latest played season).",
    )
    parser.add_argument(
        "--skip-pbp", action="store_true",
        help="Skip the play-by-play derivations — red zone, inside 10/5/2, "
             "unrealized air yards (faster, leaves those columns NULL).",
    )
    args = parser.parse_args()
    ingest_stats(args.seasons, include_pbp=not args.skip_pbp)
