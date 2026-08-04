"""Fantasy intelligence (M3) — VORP, opportunity rating, and the buy/sell indices.

This is the moat layer: descriptive, explainable signals rather than a black-box
projection. Everything here is derived at query time from data M1/M2 already produce,
so every score responds to the user's own league scoring *and* league size.

The four scores
---------------
**VORP** — value over replacement. A player's fantasy points per game minus the
points per game of the last startable player at their position *in this league*
(see :mod:`app.league`), and that gap multiplied by games played for a season total.
Twelve points per game is a star at tight end and a bench player at running back;
VORP is what makes those two numbers comparable.

**Fantasy Opportunity Rating (FOR)** — 0–100. How much of an offense is running
through a player, regardless of what it produced. Half of it is expected fantasy
points per game (M2's scoring-aware read on opportunity *value*); half is the
position's usage shares (target share, route participation, goal-line carries…).

**Positive-Regression Index (PRI)** — 0–100, the buy-low signal. High when a player
is scoring *less* than their usage is worth, is touchdown-starved, and is cheap —
weighted so that a big gap only counts when the opportunity behind it is real.

**Sell-High Index (SHI)** — 0–100. High when a player is outscoring their usage on
touchdown luck and above-baseline efficiency *and* their share of the offense is
already shrinking.

How the scores are built
------------------------
Every input is converted to a **percentile within its own position pool** (mid-rank,
so ties share a percentile) and the composites are weighted means of those
percentiles, ×100. Percentiles rather than z-scores because these distributions are
skewed and long-tailed, and because "84th percentile among receivers" is a sentence a
fantasy manager can act on. When an input is missing for a player, its weight is
dropped and the rest are renormalised, except where noted below.

The pool is the *qualified* players at that position — those meeting ``min_games``.
Any player can be scored against that pool, qualified or not, so a player page can
show a score with a "small sample" caveat rather than an empty panel.
"""

from __future__ import annotations

from bisect import bisect_left, bisect_right
from dataclasses import dataclass

from sqlalchemy import Select, case, func, select
from sqlalchemy.orm import Session

from app.aggregation import (
    POSITIONS,
    aggregate_select,
    finalize_row,
    games_expr,
    round_value,
    window_filters,
)
from app.custom_metrics import CustomMetric
from app.league import LeagueConfig, replacement_ranks
from app.models import Player, PlayerStats
from app.scoring import ScoringConfig, points_expr

# --- Tuning constants (all in one place, all documented in the M3 design doc) ---

# Share of the window's weeks a player must have played to enter a ranking pool.
QUALIFY_FRACTION = 0.35
MIN_QUALIFY_GAMES = 2

# Replacement level is the mean of a small band of players centred on the replacement
# rank rather than that single player, so one outlier week can't move the baseline.
REPLACEMENT_BAND = 3

# Career-baseline efficiency needs enough prior volume to mean anything.
MIN_BASELINE_OPPORTUNITIES = 50

# Weight of expected fantasy points per game in the opportunity rating. The remaining
# weight is spent on the position's usage shares below.
FOR_EXPECTED_WEIGHT = 0.50


@dataclass(frozen=True)
class Term:
    """One weighted input of a composite score."""

    key: str
    label: str
    weight: float
    format: str | int = 2
    invert: bool = False  # True when *lower* raw values should score higher


# Usage terms for the opportunity rating, per position. Weights sum to
# 1 − FOR_EXPECTED_WEIGHT.
FOR_USAGE_TERMS: dict[str, tuple[Term, ...]] = {
    "QB": (
        Term("attempts_pg", "Pass attempts / game", 0.30, 1),
        Term("carries_pg", "Carries / game", 0.20, 1),
    ),
    "RB": (
        Term("opportunity_share", "Opportunity share", 0.20, "pct"),
        Term("rush_att_inside_10_pg", "Carries inside 10 / game", 0.15, 2),
        Term("route_participation", "Route participation", 0.15, "pct"),
    ),
    "WR": (
        Term("target_share", "Target share", 0.20, "pct"),
        Term("route_participation", "Route participation", 0.15, "pct"),
        Term("air_yards_share", "Air yards share", 0.15, "pct"),
    ),
}
FOR_USAGE_TERMS["TE"] = FOR_USAGE_TERMS["WR"]

FOR_EXPECTED_TERM = Term(
    "expected_fantasy_ppg", "Expected fantasy PPG", FOR_EXPECTED_WEIGHT, 2
)

# The buy-low signal: underproducing real opportunity, touchdown-starved, and cheap.
PRI_TERMS: tuple[Term, ...] = (
    Term("points_over_expected_pg", "Points over expected / game", 0.40, 2, invert=True),
    Term("fantasy_opportunity_rating", "Fantasy Opportunity Rating", 0.30, 1),
    Term("tds_over_expected_pg", "TDs over expected / game", 0.15, 2, invert=True),
    Term("fantasy_ppg", "Fantasy PPG", 0.15, 2, invert=True),
)

# The sell-high signal: unsustainable scoring on shrinking usage.
SHI_TERMS: tuple[Term, ...] = (
    Term("points_over_expected_pg", "Points over expected / game", 0.35, 2),
    Term("tds_over_expected_pg", "TDs over expected / game", 0.20, 2),
    Term("efficiency_over_baseline", "Points per opportunity vs career", 0.20, 2),
    Term("opportunity_trend", "Usage trend (2nd half − 1st half)", 0.15, "pct", invert=True),
    Term("fantasy_ppg", "Fantasy PPG", 0.10, 2),
)

# Both indices are built around the expected-points gap; without expected data the
# remaining inputs describe usage, not regression, so no score is reported.
REGRESSION_REQUIRED_INPUT = "points_over_expected_pg"


# --- Percentile machinery ---


class Pool:
    """The distribution of one input across a position's qualified players."""

    def __init__(self, values: list[float]) -> None:
        self.values = sorted(values)

    def percentile(self, value: float | None) -> float | None:
        """Mid-rank percentile of ``value`` in [0, 1]; ``None`` if it can't be placed."""
        if value is None or not self.values:
            return None
        below = bisect_left(self.values, value)
        equal = bisect_right(self.values, value) - below
        return (below + 0.5 * equal) / len(self.values)


def _weighted_score(
    terms: tuple[Term, ...], percentiles: dict[str, float | None]
) -> float | None:
    """Weighted mean of the terms' percentiles, on a 0–100 scale.

    Missing inputs drop out and the remaining weights are renormalised, so a rookie
    with no career baseline is still scored on everything else.
    """
    total_weight = 0.0
    total = 0.0
    for term in terms:
        percentile = percentiles.get(term.key)
        if percentile is None:
            continue
        value = 1.0 - percentile if term.invert else percentile
        total += term.weight * value
        total_weight += term.weight
    if not total_weight:
        return None
    return 100.0 * total / total_weight


# --- Window resolution and the supporting queries ---


@dataclass(frozen=True)
class Window:
    """The stretch of weeks a set of scores covers."""

    season: int
    season_type: str
    week_from: int
    week_to: int
    last_weeks: int | None

    @property
    def weeks(self) -> int:
        return max(self.week_to - self.week_from + 1, 1)

    @property
    def default_min_games(self) -> int:
        """Games needed to enter a ranking pool: ~a third of the window, min 2."""
        target = max(MIN_QUALIFY_GAMES, round(QUALIFY_FRACTION * self.weeks))
        return min(target, self.weeks)

    def as_dict(self) -> dict:
        return {
            "season": self.season,
            "season_type": self.season_type,
            "week_from": self.week_from,
            "week_to": self.week_to,
            "weeks": self.weeks,
            "last_weeks": self.last_weeks,
        }


def resolve_window(
    db: Session, season: int, season_type: str, last_weeks: int | None
) -> Window:
    """Resolve a full season or a trailing ``last_weeks`` window to concrete weeks.

    The trailing window is anchored to the last week that actually has data, so
    "last 4 weeks" means the last four *played* weeks, not weeks 15–18 of a season
    that has only reached week 9.
    """
    bounds = db.execute(
        select(func.min(PlayerStats.week), func.max(PlayerStats.week)).where(
            PlayerStats.season == season, PlayerStats.season_type == season_type
        )
    ).one()
    first_week, last_week = bounds[0] or 1, bounds[1] or 1

    week_from = first_week
    if last_weeks:
        week_from = max(first_week, last_week - last_weeks + 1)
    return Window(season, season_type, week_from, last_week, last_weeks)


def _opportunities_expr() -> object:
    """Touches + targets + pass attempts — the denominator of "per opportunity"."""
    return (
        func.coalesce(func.sum(PlayerStats.carries), 0)
        + func.coalesce(func.sum(PlayerStats.targets), 0)
        + func.coalesce(func.sum(PlayerStats.attempts), 0)
    )


def fetch_career_efficiency(
    db: Session, season: int, config: ScoringConfig
) -> dict[str, float]:
    """Each player's fantasy points per opportunity across all *earlier* seasons.

    The baseline the Sell-High Index compares against. Regular season only, and only
    for players with enough prior volume for the rate to mean something — a rookie
    simply has no baseline, which the composite handles by renormalising.
    """
    opportunities = _opportunities_expr()
    rows = db.execute(
        select(
            PlayerStats.player_id,
            points_expr(config, sum_mode=True).label("points"),
            opportunities.label("opportunities"),
        )
        .join(Player, PlayerStats.player_id == Player.player_id)
        .where(PlayerStats.season < season, PlayerStats.season_type == "REG")
        # Position is grouped as well as player because a TE-premium scoring config
        # makes the points expression depend on it.
        .group_by(PlayerStats.player_id, Player.position)
        .having(opportunities >= MIN_BASELINE_OPPORTUNITIES)
    ).all()
    return {row.player_id: row.points / row.opportunities for row in rows}


def fetch_usage_trend(db: Session, window: Window) -> dict[str, dict[str, float | None]]:
    """Each player's usage in the second half of the window minus the first half.

    Opportunity share for skill players. For quarterbacks it is the *relative* change
    in pass attempts per game — a quarterback's share of the offense barely moves,
    their volume does, and expressing it as a fraction keeps the number on the same
    scale (and in the same units) as the skill-position trend.
    """
    if window.weeks < 2:
        return {}

    midpoint = (window.week_from + window.week_to) // 2
    early = PlayerStats.week <= midpoint
    late = PlayerStats.week > midpoint

    def split(column, condition):
        return func.avg(case((condition, column), else_=None))

    rows = db.execute(
        select(
            PlayerStats.player_id,
            split(PlayerStats.opportunity_share, early).label("early_share"),
            split(PlayerStats.opportunity_share, late).label("late_share"),
            split(PlayerStats.attempts, early).label("early_attempts"),
            split(PlayerStats.attempts, late).label("late_attempts"),
        )
        .where(*window_filters(window.season, window.season_type,
                              week_from=window.week_from, week_to=window.week_to))
        .group_by(PlayerStats.player_id)
    ).all()

    trend: dict[str, dict[str, float | None]] = {}
    for row in rows:
        share = (
            row.late_share - row.early_share
            if row.early_share is not None and row.late_share is not None
            else None
        )
        attempts = None
        if row.early_attempts and row.late_attempts is not None:
            attempts = (row.late_attempts - row.early_attempts) / row.early_attempts
        trend[row.player_id] = {"share": share, "attempts": attempts}
    return trend


def aggregate_window_select(window: Window, position: str | None = None) -> Select:
    """The per-player aggregate for a window, restricted to covered positions."""
    filters = window_filters(
        window.season,
        window.season_type,
        position=position,
        week_from=window.week_from,
        week_to=window.week_to,
        positions=POSITIONS,
    )
    return aggregate_select(filters, games_expr())


# --- Derived inputs ---


def _per_game(record: dict, column: str, played: int) -> float | None:
    total = record.get(column)
    if total is None or not played:
        return None
    return total / played


def _sum_or_none(record: dict, columns: tuple[str, ...]) -> float | None:
    """Sum the columns, treating an all-missing set as missing rather than zero."""
    values = [record.get(column) for column in columns]
    if all(value is None for value in values):
        return None
    return sum(value or 0.0 for value in values)


_TD_COLUMNS = ("passing_tds", "rushing_tds", "receiving_tds")
_TD_EXPECTED_COLUMNS = ("passing_tds_exp", "rushing_tds_exp", "receiving_tds_exp")


def derive_inputs(
    record: dict,
    trend: dict[str, float | None] | None,
    career_efficiency: float | None,
) -> dict[str, float | None]:
    """The raw (pre-percentile) inputs every score is built from, for one player."""
    played = record.get("games_played") or 0
    position = record.get("position")

    points = record.get("fantasy_points")
    expected = record.get("expected_fantasy_points")
    points_over_expected_pg = (
        (points - expected) / played if played and points is not None and expected is not None
        else None
    )

    touchdowns = _sum_or_none(record, _TD_COLUMNS)
    expected_touchdowns = _sum_or_none(record, _TD_EXPECTED_COLUMNS)
    tds_over_expected = (
        touchdowns - expected_touchdowns
        if touchdowns is not None and expected_touchdowns is not None
        else None
    )
    tds_over_expected_pg = (
        tds_over_expected / played if played and tds_over_expected is not None else None
    )

    opportunities = (record.get("carries") or 0) + (record.get("targets") or 0) + (
        record.get("attempts") or 0
    )
    efficiency = points / opportunities if opportunities and points is not None else None
    efficiency_over_baseline = (
        efficiency - career_efficiency
        if efficiency is not None and career_efficiency is not None
        else None
    )

    usage_trend = None
    if trend:
        usage_trend = trend["attempts"] if position == "QB" else trend["share"]

    return {
        # Scoring-aware production and opportunity value
        "fantasy_ppg": record.get("fantasy_ppg"),
        "expected_fantasy_ppg": record.get("expected_fantasy_ppg"),
        "points_over_expected_pg": points_over_expected_pg,
        "tds_over_expected": tds_over_expected,
        "tds_over_expected_pg": tds_over_expected_pg,
        "efficiency_over_baseline": efficiency_over_baseline,
        "opportunity_trend": usage_trend,
        # Usage shares (already season averages) and per-game volume
        "opportunity_share": record.get("opportunity_share"),
        "target_share": record.get("target_share"),
        "air_yards_share": record.get("air_yards_share"),
        "route_participation": record.get("route_participation"),
        "rush_att_inside_10_pg": _per_game(record, "rush_att_inside_10", played),
        "attempts_pg": _per_game(record, "attempts", played),
        "carries_pg": _per_game(record, "carries", played),
    }


# --- The pool: replacement levels and percentile distributions ---


def _replacement_ppg(sorted_desc: list[float], rank: int) -> tuple[float | None, bool]:
    """Mean PPG of the ``REPLACEMENT_BAND`` players centred on the replacement rank.

    Returns ``(value, shallow)`` — ``shallow`` is True when the qualified pool doesn't
    reach the replacement rank (a small league-relative dataset, e.g. an early-season
    window), in which case the deepest available players stand in for it.
    """
    if not sorted_desc:
        return None, True
    half = REPLACEMENT_BAND // 2
    start = rank - 1 - half  # rank is 1-based; centre the band on it
    shallow = rank > len(sorted_desc)
    if shallow:
        start = len(sorted_desc) - REPLACEMENT_BAND
    start = max(0, min(start, len(sorted_desc) - 1))
    band = sorted_desc[start : start + REPLACEMENT_BAND] or sorted_desc[-1:]
    return sum(band) / len(band), shallow


class PositionPool:
    """Everything the scores need to know about one position's qualified players."""

    def __init__(self, records: list[dict], inputs: dict[str, dict], rank: int) -> None:
        self.size = len(records)
        self.replacement_rank = rank
        keys = inputs[records[0]["player_id"]].keys() if records else ()
        self.pools: dict[str, Pool] = {
            key: Pool([
                value for record in records
                if (value := inputs[record["player_id"]].get(key)) is not None
            ])
            for key in keys
        }
        ppg = sorted(
            (record["fantasy_ppg"] for record in records if record.get("fantasy_ppg") is not None),
            reverse=True,
        )
        self.replacement_ppg, self.shallow_pool = _replacement_ppg(ppg, rank)

    def percentiles(self, values: dict[str, float | None]) -> dict[str, float | None]:
        return {
            key: pool.percentile(values.get(key)) for key, pool in self.pools.items()
        }

    def add_rating_pool(self, ratings: list[float]) -> None:
        """Register the opportunity ratings so the buy/sell indices can rank them."""
        self.pools["fantasy_opportunity_rating"] = Pool(ratings)


# --- Orchestration ---


def _score_row(record: dict, pool: PositionPool, percentiles: dict) -> None:
    """Attach VORP to one row (the composites need a second pass)."""
    played = record.get("games_played") or 0
    ppg = record.get("fantasy_ppg")
    replacement = pool.replacement_ppg

    record["replacement_ppg"] = round_value(replacement, 2)
    if ppg is None or replacement is None:
        record["vorp_ppg"] = record["vorp"] = None
    else:
        vorp_ppg = ppg - replacement
        record["vorp_ppg"] = round_value(vorp_ppg, 2)
        record["vorp"] = round_value(vorp_ppg * played, 1)

    usage_terms = FOR_USAGE_TERMS.get(record.get("position"), ())
    record["fantasy_opportunity_rating"] = round_value(
        _weighted_score((FOR_EXPECTED_TERM, *usage_terms), percentiles), 1
    )


def _score_regression(record: dict, inputs: dict, percentiles: dict) -> None:
    """Attach the buy-low and sell-high indices, plus their headline inputs."""
    record["tds_over_expected"] = round_value(inputs["tds_over_expected"], 2)
    record["opportunity_trend"] = round_value(inputs["opportunity_trend"], 4)
    record["efficiency_over_baseline"] = round_value(inputs["efficiency_over_baseline"], 3)

    if inputs.get(REGRESSION_REQUIRED_INPUT) is None:
        record["positive_regression_index"] = None
        record["sell_high_index"] = None
        return
    record["positive_regression_index"] = round_value(
        _weighted_score(PRI_TERMS, percentiles), 1
    )
    record["sell_high_index"] = round_value(_weighted_score(SHI_TERMS, percentiles), 1)


def build_intelligence(
    db: Session,
    window: Window,
    config: ScoringConfig,
    league: LeagueConfig,
    min_games: int | None = None,
    position: str | None = None,
    custom: list[CustomMetric] | None = None,
) -> tuple[list[dict], dict]:
    """Score every player in the window. Returns ``(rows, context)``.

    Rows are the same aggregated shape the leaderboard returns, plus the intelligence
    columns. ``context`` carries the pool sizes and replacement levels so the UI can
    explain where a number came from.

    The ranking pools are always built from *all* covered positions, even when
    ``position`` filters the output — a receiver's percentile must not change because
    the caller asked only about receivers.
    """
    qualify = min_games if min_games is not None else window.default_min_games
    ranks = replacement_ranks(league)

    rows = [
        finalize_row(dict(row), config, custom)
        for row in db.execute(aggregate_window_select(window)).mappings().all()
    ]

    career_efficiency = fetch_career_efficiency(db, window.season, config)
    trends = fetch_usage_trend(db, window)

    inputs = {
        record["player_id"]: derive_inputs(
            record,
            trends.get(record["player_id"]),
            career_efficiency.get(record["player_id"]),
        )
        for record in rows
    }

    # Build one pool per position from the qualified players only.
    pools: dict[str, PositionPool] = {}
    for pos in POSITIONS:
        qualified = [
            record for record in rows
            if record.get("position") == pos and (record.get("games_played") or 0) >= qualify
        ]
        pools[pos] = PositionPool(qualified, inputs, ranks.get(pos, 1))

    # Pass 1: VORP + opportunity rating (the indices rank against the ratings).
    percentile_cache: dict[str, dict] = {}
    for record in rows:
        pool = pools.get(record.get("position"))
        if pool is None:
            continue
        percentiles = pool.percentiles(inputs[record["player_id"]])
        percentile_cache[record["player_id"]] = percentiles
        _score_row(record, pool, percentiles)

    for pos, pool in pools.items():
        pool.add_rating_pool([
            rating for record in rows
            if record.get("position") == pos
            and (record.get("games_played") or 0) >= qualify
            and (rating := record.get("fantasy_opportunity_rating")) is not None
        ])

    # Pass 2: the buy-low / sell-high composites.
    for record in rows:
        pool = pools.get(record.get("position"))
        if pool is None:
            continue
        player_inputs = dict(inputs[record["player_id"]])
        player_inputs["fantasy_opportunity_rating"] = record["fantasy_opportunity_rating"]
        percentiles = percentile_cache[record["player_id"]]
        percentiles["fantasy_opportunity_rating"] = pool.pools[
            "fantasy_opportunity_rating"
        ].percentile(record["fantasy_opportunity_rating"])
        inputs[record["player_id"]] = player_inputs
        _score_regression(record, player_inputs, percentiles)
        record["qualified"] = (record.get("games_played") or 0) >= qualify

    context = {
        "min_games": qualify,
        "league": league.model_dump(),
        "replacement": {
            pos: {
                "rank": pool.replacement_rank,
                "ppg": round_value(pool.replacement_ppg, 2),
                "pool_size": pool.size,
                "shallow_pool": pool.shallow_pool,
            }
            for pos, pool in pools.items()
        },
    }

    if position:
        wanted = position.upper()
        rows = [record for record in rows if record.get("position") == wanted]

    return rows, {**context, "inputs": inputs, "percentiles": percentile_cache}


# --- Explanation breakdown (player pages) ---


SCORE_BREAKDOWNS: tuple[tuple[str, str, tuple[Term, ...]], ...] = (
    ("fantasy_opportunity_rating", "Fantasy Opportunity Rating", ()),  # terms are per-position
    ("positive_regression_index", "Buy-Low (Positive Regression)", PRI_TERMS),
    ("sell_high_index", "Sell-High", SHI_TERMS),
)


def breakdown(record: dict, inputs: dict, percentiles: dict) -> dict:
    """Per-score component tables: what went in, each value, and its percentile.

    The player page renders this verbatim, so a user can see exactly why a score is
    what it is — the whole point of a rule-based signal over a projection.
    """
    def terms_for(score_id: str) -> tuple[Term, ...]:
        if score_id == "fantasy_opportunity_rating":
            return (FOR_EXPECTED_TERM, *FOR_USAGE_TERMS.get(record.get("position"), ()))
        return next(terms for id_, _, terms in SCORE_BREAKDOWNS if id_ == score_id)

    result: dict[str, dict] = {}
    for score_id, label, _ in SCORE_BREAKDOWNS:
        components = []
        for term in terms_for(score_id):
            percentile = percentiles.get(term.key)
            if term.invert and percentile is not None:
                percentile = 1.0 - percentile
            components.append({
                "key": term.key,
                "label": term.label,
                "value": round_value(inputs.get(term.key), 4),
                "format": term.format,
                "weight": term.weight,
                "percentile": round_value(percentile, 3),
                "invert": term.invert,
            })
        result[score_id] = {
            "label": label,
            "score": record.get(score_id),
            "components": components,
        }
    return result
