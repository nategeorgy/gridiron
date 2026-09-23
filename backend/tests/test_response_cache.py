"""The response cache on the leaderboard, the scatter and the comparison.

These three went behind ``cached_response`` (app/cache.py) because the home page asks
each of them for the same URLs on every visit, and every one of those requests
re-aggregated ``player_stats``: about 110 MB of pages a visit on a warm process, on a
database whose Disk IO budget had already run out once (September 2026). Pinned here:

- a repeat request is served without recomputing, whatever order its parameters are in
- the key is the whole query string, so two watchlists never share an answer
- a write to the data forces a miss
- an error is never stored, so a 404 does not outlive the data that caused it
- a hit sends the same bytes the uncached endpoint does

The cache is off under ``ENVIRONMENT=test``, so every test here switches it on and
controls the data version itself: a rolled-back test transaction never moves the
Postgres counters the real version is read from.
"""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import cache
from app.intelligence import _CAREER_TOTALS, _SCORED_WINDOWS
from app.models import Game, Player, PlayerStats, Team
from app.routers import stats as stats_router
from app.seasons import _SUMMARY, _WEEK_BOUNDS

SEASON = 2025
LEADERBOARD = "/api/v1/stats/leaderboard"
SCATTER = "/api/v1/stats/scatter"
COMPARE = "/api/v1/stats/compare"

_STORES = (
    stats_router._LEADERBOARD_RESPONSES,
    stats_router._SCATTER_RESPONSES,
    stats_router._COMPARE_RESPONSES,
    _WEEK_BOUNDS, _SUMMARY, _CAREER_TOTALS, _SCORED_WINDOWS,
)


@pytest.fixture
def version(monkeypatch) -> dict:
    """Caching on, every store empty on both sides, and a data version the test sets."""
    state = {"version": 1}
    monkeypatch.setattr(cache, "ENABLED", True)
    monkeypatch.setattr(cache, "data_version", lambda db: state["version"])
    for store in _STORES:
        store.clear()
    yield state
    for store in _STORES:
        store.clear()


@pytest.fixture
def receivers(db: Session, team: Team) -> dict:
    """Two receivers with two games each, and a way to add another stat line."""
    opponent = Team(name="Denver Broncos", abbreviation="DEN", conference="AFC", division="AFC West")
    db.add(opponent)
    db.flush()
    for week in (1, 2, 3):
        db.add(Game(
            game_id=f"{SEASON}_{week:02d}_CACHE", season=SEASON, week=week, season_type="REG",
            home_team_id=team.team_id, away_team_id=opponent.team_id,
            home_score=24, away_score=17, game_date=date(SEASON, 9, 7 * week),
        ))
    players = {
        "first": Player(player_id="00-0000031", name="First Receiver", position="WR",
                        team_id=team.team_id, status="ACT"),
        "second": Player(player_id="00-0000032", name="Second Receiver", position="WR",
                         team_id=team.team_id, status="ACT"),
    }
    db.add_all(players.values())
    db.flush()

    def add_line(player: Player, week: int, receptions: int, yards: int) -> None:
        # fantasy_points_std has to be set: compute_points starts from it and adds only
        # the difference between the caller's weights and standard ones (CLAUDE.md).
        db.add(PlayerStats(
            player_id=player.player_id, game_id=f"{SEASON}_{week:02d}_CACHE",
            team_id=team.team_id, season=SEASON, week=week, season_type="REG",
            receptions=receptions, targets=receptions + 2, receiving_yards=yards,
            receiving_tds=0, fantasy_points_std=round(yards * 0.1, 2),
        ))
        db.flush()

    for week in (1, 2):
        add_line(players["first"], week, receptions=6, yards=80)
        add_line(players["second"], week, receptions=4, yards=50)
    return {**players, "add_line": add_line}


def _count_calls(monkeypatch, name: str) -> dict:
    """Wrap one of the stats router's helpers so a test can see whether it ran."""
    original = getattr(stats_router, name)
    calls = {"count": 0}

    def counted(*args, **kwargs):
        calls["count"] += 1
        return original(*args, **kwargs)

    monkeypatch.setattr(stats_router, name, counted)
    return calls


def _names(response) -> list[str]:
    return [row["name"] for row in response.json()["data"]]


def test_a_repeat_request_is_served_without_recomputing(
    client: TestClient, receivers: dict, version: dict, monkeypatch
) -> None:
    calls = _count_calls(monkeypatch, "_leaderboard_season")

    first = client.get(LEADERBOARD, params={"season": SEASON, "scoring": "ppr"})
    # Same parameters, other order: one entry, not two.
    second = client.get(f"{LEADERBOARD}?scoring=ppr&season={SEASON}")

    assert first.status_code == second.status_code == 200
    assert first.content == second.content
    assert calls["count"] == 1


def test_a_different_query_is_a_different_entry(
    client: TestClient, receivers: dict, version: dict
) -> None:
    ppr = client.get(LEADERBOARD, params={"season": SEASON, "scoring": "ppr"}).json()
    standard = client.get(LEADERBOARD, params={"season": SEASON, "scoring": "std"}).json()

    # 160 yards is 16 standard points; PPR adds the 12 catches.
    assert ppr["data"][0]["fantasy_points"] == pytest.approx(28.0)
    assert standard["data"][0]["fantasy_points"] == pytest.approx(16.0)


def test_two_watchlists_never_share_an_answer(
    client: TestClient, receivers: dict, version: dict
) -> None:
    """The watchlist filter runs in the SQL, so the ids have to be in the key."""
    first = receivers["first"].player_id
    second = receivers["second"].player_id

    mine = client.get(LEADERBOARD, params={"season": SEASON, "player_ids": first})
    yours = client.get(LEADERBOARD, params={"season": SEASON, "player_ids": second})

    assert _names(mine) == ["First Receiver"]
    assert _names(yours) == ["Second Receiver"]


def test_a_write_to_the_data_forces_a_miss(
    client: TestClient, receivers: dict, version: dict
) -> None:
    params = {"season": SEASON, "scoring": "std"}
    before = client.get(LEADERBOARD, params=params).json()
    assert before["data"][0]["fantasy_points"] == pytest.approx(16.0)

    receivers["add_line"](receivers["first"], 3, receptions=5, yards=100)
    # Unchanged version: the cached board is still the right answer to serve.
    assert client.get(LEADERBOARD, params=params).json() == before

    version["version"] = 2
    after = client.get(LEADERBOARD, params=params).json()
    assert after["data"][0]["fantasy_points"] == pytest.approx(26.0)


def test_an_error_is_never_stored(
    client: TestClient, receivers: dict, team: Team, db: Session, version: dict
) -> None:
    newcomer = Player(player_id="00-0000033", name="Newcomer", position="WR",
                      team_id=team.team_id, status="ACT")
    db.add(newcomer)
    db.flush()
    params = {"players": newcomer.player_id, "season": SEASON}

    assert client.get(COMPARE, params=params).status_code == 404

    receivers["add_line"](newcomer, 2, receptions=3, yards=40)
    # Same data version, so only a 404 that was never stored can turn into a 200.
    assert client.get(COMPARE, params=params).status_code == 200


@pytest.mark.parametrize(
    ("path", "params"),
    [
        (LEADERBOARD, {"season": SEASON, "percentiles": "receptions,receiving_yards"}),
        (SCATTER, {"season": SEASON, "x": "targets", "y": "fantasy_points", "min_games": 1}),
        (COMPARE, {"players": "00-0000031,00-0000032", "season": SEASON}),
    ],
)
def test_a_hit_sends_the_same_bytes_as_the_uncached_endpoint(
    client: TestClient, receivers: dict, version: dict, monkeypatch, path: str, params: dict
) -> None:
    monkeypatch.setattr(cache, "ENABLED", False)
    uncached = client.get(path, params=params)

    monkeypatch.setattr(cache, "ENABLED", True)
    miss = client.get(path, params=params)
    hit = client.get(path, params=params)

    assert uncached.status_code == 200
    assert uncached.content == miss.content == hit.content
    assert hit.headers["content-type"] == "application/json"
