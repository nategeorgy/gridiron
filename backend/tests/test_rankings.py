"""Ranking boards (M9) — the fail-closed registry, the blend, and CSV import.

Two quite different risks are covered here.

**The security one.** Several of the boards blended into the GridironIQ Consensus are
paywalled, and the whole guarantee is that they can only ever leave the server inside
an average. That is a property of `app.rankings.GLOBAL_SOURCES` being fail-closed, so
these tests assert it directly rather than through any one endpoint: a source that is
not registered public must be unlistable and unnameable, and must 404 exactly as a
source that never existed does.

**The arithmetic one.** Averaging orderings is easy to get subtly wrong, and wrong here
does not crash — it produces a plausible board. Two failures are pinned:
re-densifying each source before averaging (so a deep board does not outvote a
shallow one), and letting a player listed by only one source through (an earlier
version required two, which silently truncated the whole consensus to the depth of the
shallowest board).
"""

from datetime import date

import pytest
from sqlalchemy.orm import Session

from app.rankings import GLOBAL_SOURCES, public_source
from app.models import Game, Player, PlayerRanking, PlayerStats, Team

SOURCES = "/api/v1/draft/sources"
RANKINGS = "/api/v1/draft/rankings"

RANKING_SEASON = 2026    # the season the boards rank
SEASON = 2025            # the season we value from — always the last one played
WEEKS = 8
SCRAPED = date(2026, 8, 14)

# A source id nobody registers. Standing in for a dropped paywalled board.
PRIVATE_SOURCE = "analyst-a"


def _seed_season(db: Session, team: Team) -> None:
    """A played season, so the board has something to value players against."""
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


def _seed_production(db: Session, team: Team, player_id: str, yards: float) -> None:
    """A full season of receiving, with expected matching actual."""
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
        for week in range(1, WEEKS + 1)
    ])
    db.flush()


def _seed_ranking(
    db: Session, player_id: str, ecr: float, *, source: str, sd: float | None = 1.0
) -> None:
    db.add(
        PlayerRanking(
            player_id=player_id,
            source=source,
            ranking_type="redraft-overall",
            season=RANKING_SEASON,
            week=0,
            scraped_at=SCRAPED,
            ecr=ecr,
            sd=sd,
        )
    )
    db.flush()


@pytest.fixture
def two_boards(db: Session, team: Team) -> dict[str, str]:
    """Two sources that disagree, at deliberately different depths.

    FantasyPros lists six players in order; the private board lists four of them in a
    different order. Constructed so that **p1 is second on both boards and top of
    neither** — an averaged board must put it first, which no single source does.
    The depth difference is the second half of the point: it catches a blend that
    truncates to its shallowest input, and exercises the depth imputation for the two
    players the private board never mentions.
    """
    _seed_season(db, team)

    ids = {}
    for index in range(6):
        player_id = f"00-000090{index}"
        ids[f"p{index}"] = player_id
        db.add(
            Player(
                player_id=player_id,
                name=f"Player {index}",
                position="WR",
                team_id=team.team_id,
            )
        )
        db.flush()
        _seed_production(db, team, player_id, yards=120 - index * 15)
        # ECR carries decimals and its own spacing — deliberately not 1,2,3 — so a
        # blend that averages raw ECR against a 1..n list gives itself away.
        _seed_ranking(db, player_id, ecr=1.5 + index * 8.25, source="fantasypros")

    # Blended means: p1 = (2+2)/2 = 2.0 wins; p0 = (1+4)/2 and p3 = (4+1)/2 tie at
    # 2.5; p4 and p5 are imputed at this board's depth + 1.
    for rank, key in enumerate(["p3", "p1", "p2", "p0"], start=1):
        _seed_ranking(db, ids[key], ecr=float(rank), source=PRIVATE_SOURCE, sd=None)

    return ids


def _board(client, source: str = "consensus", **params) -> dict:
    response = client.get(
        RANKINGS, params={"source": source, "season": SEASON, "limit": 50, **params}
    )
    assert response.status_code == 200, response.text
    return response.json()


# --- The registry is fail-closed ---------------------------------------------


def test_every_listed_source_is_public(client, two_boards):
    """The listing may only ever contain sources the registry publishes.

    Asserted against the registry rather than against a hardcoded list, so a source
    added later is covered by this test the day it is added.
    """
    listed = {row["id"] for row in client.get(SOURCES).json()["data"]}

    assert listed
    for source_id in listed:
        assert public_source(source_id) is not None, f"{source_id} is not a public source"


def test_a_private_source_is_never_listed(client, two_boards):
    listed = {row["id"] for row in client.get(SOURCES).json()["data"]}

    assert PRIVATE_SOURCE not in listed


def test_a_private_source_cannot_be_named(client, two_boards):
    """The blend reads it, but no request can address it.

    This is the test that matters: the rows exist, are in the consensus, and are still
    unreachable by name.
    """
    response = client.get(RANKINGS, params={"source": PRIVATE_SOURCE})

    assert response.status_code == 404


def test_private_and_unknown_sources_are_indistinguishable(client, two_boards):
    """A caller must not be able to probe for which private boards exist."""
    private = client.get(RANKINGS, params={"source": PRIVATE_SOURCE})
    nonsense = client.get(RANKINGS, params={"source": "no-such-source-at-all"})

    assert private.status_code == nonsense.status_code == 404
    assert private.json() == nonsense.json()


def test_registry_marks_the_blend_and_nothing_else(client):
    """Exactly one public source is the blend; the rest are single boards."""
    blends = [source for source in GLOBAL_SOURCES.values() if source.blend]

    assert len(blends) == 1


# --- The blend ---------------------------------------------------------------


def test_blend_ranks_every_player_the_deeper_board_lists(client, two_boards):
    """The bug this pins: requiring two sources truncated the consensus.

    Blending a six-name board with a three-name one must still produce six names —
    the shallow board's absence is information about its floor, not a reason to
    forget the other three players exist.
    """
    board = _board(client)

    assert board["total"] == 6


def test_blend_reverses_the_market_where_the_private_board_disagrees(client, two_boards):
    """Two sources, opposite orders, and the average is what decides.

    FantasyPros has p0 first and the private board has p3 first. p1 is second on
    both and first on neither, so averaging is the only thing that puts it top —
    which is exactly the claim the consensus makes.
    """
    rows = _board(client)["data"]

    assert rows[0]["player_id"] == two_boards["p1"]
    assert {row["player_id"] for row in rows[1:3]} == {
        two_boards["p0"], two_boards["p3"]
    }


def test_blend_densifies_each_source_before_averaging(client, two_boards):
    """A source's own numbering must not carry weight.

    FantasyPros' ECR runs 1.5 to 42.75 while the private board runs 1 to 4. Averaging
    the raw numbers would let the wider scale dominate completely and reproduce the
    FantasyPros order; averaging *ranks* does not.
    """
    rows = _board(client)["data"]

    # Under raw-ECR averaging p0 (ECR 1.5) would win outright. It does not.
    assert rows[0]["player_id"] != two_boards["p0"]


def test_blend_reports_how_many_sources_saw_each_player(client, two_boards):
    rows = {row["player_id"]: row for row in _board(client)["data"]}

    assert rows[two_boards["p0"]]["sources_count"] == 2
    assert rows[two_boards["p5"]]["sources_count"] == 1


def test_blend_dispersion_measures_real_disagreement(client, two_boards):
    """Dispersion comes from actual placements, not from imputed ones.

    p0 is ranked first by one board and fourth by the other — genuine disagreement.
    p5 appears on one board only, so there is nothing to disagree about and its
    dispersion falls back to that source's own published sd.
    """
    rows = {row["player_id"]: row for row in _board(client)["data"]}

    assert rows[two_boards["p0"]]["dispersion"] > 0
    assert rows[two_boards["p0"]]["best_rank"] == 1
    assert rows[two_boards["p0"]]["worst_rank"] == 4
    assert rows[two_boards["p5"]]["best_rank"] == rows[two_boards["p5"]]["worst_rank"]


def test_a_single_source_board_keeps_its_own_order(client, two_boards):
    """Asking for FantasyPros gives FantasyPros, untouched by the blend."""
    rows = _board(client, source="fantasypros")["data"]

    assert [row["player_id"] for row in rows][:3] == [
        two_boards["p0"], two_boards["p1"], two_boards["p2"]
    ]


def test_a_named_board_carries_its_attribution(client, two_boards):
    """ECR is FantasyPros' work and must say so wherever it is shown on its own."""
    board = _board(client, source="fantasypros")

    assert board["attribution"]
    assert "FantasyPros" in board["attribution"]


def test_the_blend_carries_no_attribution_to_any_one_board(client, two_boards):
    """The consensus must not name its inputs — several of them are paywalled."""
    board = _board(client)

    assert board["attribution"] is None
    body = str(board)
    assert PRIVATE_SOURCE not in body
