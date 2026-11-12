"""Rate-stat minimums for the percentile pools (November 2026, ``app/qualifiers.py``).

The rule, pinned from both sides: a player below his position's volume minimum per team
game never shapes a rate's pool (or the few gated shares), so his 25.4 aDOT cannot move a
starter's percentile; but his own percentile is still given, ranked against the pool he
is not in, and the response says it is "as if qualified". Counting totals keep the games
rule alone. Also pinned: receivers' routes are counted over the team games that have
routes, so a week whose routes are not loaded yet does not disqualify every receiver, and
before routes exist a receiver falls back to the tight end's rule.

The board filter (``require_minimum``) narrows the rows and never a pool, like every
other filter on ``/stats/intelligence``.
"""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Game, Player, PlayerStats, Team
from app.percentiles import PercentileIndex
from app.qualifiers import Qualifier, is_gated, is_rate


# --- Which stats are gated -------------------------------------------------------------


@pytest.mark.parametrize("metric_id", [
    "adot", "yards_per_route_run", "targets_per_route_run", "completion_pct", "epa_per_play",
    "fantasy_points_per_route_run", "yards_per_carry", "cpoe", "ngs_rec_separation",
])
def test_rates_are_gated_at_every_position(metric_id: str) -> None:
    assert is_rate(metric_id)
    assert all(is_gated(metric_id, position) for position in ("QB", "RB", "WR", "TE"))


@pytest.mark.parametrize("metric_id", [
    "receiving_yards", "targets", "fantasy_points", "fantasy_ppg", "dropbacks",
    "high_value_touches_per_game", "snap_share", "epa",
])
def test_counts_and_per_game_stats_are_not_rates(metric_id: str) -> None:
    assert not is_rate(metric_id)


def test_a_few_shares_are_gated_for_one_position_only() -> None:
    assert is_gated("rushing_yards_per_game", "QB")
    assert not is_gated("rushing_yards_per_game", "RB")
    assert is_gated("rush_attempt_share", "RB")
    assert not is_gated("rush_attempt_share", "QB")
    for position in ("WR", "TE"):
        for share in ("target_share", "route_participation", "air_yards_share", "wopr"):
            assert is_gated(share, position)
    assert is_gated("target_share", "RB")
    assert not is_gated("snap_share", "WR")


# --- The bar ---------------------------------------------------------------------------


def _wr(player_id: str, routes: int | None, targets: int, adot: float, games: int = 8, **extra) -> dict:
    return {
        "player_id": player_id, "position": "WR", "team_abbreviation": "SEA",
        "games_played": games, "routes_run": routes, "targets": targets, "adot": adot,
        "receiving_yards": targets * 8, **extra,
    }


def test_a_receiver_needs_twelve_routes_per_team_game() -> None:
    qualifier = Qualifier({"SEA": 8}, {"SEA": 8})
    assert qualifier.check(_wr("a", routes=96, targets=10, adot=9.0))["met"]
    check = qualifier.check(_wr("b", routes=65, targets=12, adot=25.4))
    assert not check["met"]
    assert (check["value"], check["needed"], check["measure"]) == (65, 96, "routes")


def test_routes_count_only_the_team_games_that_have_them() -> None:
    """Week 9's routes not loaded yet: the bar is 8 games of routes, not 9."""
    qualifier = Qualifier({"SEA": 9}, {"SEA": 8})
    check = qualifier.check(_wr("a", routes=100, targets=20, adot=9.0))
    assert check["met"] and check["needed"] == 96


def test_before_routes_a_receiver_uses_the_tight_ends_rule() -> None:
    qualifier = Qualifier({"SEA": 16}, {})
    check = qualifier.check(_wr("a", routes=None, targets=40, adot=9.0))
    assert check["met"] and (check["measure"], check["needed"]) == ("targets", 32)
    assert not qualifier.check(_wr("b", routes=None, targets=31, adot=9.0))["met"]


def test_each_position_has_its_own_measure() -> None:
    qualifier = Qualifier({"SEA": 9}, {"SEA": 9})
    quarterback = {"position": "QB", "team_abbreviation": "SEA", "dropbacks": 63}
    back = {"position": "RB", "team_abbreviation": "SEA", "carries": 20, "targets": 6}
    tight_end = {"position": "TE", "team_abbreviation": "SEA", "targets": 17}
    assert qualifier.check(quarterback)["met"]              # 7 x 9 = 63
    assert not qualifier.check(back)["met"]                 # 26 of 27 carries + targets
    assert not qualifier.check(tight_end)["met"]            # 17 of 18 targets


def test_for_window_counts_only_the_window_weeks(monkeypatch: pytest.MonkeyPatch) -> None:
    ledger = tuple(("SEA", week, week <= 8) for week in range(1, 10)) + (("KC", 3, True),)
    monkeypatch.setattr("app.qualifiers._ledger", lambda db, season, season_type: ledger)
    whole = Qualifier.for_window(None, 2026, "REG", week_from=1, week_to=9)
    assert (whole.games["SEA"], whole.route_games["SEA"]) == (9, 8)
    picked = Qualifier.for_window(None, 2026, "REG", week_in=(2, 9))
    assert (picked.games["SEA"], picked.route_games["SEA"]) == (2, 1)
    assert picked.games.get("KC") is None


# --- The pools -------------------------------------------------------------------------

STARTERS = [_wr(key, routes=200, targets=40, adot=adot) for key, adot in (("a", 6.0), ("b", 9.0), ("c", 12.0))]
PART_TIMER = _wr("palmer", routes=65, targets=12, adot=25.4)
CAMEO = _wr("cameo", routes=30, targets=6, adot=14.0, games=1)
ROWS = [*STARTERS, PART_TIMER, CAMEO]
METRICS = ("adot", "receiving_yards")


def _index() -> PercentileIndex:
    return PercentileIndex(ROWS, METRICS, min_games=3, qualifier=Qualifier({"SEA": 8}, {"SEA": 8}))


def test_a_part_timer_never_shapes_a_rate_pool() -> None:
    index = _index()
    # Three starters in aDOT's pool: c is the deepest of them, so the top of it.
    assert index.metric_pool_sizes["WR"]["adot"] == 3
    assert index.for_row(STARTERS[2])["adot"] == round(100 * 2.5 / 3)
    assert index.ranks_for_row(STARTERS[2], METRICS)["adot"] == 1


def test_a_part_timer_is_ranked_as_if_qualified_on_his_own_row() -> None:
    index = _index()
    assert index.for_row(PART_TIMER)["adot"] == 100
    assert index.ranks_for_row(PART_TIMER, METRICS)["adot"] == 1
    assert index.as_if(PART_TIMER) == ["adot"]


def test_counts_keep_the_games_rule() -> None:
    index = _index()
    assert index.metric_pool_sizes["WR"]["receiving_yards"] == 4
    assert index.pool_sizes["WR"] == 4 and index.qualified_sizes["WR"] == 3
    assert index.as_if(STARTERS[0]) == []


def test_too_few_games_is_as_if_everywhere() -> None:
    assert _index().as_if(CAMEO) == ["adot", "receiving_yards"]


def test_without_a_qualifier_the_pools_are_the_games_pools() -> None:
    index = PercentileIndex(ROWS, METRICS, min_games=3)
    assert index.metric_pool_sizes["WR"]["adot"] == 4
    assert index.as_if(PART_TIMER) == []


# --- The board -------------------------------------------------------------------------

SEASON = 2025
BOARD = "/api/v1/stats/intelligence"
# Routes and targets per game for four receivers who play all three weeks. The bar is 36
# routes (12 x 3): "d" ran 30.
WEEKLY = {"a": (30, 9), "b": (28, 7), "c": (20, 5), "d": (10, 4)}


@pytest.fixture
def receivers(db: Session, team: Team) -> dict:
    opponent = Team(name="Denver Broncos", abbreviation="DEN", conference="AFC", division="AFC West")
    db.add(opponent)
    db.flush()
    for week in (1, 2, 3):
        db.add(Game(
            game_id=f"{SEASON}_{week:02d}_QUAL", season=SEASON, week=week, season_type="REG",
            home_team_id=team.team_id, away_team_id=opponent.team_id,
            home_score=24, away_score=17, game_date=date(SEASON, 9, 7 * week),
        ))
    players = {
        key: Player(player_id=f"00-00008{index:02d}", name=f"Receiver {key.upper()}", position="WR",
                    team_id=team.team_id, status="ACT")
        for index, key in enumerate(WEEKLY)
    }
    db.add_all(players.values())
    db.flush()
    for key, (routes, targets) in WEEKLY.items():
        for week in (1, 2, 3):
            db.add(PlayerStats(
                player_id=players[key].player_id, game_id=f"{SEASON}_{week:02d}_QUAL",
                team_id=team.team_id, season=SEASON, week=week, season_type="REG",
                routes_run=routes, targets=targets, receptions=targets - 1,
                receiving_yards=targets * 9, receiving_tds=0, yards_per_route_run=targets * 9 / routes,
                fantasy_points_std=round(targets * 0.9, 2),
            ))
    db.flush()
    return players


def _board(client: TestClient, **params) -> dict:
    response = client.get(BOARD, params={
        "season": SEASON, "positions": "WR", "metric": "receiving_yards",
        "percentiles": "yards_per_route_run,receiving_yards", **params,
    })
    assert response.status_code == 200, response.text
    return response.json()


def test_the_board_filter_hides_players_below_the_minimum(client: TestClient, receivers: dict) -> None:
    every = _board(client)
    assert every["total"] == 4
    qualified = _board(client, require_minimum="true")
    assert [row["name"] for row in qualified["data"]] == ["Receiver A", "Receiver B", "Receiver C"]
    assert qualified["require_minimum"] is True


def test_the_board_filter_never_moves_a_percentile(client: TestClient, receivers: dict) -> None:
    every = {row["name"]: row["percentiles"] for row in _board(client)["data"]}
    qualified = {row["name"]: row["percentiles"] for row in _board(client, require_minimum="true")["data"]}
    for name, percentiles in qualified.items():
        assert percentiles == every[name]


def test_a_row_says_where_it_stands(client: TestClient, receivers: dict) -> None:
    rows = {row["name"]: row for row in _board(client)["data"]}
    below = rows["Receiver D"]
    assert below["minimum"] == {
        "met": False, "value": 30, "needed": 36, "measure": "routes", "per_team_game": 12, "team_games": 3,
    }
    assert below["as_if"] == ["yards_per_route_run"]
    assert rows["Receiver A"]["as_if"] == []
    body = _board(client)
    assert body["percentiles"]["qualified_sizes"]["WR"] == 3
    assert body["percentiles"]["rank_pools"] is None
    assert body["percentiles"]["gated"]["WR"] == ["yards_per_route_run"]
