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
    base: str | None = None  # for aggregation="derived": the column being divided
    # For aggregation="derived": what to divide ``base`` by. None means games played,
    # which is what every per-game metric wants. Naming columns instead gives a rate
    # per opportunity — EPA per play is ``base="epa", per=("attempts", "carries")`` —
    # without inventing a stored column for something that is pure arithmetic on two
    # that already exist.
    per: tuple[str, ...] | None = None
    # For aggregation="avg": weight the mean by this column instead of treating every
    # game equally. A stored per-game *rate* averaged flat lets a five-attempt game
    # count as much as a forty-five-attempt one — the same error the composite engine
    # already refuses to make ("aggregate first, then combine").
    weight_by: str | None = None
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
       weight_by="attempts",
       description="NFL passer rating, weighted by attempts. ⚠️ An approximation: the true "
                   "season rating recomputes the formula from summed components, and "
                   "its per-component clamps make it inexpressible as a weighted mean. "
                   "Far closer than a flat average of per-game ratings, which lets a "
                   "three-attempt relief appearance count as much as a full start."),
    _m("cpoe", "CPOE", "CPOE", 1, "passing", "avg", applies_to=["QB"],
       weight_by="attempts",
       description="Completion percentage over expected, weighted by attempts — a "
                   "five-attempt game does not count as much as a forty-five-attempt "
                   "one, which a flat average of per-game rates would let it do."),

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
       weight_by="targets",
       description="Average depth of target, weighted by targets — so the season "
                   "value is total air yards over total targets."),
    _m("yards_after_catch", "Yards After Catch", "YAC", "int", "receiving", "sum", applies_to=["WR", "TE", "RB"],
       description="Total yards after the catch."),
    _m("wopr", "WOPR", "WOPR", 2, "receiving", "avg", applies_to=["WR", "TE", "RB"],
       description="Weighted opportunity rating (air-yards + target share)."),
    _m("racr", "RACR", "RACR", 2, "receiving", "avg", applies_to=["WR", "TE", "RB"],
       weight_by="air_yards",
       description="Receiver air-conversion ratio, weighted by air yards — the season "
                   "value is total receiving yards over total air yards."),
    _m("red_zone_targets", "Red Zone Targets", "RZ TGT", "int", "receiving", "sum", applies_to=["WR", "TE", "RB"],
       description="Targets inside the opponent's 20."),
    _m("targets_per_route_run", "Targets Per Route Run", "TPRR", 2, "receiving", "avg", applies_to=["WR", "TE", "RB"],
       weight_by="routes_run",
       description="Targets divided by routes run, weighted by routes — total targets "
                   "over total routes."),
    _m("yards_per_route_run", "Yards Per Route Run", "YPRR", 2, "receiving", "avg", applies_to=["WR", "TE", "RB"],
       weight_by="routes_run",
       description="Receiving yards divided by routes run, weighted by routes — total "
                   "yards over total routes."),
    _m("yards_per_target", "Yards Per Target", "Y/TGT", 2, "receiving", "avg", applies_to=["WR", "TE", "RB"],
       weight_by="targets",
       description="Receiving yards divided by targets, weighted by targets — total "
                   "yards over total targets."),
    _m("yards_per_reception", "Yards Per Reception", "Y/REC", 2, "receiving", "avg", applies_to=["WR", "TE", "RB"],
       weight_by="receptions",
       description="Receiving yards divided by receptions, weighted by receptions — "
                   "total yards over total receptions."),
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
       description="Total expected points added — passing, rushing and receiving "
                   "combined, which is why a quarterback's rushing shows up here."),
    _m("epa_per_play", "EPA / Play", "EPA/PLAY", 3, "usage", "derived",
       base="epa", per=("attempts", "carries"),
       description="Expected points added per play, counting pass attempts and "
                   "carries. Rate rather than volume, so it separates a quarterback "
                   "who was efficient from one who simply threw a lot — and because "
                   "the denominator includes carries, a running quarterback's legs "
                   "count toward it rather than diluting it. Sacks are not in the "
                   "denominator: no free feed publishes them per player, so this is "
                   "per play rather than per dropback."),
    _m("fumbles", "Fumbles", "FUM", "int", "usage", "sum",
       higher_is_better=False, description="Total fumbles."),
    _m("fumbles_lost", "Fumbles Lost", "FUM L", "int", "usage", "sum",
       higher_is_better=False, description="Fumbles lost to the defense."),

    # --- Next Gen Stats (M11) ---
    #
    # Player-tracking derivatives from the chips in the ball and the pads, read via
    # nflverse's scrape of nextgenstats.nfl.com. Three things are true of every entry
    # below and of none of the entries above:
    #
    #   1. **2016+ only** (see app.availability.NEXTGEN), so half of project scope
    #      cannot answer them.
    #   2. **Qualified players only.** NGS ranks roughly 65 receivers a week and files
    #      each player under a single phase, so a pass-catching back has rushing NGS
    #      and no receiving NGS. Expect NULLs inside the window, not just outside it.
    #   3. **Every one is a stored per-week rate**, so all but the two genuine totals
    #      carry a ``weight_by``. Averaging these flat would let a three-target game
    #      count as much as a twelve-target one -- the bug fixed in 062e97d.
    #
    # The NGS CPOE and the NGS intended air yards are NOT the ``cpoe`` and ``adot``
    # defined above. Those come from nflverse play-by-play; these come from the NGS
    # model. They disagree, and they are supposed to -- which is exactly why they are
    # separate rows in this registry rather than one column with two sources.

    # Passing (QB) -- weighted by attempts
    _m("ngs_pass_time_to_throw", "Time to Throw (NGS)", "TT", 2, "passing", "avg",
       applies_to=["QB"], weight_by="attempts",
       description="Average seconds from snap to release. Descriptive rather than "
                   "good or bad: a high number is a quarterback holding the ball for "
                   "deep routes, and also one taking sacks."),
    _m("ngs_pass_intended_air_yards", "Intended Air Yards (NGS)", "IAY", 1, "passing",
       "avg", applies_to=["QB"], weight_by="attempts",
       description="Average depth of target on all attempts, completed or not -- the "
                   "quarterback's aDOT as NGS measures it. The single best read on "
                   "whether an offense throws downfield, which is what turns receiver "
                   "volume into fantasy points."),
    _m("ngs_pass_completed_air_yards", "Completed Air Yards (NGS)", "CAY", 1, "passing",
       "avg", applies_to=["QB"], weight_by="attempts",
       description="Average air yards on completions only."),
    _m("ngs_pass_air_yards_differential", "Air Yards Differential (NGS)", "AYD", 1,
       "passing", "avg", applies_to=["QB"], weight_by="attempts",
       description="Completed air yards minus intended air yards. Negative for almost "
                   "everyone; closer to zero means a passer is actually connecting at "
                   "the depth he is throwing to."),
    _m("ngs_pass_aggressiveness", "Aggressiveness (NGS)", "AGG%", "pct", "passing",
       "avg", applies_to=["QB"], weight_by="attempts",
       description="Share of attempts thrown into tight coverage -- a defender within "
                   "one yard of the receiver at the catch point. High aggressiveness "
                   "on a contested receiver is a fantasy signal; on a possession "
                   "offense it is a turnover warning."),
    _m("ngs_pass_air_yards_to_sticks", "Air Yards to Sticks (NGS)", "AYTS", 1,
       "passing", "avg", applies_to=["QB"], weight_by="attempts",
       description="Average air yards relative to the first-down marker. Negative "
                   "means the offense throws short of the sticks and asks receivers "
                   "to make up the difference."),
    _m("ngs_pass_expected_completion_pct", "Expected Completion % (NGS)", "xCOMP%",
       "pct", "passing", "avg", applies_to=["QB"], weight_by="attempts", modelled=True,
       description="The completion percentage an average quarterback would post on "
                   "this player's throws, given depth, receiver separation and "
                   "coverage. A low number means a hard set of throws, not a bad "
                   "passer."),
    _m("ngs_pass_completion_pct_above_expectation", "CPOE (NGS)", "CPOE-N", 1,
       "passing", "avg", applies_to=["QB"], weight_by="attempts", modelled=True,
       description="Completion percentage over expected, from the NGS tracking model. "
                   "Deliberately separate from the play-by-play CPOE above: different "
                   "model, different inputs, and they disagree by a point or two."),

    # Receiving (WR/TE) -- weighted by targets, or by receptions for the YAC family
    _m("ngs_rec_separation", "Separation (NGS)", "SEP", 2, "receiving", "avg",
       applies_to=["WR", "TE"], weight_by="targets",
       description="Average yards of separation from the nearest defender at the "
                   "moment the ball arrives. The closest thing tracking data has to a "
                   "measurement of whether a receiver is actually getting open."),
    _m("ngs_rec_cushion", "Cushion (NGS)", "CUSH", 2, "receiving", "avg",
       applies_to=["WR", "TE"], weight_by="targets",
       description="Average yards the assigned defender lines up off the receiver "
                   "before the snap. A shrinking cushion is respect; a large one is a "
                   "defense conceding the underneath throw."),
    _m("ngs_rec_intended_air_yards", "Intended Air Yards (NGS)", "IAY-R", 1,
       "receiving", "avg", applies_to=["WR", "TE"], weight_by="targets",
       description="Average depth of the targets thrown to this receiver, as NGS "
                   "measures it. Not the same number as the play-by-play ADOT above."),
    _m("ngs_rec_pct_share_intended_air_yards", "Air Yards Share (NGS)", "AY%-N", "pct",
       "receiving", "avg", applies_to=["WR", "TE"], weight_by="targets",
       description="Share of the team's intended air yards this receiver commanded -- "
                   "the NGS reading of how much of the downfield passing game runs "
                   "through him."),
    _m("ngs_rec_catch_pct", "Catch Rate (NGS)", "CATCH%", "pct", "receiving", "avg",
       applies_to=["WR", "TE"], weight_by="targets",
       description="Receptions divided by targets, as NGS counts them."),
    _m("ngs_rec_yac_above_expectation", "YAC Over Expected (NGS)", "YAC+", 2,
       "receiving", "avg", applies_to=["WR", "TE"], weight_by="receptions",
       modelled=True,
       description="Yards after catch above what the tracking model expected given "
                   "where the catch was made and where the defenders were. Separates "
                   "a receiver creating yards from one handed a screen with blockers."),
    _m("ngs_rec_yac", "Yards After Catch (NGS)", "YAC-N", 2, "receiving", "avg",
       applies_to=["WR", "TE"], weight_by="receptions",
       description="Average yards after the catch per reception."),
    _m("ngs_rec_expected_yac", "Expected YAC (NGS)", "xYAC", 2, "receiving", "avg",
       applies_to=["WR", "TE"], weight_by="receptions", modelled=True,
       description="Yards after catch the model expected, per reception."),

    # Rushing (RB/FB) -- weighted by carries, except the two genuine totals
    _m("ngs_rush_yards_over_expected", "Rush Yards Over Expected (NGS)", "RYOE", 1,
       "rushing", "sum", applies_to=["RB"], modelled=True,
       description="Rushing yards above what the tracking model expected given the "
                   "blocking, the box count and where every defender was at handoff. "
                   "The cleanest available separation of a back from his offensive "
                   "line -- a season total, so it rewards volume as well as skill."),
    _m("ngs_rush_yards_over_expected_per_att", "RYOE / Attempt (NGS)", "RYOE/A", 2,
       "rushing", "avg", applies_to=["RB"], weight_by="carries", modelled=True,
       description="Rush yards over expected on a per-carry basis -- the same signal "
                   "with volume divided out, so a committee back is judged on the "
                   "carries he got."),
    _m("ngs_rush_expected_yards", "Expected Rush Yards (NGS)", "xRY", "int", "rushing",
       "sum", applies_to=["RB"], modelled=True,
       description="Rushing yards the tracking model expected from this player's "
                   "carries. Read beside actual yards, it is a measure of the blocking "
                   "in front of him."),
    _m("ngs_rush_pct_over_expected", "Carries Over Expected % (NGS)", "ROE%", "pct",
       "rushing", "avg", applies_to=["RB"], weight_by="carries", modelled=True,
       description="Share of carries that gained more than the model expected. "
                   "Consistency rather than magnitude: a back at 55% is beating his "
                   "blocking more often than not, whatever his long runs say."),
    _m("ngs_rush_pct_attempts_eight_defenders", "Stacked Box Rate (NGS)", "8+BOX",
       "pct", "rushing", "avg", applies_to=["RB"], weight_by="carries",
       description="Share of carries faced with eight or more defenders in the box. "
                   "High rates mean defenses are daring the offense to throw -- "
                   "context that explains a poor yards-per-carry without excusing it."),
    _m("ngs_rush_efficiency", "Rush Efficiency (NGS)", "EFF-N", 2, "rushing", "avg",
       applies_to=["RB"], weight_by="carries", higher_is_better=False,
       description="Total distance travelled divided by yards gained downfield. "
                   "**Lower is better**: a back at 3.5 is running north-south, one at "
                   "8 is dancing behind the line."),
    _m("ngs_rush_time_to_los", "Time to Line of Scrimmage (NGS)", "TLOS", 2, "rushing",
       "avg", applies_to=["RB"], weight_by="carries", higher_is_better=False,
       description="Average seconds from handoff to crossing the line of scrimmage. "
                   "**Lower is better** -- decisiveness, which is what survives a "
                   "change of offensive line."),
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
        resolved = for_metric(metric.base)
        # A rate is only answerable where BOTH sides of it are, so a per-opportunity
        # metric inherits the narrower of its numerator's and denominator's windows.
        for column in metric.per or ():
            resolved = intersect(resolved, for_metric(column))
        return resolved

    if metric.aggregation == "avg" and metric.weight_by:
        # A weighted mean needs its weight as much as its value.
        return intersect(explicit, for_metric(metric.weight_by))

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
