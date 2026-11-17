"""Every offensive touchdown, for the Every Touchdown viz and the tweet kit's touchdown cards.

Pinned: only the offense's touchdowns (a return is not one), the starting yard line and the
air yards a pass carries, the gap a run went through, and the team and game filters.
"""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Game, GamePlay, Player, PlayTarget, Team

GAME = "2026_05_DEN_KC"
URL = "/api/v1/explore/touchdowns"


@pytest.fixture
def plays(db: Session) -> dict:
    kc = Team(name="Kansas City Chiefs", abbreviation="KC", conference="AFC", division="AFC West")
    den = Team(name="Denver Broncos", abbreviation="DEN", conference="AFC", division="AFC West")
    db.add_all([kc, den])
    db.flush()
    db.add(Game(game_id=GAME, season=2026, week=5, season_type="REG", home_team_id=kc.team_id,
                away_team_id=den.team_id, home_score=14, away_score=13, game_date=date(2026, 10, 11)))
    db.add_all([
        Player(player_id="qb", name="Kansas Passer", position="QB", team_id=kc.team_id, status="ACT"),
        Player(player_id="te", name="Kansas End", position="TE", team_id=kc.team_id, status="ACT"),
        Player(player_id="rb", name="Denver Back", position="RB", team_id=den.team_id, status="ACT"),
    ])
    db.flush()

    def play(seq, team, desc, **extra):
        return GamePlay(game_id=GAME, play_id=seq * 10, season=2026, week=5, season_type="REG", sequence=seq,
                        quarter=1 + seq // 3, clock="10:00", team_id=team.team_id, description=desc, **extra)

    db.add_all([
        play(1, kc, "P.Passer pass deep left to K.End for 34 yards, TOUCHDOWN.", yardline_100=34, yards=34,
             passer_id="qb", receiver_id="te", is_pass=True, complete=True, touchdown=True, pass_touchdown=True,
             play_type="pass"),
        play(2, den, "D.Back up the middle for 2 yards, TOUCHDOWN.", yardline_100=2, yards=2, rusher_id="rb",
             is_rush=True, touchdown=True, rush_touchdown=True, play_type="run"),
        play(3, den, "D.Back right tackle for 7 yards.", yardline_100=40, yards=7, rusher_id="rb", is_rush=True,
             play_type="run"),
        # A punt returned for a score: a touchdown, but not the offense's.
        play(4, den, "Punt returned 70 yards, TOUCHDOWN.", yardline_100=70, yards=0, touchdown=True, play_type="punt"),
    ])
    db.add(PlayTarget(game_id=GAME, play_id=10, season=2026, week=5, season_type="REG", team_id=kc.team_id,
                      passer_id="qb", receiver_id="te", air_yards=22, location="left", complete=True,
                      touchdown=True, yards=34, yards_after_catch=12))
    db.flush()
    return {"kc": kc, "den": den}


def _get(client: TestClient, **params) -> dict:
    response = client.get(URL, params={"season": 2026, **params})
    assert response.status_code == 200, response.text
    return response.json()


def test_only_offensive_touchdowns_with_where_they_started(client: TestClient, plays: dict) -> None:
    result = _get(client)
    assert result["total"] == 2
    catch, run = result["data"]
    assert (catch["kind"], catch["from"], catch["air_yards"], catch["yards_after_catch"], catch["location"]) == ("pass", 34, 22, 12, "left")
    assert (catch["scorer_id"], catch["passer_id"], catch["team"], catch["opponent"], catch["home"]) == ("te", "qb", "KC", "DEN", True)
    assert (run["kind"], run["from"], run["gap"], run["scorer_id"], run["passer_id"]) == ("rush", 2, "up the middle", "rb", None)
    assert run["air_yards"] is None
    assert result["players"]["te"]["name"] == "Kansas End"


def test_team_and_game_filters(client: TestClient, plays: dict) -> None:
    assert [row["team"] for row in _get(client, team="den")["data"]] == ["DEN"]
    assert _get(client, game_id=GAME)["total"] == 2
    assert _get(client, weeks="4")["total"] == 0
    assert client.get(URL, params={"team": "XYZ"}).status_code == 400
    assert client.get(URL, params={"game_id": "2026_05_NOPE"}).status_code == 404
