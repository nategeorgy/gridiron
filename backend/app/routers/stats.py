"""Stats endpoints: the filterable leaderboard.

Supports two modes:
  - Season aggregate (no ``week``): one row per player, counting stats summed,
    rate stats averaged, plus season-derived per-game metrics.
  - Single week (``week`` provided): raw per-game stat lines.

Season-derived metrics (fantasy_ppg_*, routes_run_per_game) are computed here
by aggregating player_stats rows — never stored as columns (see CLAUDE.md).
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Player, PlayerStats, Team

router = APIRouter(prefix="/stats", tags=["stats"])

# Counting stats — summed when aggregating a season.
SUM_METRICS = [
    "passing_yards", "passing_tds", "interceptions", "completions", "attempts",
    "rushing_yards", "rushing_tds", "carries", "receiving_yards", "receiving_tds",
    "receptions", "targets", "fumbles", "fumbles_lost", "air_yards",
    "yards_after_catch", "epa", "rushing_epa", "receiving_epa",
    "red_zone_rush_attempts", "red_zone_targets", "routes_run", "snap_count",
    "slot_snaps", "unrealized_air_yards",
    "fantasy_points_ppr", "fantasy_points_half", "fantasy_points_std",
]

# Rate / share stats — averaged when aggregating a season.
AVG_METRICS = [
    "cpoe", "air_yards_share", "target_share", "racr", "wopr", "snap_share",
    "adot", "passer_rating", "red_zone_rush_share", "targets_per_route_run",
    "route_participation", "yards_per_route_run", "yards_per_target",
    "yards_per_reception",
]

# Season-derived per-game metrics: key -> the per-game column they aggregate.
PPG_METRICS = {
    "fantasy_ppg_ppr": "fantasy_points_ppr",
    "fantasy_ppg_half": "fantasy_points_half",
    "fantasy_ppg_std": "fantasy_points_std",
    "routes_run_per_game": "routes_run",
}

ALLOWED_METRICS = set(SUM_METRICS) | set(AVG_METRICS) | set(PPG_METRICS) | {"games_played"}


def _round(value: float | None, digits: int = 3) -> float | None:
    return round(value, digits) if value is not None else None


def _leaderboard_season(
    db: Session, season: int, season_type: str, position: str | None,
    metric: str, descending: bool, min_games: int, limit: int, offset: int,
) -> tuple[list[dict], int]:
    """Aggregate a full season into one ranked row per player."""
    games = func.count(func.distinct(PlayerStats.game_id))
    filters = [PlayerStats.season == season, PlayerStats.season_type == season_type]
    if position:
        filters.append(Player.position == position.upper())

    labeled = [func.sum(getattr(PlayerStats, name)).label(name) for name in SUM_METRICS]
    labeled += [func.avg(getattr(PlayerStats, name)).label(name) for name in AVG_METRICS]

    grouping = (Player.player_id, Player.name, Player.position, Team.abbreviation)
    base = (
        select(
            Player.player_id, Player.name.label("name"),
            Player.position.label("position"),
            Team.abbreviation.label("team_abbreviation"),
            games.label("games_played"), *labeled,
        )
        .join(Player, PlayerStats.player_id == Player.player_id)
        .outerjoin(Team, Player.team_id == Team.team_id)
        .where(*filters)
        .group_by(*grouping)
        .having(games >= min_games)
    )

    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0

    # Resolve the ORDER BY expression for the requested metric.
    if metric == "games_played":
        order_expr = games
    elif metric in PPG_METRICS:
        base_col = getattr(PlayerStats, PPG_METRICS[metric])
        order_expr = func.sum(base_col) / func.nullif(games, 0)
    elif metric in AVG_METRICS:
        order_expr = func.avg(getattr(PlayerStats, metric))
    else:  # a summed counting stat
        order_expr = func.sum(getattr(PlayerStats, metric))
    order_expr = order_expr.desc().nulls_last() if descending else order_expr.asc().nulls_last()

    rows = db.execute(base.order_by(order_expr).limit(limit).offset(offset)).mappings().all()

    results: list[dict] = []
    for row in rows:
        record = dict(row)
        played = record["games_played"] or 0
        for key, column in PPG_METRICS.items():
            total_value = record.get(column)
            record[key] = _round(total_value / played) if played and total_value is not None else None
        for key in SUM_METRICS + AVG_METRICS:
            record[key] = _round(record.get(key))
        results.append(record)
    return results, total


def _leaderboard_week(
    db: Session, season: int, week: int, season_type: str, position: str | None,
    metric: str, descending: bool, limit: int, offset: int,
) -> tuple[list[dict], int]:
    """Return raw per-game stat lines for a single week, ranked by metric."""
    filters = [
        PlayerStats.season == season, PlayerStats.week == week,
        PlayerStats.season_type == season_type,
    ]
    if position:
        filters.append(Player.position == position.upper())

    # PPG metrics have no per-game meaning; fall back to their base column.
    sort_column = getattr(PlayerStats, PPG_METRICS.get(metric, metric))
    order_expr = sort_column.desc().nulls_last() if descending else sort_column.asc().nulls_last()

    query = (
        select(
            Player.player_id, Player.name.label("name"),
            Player.position.label("position"),
            Team.abbreviation.label("team_abbreviation"),
            PlayerStats,
        )
        .join(Player, PlayerStats.player_id == Player.player_id)
        .outerjoin(Team, Player.team_id == Team.team_id)
        .where(*filters)
    )

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.execute(query.order_by(order_expr).limit(limit).offset(offset)).all()

    results: list[dict] = []
    for player_id, name, position_value, team_abbreviation, stat_line in rows:
        record = {
            "player_id": player_id, "name": name, "position": position_value,
            "team_abbreviation": team_abbreviation, "games_played": 1,
        }
        for key in SUM_METRICS + AVG_METRICS:
            record[key] = _round(getattr(stat_line, key))
        for key, column in PPG_METRICS.items():
            record[key] = _round(getattr(stat_line, column))
        results.append(record)
    return results, total


@router.get("/leaderboard")
def leaderboard(
    season: int = Query(..., description="Season year, e.g. 2024"),
    week: int | None = Query(None, ge=1, le=22, description="Omit for a season aggregate"),
    season_type: str = Query("REG", pattern="^(REG|POST)$"),
    position: str | None = Query(None, description="QB, RB, WR, or TE"),
    metric: str = Query("fantasy_points_ppr", description="Metric to rank by"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    min_games: int = Query(1, ge=0, description="Season mode: minimum games played"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> dict:
    """Filterable player leaderboard (season aggregate or single week)."""
    if metric not in ALLOWED_METRICS:
        raise HTTPException(status_code=400, detail=f"Unknown metric '{metric}'")

    descending = order == "desc"
    if week is None:
        data, total = _leaderboard_season(
            db, season, season_type, position, metric, descending, min_games, limit, offset,
        )
    else:
        data, total = _leaderboard_week(
            db, season, week, season_type, position, metric, descending, limit, offset,
        )

    page = (offset // limit) + 1 if limit else 1
    return {
        "data": data, "total": total, "page": page, "limit": limit, "offset": offset,
        "season": season, "week": week, "season_type": season_type,
        "metric": metric, "order": order,
    }
