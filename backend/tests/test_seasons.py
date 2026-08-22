"""``GET /seasons`` — which seasons exist, and which one a board should open on.

This endpoint replaced a hardcoded array in the frontend, and the reason it had to is
the distinction it draws: a season appears on the **schedule** months before anyone
plays a game in it. The 2026 fixtures were in the database in August 2026 with no
player line recorded against any of them. Defaulting a board to that season — the
newest one, by every obvious measure — would open the app on an empty table.

So "current" means *the newest season with stats*, and the tests below are mostly
about that gap between a season existing and a season having happened.
"""

from datetime import date

from sqlalchemy.orm import Session

from app.models import Game, PlayerStats

SEASONS = "/api/v1/seasons"


def _game(game_id: str, season: int, week: int, *, played: bool) -> Game:
    """A scheduled game, optionally with a final score."""
    return Game(
        game_id=game_id,
        season=season,
        week=week,
        season_type="REG",
        home_score=24 if played else None,
        away_score=17 if played else None,
        game_date=date(season, 9, 10),
    )


def test_empty_database_returns_no_seasons(client):
    """A database with no games is a supported state, not a 500."""
    body = client.get(SEASONS).json()

    assert body == {"data": [], "total": 0, "current_season": None}


def test_seasons_are_listed_newest_first(client, db: Session):
    db.add_all([
        _game("2024_01_A", 2024, 1, played=True),
        _game("2025_01_A", 2025, 1, played=True),
        _game("2026_01_A", 2026, 1, played=False),
    ])
    db.flush()

    body = client.get(SEASONS).json()

    assert [entry["season"] for entry in body["data"]] == [2026, 2025, 2024]
    assert body["total"] == 3


def test_a_scheduled_season_with_no_stats_is_not_current(client, db: Session, player):
    """The case this endpoint exists for.

    2026 is on the schedule and is the newest season by any obvious measure, but no
    game has been played in it. A board opening there would show an empty table, so
    the current season stays 2025.
    """
    db.add_all([
        _game("2025_01_A", 2025, 1, played=True),
        _game("2026_01_A", 2026, 1, played=False),
    ])
    db.add(PlayerStats(player_id=player.player_id, game_id="2025_01_A", season=2025, week=1))
    db.flush()

    body = client.get(SEASONS).json()

    assert body["current_season"] == 2025
    by_season = {entry["season"]: entry for entry in body["data"]}
    assert by_season[2026]["has_stats"] is False
    assert by_season[2025]["has_stats"] is True


def test_current_season_follows_the_stats_forward(client, db: Session, player):
    """Once the new season has stats, it becomes current with no code change.

    This is the whole point of computing the value: the rollover is a consequence of
    the pipeline running, not of anyone editing a constant.
    """
    db.add_all([
        _game("2025_01_A", 2025, 1, played=True),
        _game("2026_01_A", 2026, 1, played=True),
    ])
    db.add_all([
        PlayerStats(player_id=player.player_id, game_id="2025_01_A", season=2025, week=1),
        PlayerStats(player_id=player.player_id, game_id="2026_01_A", season=2026, week=1),
    ])
    db.flush()

    assert client.get(SEASONS).json()["current_season"] == 2026


def test_completed_games_counts_only_games_with_a_score(client, db: Session):
    """Schedule-shaped surfaces need to tell a fixture from a result."""
    db.add_all([
        _game("2026_01_A", 2026, 1, played=True),
        _game("2026_02_A", 2026, 2, played=False),
        _game("2026_03_A", 2026, 3, played=False),
    ])
    db.flush()

    entry = client.get(SEASONS).json()["data"][0]

    assert entry["games"] == 3
    assert entry["completed_games"] == 1


def test_current_season_falls_back_to_the_schedule_when_nothing_has_stats(client, db: Session):
    """A freshly seeded database — schedule ingested, stats not yet — still answers.

    Returning None here would leave every board with no season to request at all,
    which is a worse failure than naming a season that happens to be empty.
    """
    db.add(_game("2026_01_A", 2026, 1, played=False))
    db.flush()

    assert client.get(SEASONS).json()["current_season"] == 2026
