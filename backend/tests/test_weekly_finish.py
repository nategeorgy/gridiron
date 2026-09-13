"""Weekly positional finish on the game log (M13).

"WR3 that week" is a claim about everyone else, so it fails silently in ways a single
player's numbers never reveal. Pinned here: ties share a place and the next one skips,
the pool is the player's own position only, and the finish is re-ranked in the caller's
scoring rather than merely rescaled — a possession receiver and a deep threat swap places
between PPR and standard, which a fixed-PPR rank could never show.
"""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Game, Player, PlayerStats, Team

SEASON = 2025
GAME = f"{SEASON}_01_TEST"


def _line(player: Player, team: Team, *, receptions: int, yards: int) -> PlayerStats:
    """A receiving line with its standard points.

    ``fantasy_points_std`` is required: ``compute_points`` and ``points_expr`` both start
    from it and add only the difference between the caller's weights and standard, so a
    fixture without it ranks everyone on receptions alone.
    """
    return PlayerStats(
        player_id=player.player_id, game_id=GAME, team_id=team.team_id,
        season=SEASON, week=1, season_type="REG",
        receptions=receptions, targets=receptions + 2, receiving_yards=yards,
        fantasy_points_std=round(yards * 0.1, 2),
    )


@pytest.fixture
def week_one(db: Session, team: Team) -> dict[str, Player]:
    opponent = Team(name="Denver Broncos", abbreviation="DEN", conference="AFC", division="AFC West")
    db.add(opponent)
    db.flush()
    db.add(Game(
        game_id=GAME, season=SEASON, week=1, season_type="REG",
        home_team_id=team.team_id, away_team_id=opponent.team_id,
        home_score=24, away_score=17, game_date=date(2025, 9, 7),
    ))
    db.flush()

    def make(player_id: str, name: str, position: str) -> Player:
        player = Player(player_id=player_id, name=name, position=position,
                        team_id=team.team_id, status="ACT")
        db.add(player)
        db.flush()
        return player

    players = {
        # PPR 15.0, standard 5.0 — catches a lot, gains little.
        "possession": make("00-0000011", "Possession Receiver", "WR"),
        # PPR 10.0, standard 9.0 — and tied exactly with the next one.
        "deep": make("00-0000012", "Deep Threat", "WR"),
        "deep_twin": make("00-0000013", "Deep Twin", "WR"),
        # 30 points — would be WR1 by a mile if positions leaked into one pool.
        "tight_end": make("00-0000014", "Big Tight End", "TE"),
    }
    db.add_all([
        _line(players["possession"], team, receptions=10, yards=50),
        _line(players["deep"], team, receptions=1, yards=90),
        _line(players["deep_twin"], team, receptions=1, yards=90),
        _line(players["tight_end"], team, receptions=10, yards=200),
    ])
    db.flush()
    return players


def _finish(client: TestClient, player: Player, scoring: str) -> tuple[int, int]:
    response = client.get(f"/api/v1/players/{player.player_id}/stats",
                          params={"scoring": scoring, "season": SEASON})
    assert response.status_code == 200
    line = response.json()["data"][0]
    return line["position_rank"], line["pool_size"]


def test_the_most_points_that_week_finishes_first(client: TestClient, week_one: dict) -> None:
    assert _finish(client, week_one["possession"], "ppr") == (1, 3)


def test_ties_share_a_place_and_the_next_one_skips(client: TestClient, week_one: dict) -> None:
    # Standard scoring: the two deep threats tie at 9.0 and share WR1...
    assert _finish(client, week_one["deep"], "std") == (1, 3)
    assert _finish(client, week_one["deep_twin"], "std") == (1, 3)
    # ...so the possession receiver is WR3, not WR2.
    assert _finish(client, week_one["possession"], "std") == (3, 3)


def test_the_finish_is_re_ranked_in_the_callers_scoring(client: TestClient, week_one: dict) -> None:
    """Not rescaled: the order itself changes when receptions stop scoring."""
    assert _finish(client, week_one["possession"], "ppr")[0] == 1
    assert _finish(client, week_one["possession"], "std")[0] == 3


def test_the_pool_is_the_players_own_position(client: TestClient, week_one: dict) -> None:
    # The tight end outscored every receiver, yet no receiver drops a place for it and the
    # receiver pool is three players, not four.
    assert _finish(client, week_one["possession"], "ppr") == (1, 3)
    assert _finish(client, week_one["tight_end"], "ppr") == (1, 1)
