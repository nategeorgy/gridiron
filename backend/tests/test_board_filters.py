"""Stat filters and rank pools on ``/stats/intelligence`` (November 2026).

The player leaderboard's Filter button sends ``where=metric:min:max`` and the board shows
only the players inside every range. Pinned here: the filter narrows the rows and the
total, it never moves a percentile (the pool is the whole position, as with the team and
watchlist filters), a malformed filter is a 400 rather than a silently unfiltered board,
and a rank comes with the size of the pool it is out of.
"""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Game, Player, PlayerStats, Team
from app.percentiles import PercentileIndex

SEASON = 2025
BOARD = "/api/v1/stats/intelligence"

# Weekly receiving yards for four receivers who all play every week, so all qualify.
YARDS = {"a": 100, "b": 70, "c": 40, "d": 10}


@pytest.fixture
def receivers(db: Session, team: Team) -> dict:
    opponent = Team(name="Denver Broncos", abbreviation="DEN", conference="AFC", division="AFC West")
    db.add(opponent)
    db.flush()
    for week in (1, 2, 3):
        db.add(Game(
            game_id=f"{SEASON}_{week:02d}_FILT", season=SEASON, week=week, season_type="REG",
            home_team_id=team.team_id, away_team_id=opponent.team_id,
            home_score=24, away_score=17, game_date=date(SEASON, 9, 7 * week),
        ))
    players = {
        key: Player(player_id=f"00-00009{index:02d}", name=f"Receiver {key.upper()}", position="WR",
                    team_id=team.team_id, status="ACT")
        for index, key in enumerate(YARDS)
    }
    db.add_all(players.values())
    db.flush()
    for key, yards in YARDS.items():
        for week in (1, 2, 3):
            # fantasy_points_std has to be set: compute_points starts from it (CLAUDE.md).
            db.add(PlayerStats(
                player_id=players[key].player_id, game_id=f"{SEASON}_{week:02d}_FILT",
                team_id=team.team_id, season=SEASON, week=week, season_type="REG",
                receptions=yards // 10, targets=yards // 10 + 2, receiving_yards=yards,
                receiving_tds=0, fantasy_points_std=round(yards * 0.1, 2),
            ))
    db.flush()
    return players


def _board(client: TestClient, **params) -> dict:
    response = client.get(BOARD, params={
        "season": SEASON, "positions": "WR", "metric": "receiving_yards",
        "percentiles": "receiving_yards", "ranks": "receiving_yards", **params,
    })
    assert response.status_code == 200, response.text
    return response.json()


def test_a_filter_narrows_the_rows_and_the_total(client: TestClient, receivers: dict) -> None:
    body = _board(client, where="receiving_yards:150:")
    assert [row["name"] for row in body["data"]] == ["Receiver A", "Receiver B"]
    assert body["total"] == 2
    assert body["where"] == [{"metric": "receiving_yards", "min": 150.0, "max": None}]


def test_between_keeps_both_bounds(client: TestClient, receivers: dict) -> None:
    body = _board(client, where="receiving_yards:100:250")
    assert [row["name"] for row in body["data"]] == ["Receiver B", "Receiver C"]


def test_games_played_is_a_filter_too(client: TestClient, receivers: dict) -> None:
    """Games is the Filter's first stat and not a registry metric, so it is allowed by name."""
    assert _board(client, where="games_played:3:")["total"] == 4
    assert _board(client, where="games_played:4:")["total"] == 0


def test_a_filter_never_moves_a_percentile_or_a_rank(client: TestClient, receivers: dict) -> None:
    whole = {row["name"]: row for row in _board(client)["data"]}
    narrowed = {row["name"]: row for row in _board(client, where="receiving_yards::150")["data"]}
    assert set(narrowed) == {"Receiver C", "Receiver D"}
    for name, row in narrowed.items():
        assert row["percentiles"] == whole[name]["percentiles"]
        assert row["ranks"] == whole[name]["ranks"]


def test_low_to_high(client: TestClient, receivers: dict) -> None:
    body = _board(client, order="asc")
    assert [row["name"] for row in body["data"]] == ["Receiver D", "Receiver C", "Receiver B", "Receiver A"]


@pytest.mark.parametrize("where", ["nonsense_stat:1:", "receiving_yards:abc:", "receiving_yards:300:100"])
def test_a_malformed_filter_is_refused(client: TestClient, receivers: dict, where: str) -> None:
    response = client.get(BOARD, params={"season": SEASON, "positions": "WR", "metric": "receiving_yards",
                                         "where": where})
    assert response.status_code == 400


def test_a_rank_says_what_it_is_out_of(client: TestClient, receivers: dict) -> None:
    body = _board(client)
    assert body["percentiles"]["rank_pools"]["WR"]["receiving_yards"] == 4
    assert body["data"][0]["ranks"]["receiving_yards"] == 1


def test_a_metric_pool_counts_only_players_with_the_stat() -> None:
    """A tracking stat missing for part of the pool makes a smaller pool than the
    position's head count, and a rank has to be read against that smaller one."""
    rows = [
        {"player_id": "a", "position": "WR", "games_played": 10, "targets": 50, "ngs_rec_separation": 3.1},
        {"player_id": "b", "position": "WR", "games_played": 10, "targets": 40, "ngs_rec_separation": None},
        {"player_id": "c", "position": "WR", "games_played": 10, "targets": 30, "ngs_rec_separation": 2.4},
    ]
    index = PercentileIndex(rows, ("targets", "ngs_rec_separation"), min_games=3)
    assert index.pool_sizes["WR"] == 3
    assert index.metric_pool_sizes["WR"] == {"targets": 3, "ngs_rec_separation": 2}
