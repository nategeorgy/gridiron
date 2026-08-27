"""Metric registry (M1 spine B) — one canonical definition per metric.

This is the single source of truth for metric metadata. The leaderboard derives
its aggregation behaviour (sum / avg / derived / scoring) from the ``aggregation``
field here instead of hard-coded lists, and the frontend fetches the registry from
``GET /api/v1/metrics`` for labels and formats. Adding a metric is one entry here
(plus the schema/pipeline/API columns when it's a stored stat).

``format`` matches the frontend formatter: ``"int"``, ``"pct"``, or an int number of
decimal places. ``aggregation``:
  - ``sum``     counting stat, summed over a season
  - ``avg``     rate/share stat, averaged over a season
  - ``derived``  per-game metric = SUM(``base``) / games
  - ``scoring``  computed by the fantasy engine from a ScoringConfig
  - ``expected`` computed by the fantasy engine from the *expected* components
                 (M2) under the same ScoringConfig
  - ``intelligence`` computed by the M3 intelligence engine from a ScoringConfig *and*
                 a LeagueConfig, over a season or a trailing window of weeks. These
                 are served by ``/stats/intelligence``, not by the leaderboard,
                 because they need the whole position pool to be ranked at once.
  - ``composite`` (M4) a weighted sum of other metrics over an optional divisor,
                 declared here as a ``formula`` string and evaluated by
                 ``app.custom_metrics`` — the same evaluator that serves user-defined
                 custom metrics, so a built-in and a user's metric cannot drift.
"""

from typing import Literal

from pydantic import BaseModel

from app.availability import (
    METRIC_AVAILABILITY,
    Availability,
    for_metric,
    intersect,
)

Aggregation = Literal[
    "sum", "avg", "derived", "scoring", "expected", "intelligence", "composite"
]
Format = Literal["int", "pct"] | int


class MetricDef(BaseModel):
    """Canonical definition of a single metric."""

    id: str
    label: str
    short: str
    description: str
    format: Format
    category: Literal["fantasy", "insight", "passing", "rushing", "receiving", "usage"]
    aggregation: Aggregation
    applies_to: list[str] | Literal["all"] = "all"
    higher_is_better: bool = True
    rankable: bool = True
    base: str | None = None  # for aggregation="derived": the column divided by games
    # For aggregation="composite": the formula, in the same grammar users write for
    # custom metrics — "term[+term...][/denominator]", where a term is
    # "[weight*]metric_id" and the denominator is a metric id or the literal "games".
    # Parsed at import time by app.custom_metrics, so a typo fails at startup.
    formula: str | None = None
    # True for metrics that are *model estimates* rather than counted events (the
    # ffopportunity expected values). The UI labels these so they are never mistaken
    # for observed data. See docs/design/M2-expanded-metrics.md.
    modelled: bool = False
    # Which seasons this metric has data in (M8). Filled in below rather than passed
    # per metric: most metrics are available for the whole range, and the ones that
    # are not are either listed in app.availability or derived from their inputs.
    availability: Availability | None = None


def _m(id: str, label: str, short: str, fmt: Format, category: str, agg: Aggregation, **kw) -> MetricDef:
    return MetricDef(id=id, label=label, short=short, format=fmt, category=category, aggregation=agg, **kw)


# --- The registry, grouped by category for readability ---
REGISTRY: list[MetricDef] = [
    # Fantasy — scoring-aware (computed from the active ScoringConfig)
    _m("fantasy_points", "Fantasy Points", "FPTS", 1, "fantasy", "scoring",
       description="Total fantasy points in the active league scoring."),
    _m("fantasy_ppg", "Fantasy PPG", "FPPG", 2, "fantasy", "scoring",
       description="Fantasy points per game in the active league scoring."),
    # Fantasy — fixed preset columns (kept for reference / back-compat)
    _m("fantasy_points_ppr", "Fantasy Points (PPR)", "PPR", 1, "fantasy", "sum",
       description="Total fantasy points, full-PPR scoring.", rankable=False),
    _m("fantasy_points_half", "Fantasy Points (Half)", "HALF", 1, "fantasy", "sum",
       description="Total fantasy points, half-PPR scoring.", rankable=False),
    _m("fantasy_points_std", "Fantasy Points (Std)", "STD", 1, "fantasy", "sum",
       description="Total fantasy points, standard (non-PPR) scoring.", rankable=False),
    _m("fantasy_ppg_ppr", "Fantasy PPG (PPR)", "PPG", 2, "fantasy", "derived", base="fantasy_points_ppr",
       description="Full-PPR fantasy points per game.", rankable=False),
    _m("fantasy_ppg_half", "Fantasy PPG (Half)", "PPG½", 2, "fantasy", "derived", base="fantasy_points_half",
       description="Half-PPR fantasy points per game.", rankable=False),
    _m("fantasy_ppg_std", "Fantasy PPG (Std)", "PPGs", 2, "fantasy", "derived", base="fantasy_points_std",
       description="Standard fantasy points per game.", rankable=False),

    # Fantasy — expected points (M2), scored in the active league scoring
    _m("expected_fantasy_points", "Expected Fantasy Points", "xFPTS", 1, "fantasy", "expected",
       modelled=True,
       description="Fantasy points a player's opportunity was worth, in the active "
                   "league scoring — modelled from where and how they were used, not "
                   "from what they actually produced."),
    _m("expected_fantasy_ppg", "Expected Fantasy PPG", "xFPPG", 2, "fantasy", "expected",
       modelled=True,
       description="Expected fantasy points per game in the active league scoring."),
    _m("fantasy_points_over_expected", "Points Over Expected", "FP±", 1, "fantasy", "expected",
       modelled=True,
       description="Actual fantasy points minus expected. Positive = outproducing the "
                   "opportunity (efficiency or touchdown luck that may not hold); "
                   "negative = the usage says more points should be coming."),

    # Insight — fantasy intelligence (M3). Scoring-aware *and* league-aware; served by
    # /stats/intelligence. See docs/design/M3-fantasy-intelligence.md for the formulas.
    _m("vorp", "Value Over Replacement", "VORP", 1, "insight", "intelligence",
       description="Fantasy points this player produced above what the last startable "
                   "player at their position would have — in your scoring and your "
                   "league size. The honest way to compare a tight end to a running back."),
    _m("vorp_ppg", "VORP Per Game", "VORP/G", 2, "insight", "intelligence",
       description="Value over replacement on a per-game basis, so an injured star "
                   "isn't punished for the weeks they missed."),
    _m("replacement_ppg", "Replacement Level", "REPL", 2, "insight", "intelligence",
       rankable=False,
       description="Points per game of the last startable player at this position in "
                   "your league — the baseline VORP is measured against."),
    _m("expected_vorp", "Expected VORP", "xVORP", 1, "insight", "intelligence",
       modelled=True,
       description="Value over replacement measured on *expected* points instead of "
                   "actual ones — what the player's usage was worth above the last "
                   "startable player at their position. Strips touchdown luck and "
                   "efficiency out of value, so it reads opportunity rather than "
                   "results. The valuation behind the Draft Value Board."),
    _m("expected_vorp_ppg", "Expected VORP Per Game", "xVORP/G", 2, "insight",
       "intelligence", modelled=True,
       description="Expected value over replacement per game, so a player who missed "
                   "time is judged on the weeks they played."),
    _m("replacement_expected_ppg", "Replacement Level (Expected)", "xREPL", 2, "insight",
       "intelligence", rankable=False, modelled=True,
       description="Expected points per game of the last startable player at this "
                   "position — the baseline expected VORP is measured against."),
    _m("fantasy_opportunity_rating", "Fantasy Opportunity Rating", "FOR", 1, "insight",
       "intelligence", modelled=True,
       description="0–100: how much of the offense runs through this player, "
                   "regardless of what it produced. Half expected fantasy points, half "
                   "the usage shares that matter at their position."),
    _m("positive_regression_index", "Positive-Regression Index", "BUY", 1, "insight",
       "intelligence", modelled=True,
       description="0–100 buy-low signal: real opportunity, scoring below what that "
                   "opportunity is worth, touchdown-starved, and still cheap."),
    _m("sell_high_index", "Sell-High Index", "SELL", 1, "insight", "intelligence",
       modelled=True,
       description="0–100 sell-high signal: outscoring the opportunity on touchdown "
                   "luck and above-baseline efficiency, with usage already shrinking."),
    _m("tds_over_expected", "TDs Over Expected", "TD±", 2, "insight", "intelligence",
       modelled=True,
       description="Total touchdowns minus modelled touchdowns. The single most "
                   "volatile source of fantasy points, and the first thing to regress."),
    _m("efficiency_over_baseline", "Efficiency vs Career", "EFF±", 3, "insight",
       "intelligence",
       description="Fantasy points per opportunity compared with this player's own "
                   "earlier seasons. Positive means they're finishing plays better than "
                   "they ever have — which usually doesn't last."),
    _m("opportunity_trend", "Usage Trend", "TREND", "pct", "insight", "intelligence",
       description="Change in share of the offense from the first half of the window to "
                   "the second — for QBs, the relative change in pass attempts per "
                   "game. Negative means the role is shrinking."),

    # Expected components — the stored ffopportunity estimates xFP is built from
    _m("passing_yards_exp", "Expected Passing Yards", "xPASS YD", "int", "passing", "sum",
       applies_to=["QB"], modelled=True, description="Modelled passing yards from pass attempts."),
    _m("passing_tds_exp", "Expected Passing TDs", "xPASS TD", 1, "passing", "sum",
       applies_to=["QB"], modelled=True, description="Modelled passing touchdowns from pass attempts."),
    _m("interceptions_exp", "Expected Interceptions", "xINT", 1, "passing", "sum",
       applies_to=["QB"], higher_is_better=False, modelled=True,
       description="Modelled interceptions from pass attempts."),
    _m("rushing_yards_exp", "Expected Rushing Yards", "xRUSH YD", "int", "rushing", "sum",
       applies_to=["RB", "QB", "WR"], modelled=True,
       description="Modelled rushing yards from carries and where they came from."),
    _m("rushing_tds_exp", "Expected Rushing TDs", "xRUSH TD", 1, "rushing", "sum",
       applies_to=["RB", "QB", "WR"], modelled=True,
       description="Modelled rushing touchdowns from carry volume and field position."),
    _m("receiving_yards_exp", "Expected Receiving Yards", "xREC YD", "int", "receiving", "sum",
       applies_to=["WR", "TE", "RB"], modelled=True,
       description="Modelled receiving yards from target volume and depth."),
    _m("receiving_tds_exp", "Expected Receiving TDs", "xREC TD", 1, "receiving", "sum",
       applies_to=["WR", "TE", "RB"], modelled=True,
       description="Modelled receiving touchdowns from target volume and field position."),
    _m("receptions_exp", "Expected Receptions", "xREC", 1, "receiving", "sum",
       applies_to=["WR", "TE", "RB"], modelled=True,
       description="Modelled catches from target volume and difficulty."),
    _m("two_point_conv_exp", "Expected 2-Pt Conversions", "x2PT", 2, "fantasy", "sum",
       modelled=True, rankable=False, description="Modelled two-point conversions."),

    # Passing
    _m("passing_yards", "Passing Yards", "PASS YD", "int", "passing", "sum", applies_to=["QB"],
       description="Total passing yards."),
    _m("passing_tds", "Passing TDs", "PASS TD", "int", "passing", "sum", applies_to=["QB"],
       description="Passing touchdowns."),
    _m("interceptions", "Interceptions", "INT", "int", "passing", "sum", applies_to=["QB"],
       higher_is_better=False, description="Interceptions thrown."),
    _m("completions", "Completions", "CMP", "int", "passing", "sum", applies_to=["QB"],
       description="Completed passes."),
    _m("attempts", "Attempts", "ATT", "int", "passing", "sum", applies_to=["QB"],
       description="Pass attempts."),
    _m("passer_rating", "Passer Rating", "RATE", 1, "passing", "avg", applies_to=["QB"],
       description="NFL passer rating."),
    _m("cpoe", "CPOE", "CPOE", 1, "passing", "avg", applies_to=["QB"],
       description="Completion percentage over expected."),

    # Rushing
    _m("rushing_yards", "Rushing Yards", "RUSH YD", "int", "rushing", "sum", applies_to=["RB", "QB", "WR"],
       description="Total rushing yards."),
    _m("rushing_tds", "Rushing TDs", "RUSH TD", "int", "rushing", "sum", applies_to=["RB", "QB", "WR"],
       description="Rushing touchdowns."),
    _m("carries", "Carries", "CAR", "int", "rushing", "sum", applies_to=["RB", "QB", "WR"],
       description="Rushing attempts."),
    _m("red_zone_rush_attempts", "Red Zone Carries", "RZ CAR", "int", "rushing", "sum", applies_to=["RB", "QB"],
       description="Rushing attempts inside the opponent's 20."),
    _m("red_zone_rush_share", "Red Zone Rush Share", "RZ RUN%", "pct", "rushing", "avg", applies_to=["RB", "QB"],
       description="Share of the team's red-zone rushing attempts."),
    _m("rushing_epa", "Rushing EPA", "RU EPA", 1, "rushing", "sum", applies_to=["RB", "QB"],
       description="Expected points added on rushes."),
    _m("rush_att_inside_10", "Carries Inside 10", "IN10", "int", "rushing", "sum", applies_to=["RB", "QB"],
       description="Rushing attempts from inside the opponent's 10-yard line."),
    _m("rush_att_inside_5", "Carries Inside 5", "IN5", "int", "rushing", "sum", applies_to=["RB", "QB"],
       description="Rushing attempts from inside the opponent's 5-yard line — the highest-value carries in fantasy."),
    _m("rush_att_inside_2", "Carries Inside 2", "IN2", "int", "rushing", "sum", applies_to=["RB", "QB"],
       description="Rushing attempts from inside the opponent's 2-yard line."),
    _m("rush_attempt_share", "Rush Share", "RUSH%", "pct", "rushing", "avg", applies_to=["RB", "QB", "WR"],
       description="Share of the team's rushing attempts."),

    # Receiving
    _m("receiving_yards", "Receiving Yards", "REC YD", "int", "receiving", "sum", applies_to=["WR", "TE", "RB"],
       description="Total receiving yards."),
    _m("receiving_tds", "Receiving TDs", "REC TD", "int", "receiving", "sum", applies_to=["WR", "TE", "RB"],
       description="Receiving touchdowns."),
    _m("receptions", "Receptions", "REC", "int", "receiving", "sum", applies_to=["WR", "TE", "RB"],
       description="Catches."),
    _m("targets", "Targets", "TGT", "int", "receiving", "sum", applies_to=["WR", "TE", "RB"],
       description="Times targeted."),
    _m("target_share", "Target Share", "TGT%", "pct", "receiving", "avg", applies_to=["WR", "TE", "RB"],
       description="Share of the team's targets while on the field."),
    _m("air_yards", "Air Yards", "AIR YD", "int", "receiving", "sum", applies_to=["WR", "TE", "RB"],
       description="Total air yards on targets."),
    _m("air_yards_share", "Air Yards Share", "AY%", "pct", "receiving", "avg", applies_to=["WR", "TE", "RB"],
       description="Share of the team's air yards."),
    _m("adot", "ADOT", "ADOT", 1, "receiving", "avg", applies_to=["WR", "TE", "RB"],
       description="Average depth of target."),
    _m("yards_after_catch", "Yards After Catch", "YAC", "int", "receiving", "sum", applies_to=["WR", "TE", "RB"],
       description="Total yards after the catch."),
    _m("wopr", "WOPR", "WOPR", 2, "receiving", "avg", applies_to=["WR", "TE", "RB"],
       description="Weighted opportunity rating (air-yards + target share)."),
    _m("racr", "RACR", "RACR", 2, "receiving", "avg", applies_to=["WR", "TE", "RB"],
       description="Receiver air-conversion ratio."),
    _m("red_zone_targets", "Red Zone Targets", "RZ TGT", "int", "receiving", "sum", applies_to=["WR", "TE", "RB"],
       description="Targets inside the opponent's 20."),
    _m("targets_per_route_run", "Targets Per Route Run", "TPRR", 2, "receiving", "avg", applies_to=["WR", "TE", "RB"],
       description="Targets divided by routes run."),
    _m("yards_per_route_run", "Yards Per Route Run", "YPRR", 2, "receiving", "avg", applies_to=["WR", "TE", "RB"],
       description="Receiving yards divided by routes run."),
    _m("yards_per_target", "Yards Per Target", "Y/TGT", 2, "receiving", "avg", applies_to=["WR", "TE", "RB"],
       description="Receiving yards divided by targets."),
    _m("yards_per_reception", "Yards Per Reception", "Y/REC", 2, "receiving", "avg", applies_to=["WR", "TE", "RB"],
       description="Receiving yards divided by receptions."),
    _m("routes_run", "Routes Run", "RTS", "int", "receiving", "sum", applies_to=["WR", "TE", "RB"],
       description="Total routes run."),
    _m("routes_run_per_game", "Routes Run / Game", "RTS/G", 1, "receiving", "derived", base="routes_run",
       applies_to=["WR", "TE", "RB"], description="Routes run per game."),
    _m("route_participation", "Route Participation", "RTE%", "pct", "receiving", "avg", applies_to=["WR", "TE", "RB"],
       description="Share of team pass plays on which the player ran a route."),
    _m("slot_snaps", "Slot Snaps", "SLOT", "int", "receiving", "sum", applies_to=["WR", "TE", "RB"],
       description="Snaps aligned in the slot."),
    _m("unrealized_air_yards", "Unrealized Air Yards", "UAY", "int", "receiving", "sum", applies_to=["WR", "TE", "RB"],
       description="Air yards on incompletions (lost opportunity)."),
    _m("receiving_epa", "Receiving EPA", "RE EPA", 1, "receiving", "sum", applies_to=["WR", "TE", "RB"],
       description="Expected points added on receptions."),

    # Usage / general
    _m("snap_count", "Snap Count", "SNAP", "int", "usage", "sum",
       description="Offensive snaps played."),
    _m("snap_share", "Snap Share", "SNAP%", "pct", "usage", "avg",
       description="Share of the team's offensive snaps."),
    _m("opportunity_share", "Opportunity Share", "OPP%", "pct", "usage", "avg",
       applies_to=["RB", "WR", "TE"],
       description="Share of the team's touches and targets (carries + targets) — the "
                   "single best read on how much of the offense runs through a player."),
    _m("market_share", "Market Share", "MKT%", "pct", "usage", "avg",
       applies_to=["RB", "WR", "TE"],
       description="Share of the team's yards from scrimmage (rushing + receiving)."),

    # Composite usage metrics (M4) — defined as formulas over the metrics above and
    # evaluated by the same engine as user-defined custom metrics.
    _m("high_value_touches_per_game", "High-Value Touches / Game", "HVT/G", 2, "usage",
       "composite", formula="red_zone_targets+rush_att_inside_5/games",
       applies_to=["RB", "WR", "TE"],
       description="Red-zone targets plus carries inside the 5, per game. The two "
                   "highest-value touch types in fantasy counted together — volume "
                   "measured where points are actually scored, not between the 20s."),
    _m("touches_per_snap", "Touches Per Snap", "TCH/SNAP", 3, "usage",
       "composite", formula="targets+carries/snap_count",
       applies_to=["RB", "WR", "TE"],
       description="Targets plus carries divided by snaps played — how efficiently a "
                   "role converts playing time into opportunity. A back who touches "
                   "the ball on a third of his snaps is used very differently from "
                   "one who blocks on most of them."),
    _m("epa", "EPA", "EPA", 1, "usage", "sum",
       description="Total expected points added."),
    _m("fumbles", "Fumbles", "FUM", "int", "usage", "sum",
       higher_is_better=False, description="Total fumbles."),
    _m("fumbles_lost", "Fumbles Lost", "FUM L", "int", "usage", "sum",
       higher_is_better=False, description="Fumbles lost to the defense."),
]


REGISTRY_BY_ID: dict[str, MetricDef] = {metric.id: metric for metric in REGISTRY}


# --- Availability (M8): which seasons each metric actually has data in ---
#
# Three kinds of answer, in order of preference:
#   1. An explicit window in app.availability (every stored column with a restriction).
#   2. Derived from what the metric is built from — a per-game metric is only as
#      available as the column it divides, and a composite only as available as its
#      narrowest input. Deriving these means adding a composite can never accidentally
#      claim a season its own inputs do not have.
#   3. The full range, for everything else.
def _derive_availability(metric: MetricDef, parse_formula) -> Availability:
    """Resolve one metric's window, following `base` and `formula` to their inputs.

    ``parse_formula`` is passed in rather than imported: it lives in
    ``app.custom_metrics``, which imports this module, and taking it as an argument is
    what keeps that cycle out of this function. See :func:`finalize_availability`.
    """
    explicit = for_metric(metric.id)
    if metric.id in _EXPLICIT_IDS:
        return explicit

    if metric.aggregation == "derived" and metric.base:
        return for_metric(metric.base)

    if metric.aggregation == "composite" and metric.formula:
        # Parsed rather than re-implemented: the same grammar the engine uses.
        parsed = parse_formula(metric.id, metric.formula, builtin=True)
        inputs = [term.metric for term in parsed.terms]
        if parsed.denominator and parsed.denominator != "games":
            inputs.append(parsed.denominator)
        resolved = explicit
        for input_id in inputs:
            resolved = intersect(resolved, for_metric(input_id))
        return resolved

    return explicit


_EXPLICIT_IDS = set(METRIC_AVAILABILITY)

_availability_resolved = False


def finalize_availability() -> None:
    """Stamp every metric with its availability window. Idempotent.

    **This exists to break a genuine import cycle**, not for laziness' sake: resolving
    a *composite* metric's window needs the formula grammar in ``app.custom_metrics``,
    and that module needs ``REGISTRY`` from this one. Whichever of the two is imported
    first cannot finish the job, so both call this and whichever finishes second does
    the work.

    Before this, importing ``app.custom_metrics`` (or anything reaching it first, such
    as ``app.intelligence`` or ``app.routers.stats``) raised ImportError outright. It
    only ever worked because ``app.main`` happened to import this module first — an
    ordering nothing stated and nothing enforced.
    """
    global _availability_resolved
    if _availability_resolved:
        return
    from app.custom_metrics import parse_formula

    # A nested call may have completed while that import ran — it does exactly this,
    # from the bottom of app.custom_metrics.
    if _availability_resolved:
        return
    for metric in REGISTRY:
        metric.availability = _derive_availability(metric, parse_formula)
    _availability_resolved = True


# Try now, in case this module was imported first. If app.custom_metrics is
# mid-import, the parser does not exist yet and it finishes the job on its way out.
try:
    finalize_availability()
except ImportError:
    pass


def ids_with_aggregation(aggregation: Aggregation) -> list[str]:
    """Metric ids whose aggregation matches (registry order preserved)."""
    return [metric.id for metric in REGISTRY if metric.aggregation == aggregation]
