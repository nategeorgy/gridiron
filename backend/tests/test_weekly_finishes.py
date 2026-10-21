"""Weekly finishes, the grid behind the home page's Weekly Finishes card.

What is pinned here is what fails silently. A finish computed in a third place that
drifts from the game log still prints a plausible rank. A bye inferred from a missing
stat line turns every missed game into a bye and every Monday-night team into a no-show.
And a traded player's bye drawn from his new team's schedule marks the wrong week.
"""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import cache
from app.models import Game, Player, PlayerStats, Team
from app.routers import stats as stats_router

SEASON = 2025
URL = "/api/v1/stats/weekly-finishes"


@pytest.fixture
def league(db: Session) -> dict:
    """Three teams over four weeks: each has one bye, and Week 4 is not played yet.

    Week 1 KC-DEN, Week 2 KC-LV, Week 3 DEN-LV, Week 4 KC-DEN (no score).
    """
    kc = Team(name="Kansas City Chiefs", abbreviation="KC", conference="AFC", division="AFC West")
    den = Team(name="Denver Broncos", abbreviation="DEN", conference="AFC", division="AFC West")
    lv = Team(name="Las Vegas Raiders", abbreviation="LV", conference="AFC", division="AFC West")
    db.add_all([kc, den, lv])
    db.flush()
    fixtures = {1: (kc, den), 2: (kc, lv), 3: (den, lv), 4: (kc, den)}
    for week, (home, away) in fixtures.items():
        played = week < 4
        db.add(Game(game_id=f"{SEASON}_{week:02d}_WF", season=SEASON, week=week, season_type="REG",
                    home_team_id=home.team_id, away_team_id=away.team_id,
                    home_score=24 if played else None, away_score=17 if played else None,
                    game_date=date(SEASON, 9, 7 * week)))

    def make(player_id: str, name: str, position: str = "WR") -> Player:
        player = Player(player_id=player_id, name=name, position=position, team_id=kc.team_id, status="ACT")
        db.add(player)
        return player

    people = {
        "steady": make("00-0000101", "Steady Receiver"),
        "missed": make("00-0000102", "Missed Receiver"),
        "traded": make("00-0000103", "Traded Receiver"),
        "te": make("00-0000104", "Big Tight End", "TE"),
    }
    db.flush()

    def line(player: Player, week: int, team: Team, receptions: int, yards: int) -> None:
        # fantasy_points_std has to be set: compute_points starts from it (CLAUDE.md).
        db.add(PlayerStats(player_id=player.player_id, game_id=f"{SEASON}_{week:02d}_WF", team_id=team.team_id,
                           season=SEASON, week=week, season_type="REG", receptions=receptions,
                           targets=receptions + 2, receiving_yards=yards, receiving_tds=0,
                           fantasy_points_std=round(yards * 0.1, 2)))

    line(people["steady"], 1, kc, 6, 90)
    line(people["steady"], 2, kc, 5, 70)
    line(people["missed"], 1, den, 8, 60)    # then a bye in Week 2, and no line in Week 3
    line(people["traded"], 1, den, 2, 20)    # Denver in Week 1, Las Vegas from Week 3
    line(people["traded"], 3, lv, 4, 110)
    line(people["te"], 1, kc, 12, 200)       # never in a receiver's weekly pool
    db.flush()
    return {"kc": kc, "den": den, "lv": lv, **people}


def _finishes(client: TestClient, **params) -> dict:
    response = client.get(URL, params={"season": SEASON, "position": "WR", **params})
    assert response.status_code == 200, response.text
    return response.json()


def _row(result: dict, name: str) -> dict:
    return next(row for row in result["data"] if row["name"] == name)


def test_every_finish_matches_the_game_log(client: TestClient, league: dict) -> None:
    """One definition of a weekly finish, now read in a third place, must agree."""
    for scoring in ("ppr", "std"):
        result = _finishes(client, scoring=scoring)
        assert result["data"]
        for row in result["data"]:
            log = client.get(f"/api/v1/players/{row['player_id']}/stats",
                             params={"scoring": scoring, "season": SEASON}).json()["data"]
            for line in log:
                assert row["finishes"][str(line["week"])] == line["position_rank"], (scoring, row["name"])
                assert row["points"][str(line["week"])] == pytest.approx(line["fantasy_points"], abs=0.01)


def test_the_tight_end_is_not_in_the_receivers_pool(client: TestClient, league: dict) -> None:
    result = _finishes(client)
    assert "Big Tight End" not in {row["name"] for row in result["data"]}
    # Week 1 receivers: Steady 15.0, Missed 14.0, Traded 4.0 in PPR.
    assert [_row(result, name)["finishes"]["1"] for name in ("Steady Receiver", "Missed Receiver",
                                                               "Traded Receiver")] == [1, 2, 3]


def test_flex_pools_every_position_but_ranks_each_at_his_own(client: TestClient, league: dict) -> None:
    """Floor and Ceiling reads the pooled list; a finish must not change meaning in it."""
    receivers = _finishes(client)
    flex = _finishes(client, position="FLEX")
    names = {row["name"] for row in flex["data"]}
    assert "Big Tight End" in names and "Steady Receiver" in names
    tight_end = _row(flex, "Big Tight End")
    assert tight_end["position"] == "TE" and tight_end["finishes"]["1"] == 1
    for row in receivers["data"]:
        assert _row(flex, row["name"])["finishes"] == row["finishes"]
        assert _row(flex, row["name"])["position"] == "WR"


def test_a_bye_a_missed_game_and_an_unplayed_week_are_three_things(client: TestClient, league: dict) -> None:
    result = _finishes(client)
    assert result["weeks"] == [1, 2, 3, 4] and result["last_week"] == 3

    steady = _row(result, "Steady Receiver")
    assert steady["byes"] == [3] and steady["upcoming"] == [4]

    missed = _row(result, "Missed Receiver")
    # Week 2 is Denver's bye; Denver played in Week 3, so his empty Week 3 is a missed game.
    assert missed["byes"] == [2] and missed["upcoming"] == [4]
    assert "3" not in missed["finishes"]


def test_a_traded_players_byes_follow_him(client: TestClient, league: dict) -> None:
    traded = _row(_finishes(client), "Traded Receiver")
    # Week 2: still a Bronco, and Denver had the week off. Week 4: a Raider, and Las Vegas
    # has no game. Las Vegas playing in Week 2 must not make that week a missed game.
    assert traded["team"] == "LV"
    assert traded["byes"] == [2, 4] and traded["upcoming"] == []


def test_sorted_by_total_or_per_game_and_floored_by_games(client: TestClient, league: dict) -> None:
    result = _finishes(client)
    # PPR totals: Steady 27.0 over two games, Missed 14.0 in one, Traded 21.0 over two.
    assert [row["name"] for row in result["data"]] == ["Steady Receiver", "Traded Receiver", "Missed Receiver"]
    # Per game, Missed's one 14-point game beats Steady's 13.5 and Traded's 10.5 averages.
    per_game = _finishes(client, sort="ppg")
    assert [row["name"] for row in per_game["data"]] == ["Missed Receiver", "Steady Receiver", "Traded Receiver"]
    assert client.get(URL, params={"season": SEASON, "sort": "rank"}).status_code == 422
    steady = _row(result, "Steady Receiver")
    assert steady["games"] == 2 and steady["fantasy_ppg"] == pytest.approx((15.0 + 12.0) / 2)

    floored = _finishes(client, min_games=2)
    assert {row["name"] for row in floored["data"]} == {"Steady Receiver", "Traded Receiver"}
    assert floored["total"] == 2
    assert len(_finishes(client, limit=1)["data"]) == 1


def test_bad_requests_are_400s(client: TestClient, league: dict) -> None:
    assert client.get(URL, params={"season": SEASON, "position": "K"}).status_code == 400
    assert client.get(URL, params={"season": SEASON, "scoring": "nonsense"}).status_code == 400


def test_a_repeat_request_is_served_from_the_cache(client: TestClient, league: dict, monkeypatch) -> None:
    monkeypatch.setattr(cache, "ENABLED", True)
    monkeypatch.setattr(cache, "data_version", lambda db: 1)
    stats_router._FINISHES_RESPONSES.clear()
    original = stats_router.build_weekly_finishes
    calls = {"count": 0}

    def counted(*args, **kwargs):
        calls["count"] += 1
        return original(*args, **kwargs)

    monkeypatch.setattr(stats_router, "build_weekly_finishes", counted)
    first = client.get(URL, params={"season": SEASON, "position": "WR", "scoring": "ppr"})
    second = client.get(URL, params={"scoring": "ppr", "position": "WR", "season": SEASON})
    assert first.status_code == second.status_code == 200
    assert first.content == second.content
    assert calls["count"] == 1
    stats_router._FINISHES_RESPONSES.clear()
