"""Trending usage (M10) — who is gaining work and who is losing it.

**The relevance floors are the feature, so they are what is tested here.** Ranked on the
raw snap-share swing alone, the top of the riser board was backup tight ends going from
nothing to garbage time: the largest *relative* moves in the league belong to players
nobody can start. Two rules make the board useful, and each has a test below —

  * a riser must clear a fantasy floor **in the recent window** (he matters now), and
  * the move must appear in **opportunity share**, not only snaps.

The falling side needs the mirror: the player must have mattered **before**, or
"trending down" is a list of reserves whose usage fell from almost nothing to nothing.

Also pinned: the window is anchored to the last week with data, and both windows are
scored through the caller's own scoring config rather than a fixed PPR.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from datetime import date

from app.models import Game, Player, PlayerStats, Team

TRENDING = "/api/v1/stats/trending"
SEASON = 2025
LAST_WEEK = 10          # the season reaches week 10, so "recent" is weeks 8-10
RECENT_FROM = 8


def _back(db: Session, team: Team, player_id: str, name: str) -> Player:
    back = Player(player_id=player_id, name=name, position="RB", team_id=team.team_id, status="ACT")
    db.add(back)
    db.flush()
    return back


RECEPTIONS = 2
RECEIVING_YARDS = 20


def _week(player: Player, team: Team, week: int, *, snap, opp, carries, yards):
    """One stat line, with its standard-scoring points.

    ``fantasy_points_std`` is not optional decoration: ``compute_points`` starts from
    the stored standard total and adds only the *difference* between the caller's
    weights and standard ones, so a row without it scores as if the player gained no
    yards at all. Every ingested row has it; a fixture that omits it silently tests
    nothing but receptions.
    """
    return PlayerStats(
        player_id=player.player_id, game_id=f"{SEASON}_{week:02d}",
        team_id=team.team_id, season=SEASON, week=week, season_type="REG",
        snap_share=snap, opportunity_share=opp, target_share=0.1, route_participation=0.5,
        carries=carries, rushing_yards=yards,
        receptions=RECEPTIONS, targets=3, receiving_yards=RECEIVING_YARDS,
        fantasy_points_std=round((yards + RECEIVING_YARDS) * 0.1, 2),
    )


@pytest.fixture
def backfield(db: Session, team: Team) -> dict[str, Player]:
    """Four backs on one roster, one per rule the board has to enforce.

    They share a game per week because they share a team — which is also what
    `player_stats.game_id` being a real foreign key forces us to be honest about.
    """
    opponent = Team(name="Denver Broncos", abbreviation="DEN", conference="AFC", division="AFC West")
    db.add(opponent)
    db.flush()
    db.add_all([
        Game(
            game_id=f"{SEASON}_{week:02d}", season=SEASON, week=week, season_type="REG",
            home_team_id=team.team_id, away_team_id=opponent.team_id,
            home_score=24, away_score=17, game_date=date(2025, 9, 7),
        )
        for week in range(1, LAST_WEEK + 1)
    ])
    db.flush()

    riser = _back(db, team, "00-0000001", "Real Riser")
    scrub = _back(db, team, "00-0000002", "Garbage Timer")
    snaps_only = _back(db, team, "00-0000003", "Snaps Only")
    faller = _back(db, team, "00-0000004", "Real Faller")

    rows = []
    for week in range(1, LAST_WEEK + 1):
        recent = week >= RECENT_FROM

        # Took over the backfield: snaps AND opportunity up, and productive now.
        rows.append(_week(riser, team, week,
                          snap=0.75 if recent else 0.45, opp=0.42 if recent else 0.18,
                          carries=22 if recent else 6, yards=110 if recent else 24))

        # The biggest percentage move on the board and completely unstartable:
        # a backup whose snaps exploded but who still scores nothing.
        rows.append(_week(scrub, team, week,
                          snap=0.70 if recent else 0.05, opp=0.20 if recent else 0.02,
                          carries=2 if recent else 0, yards=3 if recent else 0))

        # Snaps up, opportunity DOWN — the blowout case. Snaps are availability;
        # carries and targets are intent, and only intent should count.
        rows.append(_week(snaps_only, team, week,
                          snap=0.80 if recent else 0.50, opp=0.10 if recent else 0.30,
                          carries=18 if recent else 20, yards=95 if recent else 100))

        # Lost the job: was a genuine starter, now barely plays.
        rows.append(_week(faller, team, week,
                          snap=0.30 if recent else 0.72, opp=0.09 if recent else 0.40,
                          carries=3 if recent else 21, yards=12 if recent else 105))
    db.add_all(rows)
    db.flush()
    return {"riser": riser, "scrub": scrub, "snaps_only": snaps_only, "faller": faller}


def _names(body: dict) -> list[str]:
    return [row["name"] for row in body["data"]]


def test_a_real_riser_is_surfaced(client: TestClient, backfield: dict):
    body = client.get(TRENDING, params={"season": SEASON, "direction": "up"}).json()

    assert "Real Riser" in _names(body)


def test_a_riser_below_the_fantasy_floor_is_excluded(client: TestClient, backfield: dict):
    """The bug this board shipped with: the biggest mover nobody can start.

    Garbage Timer's snap share goes 0.05 -> 0.70, comfortably the largest swing in the
    fixture. He is excluded because he still scores nothing, which is the whole point
    of the floor.
    """
    body = client.get(TRENDING, params={"season": SEASON, "direction": "up"}).json()

    assert "Garbage Timer" not in _names(body)


def test_rising_snaps_alone_do_not_qualify(client: TestClient, backfield: dict):
    """Snaps up but opportunity down is a blowout, not a promotion."""
    body = client.get(TRENDING, params={"season": SEASON, "direction": "up"}).json()

    assert "Snaps Only" not in _names(body)


def test_a_real_faller_is_surfaced(client: TestClient, backfield: dict):
    body = client.get(TRENDING, params={"season": SEASON, "direction": "down"}).json()

    assert "Real Faller" in _names(body)


def test_a_faller_who_never_mattered_is_excluded(client: TestClient, backfield: dict):
    """The mirror floor: losing work you never had is not news."""
    body = client.get(TRENDING, params={"season": SEASON, "direction": "down"}).json()

    assert "Garbage Timer" not in _names(body)


def test_the_window_is_anchored_to_the_last_week_with_data(
    client: TestClient, backfield: dict
):
    """"Last three weeks" means the last three *played*, not weeks 16-18 of a calendar."""
    body = client.get(TRENDING, params={"season": SEASON, "direction": "up"}).json()

    context = body["context"]
    assert (context["recent_from"], context["recent_to"]) == (RECENT_FROM, LAST_WEEK)
    assert (context["prior_from"], context["prior_to"]) == (1, RECENT_FROM - 1)


def test_movement_is_reported_as_before_and_after(client: TestClient, backfield: dict):
    """Every row carries both sides, so a caption can say what changed rather than
    quoting a delta the reader has to take on trust."""
    body = client.get(TRENDING, params={"season": SEASON, "direction": "up"}).json()
    row = next(row for row in body["data"] if row["name"] == "Real Riser")

    assert row["usage"]["snap_share"]["prior"] == pytest.approx(0.45, abs=1e-3)
    assert row["usage"]["snap_share"]["recent"] == pytest.approx(0.75, abs=1e-3)
    assert row["usage_delta"]["snap_share"] == pytest.approx(0.30, abs=1e-3)
    assert row["fantasy_ppg"]["recent"] > row["fantasy_ppg"]["prior"]


def test_points_follow_the_caller_s_scoring(client: TestClient, backfield: dict):
    """A PPR reception is worth a point; a standard one is not. The board must not
    quote everybody the same league's numbers."""
    ppr = client.get(TRENDING, params={"season": SEASON, "direction": "up", "scoring": "ppr"}).json()
    std = client.get(TRENDING, params={"season": SEASON, "direction": "up", "scoring": "std"}).json()

    ppr_row = next(row for row in ppr["data"] if row["name"] == "Real Riser")
    std_row = next(row for row in std["data"] if row["name"] == "Real Riser")
    assert ppr_row["fantasy_ppg"]["recent"] > std_row["fantasy_ppg"]["recent"]


def test_an_unknown_direction_is_rejected(client: TestClient):
    assert client.get(TRENDING, params={"direction": "sideways"}).status_code == 400


def test_quarterbacks_are_out_of_scope(client: TestClient):
    """A starter plays every snap, so the signal this board is built on does not
    exist for the position — better a 400 than a silently empty board."""
    assert client.get(TRENDING, params={"position": "QB"}).status_code == 400
