"""Percentile ranks for leaderboard columns (M12).

Every number on a leaderboard answers "how much", and almost none of them answer "is
that a lot". 1,100 receiving yards is a WR1 season and a fringe one depending on the
year and the position; 3.0 yards of separation means nothing at all to most readers.
A percentile beside the value is what turns a table of magnitudes into a table of
judgements.

**The pool is one position, one season.** A receiver is ranked against receivers, never
against quarterbacks, and never against his own position across eras — the passing game
of 2004 and 2024 are different sports and a cross-season percentile would quietly
average them. This is the rule the boards are specified against, and it holds even on
an "All" board: the pool is chosen per row from that player's own position, so a mixed
table still reads correctly.

**The maths is `app.intelligence.Pool`, not a second implementation.** Mid-rank
percentile, so ties share a rank rather than being ordered arbitrarily. Reusing that
class is deliberate: the Insight boards already show percentile-derived scores, and two
different definitions of "84th percentile" in one product would be indefensible.

**A percentile is only offered where the ranking means something.** Passing yards are
ranked among quarterbacks and nowhere else; a receiver with one gadget completion is not
"99th percentile passing". The pool a metric is ranked in comes from the registry's
``applies_to``, with two deliberate overrides in ``PERCENTILE_POSITIONS`` below. Where a
position is excluded the *value* is still shown — a wide receiver's 12 rushing yards are
real — but the rank beneath it is not, and the UI renders a dash.

**Direction comes from the registry.** ``higher_is_better`` is inverted before the
percentile is reported, so leading in Drop % means the fewest drops and a 95th
percentile always reads as good. Without this a board would paint fumbles green.

**Qualification is the pool's, not the caller's.** A leaderboard showing `min_games=1`
still ranks against players who actually played, because a pool including every
one-game call-up moves every percentile in it — a receiver with three catches in his
only appearance would sit above the median for target share. The pool therefore uses
the same ``QUALIFY_FRACTION`` rule as the Insight boards, independent of what the
caller chose to display. An unqualified player is still *scored* against that pool; he
just does not shape it.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.aggregation import (
    POSITIONS,
    aggregate_select,
    finalize_row,
    games_expr,
    window_filters,
)
from app.custom_metrics import CustomMetric
from app.intelligence import MIN_QUALIFY_GAMES, QUALIFY_FRACTION, Pool
from app.metrics import REGISTRY_BY_ID
from app.scoring import ScoringConfig


# Positions a metric may be ranked *within*, where that differs from the registry's
# ``applies_to``. ``applies_to`` governs whether a column is shown at all; this governs
# whether a rank beneath it is meaningful, and the two are not the same question.
#
# Rushing is the only real divergence: receivers are in ``applies_to`` for it because
# jet sweeps exist and the column should render for them, but ranking receivers by
# rushing yards would put a player with four carries in the 95th percentile of a pool
# that barely runs. Quarterbacks belong in the rushing pool — a running quarterback's
# legs are a real and large part of his value.
PERCENTILE_POSITIONS: dict[str, tuple[str, ...]] = {
    "rushing_yards": ("RB", "QB"),
    "rushing_tds": ("RB", "QB"),
    "rushing_first_downs": ("RB", "QB"),
    "rushing_epa": ("RB", "QB"),
    "carries": ("RB", "QB"),
}


def ranked_positions(metric_id: str) -> tuple[str, ...] | None:
    """Positions ``metric_id`` may be ranked within, or None for no restriction."""
    if metric_id in PERCENTILE_POSITIONS:
        return PERCENTILE_POSITIONS[metric_id]
    definition = REGISTRY_BY_ID.get(metric_id)
    if definition is None or definition.applies_to == "all":
        return None
    return tuple(definition.applies_to)


def qualify_games(weeks: int) -> int:
    """Games needed to enter a percentile pool — the Insight boards' rule."""
    target = max(MIN_QUALIFY_GAMES, round(QUALIFY_FRACTION * weeks))
    return min(target, weeks) if weeks else MIN_QUALIFY_GAMES


class PercentileIndex:
    """Percentile pools for one season, one per (position, metric)."""

    def __init__(self, rows: list[dict], metric_ids: tuple[str, ...], min_games: int) -> None:
        self.metric_ids = metric_ids
        self._pools: dict[tuple[str, str], Pool] = {}
        for position in POSITIONS:
            qualified = [
                row for row in rows
                if row.get("position") == position
                and (row.get("games_played") or 0) >= min_games
            ]
            for metric_id in metric_ids:
                values = [
                    value for row in qualified
                    if (value := row.get(metric_id)) is not None
                ]
                if values:
                    self._pools[(position, metric_id)] = Pool(values)
        self.pool_sizes = {
            position: sum(
                1 for row in rows
                if row.get("position") == position
                and (row.get("games_played") or 0) >= min_games
            )
            for position in POSITIONS
        }

    def for_row(self, row: dict) -> dict[str, int]:
        """Percentiles (0-100, rounded) for one row's metrics, direction-corrected."""
        position = row.get("position")
        result: dict[str, int] = {}
        for metric_id in self.metric_ids:
            value = row.get(metric_id)
            if value is None:
                continue
            allowed = ranked_positions(metric_id)
            if allowed is not None and position not in allowed:
                continue  # the value still renders; the rank beneath it does not
            pool = self._pools.get((position, metric_id))
            if pool is None:
                continue
            ranked = pool.percentile(value)
            if ranked is None:
                continue
            definition = REGISTRY_BY_ID.get(metric_id)
            # "Leading" in a lower-is-better metric means the fewest of it, so the
            # percentile is flipped before it is reported. The UI never has to know
            # which way a metric points.
            if definition is not None and not definition.higher_is_better:
                ranked = 1.0 - ranked
            result[metric_id] = round(ranked * 100)
        return result


def percentile_metric_ids(
    requested: str, custom: list[CustomMetric] | None = None
) -> tuple[str, ...]:
    """Resolve the requested comma-separated metric ids, dropping unknown ones.

    Silently ignoring an unknown id rather than 400-ing is deliberate: the columns a
    board asks to rank are a *display* concern, and a stale bookmark naming a metric
    that has since been renamed should lose a percentile, not the whole page.
    """
    custom_ids = {definition.id for definition in (custom or ())}
    seen: dict[str, None] = {}
    for raw in requested.split(","):
        metric_id = raw.strip()
        if metric_id and (metric_id in REGISTRY_BY_ID or metric_id in custom_ids):
            seen.setdefault(metric_id, None)
    return tuple(seen)


def build_index(
    db: Session,
    season: int,
    season_type: str,
    config: ScoringConfig,
    custom: list[CustomMetric],
    metric_ids: tuple[str, ...],
    weeks: int,
    week_from: int | None = None,
    week_to: int | None = None,
    week_in: tuple[int, ...] | None = None,
) -> PercentileIndex:
    """Aggregate every covered player in the window and build the pools.

    Deliberately **unfiltered** by team, watchlist or the caller's ``min_games``: the
    pool is the league at that position, so narrowing the board to one team must not
    change what a percentile means. That is the same reason the Insight boards build
    their pools from all positions even when the output is filtered to one.
    """
    filters = window_filters(
        season, season_type, week_from=week_from, week_to=week_to, week_in=week_in,
        positions=POSITIONS,
    )
    rows = [
        finalize_row(dict(row), config, custom)
        for row in db.execute(aggregate_select(filters, games_expr())).mappings().all()
    ]
    return PercentileIndex(rows, metric_ids, qualify_games(weeks))
