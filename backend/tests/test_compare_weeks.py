"""An explicit set of weeks on ``/stats/compare`` (October 2026).

The home page's head-to-head compared two Carolina receivers over only the weeks both
played in full, so the comparison takes ``weeks=`` the way ``/stats/intelligence``
already did. Pinned here: the totals, the games count and the weekly series all cover
exactly those weeks, and the percentile pools are drawn from the same weeks rather than
the whole season.
"""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Game, Player, PlayerStats, Team

SEASON = 2025
COMPARE = "/api/v1/stats/compare"


@pytest.fixture
def receivers(db: Session, team: Team) -> dict:
    """Two receivers over three weeks; the first has a huge Week 2 the others lack."""
    opponent = Team(name="Denver Broncos", abbreviation="DEN", conference="AFC", division="AFC West")
    db.add(opponent)
    db.flush()
    for week in (1, 2, 3):
        db.add(Game(
            game_id=f"{SEASON}_{week:02d}_WEEKS", season=SEASON, week=week, season_type="REG",
            home_team_id=team.team_id, away_team_id=opponent.team_id,
            home_score=24, away_score=17, game_date=date(SEASON, 9, 7 * week),
        ))
    players = {
        "first": Player(player_id="00-0000041", name="First Receiver", position="WR",
                        team_id=team.team_id, status="ACT"),
        "second": Player(player_id="00-0000042", name="Second Receiver", position="WR",
                         team_id=team.team_id, status="ACT"),
    }
    db.add_all(players.values())
    db.flush()

    lines = {
        "first": {1: (5, 60), 2: (12, 200), 3: (5, 60)},
        "second": {1: (6, 70), 2: (3, 30), 3: (6, 70)},
    }
    for key, weeks in lines.items():
        for week, (receptions, yards) in weeks.items():
            # fantasy_points_std has to be set: compute_points starts from it (CLAUDE.md).
            db.add(PlayerStats(
                player_id=players[key].player_id, game_id=f"{SEASON}_{week:02d}_WEEKS",
                team_id=team.team_id, season=SEASON, week=week, season_type="REG",
                receptions=receptions, targets=receptions + 2, receiving_yards=yards,
                receiving_tds=0, fantasy_points_std=round(yards * 0.1, 2),
            ))
    db.flush()
    return players


def _compare(client: TestClient, players: dict, **params) -> dict:
    response = client.get(COMPARE, params={
        "players": f"{players['first'].player_id},{players['second'].player_id}",
        "season": SEASON, "metrics": "receiving_yards,receptions", **params,
    })
    assert response.status_code == 200, response.text
    return {row["name"]: row for row in response.json()["data"]} | {"_body": response.json()}


def test_explicit_weeks_cover_only_those_weeks(client: TestClient, receivers: dict) -> None:
    result = _compare(client, receivers, weeks="1,3")

    first, second = result["First Receiver"], result["Second Receiver"]
    assert first["games_played"] == 2
    assert first["stats"]["receiving_yards"] == 120
    assert second["stats"]["receiving_yards"] == 140
    assert [line["week"] for line in first["weekly"]] == [1, 3]
    assert result["_body"]["window"]["week_list"] == [1, 3]


def test_percentiles_are_ranked_over_the_same_weeks(client: TestClient, receivers: dict) -> None:
    season = _compare(client, receivers)
    chosen = _compare(client, receivers, weeks="1,3")

    # Over the season the first receiver's Week 2 puts him ahead; without it he trails.
    assert season["First Receiver"]["percentiles"]["receiving_yards"] > season["Second Receiver"]["percentiles"]["receiving_yards"]
    assert chosen["First Receiver"]["percentiles"]["receiving_yards"] < chosen["Second Receiver"]["percentiles"]["receiving_yards"]


def test_a_bad_week_is_a_400(client: TestClient, receivers: dict) -> None:
    response = client.get(COMPARE, params={
        "players": receivers["first"].player_id, "season": SEASON, "weeks": "1,x",
    })
    assert response.status_code == 400
