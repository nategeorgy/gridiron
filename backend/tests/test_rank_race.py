"""The rank race, behind the home page's Rank Race card and the tweet kit's bump chart.

What is pinned is what would fail quietly: a week's rank taken among only the leaders
drawn (a WR40 shown as 3rd), a player ranked before his first game, a missed week that
does not let anyone pass him, and ties that do not share a rank.
"""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Game, Player, PlayerStats, Team

SEASON = 2025
URL = "/api/v1/stats/rank-race"


@pytest.fixture
def league(db: Session) -> dict:
    kc = Team(name="Kansas City Chiefs", abbreviation="KC", conference="AFC", division="AFC West")
    den = Team(name="Denver Broncos", abbreviation="DEN", conference="AFC", division="AFC West")
    db.add_all([kc, den])
    db.flush()
    for week in (1, 2, 3):
        db.add(Game(game_id=f"{SEASON}_{week:02d}_RR", season=SEASON, week=week, season_type="REG",
                    home_team_id=kc.team_id, away_team_id=den.team_id, home_score=20, away_score=17,
                    game_date=date(SEASON, 9, 7 * week)))
    people = {}
    for pid, name, position in [("00-0000201", "Early Leader", "WR"), ("00-0000202", "Steady Hand", "WR"),
                                ("00-0000203", "Late Arrival", "WR"), ("00-0000204", "Deep Reserve", "WR"),
                                ("00-0000205", "Big Tight End", "TE")]:
        people[name] = Player(player_id=pid, name=name, position=position, team_id=kc.team_id, status="ACT")
    db.add_all(people.values())
    db.flush()

    def line(name: str, week: int, yards: int) -> None:
        # Standard points are yards / 10; fantasy_points_std must be set (CLAUDE.md).
        db.add(PlayerStats(player_id=people[name].player_id, game_id=f"{SEASON}_{week:02d}_RR", team_id=kc.team_id,
                           season=SEASON, week=week, season_type="REG", receptions=0, targets=0,
                           receiving_yards=yards, receiving_tds=0, fantasy_points_std=yards / 10))

    line("Early Leader", 1, 150)   # 15, then misses Week 2, then 5
    line("Early Leader", 3, 50)
    line("Steady Hand", 1, 100)    # 10 a week
    line("Steady Hand", 2, 100)
    line("Steady Hand", 3, 100)
    line("Late Arrival", 2, 300)   # first game in Week 2
    line("Late Arrival", 3, 10)
    line("Deep Reserve", 1, 20)    # never a leader, still counted in every week's pool
    line("Deep Reserve", 2, 20)
    line("Deep Reserve", 3, 20)
    line("Big Tight End", 1, 500)  # never in a receiver's pool
    db.flush()
    return people


def _race(client: TestClient, **params) -> dict:
    response = client.get(URL, params={"season": SEASON, "position": "WR", "scoring": "std", **params})
    assert response.status_code == 200, response.text
    return response.json()


def _row(result: dict, name: str) -> dict:
    return next(row for row in result["data"] if row["name"] == name)


def test_ranks_count_the_whole_position_not_the_leaders_shown(client: TestClient, league: dict) -> None:
    """Asking for two leaders must not rank them against each other only."""
    result = _race(client, limit=2)
    assert [row["name"] for row in result["data"]] == ["Late Arrival", "Steady Hand"]
    assert result["weeks"] == [1, 2, 3]
    assert result["pool"] == 4  # the tight end is not a receiver
    # Week 1: Early 15 > Steady 10. Week 2: Late 30 > Steady 20 > Early 15. Week 3: Late 31 > Steady 30.
    assert _row(result, "Steady Hand")["ranks"] == [2, 2, 2]


def test_no_rank_before_a_first_game(client: TestClient, league: dict) -> None:
    late = _row(_race(client), "Late Arrival")
    assert late["ranks"] == [None, 1, 1]
    assert late["totals"] == [None, 30.0, 31.0]
    assert late["played"] == [False, True, True]


def test_a_missed_week_keeps_the_total_and_lets_others_pass(client: TestClient, league: dict) -> None:
    early = _row(_race(client), "Early Leader")
    assert early["ranks"] == [1, 3, 3]
    assert early["totals"] == [15.0, 15.0, 20.0]
    assert early["games"] == 2


def test_ties_share_a_rank(client: TestClient, league: dict, db: Session) -> None:
    # Bring Deep Reserve level with Early Leader after Week 1 (both 15).
    reserve = db.query(PlayerStats).filter_by(player_id="00-0000204", week=1).one()
    reserve.receiving_yards, reserve.fantasy_points_std = 150, 15.0
    db.flush()
    result = _race(client)
    assert _row(result, "Early Leader")["ranks"][0] == 1
    assert _row(result, "Deep Reserve")["ranks"][0] == 1
    assert _row(result, "Steady Hand")["ranks"][0] == 3


def test_scoring_reorders_the_race(client: TestClient, league: dict, db: Session) -> None:
    # Ten catches for Steady Hand in Week 1 are worth 10 more in PPR, nothing in standard.
    line = db.query(PlayerStats).filter_by(player_id="00-0000202", week=1).one()
    line.receptions = 10
    db.flush()
    assert _row(_race(client, scoring="std"), "Steady Hand")["ranks"][0] == 2
    assert _row(_race(client, scoring="ppr"), "Steady Hand")["ranks"][0] == 1


def test_unknown_position_is_a_400(client: TestClient, league: dict) -> None:
    assert client.get(URL, params={"position": "K"}).status_code == 400
