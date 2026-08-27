"""Custom metrics (M4) — a third per-request config, alongside scoring and league.

M1 made fantasy points scoring-aware (``scoring=``); M3 made value league-aware
(``league=``). This module adds ``custom=``: metrics that do not exist until a caller
asks for them, evaluated at query time and never stored. Same reasoning as M2's
expected *components* and M3's intelligence scores — a stored value is locked to one
context, and a formula is not.

The grammar is deliberately structured rather than free-form::

    custom      = spec[;spec...]
    spec        = name=numerator[/denominator]
    numerator   = term[+term...]
    term        = [weight*]metric_id
    denominator = metric_id | "games"

::

    "hvt=red_zone_targets+rush_att_inside_5/games"
    "tps=targets+carries/snap_count"
    "blend=0.6*target_share+0.4*rush_attempt_share"

A weighted sum over an optional divisor — nothing more. **There is no expression
parser and no eval.** Every term is a registry id looked up in ``REGISTRY_BY_ID``,
every weight is a bounded float, and anything else raises ``ValueError`` for the
router to turn into a 400 — exactly as ``parse_scoring`` and ``parse_league`` do.

Aggregation semantics: **aggregate first, then combine.** Each term is aggregated over
the window by its own registry rule (``sum`` → SUM, ``avg`` → AVG, ``scoring`` →
the M1 engine), and the arithmetic runs on those aggregates. So
``receiving_yards/targets`` over a season is ``Σyards / Σtargets``, never the mean of
per-game ratios — the second reading lets a one-target game count as much as a
twelve-target one. This matches how the leaderboard already treats ``derived``
metrics, so a custom metric behaves like a built-in.

See docs/design/M4-exploration-viz.md §1.
"""

from __future__ import annotations

import re

from pydantic import BaseModel

from app.metrics import REGISTRY, REGISTRY_BY_ID

# The literal denominator meaning "games played" — the only non-metric divisor.
GAMES = "games"

# Aggregations a term may reference. ``intelligence`` is excluded because those scores
# are percentile ranks computed in Python across a whole position pool: there is no
# column or SQL expression to divide by. ``composite`` is excluded to rule out cycles.
TERM_AGGREGATIONS: frozenset[str] = frozenset(
    {"sum", "avg", "derived", "scoring", "expected"}
)

_NAME_PATTERN = re.compile(r"^[a-z][a-z0-9_]{0,23}$")
_WEIGHT_BOUND = 1000.0
_MAX_TERMS = 8
_MAX_METRICS = 5  # per request

# Custom metric ids are namespaced so they can never collide with the registry.
ID_PREFIX = "custom_"


class CustomTerm(BaseModel):
    """One ``[weight*]metric_id`` term of a custom metric's numerator."""

    metric: str
    weight: float = 1.0


class CustomMetric(BaseModel):
    """A resolved custom metric: a weighted sum over an optional divisor."""

    name: str
    terms: list[CustomTerm]
    denominator: str | None = None
    # Built-ins are registry ``composite`` metrics expressed in this same grammar.
    # They keep their registry id; only user-defined metrics get namespaced.
    builtin: bool = False

    @property
    def id(self) -> str:
        """The field name this metric is returned under (namespaced, collision-free)."""
        return self.name if self.builtin else f"{ID_PREFIX}{self.name}"


def _validate_metric_id(metric_id: str, role: str) -> str:
    """Check a term/denominator references a metric that can actually be evaluated."""
    definition = REGISTRY_BY_ID.get(metric_id)
    if definition is None:
        raise ValueError(f"Unknown metric '{metric_id}' in custom metric {role}.")
    if definition.aggregation not in TERM_AGGREGATIONS:
        raise ValueError(
            f"Metric '{metric_id}' cannot be used in a custom metric: "
            f"'{definition.aggregation}' metrics are computed across a whole position "
            "pool rather than from a player's own rows."
        )
    return metric_id


def parse_formula(name: str, formula: str, builtin: bool = False) -> CustomMetric:
    """Parse one ``numerator[/denominator]`` formula into a CustomMetric.

    Shared by ``parse_custom`` (user specs) and the registry's built-in ``composite``
    metrics, so both are validated by exactly the same grammar. The *name* is validated
    by ``parse_custom`` rather than here — built-ins are named by their registry id,
    which is longer than a user-facing name is allowed to be.
    """
    numerator_part, separator, denominator_part = formula.partition("/")
    if separator and not denominator_part.strip():
        raise ValueError(f"Custom metric '{name}' has a '/' with no denominator.")

    terms: list[CustomTerm] = []
    for raw_term in numerator_part.split("+"):
        raw_term = raw_term.strip()
        if not raw_term:
            raise ValueError(f"Custom metric '{name}' has an empty term.")

        weight_part, star, metric_part = raw_term.rpartition("*")
        weight = 1.0
        if star:
            try:
                weight = float(weight_part.strip())
            except ValueError as exc:
                raise ValueError(
                    f"Custom metric '{name}': weight '{weight_part.strip()}' is not a number."
                ) from exc
            if abs(weight) > _WEIGHT_BOUND:
                raise ValueError(
                    f"Custom metric '{name}': weight is out of range "
                    f"(|weight| ≤ {_WEIGHT_BOUND:.0f})."
                )
        terms.append(
            CustomTerm(metric=_validate_metric_id(metric_part.strip(), "numerator"), weight=weight)
        )

    if not terms:
        raise ValueError(f"Custom metric '{name}' has no terms.")
    if len(terms) > _MAX_TERMS:
        raise ValueError(f"Custom metric '{name}' has more than {_MAX_TERMS} terms.")

    denominator: str | None = None
    if separator:
        candidate = denominator_part.strip()
        denominator = candidate if candidate == GAMES else _validate_metric_id(candidate, "denominator")

    return CustomMetric(name=name, terms=terms, denominator=denominator, builtin=builtin)


def parse_custom(spec: str | None) -> list[CustomMetric]:
    """Parse a ``name=formula[;name=formula...]`` spec into resolved custom metrics.

    Returns an empty list for an empty spec. Raises ``ValueError`` on a malformed
    clause, a duplicate name, an unknown metric, or too many metrics.
    """
    if not spec or not spec.strip():
        return []

    metrics: list[CustomMetric] = []
    seen: set[str] = set()
    for clause in spec.split(";"):
        clause = clause.strip()
        if not clause:
            continue
        name, separator, formula = clause.partition("=")
        if not separator:
            raise ValueError(f"Malformed custom metric '{clause}' (expected name=formula).")
        name = name.strip().lower()
        if not _NAME_PATTERN.match(name):
            raise ValueError(
                f"Custom metric name '{name}' must start with a letter and contain only "
                "lowercase letters, numbers, and underscores (max 24 characters)."
            )
        if name in REGISTRY_BY_ID:
            raise ValueError(f"'{name}' is already a built-in metric — choose another name.")
        if name in seen:
            raise ValueError(f"Duplicate custom metric name '{name}'.")
        seen.add(name)
        metrics.append(parse_formula(name, formula.strip()))

    if len(metrics) > _MAX_METRICS:
        raise ValueError(f"At most {_MAX_METRICS} custom metrics per request.")
    return metrics


def compute_custom(metric: CustomMetric, record: dict) -> float | None:
    """Evaluate a custom metric from an already-aggregated row.

    ``record`` holds each referenced metric under its own id (the aggregation layer
    fills those in before this runs), plus ``games_played``. Returns ``None`` when the
    divisor is zero or missing, so "no data" stays distinguishable from zero — the
    same rule the rest of the codebase follows.
    """
    total = 0.0
    for term in metric.terms:
        value = record.get(term.metric)
        if value is not None:
            total += term.weight * float(value)

    if metric.denominator is None:
        return total

    divisor = (
        record.get("games_played") if metric.denominator == GAMES
        else record.get(metric.denominator)
    )
    if divisor is None or float(divisor) == 0.0:
        return None
    return total / float(divisor)


def formula_text(metric: CustomMetric) -> str:
    """Render a formula back to its canonical spec, e.g. ``"0.6*target_share/games"``."""
    parts = [
        term.metric if term.weight == 1.0 else f"{term.weight:g}*{term.metric}"
        for term in metric.terms
    ]
    numerator = "+".join(parts)
    return f"{numerator}/{metric.denominator}" if metric.denominator else numerator


def formula_label(metric: CustomMetric) -> str:
    """Human-readable formula using registry short labels, e.g. ``"(RZ TGT + IN5) / G"``.

    This is the display label when a shared link arrives without the author's own name
    for the metric — more use to a stranger than someone else's private shorthand.
    """
    def short(metric_id: str) -> str:
        definition = REGISTRY_BY_ID.get(metric_id)
        return definition.short if definition else metric_id

    parts = [
        short(term.metric) if term.weight == 1.0 else f"{term.weight:g}×{short(term.metric)}"
        for term in metric.terms
    ]
    numerator = " + ".join(parts)
    if metric.denominator is None:
        return numerator
    if len(parts) > 1:
        numerator = f"({numerator})"
    divisor = "G" if metric.denominator == GAMES else short(metric.denominator)
    return f"{numerator} / {divisor}"


# Built-in composite metrics, parsed from the registry at import time so a typo in a
# formula fails at startup rather than on a request. Keyed by metric id.
BUILTIN_COMPOSITES: dict[str, CustomMetric] = {
    definition.id: parse_formula(definition.id, definition.formula, builtin=True)
    for definition in REGISTRY
    if definition.aggregation == "composite" and definition.formula
}


# app.metrics defers stamping composite availability until this module exists, because
# resolving a composite's window needs the formula grammar above. Whichever of the two
# modules is imported second finishes the job; see metrics.finalize_availability.
from app.metrics import finalize_availability  # noqa: E402

finalize_availability()
