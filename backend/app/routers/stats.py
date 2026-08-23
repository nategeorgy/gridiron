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

from bisect import bisect_left, bisect_right
from statistics import median

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.aggregation import (
    AVG_METRICS,
    COMPOSITE_METRICS,
    EXPECTED_METRICS,
    INSIGHT_METRICS,
    POSITIONS,
    PPG_METRICS,
    SCORING_METRICS,
    SUM_METRICS,
    aggregate_select,
    finalize_row,
    games_expr,
    metric_expr,
    window_filters,
)
from app.custom_metrics import (
    BUILTIN_COMPOSITES,
    CustomMetric,
    compute_custom,
    formula_label,
    formula_text,
    parse_custom,
)
from app.database import get_db
from app.draft_board import build_draft_board, default_ranking_type
from app.intelligence import build_intelligence, resolve_window
from app.league import FLEX_ELIGIBLE, parse_league
from app.metrics import REGISTRY_BY_ID
from app.models import Player, PlayerStats, Team
from app.seasons import current_season, latest_scheduled_season
from app.sos import POSITIONS as SOS_POSITIONS, WINDOWS as SOS_WINDOWS, build_sos
from app.vegas import VIEWS as VEGAS_VIEWS, build_vegas, default_week, week_summary
from app.scoring import (
    EXPECTED_COMPONENTS,
    POINTS_COMPONENTS,
    ScoringConfig,
    compute_expected_points,
    compute_points,
    parse_scoring,
)

router = APIRouter(prefix="/stats", tags=["stats"])

ALLOWED_METRICS = (
    set(SUM_METRICS) | set(AVG_METRICS) | set(PPG_METRICS)
    | SCORING_METRICS | EXPECTED_METRICS | COMPOSITE_METRICS | {"games_played"}
)
# The intelligence board can also rank by any of the plain aggregate metrics, so its
# supporting columns are sortable next to the scores.
ALLOWED_INSIGHT_METRICS = ALLOWED_METRICS | INSIGHT_METRICS


def _round(value: float | None, digits: int = 3) -> float | None:
    return round(value, digits) if value is not None else None


def _leaderboard_season(
    db: Session, season: int, season_type: str, position: str | None,
    metric: str, config: ScoringConfig, descending: bool, min_games: int,
    limit: int, offset: int, custom: list[CustomMetric],
    player_ids: tuple[str, ...] | None = None,
) -> tuple[list[dict], int]:
    """Aggregate a full season into one ranked row per player."""
    games = games_expr()
    filters = window_filters(season, season_type, position=position, player_ids=player_ids)
    base = aggregate_select(filters, games).having(games >= min_games)

    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0

    # One expression builder serves every metric kind — stored, scoring-aware,
    # expected, per-game derived, and composite/custom (M4).
    custom_map = {definition.id: definition for definition in custom}
    order_expr = metric_expr(metric, config, sum_mode=True, games=games, custom=custom_map)
    order_expr = order_expr.desc().nulls_last() if descending else order_expr.asc().nulls_last()

    rows = db.execute(base.order_by(order_expr).limit(limit).offset(offset)).mappings().all()

    # The scoring-aware, expected, and per-game columns are filled in by the shared
    # aggregation layer, so the leaderboard and the intelligence board can't drift.
    return [finalize_row(dict(row), config, custom) for row in rows], total


def _leaderboard_week(
    db: Session, season: int, week: int, season_type: str, position: str | None,
    metric: str, config: ScoringConfig, descending: bool, limit: int, offset: int,
    custom: list[CustomMetric], player_ids: tuple[str, ...] | None = None,
) -> tuple[list[dict], int]:
    """Return raw per-game stat lines for a single week, ranked by metric."""
    filters = window_filters(
        season, season_type, position=position, week_from=week, week_to=week,
        player_ids=player_ids,
    )

    # In single-week mode every metric is already a one-game value, so the same
    # expression builder runs with sum_mode=False (PPG metrics fall back to their base).
    custom_map = {definition.id: definition for definition in custom}
    sort_column = metric_expr(metric, config, sum_mode=False, custom=custom_map)
    order_expr = sort_column.desc().nulls_last() if descending else sort_column.asc().nulls_last()

    query = (
        select(
            Player.player_id, Player.name.label("name"),
            Player.position.label("position"),
            Team.abbreviation.label("team_abbreviation"),
            PlayerStats,
        )
        .join(Player, PlayerStats.player_id == Player.player_id)
        .outerjoin(Team, PlayerStats.team_id == Team.team_id)
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
        # Composites last — they may reference any column filled in above.
        for metric_id, definition in BUILTIN_COMPOSITES.items():
            record[metric_id] = _round(compute_custom(definition, record))
        for definition in custom:
            record[definition.id] = _round(compute_custom(definition, record))
        results.append(record)
    return results, total


def _parse_player_ids(raw: str) -> tuple[str, ...] | None:
    """Parse the comma-separated watchlist filter, or None when absent.

    None means "no filter"; an explicit but empty list is treated the same, because
    the caller has nothing to narrow to and returning zero rows for a blank parameter
    would be a confusing way to spell "everything".
    """
    ids = tuple(part.strip() for part in raw.split(",") if part.strip())
    return ids or None


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
    custom: str = Query(
        "",
        description="Custom metrics as name=formula[;...], e.g. "
                    "'hvt=red_zone_targets+rush_att_inside_5/games'",
    ),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    min_games: int = Query(1, ge=0, description="Season mode: minimum games played"),
    player_ids: str = Query(
        "", description="Comma-separated player ids to narrow to (the M5 watchlist filter)"
    ),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> dict:
    """Filterable player leaderboard (season aggregate or single week)."""
    try:
        config = parse_scoring(scoring)
        custom_metrics = parse_custom(custom)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # A custom metric is rankable in the same request that defines it.
    if metric not in ALLOWED_METRICS | {definition.id for definition in custom_metrics}:
        raise HTTPException(status_code=400, detail=f"Unknown metric '{metric}'")

    descending = order == "desc"
    watchlist = _parse_player_ids(player_ids)
    if week is None:
        data, total = _leaderboard_season(
            db, season, season_type, position, metric, config, descending, min_games,
            limit, offset, custom_metrics, watchlist,
        )
    else:
        data, total = _leaderboard_week(
            db, season, week, season_type, position, metric, config, descending,
            limit, offset, custom_metrics, watchlist,
        )

    page = (offset // limit) + 1 if limit else 1
    return {
        "data": data, "total": total, "page": page, "limit": limit, "offset": offset,
        "season": season, "week": week, "season_type": season_type,
        "metric": metric, "order": order, "scoring": config.model_dump(),
        "custom": _custom_payload(custom_metrics),
    }


def _custom_payload(custom: list[CustomMetric]) -> list[dict]:
    """Describe the active custom metrics so the client can label their columns."""
    return [
        {
            "id": definition.id,
            "name": definition.name,
            "formula": formula_text(definition),
            "label": formula_label(definition),
        }
        for definition in custom
    ]


# Candidate metrics for the comparison builder, in display order. The set actually
# returned is this list filtered to metrics that apply to *every* position being
# compared (see ``_compare_metrics``) — so a QB-vs-WR comparison drops passing and
# receiving stats and keeps what both players genuinely do.
COMPARE_METRIC_ORDER: list[str] = [
    # Fantasy first — the product's default lens.
    "fantasy_points", "fantasy_ppg", "expected_fantasy_ppg", "fantasy_points_over_expected",
    # Passing
    "passing_yards", "passing_tds", "interceptions", "completions", "attempts",
    "passer_rating", "cpoe",
    # Rushing
    "carries", "rushing_yards", "rushing_tds", "rush_attempt_share",
    "rush_att_inside_10", "rush_att_inside_5", "red_zone_rush_share",
    # Receiving
    "receptions", "targets", "receiving_yards", "receiving_tds", "target_share",
    "air_yards", "air_yards_share", "adot", "targets_per_route_run",
    "yards_per_route_run", "route_participation", "red_zone_targets",
    # Usage / general
    "snap_count", "snap_share", "opportunity_share", "market_share",
    "high_value_touches_per_game", "touches_per_snap", "epa", "fumbles_lost",
]

# Section headings for the comparison table, so a long metric list stays navigable.
COMPARE_SECTIONS: list[tuple[str, tuple[str, ...]]] = [
    ("Fantasy", ("fantasy_points", "fantasy_ppg", "expected_fantasy_ppg",
                 "fantasy_points_over_expected")),
    ("Passing", ("passing_yards", "passing_tds", "interceptions", "completions",
                 "attempts", "passer_rating", "cpoe")),
    ("Rushing", ("carries", "rushing_yards", "rushing_tds", "rush_attempt_share",
                 "rush_att_inside_10", "rush_att_inside_5", "red_zone_rush_share")),
    ("Receiving", ("receptions", "targets", "receiving_yards", "receiving_tds",
                   "target_share", "air_yards", "air_yards_share", "adot",
                   "targets_per_route_run", "yards_per_route_run",
                   "route_participation", "red_zone_targets")),
    ("Usage", ("snap_count", "snap_share", "opportunity_share", "market_share",
               "high_value_touches_per_game", "touches_per_snap", "epa", "fumbles_lost")),
]

MAX_COMPARE_PLAYERS = 5


def _compare_metrics(positions: set[str]) -> list[str]:
    """Metrics that apply to *every* position in the comparison, in display order.

    Comparing a quarterback with a receiver should not show target share (the QB has
    none) or passing yards (the receiver has none) — it should show what they have in
    common: fantasy output, rushing, and the usage metrics defined for all positions.
    Applicability comes from the registry's ``applies_to``, so this needs no maintenance
    as metrics are added.
    """
    metrics: list[str] = []
    for metric_id in COMPARE_METRIC_ORDER:
        definition = REGISTRY_BY_ID.get(metric_id)
        if definition is None:
            continue
        applies = definition.applies_to
        if applies == "all" or positions.issubset(set(applies)):
            metrics.append(metric_id)
    return metrics


@router.get("/compare")
def compare(
    players: str = Query(..., description="Comma-separated player ids (max 5)"),
    season: int = Query(..., description="Season year, e.g. 2024"),
    last_weeks: int | None = Query(
        None, ge=1, le=22, description="Trailing window of played weeks. Omit for the full season."
    ),
    season_type: str = Query("REG", pattern="^(REG|POST)$"),
    metrics: str = Query("", description="Comma-separated metric ids. Defaults per position."),
    scoring: str = Query("ppr", description="League scoring as preset[:overrides]"),
    custom: str = Query("", description="Custom metrics as name=formula[;...]"),
    db: Session = Depends(get_db),
) -> dict:
    """Compare up to five players: season stats, within-position percentiles, weekly series.

    Percentiles are computed *within position* against that position's qualified pool,
    which is what makes a cross-position comparison honest — a tight end's 80th
    percentile and a receiver's 80th percentile are the comparable quantities, the same
    argument VORP makes in M3.
    """
    player_ids = [pid.strip() for pid in players.split(",") if pid.strip()]
    if not player_ids:
        raise HTTPException(status_code=400, detail="At least one player id is required.")
    if len(player_ids) > MAX_COMPARE_PLAYERS:
        raise HTTPException(
            status_code=400,
            detail=f"At most {MAX_COMPARE_PLAYERS} players can be compared at once.",
        )
    try:
        config = parse_scoring(scoring)
        custom_metrics = parse_custom(custom)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    window = resolve_window(db, season, season_type, last_weeks)
    games = games_expr()
    rows = [
        finalize_row(dict(row), config, custom_metrics)
        for row in db.execute(
            aggregate_select(
                window_filters(
                    window.season, window.season_type,
                    week_from=window.week_from, week_to=window.week_to,
                    positions=POSITIONS,
                ),
                games,
            )
        ).mappings().all()
    ]
    by_id = {record["player_id"]: record for record in rows}

    missing = [pid for pid in player_ids if pid not in by_id]
    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"No {season} {season_type} stats in that window for: {', '.join(missing)}",
        )

    custom_ids = [definition.id for definition in custom_metrics]
    selected = [metric.strip() for metric in metrics.split(",") if metric.strip()]
    if selected:
        unknown = [m for m in selected if m not in ALLOWED_METRICS | set(custom_ids)]
        if unknown:
            raise HTTPException(status_code=400, detail=f"Unknown metric(s): {', '.join(unknown)}")
        metric_ids = selected
    else:
        # Only metrics that apply to every position in the comparison, so a mixed-
        # position lineup shows common ground instead of half-empty rows.
        compared_positions = {
            by_id[pid].get("position") for pid in player_ids if by_id[pid].get("position")
        }
        metric_ids = [*_compare_metrics(compared_positions), *custom_ids]

    pools = _compare_pools(rows, metric_ids, window.default_min_games)
    weekly = _compare_weekly(db, player_ids, window, config)
    photos = dict(
        db.execute(
            select(Player.player_id, Player.headshot_url).where(Player.player_id.in_(player_ids))
        ).all()
    )

    return {
        "data": [
            {
                "player_id": pid,
                "name": by_id[pid].get("name"),
                "position": by_id[pid].get("position"),
                "team_abbreviation": by_id[pid].get("team_abbreviation"),
                "games_played": by_id[pid].get("games_played"),
                "headshot_url": photos.get(pid) or None,
                "stats": {metric: by_id[pid].get(metric) for metric in metric_ids},
                "percentiles": {
                    metric: _percentile(
                        pools.get((by_id[pid].get("position"), metric), []),
                        by_id[pid].get(metric),
                    )
                    for metric in metric_ids
                },
                "weekly": weekly.get(pid, []),
            }
            for pid in player_ids
        ],
        "metrics": metric_ids,
        "sections": _compare_section_layout(metric_ids),
        "season": season,
        "season_type": season_type,
        "window": window.as_dict(),
        "min_games": window.default_min_games,
        "scoring": config.model_dump(),
        "custom": _custom_payload(custom_metrics),
    }


def _compare_section_layout(metric_ids: list[str]) -> list[dict]:
    """Group the active metrics into display sections, dropping any that end up empty.

    A comparison's metric list varies with the positions involved, so the sections have
    to be computed per request rather than hard-coded in the UI.
    """
    active = set(metric_ids)
    sections = [
        {"label": label, "metrics": [m for m in members if m in active]}
        for label, members in COMPARE_SECTIONS
    ]
    # Anything not claimed by a section (e.g. custom metrics) goes in its own group.
    claimed = {m for section in sections for m in section["metrics"]}
    leftover = [m for m in metric_ids if m not in claimed]
    if leftover:
        sections.append({"label": "Custom", "metrics": leftover})
    return [section for section in sections if section["metrics"]]


def _compare_pools(
    rows: list[dict], metric_ids: list[str], min_games: int
) -> dict[tuple[str, str], list[float]]:
    """Sorted value lists per (position, metric), over qualified players only.

    Low-games players are excluded from the *pool* but can still be placed against it,
    so an early-season comparison degrades to a noisy percentile rather than a wrong one.
    """
    pools: dict[tuple[str, str], list[float]] = {}
    for record in rows:
        if (record.get("games_played") or 0) < min_games:
            continue
        position = record.get("position")
        if position not in POSITIONS:
            continue
        for metric in metric_ids:
            value = record.get(metric)
            if value is not None:
                pools.setdefault((position, metric), []).append(float(value))
    for values in pools.values():
        values.sort()
    return pools


def _percentile(sorted_values: list[float], value: float | None) -> float | None:
    """Mid-rank percentile of ``value`` in the pool, 0-100. Matches app.intelligence."""
    if value is None or not sorted_values:
        return None
    below = bisect_left(sorted_values, float(value))
    equal = bisect_right(sorted_values, float(value)) - below
    return round(100.0 * (below + 0.5 * equal) / len(sorted_values), 1)


def _compare_weekly(
    db: Session, player_ids: list[str], window, config: ScoringConfig
) -> dict[str, list[dict]]:
    """Per-week fantasy and expected points for each compared player, in their scoring."""
    rows = db.execute(
        select(PlayerStats, Player.position)
        .join(Player, PlayerStats.player_id == Player.player_id)
        .where(
            PlayerStats.player_id.in_(player_ids),
            PlayerStats.season == window.season,
            PlayerStats.season_type == window.season_type,
            PlayerStats.week >= window.week_from,
            PlayerStats.week <= window.week_to,
        )
        .order_by(PlayerStats.week)
    ).all()

    series: dict[str, list[dict]] = {pid: [] for pid in player_ids}
    for stat_line, position in rows:
        components = {name: getattr(stat_line, name) for name in POINTS_COMPONENTS}
        expected_components = {name: getattr(stat_line, name) for name in EXPECTED_COMPONENTS}
        expected = compute_expected_points(config, expected_components, position)
        series[stat_line.player_id].append({
            "week": stat_line.week,
            "fantasy_points": _round(compute_points(config, components, position)),
            "expected_fantasy_points": _round(expected),
        })
    return series


@router.get("/scatter")
def scatter(
    season: int = Query(..., description="Season year, e.g. 2024"),
    x: str = Query("expected_fantasy_ppg", description="Metric on the x axis"),
    y: str = Query("fantasy_ppg", description="Metric on the y axis"),
    size: str | None = Query(None, description="Optional metric driving bubble size"),
    mode: str = Query("season", pattern="^(season|game)$",
                      description="'season' = one point per player; 'game' = one point per player-week"),
    rank_by: str = Query(
        "fantasy_points",
        description="Metric deciding which points survive the cap — the plot shows the top N by this.",
    ),
    last_weeks: int | None = Query(
        None, ge=1, le=22, description="Trailing window of played weeks. Omit for the full season."
    ),
    season_type: str = Query("REG", pattern="^(REG|POST)$"),
    position: str | None = Query(None, description="QB, RB, WR, TE, or FLEX (RB/WR/TE)"),
    scoring: str = Query("ppr", description="League scoring as preset[:overrides]"),
    league: str = Query("12", description="League context as teams[:slot=value]"),
    custom: str = Query("", description="Custom metrics as name=formula[;...]"),
    min_games: int = Query(4, ge=0, description="Season mode: minimum games played"),
    limit: int = Query(400, ge=1, le=3000),
    db: Session = Depends(get_db),
) -> dict:
    """Plot any two metrics against each other, one point per player (or player-week).

    Takes the cheap aggregation path unless an axis needs an M3 intelligence score, in
    which case it routes through the intelligence engine — whose pools are always built
    from every position, so a point's percentile never depends on the current filter.

    Medians for both axes are returned so the client can draw quadrant guides without
    holding the full distribution.
    """
    try:
        config = parse_scoring(scoring)
        league_config = parse_league(league)
        custom_metrics = parse_custom(custom)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    custom_ids = {definition.id for definition in custom_metrics}
    axes = {"x": x, "y": y}
    if size:
        axes["size"] = size
    for axis, metric in axes.items():
        if metric not in ALLOWED_INSIGHT_METRICS | custom_ids:
            raise HTTPException(status_code=400, detail=f"Unknown metric '{metric}' on the {axis} axis")
        if mode == "game" and metric in INSIGHT_METRICS:
            raise HTTPException(
                status_code=400,
                detail=f"'{metric}' is a season-level score and cannot be plotted per game.",
            )
    if rank_by not in ALLOWED_INSIGHT_METRICS | custom_ids:
        raise HTTPException(status_code=400, detail=f"Unknown metric '{rank_by}' for rank_by")
    if mode == "game" and rank_by in INSIGHT_METRICS:
        raise HTTPException(
            status_code=400, detail=f"'{rank_by}' is a season-level score and cannot rank per-game points."
        )

    positions = _resolve_positions(position)
    window = resolve_window(db, season, season_type, last_weeks)
    needs_intelligence = any(
        metric in INSIGHT_METRICS for metric in (*axes.values(), rank_by)
    )

    if mode == "game":
        rows = _scatter_game_rows(
            db, window, positions, axes, config, custom_metrics, rank_by, limit
        )
    elif needs_intelligence:
        pool, _ = build_intelligence(
            db, window, config, league_config, min_games=min_games, custom=custom_metrics
        )
        rows = [
            _scatter_point(record, axes, rank_by=rank_by)
            for record in pool
            if record.get("qualified")
            and (positions is None or record.get("position") in positions)
        ]
    else:
        rows = _scatter_season_rows(
            db, window, positions, axes, config, custom_metrics, min_games, rank_by
        )

    # Drop points with no value on either axis — a scatter cannot place them, and
    # silently plotting them at zero would invent data.
    rows = [row for row in rows if row["x"] is not None and row["y"] is not None]
    truncated = len(rows) > limit
    # Season mode aggregates the whole pool before slicing, so its total is exact.
    # Per-game mode stops reading at limit+1, so once truncated it genuinely does not
    # know the total — report None rather than the fetch size dressed up as a count.
    total = None if (truncated and mode == "game") else len(rows)

    # Rank before capping. Without this a capped plot shows an arbitrary slice of the
    # pool rather than the players anyone came to look at. Game mode is already ordered
    # in SQL; season/intelligence rows are ranked here.
    if mode != "game":
        rows.sort(key=lambda row: (row.get("rank_value") is None, -(row.get("rank_value") or 0.0)))
    rows = rows[:limit]

    for row in rows:
        row.pop("rank_value", None)
    _attach_headshots(db, rows)

    return {
        "data": rows,
        "total": total,
        "truncated": truncated,
        "limit": limit,
        "mode": mode,
        "rank_by": rank_by,
        "position": position,
        "season": season,
        "season_type": season_type,
        "window": window.as_dict(),
        "axes": {axis: _axis_meta(metric, custom_metrics) for axis, metric in axes.items()},
        "medians": {
            axis: _median([row[axis] for row in rows]) for axis in axes
        },
        "scoring": config.model_dump(),
        "league": league_config.model_dump(),
        "custom": _custom_payload(custom_metrics),
        "min_games": min_games,
    }


def _axis_meta(metric: str, custom: list[CustomMetric]) -> dict:
    """Label an axis from the registry, or from the formula for a custom metric."""
    for definition in custom:
        if definition.id == metric:
            return {
                "metric": definition.id,
                "label": formula_label(definition),
                "formula": formula_text(definition),
                "format": 3,
                "custom": True,
            }
    registry_entry = REGISTRY_BY_ID.get(metric)
    return {
        "metric": metric,
        "label": registry_entry.label if registry_entry else metric,
        "short": registry_entry.short if registry_entry else metric,
        "format": registry_entry.format if registry_entry else 2,
        "modelled": bool(registry_entry and registry_entry.modelled),
        "custom": False,
    }


def _median(values: list[float | None]) -> float | None:
    """Median of the plotted values, ignoring gaps. ``None`` when there is nothing to plot."""
    present = sorted(value for value in values if value is not None)
    return round(median(present), 3) if present else None


def _resolve_positions(position: str | None) -> tuple[str, ...] | None:
    """Resolve a position filter, expanding the pseudo-position ``FLEX`` to RB/WR/TE.

    ``None`` means "every covered position" — the caller applies no position filter.
    """
    if not position:
        return None
    value = position.strip().upper()
    if value == "FLEX":
        return FLEX_ELIGIBLE
    if value not in POSITIONS:
        raise HTTPException(status_code=400, detail=f"Unknown position '{position}'")
    return (value,)


def _attach_headshots(db: Session, rows: list[dict]) -> None:
    """Fill each point's ``headshot_url`` in one query, after the rows are capped.

    Done here rather than in the shared aggregation select so the leaderboard and the
    intelligence board don't have to grow a column (and a GROUP BY key) they never use.
    """
    player_ids = {row["player_id"] for row in rows if row.get("player_id")}
    if not player_ids:
        return
    photos = dict(
        db.execute(
            select(Player.player_id, Player.headshot_url).where(
                Player.player_id.in_(player_ids)
            )
        ).all()
    )
    for row in rows:
        row["headshot_url"] = photos.get(row.get("player_id")) or None


def _scatter_point(
    record: dict, axes: dict[str, str], rank_by: str | None = None, week: int | None = None
) -> dict:
    """Reduce a full stat row to the identity plus the plotted axis values."""
    point = {
        "player_id": record.get("player_id"),
        "name": record.get("name"),
        "position": record.get("position"),
        "team_abbreviation": record.get("team_abbreviation"),
        "games_played": record.get("games_played"),
        **{axis: record.get(metric) for axis, metric in axes.items()},
    }
    if rank_by is not None:
        point["rank_value"] = record.get(rank_by)
    if week is not None:
        point["week"] = week
    return point


def _scatter_season_rows(
    db: Session, window, positions: tuple[str, ...] | None, axes: dict[str, str],
    config: ScoringConfig, custom: list[CustomMetric], min_games: int, rank_by: str,
) -> list[dict]:
    """One point per player, aggregated over the window."""
    games = games_expr()
    filters = window_filters(
        window.season, window.season_type, positions=positions or POSITIONS,
        week_from=window.week_from, week_to=window.week_to,
    )
    query = aggregate_select(filters, games).having(games >= min_games)
    rows = db.execute(query).mappings().all()
    return [
        _scatter_point(finalize_row(dict(row), config, custom), axes, rank_by=rank_by)
        for row in rows
    ]


def _scatter_game_rows(
    db: Session, window, positions: tuple[str, ...] | None, axes: dict[str, str],
    config: ScoringConfig, custom: list[CustomMetric], rank_by: str, limit: int,
) -> list[dict]:
    """One point per player-week — the distribution view a season aggregate hides."""
    custom_map = {definition.id: definition for definition in custom}
    labeled = [
        metric_expr(metric, config, sum_mode=False, custom=custom_map).label(axis)
        for axis, metric in axes.items()
    ]
    rank_expr = metric_expr(rank_by, config, sum_mode=False, custom=custom_map)
    query = (
        select(
            Player.player_id,
            Player.name.label("name"),
            Player.position.label("position"),
            Team.abbreviation.label("team_abbreviation"),
            PlayerStats.week,
            *labeled,
        )
        .join(Player, PlayerStats.player_id == Player.player_id)
        .outerjoin(Team, PlayerStats.team_id == Team.team_id)
        .where(*window_filters(
            window.season, window.season_type, positions=positions or POSITIONS,
            week_from=window.week_from, week_to=window.week_to,
        ))
        # Rank in SQL so the cap keeps the most relevant player-weeks, not an
        # arbitrary slice. One extra row distinguishes "at the cap" from "truncated".
        .order_by(rank_expr.desc().nulls_last())
        .limit(limit + 1)
    )
    return [
        {
            "player_id": row["player_id"],
            "name": row["name"],
            "position": row["position"],
            "team_abbreviation": row["team_abbreviation"],
            "games_played": 1,
            "week": row["week"],
            **{axis: _round(row[axis]) for axis in axes},
        }
        for row in db.execute(query).mappings().all()
    ]


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
    player_ids: str = Query(
        "", description="Comma-separated player ids to narrow to (the M5 watchlist filter)"
    ),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> dict:
    """Fantasy-intelligence board: VORP, opportunity rating, and buy/sell indices.

    Scores are relative to a position pool, so the whole pool is computed and then
    sorted and paginated in Python. Filtering by ``position`` narrows the *output*
    only — a receiver's percentile never depends on who else the caller asked about.
    The ``player_ids`` watchlist filter is applied the same way, and for the same
    reason: "82nd percentile" has to mean among all receivers, not among the six a
    user happened to star.
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

    # Applied after scoring, so percentiles stay relative to the full position pool.
    watchlist = _parse_player_ids(player_ids)
    if watchlist is not None:
        wanted = set(watchlist)
        rows = [row for row in rows if row.get("player_id") in wanted]

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


# --- The Draft Value Board (M6.1) -------------------------------------------------

# What a row can be sorted by, and which direction reads as "best first". Market rank
# ascending is draft order, which is how a draft board is read; gap descending puts the
# players we rate furthest above the consensus at the top.
# `consensus` sorts by raw ECR, which every row has — so the default board reads in
# draft order with rookies in their place, rather than dropping the rows that have
# no comparable rank to the bottom.
DRAFT_SORTS = {"consensus": "ecr", "market": "market_rank", "value": "value_rank", "gap": "gap"}


@router.get("/draft-board")
def draft_board(
    season: int | None = Query(
        None,
        description="Valuation season — the season we value players from. Defaults to "
                    "the latest season with stats, which is the last one played.",
    ),
    season_type: str = Query("REG", pattern="^(REG|POST)$"),
    scoring: str = Query(
        "ppr",
        description="League scoring as preset[:overrides], e.g. 'ppr' or 'ppr:pass_td=6'",
    ),
    league: str = Query(
        "12", description="League context as teams[:slot=value], e.g. '12' or '12:superflex=1'"
    ),
    ranking_type: str | None = Query(
        None,
        description="Consensus variant (redraft-overall, redraft-op, dynasty-overall, …). "
                    "Defaults to the one matching your league: superflex leagues get "
                    "the superflex board.",
    ),
    position: str | None = Query(None, description="QB, RB, WR, or TE"),
    sort: str = Query("consensus", pattern="^(consensus|market|value|gap)$"),
    order: str = Query("asc", pattern="^(asc|desc)$"),
    min_games: int | None = Query(
        None, ge=0, description="Games needed to be valued. Defaults to ~a third of the season."
    ),
    depth: int | None = Query(
        None, ge=0,
        description="How many consensus picks to include. Defaults to what this league "
                    "actually drafts (teams x starters x 2); 0 for the whole list.",
    ),
    player_ids: str = Query(
        "", description="Comma-separated player ids to narrow to (the M5 watchlist filter)"
    ),
    limit: int = Query(100, ge=1, le=300),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> dict:
    """Consensus expert rank against our expected-points valuation, and the gap.

    Two seasons are in play and they are deliberately different: the rankings are for
    the season about to start, while the valuation comes from the last season actually
    played. `season` names the latter.

    A positive gap means we rate the player above the consensus. Players with no NFL
    history keep their consensus place and carry no gap — see `app.draft_board`.
    """
    try:
        config = parse_scoring(scoring)
        league_config = parse_league(league)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    valuation_season = season if season is not None else current_season(db)
    if valuation_season is None:
        raise HTTPException(status_code=404, detail="No seasons with stats are loaded")

    window = resolve_window(db, valuation_season, season_type, None)
    rows, context = build_draft_board(
        db,
        window,
        config,
        league_config,
        ranking_type=ranking_type or default_ranking_type(league_config),
        min_games=min_games,
        position=position,
        depth=depth,
    )

    # Applied after the ranks are assigned, so a watchlist view still shows each
    # player's true place on the board rather than renumbering them 1..n.
    watchlist = _parse_player_ids(player_ids)
    if watchlist is not None:
        wanted = set(watchlist)
        rows = [row for row in rows if row.get("player_id") in wanted]

    key = DRAFT_SORTS[sort]
    descending = order == "desc"

    def sort_key(row: dict) -> tuple[int, float]:
        """Unvalued players sort last in both directions — they are not "rank 0",
        they are unranked, and floating them to the top of a gap sort would be a
        claim about them."""
        value = row.get(key)
        if value is None:
            return (1, 0.0)
        return (0, -value if descending else value)

    rows.sort(key=sort_key)

    total = len(rows)
    page_rows = rows[offset : offset + limit]
    page = (offset // limit) + 1 if limit else 1
    return {
        "data": page_rows, "total": total, "page": page, "limit": limit, "offset": offset,
        "valuation_season": valuation_season, "season_type": season_type,
        "window": window.as_dict(),
        "sort": sort, "order": order,
        "scoring": config.model_dump(), "league": league_config.model_dump(),
        "ranking_type": context["ranking_type"], "source": context["source"],
        "ranking_season": context["ranking_season"], "scraped_at": context["scraped_at"],
        "ranked_players": context["ranked_players"],
        "valued_players": context.get("valued_players", 0),
        "depth": context.get("depth"),
        "min_games": context.get("min_games"),
        "replacement": context.get("replacement"),
    }


# --- Strength of schedule (M6.3) ---------------------------------------------------


@router.get("/sos")
def strength_of_schedule(
    season: int | None = Query(
        None, description="Schedule season. Defaults to the newest season on the schedule."
    ),
    position: str = Query("WR", description="QB, RB, WR, or TE"),
    window: str = Query("full", description="full | ros | next4 | playoffs"),
    scoring: str = Query(
        "ppr", description="League scoring, e.g. 'ppr' or 'ppr:te_rec=1.5'"
    ),
    db: Session = Depends(get_db),
) -> dict:
    """How hard each team's fixtures are for one position, in the user's own scoring.

    Difficulty is fantasy points allowed per game by each defense, expressed as a 0–100
    percentile where **higher is harder**. Computed per request rather than stored: in a
    TE-premium league the tight ends a defense gives up are worth more, so the hardest
    schedule for a tight end is a different list of teams.

    The response always names its **basis** — which season's defensive numbers are
    behind the ratings. In August that is necessarily last season, and defenses change
    over an offseason.
    """
    upper = position.upper()
    if upper not in SOS_POSITIONS:
        raise HTTPException(status_code=400, detail=f"Unknown position '{position}'")
    if window not in SOS_WINDOWS:
        raise HTTPException(status_code=400, detail=f"Unknown window '{window}'")
    try:
        config = parse_scoring(scoring)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    schedule_season = season if season is not None else latest_scheduled_season(db)
    if schedule_season is None:
        raise HTTPException(status_code=404, detail="No seasons are loaded")

    rows, context = build_sos(db, schedule_season, config, upper, window)
    return {
        "data": rows,
        "total": len(rows),
        "season": schedule_season,
        "scoring": config.model_dump(),
        **context,
    }


# --- The Vegas board (M6.4) --------------------------------------------------------


@router.get("/vegas")
def vegas_board(
    season: int | None = Query(
        None, description="Schedule season. Defaults to the newest season on the schedule."
    ),
    week: int | None = Query(
        None, ge=1, le=22,
        description="Week to show. Defaults to the next week not yet played.",
    ),
    view: str = Query("players", description="players | games"),
    position: str | None = Query(None, description="QB, RB, WR, or TE (players view)"),
    scoring: str = Query("ppr", description="League scoring, e.g. 'ppr' or 'ppr:te_rec=1.5'"),
    limit: int = Query(100, ge=1, le=400),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> dict:
    """One week's betting market, as a slate of games or a ranked list of players.

    The market prices each game twice — a spread and a total — and splitting them apart
    gives each team's **implied total**, the points the market expects that offense to
    score. That is the forward-looking read on how many fantasy points are available,
    which is why the default view ranks *players* by the environment they are in rather
    than listing fixtures.

    Both views come from the `games` columns M6.0 already ingests: no odds API, and no
    stored implied totals. Games the market has not priced are returned with null lines
    and sort last — "no line" is not "a low total".
    """
    if view not in VEGAS_VIEWS:
        raise HTTPException(status_code=400, detail=f"Unknown view '{view}'")
    if position and position.upper() not in POSITIONS:
        raise HTTPException(status_code=400, detail=f"Unknown position '{position}'")
    try:
        config = parse_scoring(scoring)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    schedule_season = season if season is not None else latest_scheduled_season(db)
    if schedule_season is None:
        raise HTTPException(status_code=404, detail="No seasons are loaded")

    resolved_week = week if week is not None else default_week(db, schedule_season)
    if resolved_week is None:
        raise HTTPException(status_code=404, detail="No games are loaded for this season")

    # Production context comes from the last season actually played, exactly as on the
    # team page: in August the numbers beside a name are last year's.
    latest_played = current_season(db)
    production_season = (
        schedule_season
        if latest_played is not None and schedule_season <= latest_played
        else latest_played
    )

    players, games = build_vegas(
        db, schedule_season, resolved_week, config, production_season, position
    )
    rows = players if view == "players" else games
    page_rows = rows[offset : offset + limit]

    return {
        "data": page_rows,
        "total": len(rows),
        "page": (offset // limit) + 1 if limit else 1,
        "limit": limit,
        "offset": offset,
        "view": view,
        "season": schedule_season,
        "week": resolved_week,
        "production_season": production_season,
        "weeks": week_summary(db, schedule_season),
        "scoring": config.model_dump(),
    }
