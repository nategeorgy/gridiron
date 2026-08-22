"""The Vegas board (M6.4) — implied team totals from the schedule feed.

The arithmetic is three lines and the whole feature rests on it, so it is tested
directly as well as through the endpoint. `spread_line` is stored from the **home**
team's perspective, which means the favourite gets half the spread added and the
underdog has it taken away — swap that and the board recommends starting players from
the offense expected to score *least*, while looking entirely normal.

The other thing worth pinning is that **unpriced is a state, not a zero**. The market
prices a few weeks out and posts look-ahead numbers on a handful of games beyond that;
as of 2026-08-20 that meant weeks 1–6 priced, week 7 half, the rest sporadic. A game
with no line must not sort as though the market expects nobody to score.
"""

from datetime import date

import pytest
from sqlalchemy.orm import Session

from app.models import DepthChartEntry, Game, Player, PlayerStats, Team
from app.vegas import MAX_DEPTH_RANK, implied_totals

VEGAS = "/api/v1/stats/vegas"
SCHEDULE_SEASON = 2026
PLAYED_SEASON = 2025


def test_implied_totals_split_the_total_by_the_spread():
    """Home favoured by 3 in a 44-point game: 23.5 and 20.5, adding to the total."""
    home, away = implied_totals(spread_line=3.0, total_line=44.0)

    assert home == 23.5
    assert away == 20.5
    assert home + away == 44.0


def test_implied_totals_favour_the_away_side_when_the_spread_is_negative():
    """A negative spread means the *away* team is favoured — the sign is the whole rule."""
    home, away = implied_totals(spread_line=-7.0, total_line=41.0)

    assert away == 24.0
    assert home == 17.0


def test_implied_totals_are_none_without_a_line():
    assert implied_totals(None, 44.0) == (None, None)
    assert implied_totals(3.0, None) == (None, None)


@pytest.fixture
def slate(db: Session, team: Team) -> dict:
    """One week with a high-total game, a low-total game, and an unpriced one."""
    opponent = Team(name="Denver Broncos", abbreviation="DEN", conference="AFC", division="AFC West")
    other = Team(name="New York Jets", abbreviation="NYJ", conference="AFC", division="AFC East")
    fourth = Team(name="Chicago Bears", abbreviation="CHI", conference="NFC", division="NFC North")
    db.add_all([opponent, other, fourth])
    db.flush()

    db.add_all([
        # A shoot-out this team is favoured in.
        Game(
            game_id="2026_01_HIGH", season=SCHEDULE_SEASON, week=1, season_type="REG",
            home_team_id=team.team_id, away_team_id=opponent.team_id,
            game_date=date(2026, 9, 13), spread_line=6.0, total_line=50.0,
        ),
        # A low-scoring game between the other two.
        Game(
            game_id="2026_01_LOW", season=SCHEDULE_SEASON, week=1, season_type="REG",
            home_team_id=other.team_id, away_team_id=fourth.team_id,
            game_date=date(2026, 9, 13), spread_line=1.0, total_line=36.0,
        ),
        # Week 2, which the market has not got to yet.
        Game(
            game_id="2026_02_NONE", season=SCHEDULE_SEASON, week=2, season_type="REG",
            home_team_id=team.team_id, away_team_id=other.team_id,
            game_date=date(2026, 9, 20),
        ),
    ])

    # A depth chart four deep, so the cut at MAX_DEPTH_RANK is visible.
    players = []
    for rank in range(1, 5):
        player = Player(
            player_id=f"00-000070{rank}", name=f"Receiver {rank}",
            position="WR", team_id=team.team_id,
        )
        players.append(player)
    db.add_all(players)
    db.flush()
    db.add_all([
        DepthChartEntry(
            season=SCHEDULE_SEASON, team_id=team.team_id, player_id=player.player_id,
            pos_abb="WR", pos_rank=rank,
        )
        for rank, player in enumerate(players, start=1)
    ])
    # One player on the low-total team, so the environment sort has something to order.
    quiet = Player(player_id="00-0000710", name="Quiet Receiver", position="WR", team_id=other.team_id)
    db.add(quiet)
    db.flush()
    db.add(DepthChartEntry(
        season=SCHEDULE_SEASON, team_id=other.team_id, player_id=quiet.player_id,
        pos_abb="WR", pos_rank=1,
    ))

    # Last season's production, so the board has points per game to show and to break
    # ties with inside a team.
    db.add(Game(
        game_id="2025_01", season=PLAYED_SEASON, week=1, season_type="REG",
        home_team_id=team.team_id, away_team_id=opponent.team_id,
        home_score=24, away_score=20, game_date=date(2025, 9, 7),
    ))
    db.add_all([
        PlayerStats(
            player_id=players[1].player_id, game_id="2025_01", team_id=team.team_id,
            season=PLAYED_SEASON, week=1, season_type="REG",
            receptions=10, receiving_yards=120, fantasy_points_std=12.0,
        ),
        PlayerStats(
            player_id=players[0].player_id, game_id="2025_01", team_id=team.team_id,
            season=PLAYED_SEASON, week=1, season_type="REG",
            receptions=2, receiving_yards=20, fantasy_points_std=2.0,
        ),
    ])
    db.flush()
    return {"team": team, "opponent": opponent, "other": other, "players": players}


def _board(client, **params) -> dict:
    response = client.get(VEGAS, params={"season": SCHEDULE_SEASON, **params})
    assert response.status_code == 200, response.text
    return response.json()


def test_the_board_opens_on_the_next_week_not_yet_played(client, slate):
    """A line's value is that the game has not happened. Week 1 is the answer in July."""
    assert _board(client)["week"] == 1


def test_the_games_view_carries_both_implied_totals(client, slate):
    board = _board(client, view="games")
    high = next(game for game in board["data"] if game["game_id"] == "2026_01_HIGH")

    assert high["home_implied"] == 28.0
    assert high["away_implied"] == 22.0
    assert high["priced"] is True


def test_the_highest_total_game_leads_the_slate(client, slate):
    board = _board(client, view="games")

    assert board["data"][0]["game_id"] == "2026_01_HIGH"


def test_an_unpriced_game_is_marked_rather_than_zeroed(client, slate):
    """No line is not a low total, and must not read as one."""
    game = _board(client, view="games", week=2)["data"][0]

    assert game["priced"] is False
    assert game["spread_line"] is None
    assert game["home_implied"] is None


def test_unpriced_games_sort_last(client, slate, db: Session):
    """Sorting them by a null total would put them above every real game."""
    db.add(Game(
        game_id="2026_01_BLANK", season=SCHEDULE_SEASON, week=1, season_type="REG",
        home_team_id=slate["opponent"].team_id, away_team_id=slate["other"].team_id,
        game_date=date(2026, 9, 13),
    ))
    db.flush()

    board = _board(client, view="games")

    assert board["data"][-1]["game_id"] == "2026_01_BLANK"


def test_players_are_ranked_by_the_environment_they_are_in(client, slate):
    """Every player in the 28-point offense outranks the one in the 18.5-point game."""
    rows = _board(client, view="players")["data"]
    implied = [row["implied_total"] for row in rows]

    assert implied == sorted(implied, reverse=True)
    assert rows[0]["team_abbreviation"] == "KC"
    assert rows[-1]["name"] == "Quiet Receiver"


def test_the_better_producer_leads_inside_the_same_offense(client, slate):
    """The second tiebreak, without which one team's chart is an unordered block."""
    rows = [row for row in _board(client, view="players")["data"] if row["team_abbreviation"] == "KC"]

    assert rows[0]["name"] == "Receiver 2"  # 22.0 PPR last season
    assert rows[1]["name"] == "Receiver 1"  # 4.0


def test_the_player_list_stops_at_the_third_on_the_depth_chart(client, slate):
    """Past the third at a position a chart is not a fantasy question.

    Letting a whole roster through would also bury the second-best game environment
    under the best one's practice squad.
    """
    names = {row["name"] for row in _board(client, view="players")["data"]}

    assert "Receiver 3" in names
    assert "Receiver 4" not in names
    assert MAX_DEPTH_RANK == 3


def test_the_position_filter_narrows_the_players_view(client, slate):
    assert _board(client, view="players", position="QB")["data"] == []
    assert _board(client, view="players", position="WR")["total"] == 4


def test_production_is_shown_in_the_requested_scoring(client, slate):
    """Ten catches, so PPR and standard have to differ by exactly ten points."""
    def ppg(scoring: str) -> float:
        rows = _board(client, view="players", scoring=scoring)["data"]
        return next(row for row in rows if row["name"] == "Receiver 2")["fantasy_ppg"]

    assert ppg("ppr") - ppg("std") == pytest.approx(10.0)


def test_an_unknown_view_is_rejected(client, slate):
    assert client.get(VEGAS, params={"view": "heatmap"}).status_code == 400
