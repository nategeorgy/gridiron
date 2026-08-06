"""Season aggregation, shared by the leaderboard and the intelligence engine.

One place decides how a set of per-game ``player_stats`` rows becomes one row per
player: which metrics are summed, which are averaged, which are per-game derivations,
and how the scoring-aware fantasy columns are filled in. The behaviour is read from
the metric registry (M1 spine B), so adding a metric there is enough — no endpoint
needs to learn about it.

Both callers need the same numbers; the only difference is that the intelligence
endpoints also aggregate a *window* of weeks (M3) rather than a whole season.
"""

from __future__ import annotations

from sqlalchemy import Select, func, literal, select
from sqlalchemy.sql.elements import ColumnElement

from app.custom_metrics import GAMES, BUILTIN_COMPOSITES, CustomMetric, compute_custom
from app.metrics import REGISTRY, REGISTRY_BY_ID, ids_with_aggregation
from app.models import Player, PlayerStats, Team
from app.scoring import (
    ScoringConfig,
    compute_expected_points,
    compute_points,
    expected_points_expr,
    points_expr,
)

# Aggregation behaviour, derived from the metric registry (single source of truth).
SUM_METRICS = ids_with_aggregation("sum")  # counting stats, summed over the window
AVG_METRICS = ids_with_aggregation("avg")  # rate / share stats, averaged over the window
# Derived per-game metrics: id -> the column it divides by games.
PPG_METRICS = {metric.id: metric.base for metric in REGISTRY if metric.aggregation == "derived"}
# Scoring-aware fantasy metrics — computed per-request from a ScoringConfig.
SCORING_METRICS = set(ids_with_aggregation("scoring"))
# Expected-points metrics (M2) — same engine, applied to the expected components.
EXPECTED_METRICS = set(ids_with_aggregation("expected"))
# Fantasy-intelligence metrics (M3) — only served by the intelligence endpoints.
INSIGHT_METRICS = set(ids_with_aggregation("intelligence"))
# Composite metrics (M4) — registry formulas evaluated by the custom-metric engine.
COMPOSITE_METRICS = set(ids_with_aggregation("composite"))

# Positions the product covers. Used to keep stray positions out of ranking pools.
POSITIONS: tuple[str, ...] = ("QB", "RB", "WR", "TE")


def games_expr() -> ColumnElement:
    """Games played — distinct game ids, the denominator for every per-game metric."""
    return func.count(func.distinct(PlayerStats.game_id))


def window_filters(
    season: int,
    season_type: str,
    position: str | None = None,
    week_from: int | None = None,
    week_to: int | None = None,
    positions: tuple[str, ...] | None = None,
    player_ids: tuple[str, ...] | None = None,
) -> list[ColumnElement]:
    """WHERE clauses for a season, optionally narrowed to a week range and position.

    ``player_ids`` narrows to an explicit set — how the watchlist filter (M5) is
    applied. It belongs here rather than in a router so it composes with sort,
    pagination, and the min-games having clause instead of trimming an already-paged
    result, which would produce short pages and wrong totals.
    """
    filters: list[ColumnElement] = [
        PlayerStats.season == season,
        PlayerStats.season_type == season_type,
    ]
    if week_from is not None:
        filters.append(PlayerStats.week >= week_from)
    if week_to is not None:
        filters.append(PlayerStats.week <= week_to)
    if position:
        filters.append(Player.position == position.upper())
    elif positions:
        filters.append(Player.position.in_(positions))
    if player_ids is not None:
        filters.append(PlayerStats.player_id.in_(player_ids))
    return filters


def aggregate_select(filters: list[ColumnElement], games: ColumnElement) -> Select:
    """One aggregated row per player: identity, games played, and every stored metric."""
    labeled = [func.sum(getattr(PlayerStats, name)).label(name) for name in SUM_METRICS]
    labeled += [func.avg(getattr(PlayerStats, name)).label(name) for name in AVG_METRICS]

    return (
        select(
            Player.player_id,
            Player.name.label("name"),
            Player.position.label("position"),
            Team.abbreviation.label("team_abbreviation"),
            games.label("games_played"),
            *labeled,
        )
        .join(Player, PlayerStats.player_id == Player.player_id)
        .outerjoin(Team, Player.team_id == Team.team_id)
        .where(*filters)
        .group_by(Player.player_id, Player.name, Player.position, Team.abbreviation)
    )


def metric_expr(
    metric_id: str,
    config: ScoringConfig,
    sum_mode: bool,
    games: ColumnElement | None = None,
    custom: dict[str, CustomMetric] | None = None,
) -> ColumnElement:
    """SQL expression for any evaluable metric — the one place that mapping lives.

    Used for ORDER BY on the leaderboard and for the SELECT list on the scatter
    endpoint, so ranking and plotting can never disagree about what a metric means.

    ``sum_mode=True`` aggregates a window (``SUM``/``AVG`` over the grouped rows);
    ``sum_mode=False`` reads a single per-game row. ``games`` is the game-count
    expression, needed by per-game metrics in aggregate mode.

    Intelligence metrics (M3) have no SQL form — they are percentile ranks over a whole
    position pool — and raise ``ValueError`` here.
    """
    if metric_id == "games_played":
        return games if games is not None else literal(1)

    resolved = custom.get(metric_id) if custom else None
    if resolved is None and metric_id in BUILTIN_COMPOSITES:
        resolved = BUILTIN_COMPOSITES[metric_id]
    if resolved is not None:
        return _composite_expr(resolved, config, sum_mode, games, custom)

    definition = REGISTRY_BY_ID.get(metric_id)
    if definition is None:
        raise ValueError(f"Unknown metric '{metric_id}'.")

    aggregation = definition.aggregation
    if aggregation == "intelligence":
        raise ValueError(
            f"Metric '{metric_id}' is computed across a position pool and has no SQL form."
        )

    if aggregation == "scoring":
        points = points_expr(config, sum_mode=sum_mode)
        if metric_id == "fantasy_ppg" and games is not None:
            return points / func.nullif(games, 0)
        return points

    if aggregation == "expected":
        expected = expected_points_expr(config, sum_mode=sum_mode)
        if metric_id == "fantasy_points_over_expected":
            return points_expr(config, sum_mode=sum_mode) - expected
        if metric_id == "expected_fantasy_ppg" and games is not None:
            return expected / func.nullif(games, 0)
        return expected

    if aggregation == "derived":
        column = getattr(PlayerStats, definition.base)
        if not sum_mode:
            return column
        return func.sum(column) / func.nullif(games, 0)

    column = getattr(PlayerStats, metric_id)
    if not sum_mode:
        return column
    return func.avg(column) if aggregation == "avg" else func.sum(column)


def _composite_expr(
    metric: CustomMetric,
    config: ScoringConfig,
    sum_mode: bool,
    games: ColumnElement | None,
    custom: dict[str, CustomMetric] | None,
) -> ColumnElement:
    """SQL for a weighted sum over an optional divisor (M4).

    Terms are coalesced to 0 so one missing component does not null out the whole
    numerator, and the divisor is wrapped in ``NULLIF`` so dividing by zero yields
    ``NULL`` rather than an error — both matching ``compute_custom`` exactly, since
    the two have to agree for ORDER BY and the displayed value to line up.
    """
    total: ColumnElement | None = None
    for term in metric.terms:
        piece = func.coalesce(metric_expr(term.metric, config, sum_mode, games, custom), 0)
        if term.weight != 1.0:
            piece = piece * term.weight
        total = piece if total is None else total + piece

    if metric.denominator is None:
        return total

    if metric.denominator == GAMES:
        # In single-week mode the row *is* one game, so dividing by games is a no-op.
        divisor = games if games is not None else literal(1)
    else:
        divisor = metric_expr(metric.denominator, config, sum_mode, games, custom)
    return total / func.nullif(divisor, 0)


def round_value(value: float | None, digits: int = 3) -> float | None:
    """Round for display, preserving ``None`` (which means "no data", not zero)."""
    return round(value, digits) if value is not None else None


def finalize_row(
    record: dict, config: ScoringConfig, custom: list[CustomMetric] | None = None
) -> dict:
    """Fill in the computed columns on one aggregated row.

    Adds the scoring-aware fantasy metrics (from the raw component sums, before any
    rounding), the expected-points metrics, the per-game derived metrics, and finally
    the composite/custom metrics — then rounds the stored sums/averages for display.

    Order matters: composites may reference any of the earlier groups, so they are
    evaluated last, and still before rounding so precision is not lost twice.
    """
    played = record.get("games_played") or 0
    position = record.get("position")

    points = compute_points(config, record, position)
    record["fantasy_points"] = round_value(points)
    record["fantasy_ppg"] = round_value(points / played) if played else None

    expected = compute_expected_points(config, record, position)
    record["expected_fantasy_points"] = round_value(expected)
    record["expected_fantasy_ppg"] = (
        round_value(expected / played) if played and expected is not None else None
    )
    record["fantasy_points_over_expected"] = (
        round_value(points - expected) if expected is not None else None
    )

    for key, column in PPG_METRICS.items():
        total = record.get(column)
        record[key] = round_value(total / played) if played and total is not None else None

    # Composites last: they may reference any metric filled in above.
    for metric_id, definition in BUILTIN_COMPOSITES.items():
        record[metric_id] = round_value(compute_custom(definition, record))
    for definition in custom or []:
        record[definition.id] = round_value(compute_custom(definition, record))

    for key in SUM_METRICS + AVG_METRICS:
        record[key] = round_value(record.get(key))
    return record
