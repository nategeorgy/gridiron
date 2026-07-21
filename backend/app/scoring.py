"""Scoring-aware fantasy engine (M1 spine A).

Fantasy points for any league scoring are computed as a *standard baseline plus
linear deltas*::

    custom_points = fantasy_points_std
                  + Σ (config_weight[stat] − standard_weight[stat]) · component[stat]

This is exact and migration-free: it builds on nflreadpy's canonical
``fantasy_points_std`` (which already bakes in 2-pt conversions and return TDs that
we do not store as separate components), and only adjusts for the weights a league
actually customises. Because the expression is linear it is identical whether the
components are per-game values (single-week mode) or season sums (aggregate mode).

The baseline weights were calibrated against the full dataset — see
``docs/design/M1-scoring-foundation.md`` (Task 0).
"""

from __future__ import annotations

from pydantic import BaseModel, Field
from sqlalchemy import case
from sqlalchemy.sql.elements import ColumnElement

from app.models import Player, PlayerStats

# Standard scoring weights, keyed by ScoringConfig field. Locked by calibration.
STANDARD_WEIGHTS: dict[str, float] = {
    "pass_yd": 0.04,
    "pass_td": 4.0,
    "pass_int": -2.0,
    "rush_yd": 0.1,
    "rush_td": 6.0,
    "rec": 0.0,
    "rec_yd": 0.1,
    "rec_td": 6.0,
    "fumble_lost": -2.0,
}

# Configurable weight field -> the player_stats component column it multiplies.
# ``rec`` is handled separately because of the optional TE-premium.
WEIGHT_COLUMNS: dict[str, str] = {
    "pass_yd": "passing_yards",
    "pass_td": "passing_tds",
    "pass_int": "interceptions",
    "rush_yd": "rushing_yards",
    "rush_td": "rushing_tds",
    "rec_yd": "receiving_yards",
    "rec_td": "receiving_tds",
    "fumble_lost": "fumbles_lost",
}

# Component columns needed to compute fantasy points (for building a per-row dict).
POINTS_COMPONENTS: tuple[str, ...] = (
    "fantasy_points_std", "receptions", *WEIGHT_COLUMNS.values(),
)

# Named presets. Each is a sparse override of the standard weights.
PRESETS: dict[str, dict[str, float]] = {
    "std": {},
    "half": {"rec": 0.5},
    "ppr": {"rec": 1.0},
    "ppr_te": {"rec": 1.0, "te_rec": 1.5},
}

DEFAULT_PRESET = "ppr"
_WEIGHT_BOUND = 100.0  # sanity guard on any single weight


class ScoringConfig(BaseModel):
    """A resolved set of league scoring weights.

    Every field defaults to its standard value, so a config only needs to carry
    what differs from standard. ``te_rec`` is the optional TE-premium reception
    value; when ``None`` tight ends use ``rec``.
    """

    pass_yd: float = STANDARD_WEIGHTS["pass_yd"]
    pass_td: float = STANDARD_WEIGHTS["pass_td"]
    pass_int: float = STANDARD_WEIGHTS["pass_int"]
    rush_yd: float = STANDARD_WEIGHTS["rush_yd"]
    rush_td: float = STANDARD_WEIGHTS["rush_td"]
    rec: float = STANDARD_WEIGHTS["rec"]
    rec_yd: float = STANDARD_WEIGHTS["rec_yd"]
    rec_td: float = STANDARD_WEIGHTS["rec_td"]
    fumble_lost: float = STANDARD_WEIGHTS["fumble_lost"]
    te_rec: float | None = Field(default=None)


# Fields a caller may override via ``parse_scoring`` (te_rec included, rec included).
_OVERRIDABLE = set(STANDARD_WEIGHTS) | {"te_rec"}


def parse_scoring(spec: str | None) -> ScoringConfig:
    """Parse a ``preset[:key=value,...]`` scoring spec into a ScoringConfig.

    Examples: ``"ppr"``, ``"half"``, ``"ppr:pass_td=6"``,
    ``"std:rec=0.5,rec_td=6"``, ``"ppr:te_rec=1.5"``.

    Raises ``ValueError`` on an unknown preset, unknown key, non-numeric value, or
    out-of-range weight (the router turns this into a 400).
    """
    if not spec:
        spec = DEFAULT_PRESET

    preset_name, _, override_part = spec.partition(":")
    preset_name = preset_name.strip().lower()
    if preset_name not in PRESETS:
        raise ValueError(
            f"Unknown scoring preset '{preset_name}'. "
            f"Valid presets: {', '.join(sorted(PRESETS))}."
        )

    weights: dict[str, float] = dict(PRESETS[preset_name])

    if override_part:
        for clause in override_part.split(","):
            clause = clause.strip()
            if not clause:
                continue
            key, sep, raw_value = clause.partition("=")
            key = key.strip()
            if not sep:
                raise ValueError(f"Malformed scoring override '{clause}' (expected key=value).")
            if key not in _OVERRIDABLE:
                raise ValueError(
                    f"Unknown scoring key '{key}'. "
                    f"Valid keys: {', '.join(sorted(_OVERRIDABLE))}."
                )
            try:
                value = float(raw_value)
            except ValueError as exc:
                raise ValueError(f"Scoring value for '{key}' must be a number.") from exc
            if abs(value) > _WEIGHT_BOUND:
                raise ValueError(f"Scoring value for '{key}' is out of range (|value| ≤ {_WEIGHT_BOUND:.0f}).")
            weights[key] = value

    return ScoringConfig(**weights)


def _reception_weight(config: ScoringConfig) -> ColumnElement | float:
    """Return the per-reception weight, applying the TE-premium when set."""
    if config.te_rec is None:
        return config.rec
    return case((Player.position == "TE", config.te_rec), else_=config.rec)


def points_expr(config: ScoringConfig, sum_mode: bool) -> ColumnElement:
    """Build the fantasy-points SQL expression for ORDER BY / SELECT.

    ``sum_mode=True`` aggregates a season (each component is ``SUM(col)``);
    ``sum_mode=False`` scores a single per-game row (raw columns). One formula,
    both modes.
    """
    from sqlalchemy import func

    def col(name: str) -> ColumnElement:
        column = getattr(PlayerStats, name)
        aggregated = func.sum(column) if sum_mode else column
        return func.coalesce(aggregated, 0)

    expression: ColumnElement = col("fantasy_points_std")
    expression = expression + _reception_weight(config) * col("receptions")
    for field, column_name in WEIGHT_COLUMNS.items():
        delta = getattr(config, field) - STANDARD_WEIGHTS[field]
        if delta:
            expression = expression + delta * col(column_name)
    return expression


def compute_points(config: ScoringConfig, components: dict, position: str | None) -> float:
    """Compute fantasy points in Python from already-summed/raw components.

    Used for display so the returned ``fantasy_points`` matches the SQL ORDER BY
    expression exactly (same formula, same constants).
    """
    def value(name: str) -> float:
        raw = components.get(name)
        return float(raw) if raw is not None else 0.0

    rec_weight = config.te_rec if (config.te_rec is not None and position == "TE") else config.rec
    points = value("fantasy_points_std") + rec_weight * value("receptions")
    for field, column_name in WEIGHT_COLUMNS.items():
        points += (getattr(config, field) - STANDARD_WEIGHTS[field]) * value(column_name)
    return points
