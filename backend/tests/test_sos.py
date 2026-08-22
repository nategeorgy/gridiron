"""Strength of schedule (M6.3) — points allowed, by position, in the user's scoring.

Three things here are easy to get backwards and impossible to see from a 200 response.

**Direction.** A defense that gives up a lot of points is an *easy* matchup, so the
difficulty scale has to invert the raw number. Getting this wrong produces a board that
is confidently, exactly wrong — and reads perfectly plausibly, because half the league
lands on the correct side of the median by accident.

**Byes.** A week with no fixture is an absent game, not a free one. Averaging it in as
zero difficulty would make every team's bye look like the softest spot on their season.

**Which season.** In August the only complete measurement is last season, and the board
has to say so rather than implying it knows something about a defense that has not
played yet.
"""

from datetime import date

import pytest
from sqlalchemy.orm import Session

from app.models import Game, Player, PlayerStats, Team

SOS = "/api/v1/stats/sos"
BASIS_SEASON = 2025
SCHEDULE_SEASON = 2026


@pytest.fixture
def league(db: Session, team: Team) -> dict[str, Team]:
    """Three teams, one soft defense and one stingy one, and a schedule against them.

    Last season this team's receiver scored 30 against the soft defense and 5 against
    the stingy one, which makes the first an easy matchup and the second a hard one.
    This season they play them alternately, with a bye in week 3.
    """
    soft = Team(name="Soft Defense", abbreviation="SFT", conference="AFC", division="AFC East")
    stingy = Team(name="Stingy Defense", abbreviation="STG", conference="AFC", division="AFC West")
    db.add_all([soft, stingy])
    db.flush()

    receiver = Player(player_id="00-0000801", name="Receiver", position="WR", team_id=team.team_id)
    db.add(receiver)
    db.flush()

    # --- last season: the measurement ---
    db.add_all([
        Game(
            game_id="2025_01", season=BASIS_SEASON, week=1, season_type="REG",
            home_team_id=team.team_id, away_team_id=soft.team_id,
            home_score=30, away_score=10, game_date=date(2025, 9, 7),
        ),
        Game(
            game_id="2025_02", season=BASIS_SEASON, week=2, season_type="REG",
            home_team_id=team.team_id, away_team_id=stingy.team_id,
            home_score=13, away_score=17, game_date=date(2025, 9, 14),
        ),
    ])
    # `fantasy_points_std` is the base the scoring engine builds on — it adds the
    # league's reception credit to the stored standard total rather than recomputing
    # yards and touchdowns. The pipeline always populates it, so a fixture that leaves
    # it null is not testing the same arithmetic production runs.
    db.add_all([
        # 100 yards (10.0 std) + 20 receptions = 30.0 PPR, conceded by the soft defense.
        PlayerStats(
            player_id=receiver.player_id, game_id="2025_01", team_id=team.team_id,
            season=BASIS_SEASON, week=1, season_type="REG",
            receptions=20, receiving_yards=100, receiving_tds=0, fantasy_points_std=10.0,
        ),
        # 30 yards (3.0 std) + 2 receptions = 5.0 PPR, conceded by the stingy one.
        PlayerStats(
            player_id=receiver.player_id, game_id="2025_02", team_id=team.team_id,
            season=BASIS_SEASON, week=2, season_type="REG",
            receptions=2, receiving_yards=30, receiving_tds=0, fantasy_points_std=3.0,
        ),
    ])

    # --- this season: the schedule being rated ---
    db.add_all([
        Game(
            game_id=f"2026_{week:02d}", season=SCHEDULE_SEASON, week=week, season_type="REG",
            home_team_id=team.team_id, away_team_id=opponent.team_id,
            game_date=date(2026, 9, 13),
        )
        for week, opponent in [(1, soft), (2, stingy), (15, soft), (16, stingy), (17, soft)]
    ])
    # A week-3 game between the other two, so week 3 exists in the season and this team
    # is visibly on a bye rather than merely having a shorter schedule.
    db.add(Game(
        game_id="2026_03", season=SCHEDULE_SEASON, week=3, season_type="REG",
        home_team_id=soft.team_id, away_team_id=stingy.team_id, game_date=date(2026, 9, 20),
    ))
    db.flush()
    return {"team": team, "soft": soft, "stingy": stingy}


def _board(client, **params) -> dict:
    response = client.get(SOS, params={"season": SCHEDULE_SEASON, "position": "WR", **params})
    assert response.status_code == 200, response.text
    return response.json()


def _row(board: dict, team: Team) -> dict:
    return next(row for row in board["data"] if row["team_id"] == team.team_id)


def _defense(board: dict, team: Team) -> dict:
    return next(entry for entry in board["defense"] if entry["team_id"] == team.team_id)


def test_a_defense_that_allows_more_points_is_the_easier_matchup(client, league):
    """The direction the whole feature hangs on.

    The soft defense gave up 30 points a game and the stingy one 5, so the soft one has
    to score *lower* on a scale where higher means harder.
    """
    board = _board(client)

    assert _defense(board, league["soft"])["points_allowed_pg"] == 30.0
    assert _defense(board, league["stingy"])["points_allowed_pg"] == 5.0
    assert (
        _defense(board, league["soft"])["difficulty"]
        < _defense(board, league["stingy"])["difficulty"]
    )


def test_the_basis_is_last_season_and_the_response_says_so(client, league):
    """August cannot measure a season that has not started. It must not pretend to."""
    basis = _board(client)["basis"]

    assert basis["season"] == BASIS_SEASON
    assert basis["kind"] == "prior_season"


def test_the_basis_moves_to_the_current_season_once_there_is_enough_of_it(
    client, league, db: Session
):
    """Four weeks in, the season being played stops being a guess and becomes the data."""
    for week in (1, 2, 15, 16):
        db.add(PlayerStats(
            player_id="00-0000801", game_id=f"2026_{week:02d}",
            team_id=league["team"].team_id, season=SCHEDULE_SEASON, week=week,
            season_type="REG", receptions=5, receiving_yards=50,
        ))
    db.flush()

    basis = _board(client)["basis"]

    assert basis["season"] == SCHEDULE_SEASON
    assert basis["kind"] == "current_season"


def test_a_bye_is_skipped_rather_than_counted_as_an_easy_week(client, league):
    """Five fixtures across a six-week season, averaged over five."""
    board = _board(client)
    row = _row(board, league["team"])

    assert 3 in board["weeks"]                                  # the week exists…
    assert row["schedule"][board["weeks"].index(3)] is None      # …but not for this team
    assert row["games"] == 5


def test_difficulty_is_the_mean_of_the_opponents_faced(client, league):
    """Three games against the soft defense and two against the stingy one."""
    board = _board(client)
    soft = _defense(board, league["soft"])["difficulty"]
    stingy = _defense(board, league["stingy"])["difficulty"]

    assert _row(board, league["team"])["difficulty"] == pytest.approx(
        (soft * 3 + stingy * 2) / 5, abs=0.05
    )


def test_the_playoff_window_covers_only_weeks_15_to_17(client, league):
    board = _board(client, window="playoffs")

    assert board["window_weeks"] == [15, 16, 17]
    assert _row(board, league["team"])["games"] == 3


def test_teams_that_do_not_play_this_season_are_left_off(client, league, db: Session):
    """Ranking a team with no fixtures would put an empty schedule top of "easiest".

    This is a per-season rule and it outlived the bug that prompted it: `teams` used to
    carry four historical franchise codes with no games at all (LAR, OAK, SD, STL),
    which the pipeline now filters out and migration `8530feb2c2ff` deleted. A real team
    with no fixtures in the season asked about would still break the board the same way.
    """
    db.add(Team(name="Relocated", abbreviation="OLD", conference="NFC", division="NFC West"))
    db.flush()

    assert all(row["abbreviation"] != "OLD" for row in _board(client)["data"])


def test_the_board_is_ordered_easiest_schedule_first(client, league):
    board = _board(client)
    rated = [row["difficulty"] for row in board["data"] if row["difficulty"] is not None]

    assert rated == sorted(rated)
    assert board["data"][0]["rank"] == 1


def test_points_allowed_is_computed_in_the_requested_scoring(client, league):
    """Change the ruler and the board has to change with it.

    The receiver caught 20 passes in the game against the soft defense, so half-PPR has
    to report exactly ten points fewer than full PPR.
    """
    ppr = _defense(_board(client, scoring="ppr"), league["soft"])
    half = _defense(_board(client, scoring="half"), league["soft"])

    assert ppr["points_allowed_pg"] - half["points_allowed_pg"] == pytest.approx(10.0)


def test_an_unknown_position_or_window_is_rejected(client, league):
    assert client.get(SOS, params={"position": "K"}).status_code == 400
    assert client.get(SOS, params={"position": "WR", "window": "someday"}).status_code == 400
