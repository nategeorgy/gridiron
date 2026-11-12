"""Rate-stat minimums for the percentile pools (November 2026).

A games rule alone let a receiver with 16 targets set the targets-per-route-run curve for
every starter, and one with 65 routes set aDOT's. So a **rate** is pooled only among the
players who clear their position's volume minimum, stated per team game the way the NFL
states its own (14 attempts, 6.25 carries and 1.875 catches per team game), so it grows
with the season:

    QB  7 dropbacks per team game
    RB  3 carries + targets per team game
    WR  12 routes per team game
    TE  2 targets per team game

**Counting totals are never gated.** 292 receiving yards is 292 receiving yards, and the
games rule (``QUALIFY_FRACTION``) still decides who those pools hold.

**A player below the minimum is still ranked, against the pool he does not shape.** His
own card shows where his rate would sit among the qualified ("as if qualified"), and the
response says which of his percentiles are read that way (``PercentileIndex.as_if``) so
every surface can draw them as an open bubble rather than pass them off as the real
thing. Nobody else's percentile counts him.

A few shares and per-game stats are gated too, per position, because for that position a
backup's number says more about his snaps than his skill: a quarterback's rushing yards
per game, a back's rush, target, route and opportunity shares, a receiver's target, route
and air-yard shares and WOPR (which is built from two of them).

**Routes are counted only over the team games that have routes.** 2009-2015 have none, so
a receiver falls back to the tight end's rule there (2 targets per team game). The season
in progress is hand-loaded a few days behind the stats, so a week without routes yet is
left out of the team-game count instead of reading as a week every receiver ran none.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import ceil

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.cache import VersionedCache
from app.custom_metrics import BUILTIN_COMPOSITES
from app.metrics import REGISTRY_BY_ID
from app.models.player_stats import PlayerStats
from app.models.team import Team


@dataclass(frozen=True)
class Minimum:
    """One position's volume bar: the stats summed, and how many per team game."""

    measure: tuple[str, ...]
    per_team_game: float
    label: str
    counts_routes: bool = False


MINIMUMS: dict[str, Minimum] = {
    "QB": Minimum(("dropbacks",), 7, "dropbacks"),
    "RB": Minimum(("carries", "targets"), 3, "carries and targets"),
    "WR": Minimum(("routes_run",), 12, "routes", counts_routes=True),
    "TE": Minimum(("targets",), 2, "targets"),
}

# A receiver's rule where no routes were recorded: the tight end's.
ROUTELESS = Minimum(("targets",), 2, "targets")

_RECEIVER_SHARES = frozenset({"target_share", "route_participation", "air_yards_share", "wopr"})

# Shares and per-game stats that are gated for one position only.
GATED_EXTRAS: dict[str, frozenset[str]] = {
    "QB": frozenset({"rushing_yards_per_game"}),
    "RB": frozenset({
        "rush_attempt_share", "target_share", "route_participation", "opportunity_share",
    }),
    "WR": _RECEIVER_SHARES,
    "TE": _RECEIVER_SHARES,
}


def is_rate(metric_id: str) -> bool:
    """True for a per-opportunity rate: per target, route, carry, attempt or play.

    Read from how the registry aggregates a metric rather than listed by hand, so a new
    rate is gated the day it is added: a weighted mean (``weight_by``), a ``derived``
    metric with its own denominator (``per``), or a composite divided by anything but
    games. A flat mean is a share and a ``derived`` metric without ``per`` is per game;
    neither is a rate.
    """
    definition = REGISTRY_BY_ID.get(metric_id)
    if definition is None:
        return False
    if definition.aggregation == "avg":
        return definition.weight_by is not None
    if definition.aggregation == "derived":
        return definition.per is not None
    if definition.aggregation == "composite":
        composite = BUILTIN_COMPOSITES.get(metric_id)
        return composite is not None and composite.denominator not in (None, "games")
    return False


def is_gated(metric_id: str, position: str | None) -> bool:
    """Whether ``metric_id`` is pooled only among players at or above the minimum."""
    return is_rate(metric_id) or metric_id in GATED_EXTRAS.get(position or "", frozenset())


def gated_metrics(metric_ids: tuple[str, ...] | list[str]) -> dict[str, list[str]]:
    """The gated subset of ``metric_ids``, per position."""
    return {
        position: [metric_id for metric_id in metric_ids if is_gated(metric_id, position)]
        for position in MINIMUMS
    }


# --- Team games ---------------------------------------------------------------------

# (team abbreviation, week, has routes) for every team-game with stat lines in a season.
_LEDGERS: VersionedCache[tuple[tuple[str, int, bool], ...]] = VersionedCache(max_entries=48)


def _ledger(db: Session, season: int, season_type: str) -> tuple[tuple[str, int, bool], ...]:
    """Every team-game in a season that has stat lines, and whether it has routes.

    Counted from ``player_stats`` rather than the schedule, because a score arrives hours
    before the stat lines do: counting the schedule would charge every receiver on a
    Monday-night team for a game whose routes nobody has yet. It reads the same pages as
    the season aggregate it follows, which has just pulled them into memory.
    """

    def query() -> tuple[tuple[str, int, bool], ...]:
        rows = db.execute(
            select(
                Team.abbreviation,
                PlayerStats.week,
                func.count(PlayerStats.routes_run),
            )
            .join(Team, PlayerStats.team_id == Team.team_id)
            .where(PlayerStats.season == season, PlayerStats.season_type == season_type)
            .group_by(Team.abbreviation, PlayerStats.week)
        ).all()
        return tuple((abbreviation, week, bool(routes)) for abbreviation, week, routes in rows)

    return _LEDGERS.get_or_compute(db, ("ledger", season, season_type), query)


class Qualifier:
    """Decides, for one window, whether each player clears his position's minimum."""

    def __init__(self, games: dict[str, int], route_games: dict[str, int]) -> None:
        self.games = games
        self.route_games = route_games

    @classmethod
    def for_window(
        cls,
        db: Session,
        season: int,
        season_type: str,
        week_from: int | None = None,
        week_to: int | None = None,
        week_in: tuple[int, ...] | None = None,
    ) -> "Qualifier":
        """Team games (and team games with routes) over the weeks a window covers."""
        wanted = set(week_in) if week_in else None
        games: dict[str, int] = {}
        route_games: dict[str, int] = {}
        for abbreviation, week, has_routes in _ledger(db, season, season_type):
            if wanted is not None:
                if week not in wanted:
                    continue
            elif (week_from is not None and week < week_from) or (
                week_to is not None and week > week_to
            ):
                continue
            games[abbreviation] = games.get(abbreviation, 0) + 1
            if has_routes:
                route_games[abbreviation] = route_games.get(abbreviation, 0) + 1
        return cls(games, route_games)

    def check(self, row: dict) -> dict | None:
        """The row's measure against its bar. None for a position with no minimum.

        The team is the one he finished the window with, so a player traded mid-season
        is measured against his new team's games; the two rarely differ by more than a bye.
        """
        rule = MINIMUMS.get(row.get("position") or "")
        if rule is None:
            return None
        team = row.get("team_abbreviation")
        team_games = self.games.get(team, 0)
        if rule.counts_routes:
            covered = self.route_games.get(team, 0)
            if covered:
                team_games = covered
            else:
                rule = ROUTELESS
        value = sum(row.get(stat) or 0 for stat in rule.measure)
        needed = rule.per_team_game * team_games
        return {
            "met": value >= needed - 1e-9,
            "value": round(value),
            "needed": ceil(needed - 1e-9),
            "measure": rule.label,
            "per_team_game": rule.per_team_game,
            "team_games": team_games,
        }

    def meets(self, row: dict) -> bool:
        check = self.check(row)
        return True if check is None else check["met"]


def describe_minimums() -> dict[str, dict]:
    """The rules, for a response's context block."""
    return {
        position: {"measure": rule.label, "per_team_game": rule.per_team_game}
        for position, rule in MINIMUMS.items()
    }
