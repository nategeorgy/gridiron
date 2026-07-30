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

from sqlalchemy import Select, func, select
from sqlalchemy.sql.elements import ColumnElement

from app.metrics import REGISTRY, ids_with_aggregation
from app.models import Player, PlayerStats, Team
from app.scoring import ScoringConfig, compute_expected_points, compute_points

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
) -> list[ColumnElement]:
    """WHERE clauses for a season, optionally narrowed to a week range and position."""
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


def round_value(value: float | None, digits: int = 3) -> float | None:
    """Round for display, preserving ``None`` (which means "no data", not zero)."""
    return round(value, digits) if value is not None else None


def finalize_row(record: dict, config: ScoringConfig) -> dict:
    """Fill in the computed columns on one aggregated row.

    Adds the scoring-aware fantasy metrics (from the raw component sums, before any
    rounding), the expected-points metrics, and the per-game derived metrics — then
    rounds the stored sums/averages for display.
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
    for key in SUM_METRICS + AVG_METRICS:
        record[key] = round_value(record.get(key))
    return record
