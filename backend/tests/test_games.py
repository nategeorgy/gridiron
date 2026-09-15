"""Games (M10) — the schedule endpoint and the two-week home scoreboard.

Two things here are easy to get backwards and expensive when you do.

**The favourite.** `spread_line` is stored from the *home* team's perspective, so a
positive number favours the home side and a negative one favours the away side. Reading
that sign wrong labels every underdog a favourite while the page looks completely
normal — the same trap `test_vegas.py` pins for implied totals, one layer up.

**The scoreboard's two windows.** "Last" is the newest week in which most games are
final and "next" is the first week after it with a game still to play. In season they are
consecutive; from January to September they straddle two seasons, and a client that
assumed one season would show last year's Week 1 as "coming up".
"""

from datetime import date, time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Game, Team

GAMES = "/api/v1/games"
SCOREBOARD = "/api/v1/games/scoreboard"


@pytest.fixture
def opponent(db: Session) -> Team:
    other = Team(name="Denver Broncos", abbreviation="DEN", conference="AFC", division="AFC West")
    db.add(other)
    db.flush()
    return other


@pytest.fixture
def schedule(db: Session, team: Team, opponent: Team) -> None:
    """A finished season followed by an unplayed one — the offseason shape."""
    db.add_all([
        # 2025 week 17: played, home team lost.
        Game(
            game_id="2025_17_DEN_KC", season=2025, week=17, season_type="REG",
            home_team_id=team.team_id, away_team_id=opponent.team_id,
            home_score=17, away_score=24, game_date=date(2025, 12, 28),
            kickoff_time=time(13, 0), spread_line=3.0, total_line=44.0,
        ),
        # 2025 week 18: played, home team won. The newest played week.
        Game(
            game_id="2025_18_KC_DEN", season=2025, week=18, season_type="REG",
            home_team_id=opponent.team_id, away_team_id=team.team_id,
            home_score=30, away_score=10, game_date=date(2026, 1, 4),
            kickoff_time=time(16, 25), spread_line=-2.5, total_line=41.5,
        ),
        # 2026 week 1: not played. The earliest unplayed week.
        Game(
            game_id="2026_01_DEN_KC", season=2026, week=1, season_type="REG",
            home_team_id=team.team_id, away_team_id=opponent.team_id,
            game_date=date(2026, 9, 13), kickoff_time=time(20, 20),
            spread_line=6.5, total_line=48.5,
        ),
        # 2026 week 2: not played, and never priced.
        Game(
            game_id="2026_02_KC_DEN", season=2026, week=2, season_type="REG",
            home_team_id=opponent.team_id, away_team_id=team.team_id,
            game_date=date(2026, 9, 20),
        ),
    ])
    db.flush()


def test_lists_a_week_with_its_kickoff_and_line(client: TestClient, schedule: None):
    body = client.get(GAMES, params={"season": 2026, "week": 1}).json()

    assert body["total"] == 1
    game = body["data"][0]
    assert game["kickoff_time"] == "20:20:00"
    assert game["played"] is False
    assert game["winner"] is None


def test_a_positive_spread_favours_the_home_team(client: TestClient, schedule: None):
    """+6.5 on the home team means the home team is laying 6.5, not receiving it."""
    game = client.get(GAMES, params={"season": 2026, "week": 1}).json()["data"][0]

    assert game["favorite"] == "KC"          # the home side
    assert game["favorite_spread"] == -6.5   # always quoted as the negative number


def test_a_negative_spread_favours_the_away_team(client: TestClient, schedule: None):
    game = client.get(GAMES, params={"season": 2025, "week": 18}).json()["data"][0]

    assert game["favorite"] == "KC"          # the *away* side here
    assert game["favorite_spread"] == -2.5


def test_an_unpriced_game_has_no_favourite_rather_than_a_default(
    client: TestClient, schedule: None
):
    """No line is a state. It must not resolve to one side by accident."""
    game = client.get(GAMES, params={"season": 2026, "week": 2}).json()["data"][0]

    assert game["favorite"] is None
    assert game["favorite_spread"] is None
    assert game["home_implied"] is None


def test_a_played_game_reports_its_winner(client: TestClient, schedule: None):
    game = client.get(GAMES, params={"season": 2025, "week": 17}).json()["data"][0]

    assert game["played"] is True
    assert game["winner"] == "away"


def test_team_filter_matches_home_and_away(client: TestClient, schedule: None, team: Team):
    """A team's season is both sides of the fixture, not just the home half."""
    body = client.get(GAMES, params={"season": 2025, "team_id": team.team_id}).json()

    assert body["total"] == 2


def test_weeks_report_how_much_is_played_and_priced(client: TestClient, schedule: None):
    weeks = client.get("/api/v1/games/weeks", params={"season": 2026}).json()["weeks"]

    by_week = {entry["week"]: entry for entry in weeks}
    assert by_week[1] == {"week": 1, "games": 1, "played": 0, "priced": 1}
    assert by_week[2] == {"week": 2, "games": 1, "played": 0, "priced": 0}


def test_scoreboard_pairs_the_last_played_week_with_the_next_one(
    client: TestClient, schedule: None
):
    body = client.get(SCOREBOARD).json()

    assert (body["last"]["season"], body["last"]["week"]) == (2025, 18)
    assert (body["next"]["season"], body["next"]["week"]) == (2026, 1)
    assert body["last"]["label"] == "Week 18"


def test_scoreboard_windows_may_straddle_two_seasons(client: TestClient, schedule: None):
    """The offseason case: last season's finish beside next season's opener.

    Each window names its own season precisely because the pair can span two — a
    response naming one season could only ever be right for half of the year.
    """
    body = client.get(SCOREBOARD).json()

    assert body["last"]["season"] != body["next"]["season"]


def _add_week_one_games(
    db: Session, team: Team, opponent: Team, *, played: int, unplayed: int
) -> None:
    """Add games to 2026 week 1, beside the fixture's own unplayed game."""
    for index in range(played + unplayed):
        final = index < played
        db.add(Game(
            game_id=f"2026_01_EXTRA_{index}", season=2026, week=1, season_type="REG",
            home_team_id=team.team_id, away_team_id=opponent.team_id,
            home_score=21 if final else None, away_score=17 if final else None,
            game_date=date(2026, 9, 13),
        ))
    db.flush()


def test_a_week_is_last_once_most_of_it_is_final(
    client: TestClient, db: Session, schedule: None, team: Team, opponent: Team
):
    """Monday of Week 1: Sunday is in, Monday night is not. That reads Week 1 / Week 2.

    The first rule showed Week 1 in *both* tabs here — "last" because a game in it was
    final, "next" because a game in it was not.
    """
    _add_week_one_games(db, team, opponent, played=2, unplayed=0)

    body = client.get(SCOREBOARD).json()

    assert (body["last"]["season"], body["last"]["week"]) == (2026, 1)
    assert (body["next"]["season"], body["next"]["week"]) == (2026, 2)


def test_a_thursday_opener_alone_does_not_make_its_week_last(
    client: TestClient, db: Session, schedule: None, team: Team, opponent: Team
):
    """One final out of three is the opener, not the week — its Sunday is still ahead."""
    _add_week_one_games(db, team, opponent, played=1, unplayed=1)

    body = client.get(SCOREBOARD).json()

    assert (body["last"]["season"], body["last"]["week"]) == (2025, 18)
    assert (body["next"]["season"], body["next"]["week"]) == (2026, 1)


def test_a_game_carries_both_teams_logos(
    client: TestClient, db: Session, schedule: None, team: Team, opponent: Team
):
    """The scoreboard draws logos beside the abbreviations; a team without one is None."""
    team.logo_url = "https://a.espncdn.com/i/teamlogos/nfl/500/kc.png"
    db.flush()

    game = client.get(GAMES, params={"season": 2026, "week": 1}).json()["data"][0]

    assert game["home_logo_url"] == team.logo_url   # KC is at home in this fixture
    assert game["away_logo_url"] is None             # Denver has no logo stored


def test_scoreboard_is_empty_rather_than_erroring_with_no_schedule(client: TestClient):
    body = client.get(SCOREBOARD).json()

    assert body["last"] is None
    assert body["next"] is None
