"""Stats endpoints: the filterable leaderboard and the fantasy-intelligence board.

The leaderboard supports two modes:
  - Season aggregate (no ``week``): one row per player, counting stats summed,
    rate stats averaged, plus season-derived per-game metrics.
  - Single week (``week`` provided): raw per-game stat lines.

Season-derived metrics (fantasy_ppg_*, routes_run_per_game) are computed here
by aggregating player_stats rows — never stored as columns (see CLAUDE.md).

Fantasy points and expected fantasy points (xFP) are both computed per-request from
the active ScoringConfig — the actual side from the real stat components, the
expected side from the stored ffopportunity components — so the two are always
comparable in the user's own league scoring.

``/stats/intelligence`` (M3) adds the derived signals — VORP, opportunity rating,
buy-low and sell-high indices. It is a separate endpoint because those scores rank a
player against their whole position pool, so it cannot be paginated in SQL the way
the leaderboard is: the pool is computed first, then the page is cut from it.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.aggregation import (
    AVG_METRICS,
    EXPECTED_METRICS,
    INSIGHT_METRICS,
    PPG_METRICS,
    SCORING_METRICS,
    SUM_METRICS,
    aggregate_select,
    finalize_row,
    games_expr,
    window_filters,
)
from app.database import get_db
from app.intelligence import build_intelligence, resolve_window
from app.league import parse_league
from app.models import Player, PlayerStats, Team
from app.scoring import (
    EXPECTED_COMPONENTS,
    POINTS_COMPONENTS,
    ScoringConfig,
    compute_expected_points,
    compute_points,
    expected_points_expr,
    parse_scoring,
    points_expr,
)

router = APIRouter(prefix="/stats", tags=["stats"])

ALLOWED_METRICS = (
    set(SUM_METRICS) | set(AVG_METRICS) | set(PPG_METRICS)
    | SCORING_METRICS | EXPECTED_METRICS | {"games_played"}
)
# The intelligence board can also rank by any of the plain aggregate metrics, so its
# supporting columns are sortable next to the scores.
ALLOWED_INSIGHT_METRICS = ALLOWED_METRICS | INSIGHT_METRICS


def _round(value: float | None, digits: int = 3) -> float | None:
    return round(value, digits) if value is not None else None


def _fantasy_order_expr(metric: str, config: ScoringConfig, sum_mode: bool, games=None):
    """ORDER BY expression for a scoring-aware or expected-points metric.

    ``games`` (the per-season game count) is only needed by the per-game metrics in
    season mode; in single-week mode every metric is already a one-game value.
    """
    actual = points_expr(config, sum_mode=sum_mode)
    expected = expected_points_expr(config, sum_mode=sum_mode)
    per_game = (lambda expression: expression / func.nullif(games, 0)) if games is not None else (lambda expression: expression)

    if metric == "fantasy_points":
        return actual
    if metric == "fantasy_ppg":
        return per_game(actual)
    if metric == "expected_fantasy_points":
        return expected
    if metric == "expected_fantasy_ppg":
        return per_game(expected)
    if metric == "fantasy_points_over_expected":
        return actual - expected
    raise ValueError(f"'{metric}' is not a scoring-aware metric")


def _leaderboard_season(
    db: Session, season: int, season_type: str, position: str | None,
    metric: str, config: ScoringConfig, descending: bool, min_games: int,
    limit: int, offset: int,
) -> tuple[list[dict], int]:
    """Aggregate a full season into one ranked row per player."""
    games = games_expr()
    filters = window_filters(season, season_type, position=position)
    base = aggregate_select(filters, games).having(games >= min_games)

    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0

    # Resolve the ORDER BY expression for the requested metric.
    if metric == "games_played":
        order_expr = games
    elif metric in SCORING_METRICS or metric in EXPECTED_METRICS:
        order_expr = _fantasy_order_expr(metric, config, sum_mode=True, games=games)
    elif metric in PPG_METRICS:
        base_col = getattr(PlayerStats, PPG_METRICS[metric])
        order_expr = func.sum(base_col) / func.nullif(games, 0)
    elif metric in AVG_METRICS:
        order_expr = func.avg(getattr(PlayerStats, metric))
    else:  # a summed counting stat
        order_expr = func.sum(getattr(PlayerStats, metric))
    order_expr = order_expr.desc().nulls_last() if descending else order_expr.asc().nulls_last()

    rows = db.execute(base.order_by(order_expr).limit(limit).offset(offset)).mappings().all()

    # The scoring-aware, expected, and per-game columns are filled in by the shared
    # aggregation layer, so the leaderboard and the intelligence board can't drift.
    return [finalize_row(dict(row), config) for row in rows], total


def _leaderboard_week(
    db: Session, season: int, week: int, season_type: str, position: str | None,
    metric: str, config: ScoringConfig, descending: bool, limit: int, offset: int,
) -> tuple[list[dict], int]:
    """Return raw per-game stat lines for a single week, ranked by metric."""
    filters = window_filters(
        season, season_type, position=position, week_from=week, week_to=week
    )

    # PPG metrics have no per-game meaning; fall back to their base column.
    if metric in SCORING_METRICS or metric in EXPECTED_METRICS:
        sort_column = _fantasy_order_expr(metric, config, sum_mode=False)
    else:
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
        components = {name: getattr(stat_line, name) for name in POINTS_COMPONENTS}
        points = _round(compute_points(config, components, position_value))
        record["fantasy_points"] = points
        record["fantasy_ppg"] = points  # single game: PPG == points
        expected_components = {name: getattr(stat_line, name) for name in EXPECTED_COMPONENTS}
        expected = _round(compute_expected_points(config, expected_components, position_value))
        record["expected_fantasy_points"] = expected
        record["expected_fantasy_ppg"] = expected  # single game: xPPG == xFP
        record["fantasy_points_over_expected"] = (
            _round(points - expected) if expected is not None and points is not None else None
        )
        results.append(record)
    return results, total


@router.get("/leaderboard")
def leaderboard(
    season: int = Query(..., description="Season year, e.g. 2024"),
    week: int | None = Query(None, ge=1, le=22, description="Omit for a season aggregate"),
    season_type: str = Query("REG", pattern="^(REG|POST)$"),
    position: str | None = Query(None, description="QB, RB, WR, or TE"),
    metric: str = Query("fantasy_points", description="Metric to rank by"),
    scoring: str = Query(
        "ppr",
        description="League scoring as preset[:overrides], e.g. 'ppr' or 'ppr:pass_td=6,te_rec=1.5'",
    ),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    min_games: int = Query(1, ge=0, description="Season mode: minimum games played"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> dict:
    """Filterable player leaderboard (season aggregate or single week)."""
    if metric not in ALLOWED_METRICS:
        raise HTTPException(status_code=400, detail=f"Unknown metric '{metric}'")
    try:
        config = parse_scoring(scoring)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    descending = order == "desc"
    if week is None:
        data, total = _leaderboard_season(
            db, season, season_type, position, metric, config, descending, min_games, limit, offset,
        )
    else:
        data, total = _leaderboard_week(
            db, season, week, season_type, position, metric, config, descending, limit, offset,
        )

    page = (offset // limit) + 1 if limit else 1
    return {
        "data": data, "total": total, "page": page, "limit": limit, "offset": offset,
        "season": season, "week": week, "season_type": season_type,
        "metric": metric, "order": order, "scoring": config.model_dump(),
    }


@router.get("/intelligence")
def intelligence(
    season: int = Query(..., description="Season year, e.g. 2024"),
    last_weeks: int | None = Query(
        None, ge=1, le=22,
        description="Trailing window: score only the last N played weeks. Omit for the full season.",
    ),
    season_type: str = Query("REG", pattern="^(REG|POST)$"),
    position: str | None = Query(None, description="QB, RB, WR, or TE"),
    metric: str = Query("positive_regression_index", description="Metric to rank by"),
    scoring: str = Query(
        "ppr",
        description="League scoring as preset[:overrides], e.g. 'ppr' or 'ppr:pass_td=6,te_rec=1.5'",
    ),
    league: str = Query(
        "12",
        description="League context as teams[:slot=value], e.g. '12' or '10:rb=2,wr=3,flex=2'",
    ),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    min_games: int | None = Query(
        None, ge=0, description="Games needed to be ranked. Defaults to ~a third of the window."
    ),
    include_unqualified: bool = Query(
        False, description="Include players below the games threshold (never in the ranking pools)"
    ),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> dict:
    """Fantasy-intelligence board: VORP, opportunity rating, and buy/sell indices.

    Scores are relative to a position pool, so the whole pool is computed and then
    sorted and paginated in Python. Filtering by ``position`` narrows the *output*
    only — a receiver's percentile never depends on who else the caller asked about.
    """
    if metric not in ALLOWED_INSIGHT_METRICS:
        raise HTTPException(status_code=400, detail=f"Unknown metric '{metric}'")
    try:
        config = parse_scoring(scoring)
        league_config = parse_league(league)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    window = resolve_window(db, season, season_type, last_weeks)
    rows, context = build_intelligence(
        db, window, config, league_config, min_games=min_games, position=position
    )

    if not include_unqualified:
        rows = [row for row in rows if row.get("qualified")]

    descending = order == "desc"

    def sort_key(row: dict) -> tuple[int, float]:
        """Rank by the metric; players with no value for it sort last either way
        (matching the leaderboard's NULLS LAST behaviour)."""
        value = row.get(metric)
        if value is None:
            return (1, 0.0)
        return (0, -value if descending else value)

    rows.sort(key=sort_key)

    total = len(rows)
    page_rows = rows[offset : offset + limit]
    page = (offset // limit) + 1 if limit else 1
    return {
        "data": page_rows, "total": total, "page": page, "limit": limit, "offset": offset,
        "season": season, "season_type": season_type, "window": window.as_dict(),
        "metric": metric, "order": order,
        "scoring": config.model_dump(), "league": league_config.model_dump(),
        "min_games": context["min_games"], "replacement": context["replacement"],
    }
