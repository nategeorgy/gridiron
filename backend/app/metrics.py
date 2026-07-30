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
"""

from typing import Literal

from pydantic import BaseModel

Aggregation = Literal["sum", "avg", "derived", "scoring", "expected"]
Format = Literal["int", "pct"] | int


class MetricDef(BaseModel):
    """Canonical definition of a single metric."""

    id: str
    label: str
    short: str
    description: str
    format: Format
    category: Literal["fantasy", "passing", "rushing", "receiving", "usage"]
    aggregation: Aggregation
    applies_to: list[str] | Literal["all"] = "all"
    higher_is_better: bool = True
    rankable: bool = True
    base: str | None = None  # for aggregation="derived": the column divided by games
    # True for metrics that are *model estimates* rather than counted events (the
    # ffopportunity expected values). The UI labels these so they are never mistaken
    # for observed data. See docs/design/M2-expanded-metrics.md.
    modelled: bool = False


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
    _m("epa", "EPA", "EPA", 1, "usage", "sum",
       description="Total expected points added."),
    _m("fumbles", "Fumbles", "FUM", "int", "usage", "sum",
       higher_is_better=False, description="Total fumbles."),
    _m("fumbles_lost", "Fumbles Lost", "FUM L", "int", "usage", "sum",
       higher_is_better=False, description="Fumbles lost to the defense."),
]

REGISTRY_BY_ID: dict[str, MetricDef] = {metric.id: metric for metric in REGISTRY}


def ids_with_aggregation(aggregation: Aggregation) -> list[str]:
    """Metric ids whose aggregation matches (registry order preserved)."""
    return [metric.id for metric in REGISTRY if metric.aggregation == aggregation]
