"""The team page (M6.2) — fixtures, betting lines, and the current depth chart.

Two things here are easy to get subtly wrong and impossible to spot from a 200.

**Point of view.** The schedule feed is stored home-team-first: one `spread_line`
column, positive when the *home* team is favoured. A team page has to show every game
from that team's own side, so the away rows need their sign flipped and their scores
swapped. Getting it backwards produces a page that looks completely normal and is
wrong on exactly half its rows.

**Two seasons at once.** The schedule, the lines and the depth chart are about the
season coming; the production printed beside each name is the last season played.
"""

from datetime import date, datetime, timezone

import pytest
from sqlalchemy.orm import Session

from app.models import DepthChartEntry, Game, Player, PlayerStats, Team

SCHEDULE_SEASON = 2026   # published, not yet played
PLAYED_SEASON = 2025     # where production comes from
SNAPSHOT = datetime(2026, 8, 20, 7, 36, tzinfo=timezone.utc)


@pytest.fixture
def opponent(db: Session) -> Team:
    team = Team(name="Denver Broncos", abbreviation="DEN", conference="AFC", division="AFC West")
    db.add(team)
    db.flush()
    return team


@pytest.fixture
def team_page(db: Session, team: Team, opponent: Team) -> Team:
    """One team with a played season behind it and a priced season ahead of it."""
    # Last season: one game, played, and a stat line to value the roster with.
    db.add(Game(
        game_id="2025_01_HOME", season=PLAYED_SEASON, week=1, season_type="REG",
        home_team_id=team.team_id, away_team_id=opponent.team_id,
        home_score=27, away_score=20, game_date=date(2025, 9, 7),
    ))
    starter = Player(player_id="00-0000901", name="Starter", position="TE", team_id=team.team_id)
    rookie = Player(player_id="00-0000902", name="Rookie", position="TE", team_id=team.team_id)
    db.add_all([starter, rookie])
    db.flush()
    db.add(PlayerStats(
        player_id=starter.player_id, game_id="2025_01_HOME", team_id=team.team_id,
        season=PLAYED_SEASON, week=1, season_type="REG",
        receptions=8, receiving_yards=100, receiving_tds=1,
    ))

    # This season: one home game the team is favoured in, one away game it is not.
    # Neither has been played, so both are fixtures with lines and no result.
    db.add_all([
        Game(
            game_id="2026_01_HOME", season=SCHEDULE_SEASON, week=1, season_type="REG",
            home_team_id=team.team_id, away_team_id=opponent.team_id,
            game_date=date(2026, 9, 13), spread_line=3.0, total_line=44.0,
        ),
        Game(
            game_id="2026_02_AWAY", season=SCHEDULE_SEASON, week=2, season_type="REG",
            home_team_id=opponent.team_id, away_team_id=team.team_id,
            game_date=date(2026, 9, 20), spread_line=7.0, total_line=41.0,
        ),
    ])

    db.add_all([
        DepthChartEntry(
            season=SCHEDULE_SEASON, team_id=team.team_id, player_id=starter.player_id,
            pos_abb="TE", pos_rank=1, snapshot_at=SNAPSHOT,
        ),
        DepthChartEntry(
            season=SCHEDULE_SEASON, team_id=team.team_id, player_id=rookie.player_id,
            pos_abb="TE", pos_rank=2, snapshot_at=SNAPSHOT,
        ),
    ])
    db.flush()
    return team


def _page(client, team: Team, **params) -> dict:
    response = client.get(f"/api/v1/teams/{team.team_id}", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def test_unknown_team_is_a_404(client):
    assert client.get("/api/v1/teams/99999").status_code == 404


def test_a_team_that_has_never_played_is_a_404(client, team: Team):
    """`load_teams()` publishes 36 franchise codes, and only 32 of them play.

    LAR, OAK, SD and STL are historical codes sitting beside the current ones, and they
    used to render a real 200 here: a page with no record, no fixtures and no depth
    chart, which reads as broken rather than empty. The pipeline no longer ingests them
    and migration `8530feb2c2ff` removed the rows already written — this is the layer
    that holds if either of those regresses.
    """
    response = client.get(f"/api/v1/teams/{team.team_id}")

    assert response.status_code == 404


def test_a_team_with_no_games_in_the_requested_season_still_renders(client, team_page):
    """An empty season is not a missing team, and must not be reported as one.

    The 404 above asks whether a team has *ever* played, deliberately — narrowing it to
    the requested season would 404 every real team on any season it happens to have no
    fixtures for, which is a very different claim.
    """
    response = client.get(f"/api/v1/teams/{team_page.team_id}", params={"season": 2021})

    assert response.status_code == 200
    body = response.json()
    assert body["schedule"] == []
    assert body["record"]["played"] == 0


def test_the_schedule_is_told_from_this_team_s_point_of_view(client, team_page):
    """Home/away is flattened away — a fixture list reads "vs DEN" and "at DEN"."""
    games = _page(client, team_page)["schedule"]

    assert [game["week"] for game in games] == [1, 2]
    assert games[0]["is_home"] is True
    assert games[0]["opponent"] == "DEN"
    assert games[1]["is_home"] is False
    assert games[1]["opponent"] == "DEN"


def test_the_spread_is_flipped_for_away_games(client, team_page):
    """`spread_line` is stored from the home team's side, so half the rows need turning.

    Week 1: this team is home and favoured by 3, so its own line is +3. Week 2: the
    *opponent* is home and favoured by 7, so this team's line is −7. Reading the stored
    column straight through would report the team as a 7-point favourite in a game it
    is a 7-point underdog in.
    """
    games = _page(client, team_page)["schedule"]

    assert games[0]["team_spread"] == 3.0
    assert games[1]["team_spread"] == -7.0


def test_implied_total_splits_the_total_by_the_spread(client, team_page):
    """The number the Vegas board will lean on, so it is pinned here.

    Week 1: total 44, favoured by 3 → 44/2 + 3/2 = 23.5.
    Week 2: total 41, underdog by 7 → 41/2 − 7/2 = 17.0.
    """
    games = _page(client, team_page)["schedule"]

    assert games[0]["implied_total"] == 23.5
    assert games[1]["implied_total"] == 17.0


def test_the_record_counts_only_games_that_have_been_played(client, team_page):
    """An unplayed fixture is not a loss."""
    page = _page(client, team_page)

    assert page["record"] == {"wins": 0, "losses": 0, "ties": 0, "played": 0}

    played = _page(client, team_page, season=PLAYED_SEASON)
    assert played["record"] == {"wins": 1, "losses": 0, "ties": 0, "played": 1}


def test_next_game_is_the_first_one_not_yet_played(client, team_page):
    page = _page(client, team_page)

    assert page["next_game"]["week"] == 1
    assert page["next_game"]["result"] is None


def test_production_comes_from_the_last_season_actually_played(client, team_page):
    """The page shows a 2026 chart with 2025 numbers, and says so.

    Defaulting production to the schedule season would print an empty depth chart all
    summer — every name with a dash beside it — which is the state this rule exists to
    avoid.
    """
    page = _page(client, team_page)

    assert page["season"] == SCHEDULE_SEASON
    assert page["production_season"] == PLAYED_SEASON

    starter = page["depth_chart"]["TE"][0]
    assert starter["pos_rank"] == 1
    assert starter["games_played"] == 1
    assert starter["fantasy_ppg"] is not None


def test_a_player_with_no_production_shows_nothing_rather_than_zero(client, team_page):
    """A rookie has no points per game. Zero would be a claim; None is the truth."""
    rookie = _page(client, team_page)["depth_chart"]["TE"][1]

    assert rookie["name"] == "Rookie"
    assert rookie["games_played"] is None
    assert rookie["fantasy_ppg"] is None


def test_the_depth_chart_is_priced_in_the_requested_scoring(client, team_page):
    """The one place a depth chart could quietly quote somebody another league's points.

    The starter caught 8 passes, so PPR and standard have to disagree by exactly 8.
    """
    ppr = _page(client, team_page, scoring="ppr")["depth_chart"]["TE"][0]
    standard = _page(client, team_page, scoring="std")["depth_chart"]["TE"][0]

    assert ppr["fantasy_points"] - standard["fantasy_points"] == pytest.approx(8.0)


def test_the_depth_chart_carries_the_date_it_was_published(client, team_page):
    """Perishable data has to say when it was picked."""
    assert _page(client, team_page)["depth_chart_as_of"].startswith("2026-08-20")
