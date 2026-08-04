"""Ingest target distribution by pass depth and direction (M4).

`player_stats.air_yards` is a per-game *total*, and a total cannot be un-summed into
buckets — so the depth-of-target chart needs its own aggregation straight from
play-by-play. This script writes one row per (player, game, depth bucket, direction).

  depth_bucket  behind_los (< 0) | short_0_9 | intermediate_10_19 | deep_20_plus
  direction     left | middle | right   (nflfastR's own parse of the play description)

Direction is stored even though the shipped chart sums it away: it is one extra group
key on a pass over the same data, and adding it later would mean a second migration
and a second full backfill.

**Coverage.** A target is counted only when it has both a receiver id and an air-yards
value — about 88-90% of pass plays across 2020-2025. The rest are sacks, scrambles, and
throwaways, which have no receiver and no depth. Verified flat across all six seasons
(see docs/design/M4-exploration-viz.md §5), so this is a stable exclusion rather than a
season-specific gap.

Idempotent: ``INSERT ... ON CONFLICT DO UPDATE`` on the full key.
"""

import argparse
import logging

import nflreadpy as nfl
import polars as pl

from db import load_stat_keys, upsert

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("pipeline.target_depth")

DEFAULT_SEASONS = list(range(2020, 2026))


def _bucket_expr() -> pl.Expr:
    """Map air yards onto a depth bucket name. Upper bounds are exclusive."""
    expression = pl.when(pl.col("air_yards") < 0).then(pl.lit("behind_los"))
    expression = expression.when(pl.col("air_yards") < 10).then(pl.lit("short_0_9"))
    expression = expression.when(pl.col("air_yards") < 20).then(pl.lit("intermediate_10_19"))
    return expression.otherwise(pl.lit("deep_20_plus")).alias("depth_bucket")


def collect_season(season: int) -> list[dict]:
    """Aggregate one season's targets into (player, game, bucket, direction) rows."""
    plays = (
        nfl.load_pbp([season])
        .filter(
            (pl.col("pass_attempt") == 1)
            & pl.col("air_yards").is_not_null()
            & pl.col("receiver_player_id").is_not_null()
            & pl.col("pass_location").is_not_null()
        )
        .select(
            "game_id", "season", "week", "season_type",
            "receiver_player_id", "air_yards", "pass_location",
            "complete_pass", "yards_gained", "pass_touchdown",
        )
        .with_columns(_bucket_expr())
    )

    grouped = plays.group_by(
        ["receiver_player_id", "game_id", "depth_bucket", "pass_location"]
    ).agg(
        pl.len().alias("targets"),
        pl.col("complete_pass").sum().alias("receptions"),
        # Yards only count on completions — an incompletion gains nothing.
        (pl.col("yards_gained") * pl.col("complete_pass")).sum().alias("receiving_yards"),
        pl.col("pass_touchdown").sum().alias("receiving_tds"),
        pl.col("air_yards").sum().alias("air_yards"),
        pl.col("season").first().alias("season"),
        pl.col("week").first().alias("week"),
        pl.col("season_type").first().alias("season_type"),
    )

    rows = [
        {
            "player_id": row["receiver_player_id"],
            "game_id": row["game_id"],
            "depth_bucket": row["depth_bucket"],
            "direction": row["pass_location"],
            "season": int(row["season"]) if row["season"] is not None else None,
            "week": int(row["week"]) if row["week"] is not None else None,
            "season_type": row["season_type"],
            "targets": int(row["targets"] or 0),
            "receptions": int(row["receptions"] or 0),
            "receiving_yards": int(row["receiving_yards"] or 0),
            "receiving_tds": int(row["receiving_tds"] or 0),
            "air_yards": int(row["air_yards"] or 0),
        }
        for row in grouped.iter_rows(named=True)
    ]
    logger.info("target depth %d: %d player-game-bucket-direction rows", season, len(rows))
    return rows


def ingest_target_depth(seasons: list[int]) -> int:
    """Write target-depth rows for the given seasons. Returns rows written."""
    # Only keep players/games we already track, so this never inserts rows for
    # defenders or out-of-scope players (the same guard the other enrichment
    # passes use).
    stat_keys = load_stat_keys()

    written = 0
    for season in seasons:
        rows = collect_season(season)
        kept = [row for row in rows if (row["player_id"], row["game_id"]) in stat_keys]
        skipped = len(rows) - len(kept)
        written += upsert(
            "player_target_depth", kept,
            conflict_columns=["player_id", "game_id", "depth_bucket", "direction"],
        )
        logger.info(
            "target depth %d: wrote %d rows (skipped %d with no matching stat line)",
            season, len(kept), skipped,
        )
    logger.info("target depth: %d rows written for seasons %s", written, seasons)
    return written


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Ingest target distribution by pass depth and direction."
    )
    parser.add_argument(
        "--seasons", type=int, nargs="+", default=DEFAULT_SEASONS,
        help="Seasons to ingest (default: 2020-2025).",
    )
    args = parser.parse_args()
    ingest_target_depth(args.seasons)
