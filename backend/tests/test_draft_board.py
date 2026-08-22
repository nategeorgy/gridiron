"""The Draft Value Board (M6.1) — the market's ranking against our valuation.

Most of what can go wrong here is not a crash, it is a **plausible-looking wrong
number**, and the tests are aimed at exactly that.

The board's whole claim is that a gap between two ranks means something. That only
holds while both ranks count the same population. The first build of this ranked the
market over every player on the consensus board and ranked ourselves over the subset
who had played last season — and produced a +301 "value" on a 35-year-old tight end,
purely because a smaller pool compresses every rank in it upward. That failure is the
reason `test_both_ranks_cover_the_same_players` exists, and it is a failure no type
checker or 200 response would have caught.
"""

from datetime import date

import pytest
from sqlalchemy.orm import Session

from app.draft_board import default_ranking_type
from app.league import LeagueConfig
from app.models import Game, Player, PlayerRanking, PlayerStats, Team

DRAFT_BOARD = "/api/v1/stats/draft-board"

SEASON = 2025            # the season we value from
RANKING_SEASON = 2026    # the season the consensus is ranking for
WEEKS = 8
SCRAPED = date(2026, 8, 14)


def _seed_games(db: Session, team: Team) -> None:
    db.add_all([
        Game(
            game_id=f"{SEASON}_{week:02d}_X",
            season=SEASON,
            week=week,
            season_type="REG",
            home_team_id=team.team_id,
            home_score=21,
            away_score=17,
            game_date=date(SEASON, 9, 7),
        )
        for week in range(1, WEEKS + 1)
    ])
    db.flush()


def _seed_player(
    db: Session, team: Team, player_id: str, name: str, *, yards: float, games: int
) -> Player:
    """A receiver whose per-game production — actual *and* expected — is `yards`.

    Actual and expected are set to the same value so the two valuations agree; a test
    that cares about the difference sets them apart itself.
    """
    player = Player(player_id=player_id, name=name, position="WR", team_id=team.team_id)
    db.add(player)
    db.add_all([
        PlayerStats(
            player_id=player_id,
            game_id=f"{SEASON}_{week:02d}_X",
            team_id=team.team_id,
            season=SEASON,
            week=week,
            season_type="REG",
            receptions=5,
            receiving_yards=yards,
            receiving_tds=0,
            targets=8,
            receptions_exp=5,
            receiving_yards_exp=yards,
            receiving_tds_exp=0,
        )
        for week in range(1, games + 1)
    ])
    db.flush()
    return player


def _seed_ranking(db: Session, player_id: str, ecr: float) -> None:
    db.add(
        PlayerRanking(
            player_id=player_id,
            source="fantasypros",
            ranking_type="redraft-overall",
            season=RANKING_SEASON,
            week=0,
            scraped_at=SCRAPED,
            ecr=ecr,
            sd=1.0,
            best=int(ecr),
            worst=int(ecr) + 5,
        )
    )
    db.flush()


@pytest.fixture
def board(db: Session, team: Team) -> dict[str, str]:
    """A small board with every row type on it.

    The consensus order is deliberately close to the *reverse* of production, so a
    correct gap is large and signed rather than incidentally zero.
    """
    _seed_games(db, team)

    ids = {}
    # Five full-season receivers, best production first.
    for index, yards in enumerate([120, 100, 80, 60, 40]):
        player_id = f"00-000010{index}"
        ids[f"wr{index}"] = player_id
        _seed_player(db, team, player_id, f"Receiver {index}", yards=yards, games=WEEKS)
        # Consensus has them backwards: the best producer is ranked last.
        _seed_ranking(db, player_id, ecr=float(50 - index * 10))

    # A rookie the consensus ranks but who has never played.
    rookie = Player(player_id="00-0000200", name="Rookie", position="WR", team_id=team.team_id)
    db.add(rookie)
    db.flush()
    ids["rookie"] = rookie.player_id
    _seed_ranking(db, rookie.player_id, ecr=25.0)

    # Someone with one game — ranked, but nowhere near the games threshold.
    ids["cameo"] = "00-0000300"
    _seed_player(db, team, ids["cameo"], "Cameo", yards=200, games=1)
    _seed_ranking(db, ids["cameo"], ecr=35.0)

    return ids


def _rows(client, **params) -> list[dict]:
    response = client.get(DRAFT_BOARD, params={"season": SEASON, **params})
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_both_ranks_cover_the_same_players(client, board):
    """The invariant the whole board rests on.

    A gap counts positions, so the two orderings must count the same players. If the
    market is ranked over everyone and we are ranked over a subset, every gap is
    inflated by the difference in pool size and the board reports value that is purely
    an artefact of who could be valued.
    """
    rows = _rows(client)

    with_market = {row["player_id"] for row in rows if row["market_rank"] is not None}
    with_value = {row["player_id"] for row in rows if row["value_rank"] is not None}

    assert with_market == with_value
    assert len(with_market) == 5  # the rookie and the one-game cameo are excluded

    market_ranks = sorted(row["market_rank"] for row in rows if row["market_rank"])
    value_ranks = sorted(row["value_rank"] for row in rows if row["value_rank"])
    assert market_ranks == value_ranks == [1, 2, 3, 4, 5]


def test_gap_is_the_difference_between_the_two_displayed_ranks(client, board):
    """Whatever the columns say, the gap has to be their subtraction."""
    for row in _rows(client):
        if row["gap"] is None:
            continue
        assert row["gap"] == row["market_rank"] - row["value_rank"]


def test_the_best_producer_ranked_last_is_the_biggest_value(client, board):
    """The board's headline claim, on data where the right answer is known.

    Receiver 0 has the most expected production and the worst consensus rank, so they
    must come out as the largest positive gap — we rate them above the market.
    """
    rows = _rows(client, sort="gap", order="desc")

    assert rows[0]["player_id"] == board["wr0"]
    assert rows[0]["value_rank"] == 1
    assert rows[0]["market_rank"] == 5
    assert rows[0]["gap"] == 4


def test_a_player_with_no_history_keeps_their_place_and_gets_no_gap(client, board):
    """Rookies are ranked by the market and unvaluable by us — both must be visible.

    Dropping them would leave a draft board missing its first-round rookies; imputing
    them to replacement level would invent an "overvalued" verdict on every one of
    them. So they appear, in consensus order, with the reason stated.
    """
    rookie = next(row for row in _rows(client) if row["player_id"] == board["rookie"])

    assert rookie["consensus_rank"] is not None
    assert rookie["value_rank"] is None
    assert rookie["market_rank"] is None
    assert rookie["gap"] is None
    assert rookie["missing_reason"] == "no_history"


def test_too_few_games_is_reported_separately_from_no_history(client, board):
    """Two different situations that would otherwise render as the same empty cell."""
    cameo = next(row for row in _rows(client) if row["player_id"] == board["cameo"])

    assert cameo["missing_reason"] == "small_sample"
    assert cameo["gap"] is None


def test_unvalued_players_sort_last_whichever_way_the_gap_is_sorted(client, board):
    """A missing gap is not a zero gap.

    Sorting unvalued players to the top of "biggest value" — or of "biggest reach" —
    would be the board making a claim about players it cannot see.
    """
    for order in ("asc", "desc"):
        rows = _rows(client, sort="gap", order=order)
        gaps = [row["gap"] for row in rows]
        assert gaps[-2:] == [None, None]


def test_depth_caps_the_board_at_the_picks_a_league_makes(client, board):
    """Past draftable depth the consensus is listing camp bodies, not opinions."""
    rows = _rows(client, depth=3)

    assert len(rows) == 3
    assert [row["consensus_rank"] for row in rows] == [1, 2, 3]


def test_an_empty_ranking_table_returns_an_empty_board(client, db: Session, team: Team):
    """No rankings ingested yet is a state the page renders, not an error."""
    _seed_games(db, team)

    response = client.get(DRAFT_BOARD, params={"season": SEASON})

    assert response.status_code == 200
    body = response.json()
    assert body["data"] == []
    assert body["ranked_players"] == 0
    assert body["ranking_season"] is None


def test_superflex_leagues_get_the_superflex_consensus():
    """The league config already knows a second quarterback starts — so don't ask.

    A pure function, tested directly: the mapping is one line and the cost of it
    silently reverting is a board that ranks quarterbacks as if they were scarce when
    they are not.
    """
    assert default_ranking_type(LeagueConfig(teams=12)) == "redraft-overall"
    assert default_ranking_type(LeagueConfig(teams=12, superflex=1)) == "redraft-op"
