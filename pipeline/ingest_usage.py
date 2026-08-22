"""Ingest snap and route usage (M2 enrichment pass).

Fills the opportunity columns that ``ingest_stats.py`` leaves NULL, from two feeds
the weekly stats file doesn't cover:

**Snaps** — ``load_snap_counts`` (PFR game-level snap counts, 2012+). PFR keys players
by its own id, so the script builds a ``pfr_id -> gsis_id`` crosswalk from
``load_players`` to join it onto our stat lines.

  snap_count  = offensive snaps played
  snap_share  = share of the team's offensive snaps (PFR's own denominator)

**Routes** — ``load_participation`` lists the 11 offensive players on the field for
every play, using GSIS ids that match ours directly. Joined to play-by-play, that
gives per-player pass-play participation:

  routes_run          = pass plays the player was on the field for
  route_participation = those plays / his team's pass plays in that game
  targets_per_route_run, yards_per_route_run = derived from the stat line

**Approximation to be honest about:** ``routes_run`` here is *pass-play
participation*, not charted routes. A back who stays in to block, or a tight end kept
in as a sixth blocker, counts as having run a route. True route counts need charting
data no free source publishes, so this slightly overstates routes for run-blocking
backs and tight ends — and therefore slightly understates their targets per route run.
It is accurate for receivers and directionally right for everyone. QBs are skipped
(a route count for a passer is meaningless).

``slot_snaps`` is deliberately left NULL: no free nflverse feed carries per-player
alignment, only formation and personnel groupings.

This is an enrichment pass — it only updates stat lines that already exist, and it is
idempotent (``INSERT ... ON CONFLICT DO UPDATE``).
"""

import argparse
import logging

import nflreadpy as nfl
import polars as pl
from sqlalchemy import text

from db import get_engine, load_stat_keys, upsert
from seasons import STATS, clamp_seasons, default_seasons

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("pipeline.usage")

# play_type == "pass" counts every dropback that ended in a pass or a sack, and
# excludes designed runs and QB scrambles — the standard route denominator.
PASS_PLAY_TYPE = "pass"


def _pfr_to_gsis() -> dict[str, str]:
    """Build a PFR-id -> GSIS-id crosswalk from the nflverse players file."""
    players = nfl.load_players().select(["gsis_id", "pfr_id"])
    crosswalk = {
        row["pfr_id"]: row["gsis_id"]
        for row in players.iter_rows(named=True)
        if row["pfr_id"] and row["gsis_id"]
    }
    logger.info("crosswalk: %d PFR ids mapped to GSIS ids", len(crosswalk))
    return crosswalk


def _db_positions() -> dict[str, str]:
    """Return ``player_id -> position`` for the players we track."""
    with get_engine().connect() as connection:
        result = connection.execute(text("SELECT player_id, position FROM players"))
        return {player_id: position for player_id, position in result}


def collect_snaps(seasons: list[int], crosswalk: dict[str, str]) -> dict[tuple, dict]:
    """Return ``(player_id, game_id) -> {snap_count, snap_share}`` from PFR snaps."""
    snaps = nfl.load_snap_counts(seasons=seasons).select(
        ["game_id", "pfr_player_id", "offense_snaps", "offense_pct"]
    )
    collected: dict[tuple, dict] = {}
    unmapped = 0
    for row in snaps.iter_rows(named=True):
        player_id = crosswalk.get(row["pfr_player_id"])
        if player_id is None:
            unmapped += 1
            continue
        snap_count = row["offense_snaps"]
        collected[(player_id, row["game_id"])] = {
            "snap_count": int(snap_count) if snap_count is not None else None,
            "snap_share": row["offense_pct"],
        }
    logger.info(
        "snaps: %d player-games collected (%d rows with an unmapped PFR id)",
        len(collected), unmapped,
    )
    return collected


def collect_routes(season: int, positions: dict[str, str]) -> dict[tuple, dict]:
    """Return ``(player_id, game_id) -> {routes_run, route_participation}``.

    Counts, per game, how many of his own team's pass plays each non-QB skill player
    was on the field for (see the module docstring on what this approximates).
    """
    # play_id is typed inconsistently across seasons (integer in some, float in
    # others), so both sides are cast before the join.
    participation = nfl.load_participation(seasons=[season]).select(
        ["nflverse_game_id", pl.col("play_id").cast(pl.Float64), "offense_players"]
    )
    pass_plays = (
        nfl.load_pbp([season])
        .filter(pl.col("play_type") == PASS_PLAY_TYPE)
        .select(["game_id", pl.col("play_id").cast(pl.Float64), "posteam"])
    )
    # Keep only participation rows belonging to a pass play, carrying the possession
    # team so each team's pass-play denominator can be counted in the same pass.
    joined = participation.join(
        pass_plays,
        left_on=["nflverse_game_id", "play_id"],
        right_on=["game_id", "play_id"],
        how="inner",
    )

    routes: dict[tuple[str, str], int] = {}          # (player_id, game_id) -> routes
    player_team: dict[tuple[str, str], str] = {}     # (player_id, game_id) -> team
    team_pass_plays: dict[tuple[str, str], int] = {}  # (game_id, team) -> pass plays
    for row in joined.iter_rows(named=True):
        game_id = row["nflverse_game_id"]
        team = row["posteam"]
        if game_id is None or team is None:
            continue
        team_pass_plays[(game_id, team)] = team_pass_plays.get((game_id, team), 0) + 1
        for player_id in (row["offense_players"] or "").split(";"):
            if not player_id or positions.get(player_id) in (None, "QB"):
                continue
            key = (player_id, game_id)
            routes[key] = routes.get(key, 0) + 1
            player_team[key] = team

    collected: dict[tuple, dict] = {}
    for key, route_count in routes.items():
        _, game_id = key
        denominator = team_pass_plays.get((game_id, player_team[key]))
        collected[key] = {
            "routes_run": route_count,
            "route_participation": route_count / denominator if denominator else None,
        }
    logger.info("routes %d: %d player-games collected", season, len(collected))
    return collected


def _derive_route_rates(seasons: list[int]) -> int:
    """Set targets/yards per route run from each row's own targets and yards.

    Derived in SQL after the route counts land, so the numerator and denominator
    always come from the same stat line.
    """
    statement = text(
        """
        UPDATE player_stats
           SET targets_per_route_run = CASE
                   WHEN routes_run > 0 THEN targets::float / routes_run END,
               yards_per_route_run = CASE
                   WHEN routes_run > 0 THEN receiving_yards::float / routes_run END
         WHERE season = ANY(:seasons)
           AND routes_run IS NOT NULL
        """
    )
    with get_engine().begin() as connection:
        result = connection.execute(statement, {"seasons": seasons})
    logger.info("route rates: derived TPRR/YPRR on %d rows", result.rowcount)
    return result.rowcount


def ingest_usage(seasons: list[int], include_routes: bool = True) -> int:
    """Update snap and route usage columns for the given seasons."""
    # This feed has nothing for a season that has not kicked off yet, and the
    # loaders take every season in one call — so an unavailable season would fail
    # the whole run rather than part of it. See seasons.py.
    seasons = clamp_seasons(seasons, STATS)
    if not seasons:
        logger.info("nothing to ingest: no requested season is available yet")
        return 0

    stat_keys = load_stat_keys()
    positions = _db_positions()

    merged: dict[tuple, dict] = {}

    def merge(collected: dict[tuple, dict]) -> int:
        """Fold a source's values into the pending row set, skipping unknown keys."""
        skipped = 0
        for key, values in collected.items():
            if key not in stat_keys:
                skipped += 1
                continue
            player_id, game_id = key
            row = merged.setdefault(key, {"player_id": player_id, "game_id": game_id})
            row.update(values)
        return skipped

    skipped = merge(collect_snaps(seasons, _pfr_to_gsis()))
    if include_routes:
        # Participation and play-by-play are large; process one season at a time.
        for season in seasons:
            skipped += merge(collect_routes(season, positions))

    # Every row in a batch insert must carry the same keys, so fill the gaps: a
    # player-game found by one source but not the other gets an explicit NULL. This
    # script owns these columns and re-derives them in full on every run, so that is
    # the honest value — "this run found no snaps/routes for that player-game".
    for row in merged.values():
        row.setdefault("snap_count", None)
        row.setdefault("snap_share", None)
        if include_routes:
            row.setdefault("routes_run", None)
            row.setdefault("route_participation", None)

    written = upsert(
        "player_stats", list(merged.values()),
        conflict_columns=["player_id", "game_id"],
    )
    if include_routes:
        _derive_route_rates(seasons)
    logger.info(
        "usage: updated %d stat lines for seasons %s (skipped %d with no matching stat line)",
        written, seasons, skipped,
    )
    return written


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest snap counts and route usage.")
    parser.add_argument(
        "--seasons", type=int, nargs="+", default=default_seasons(STATS),
        help="Seasons to ingest (default: 2020 through the latest played season).",
    )
    parser.add_argument(
        "--skip-routes", action="store_true",
        help="Snaps only — skip the participation/play-by-play route derivation.",
    )
    args = parser.parse_args()
    ingest_usage(args.seasons, include_routes=not args.skip_routes)
