"""Volume-weighted averages for stored per-game rates.

A stored rate averaged flat lets a five-attempt game count as much as a forty-five
attempt one. That is the same error the composite engine already refuses to make —
CLAUDE.md's "aggregated **first**, then combined — Σyards / Σtargets, never the mean of
per-game ratios" — and CPOE was making it: Drake Maye's 2025 read 12.16 flat against
10.74 attempt-weighted, enough to reorder the board.

`MetricDef.weight_by` fixes it generally. Eight metrics use it. Seven are exact
identities — `rate x weight` recovers the underlying total, so the weighted mean *is*
`Σtotal / Σweight`, which is what CLAUDE.md already demands of composites. `passer_rating`
is the exception and says so in its own description: its per-component clamps make the
true season rating inexpressible as a weighted mean, so attempt-weighting is an
approximation that is merely far better than a flat one.

The second test here is the one that matters most. The denominator counts only games
where the *rate itself* is present, because charted passing starts in 2006 while
attempts reach 1999 — 4,343 quarterback games carry attempts and no CPOE. An unguarded
divisor would swallow those attempts and drag every historical CPOE toward zero.
"""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from sqlalchemy import text

from app.models import Game, Player, PlayerStats, Team

LEADERBOARD = "/api/v1/stats/leaderboard"
SEASON = 2025


@pytest.fixture
def passer(db: Session, team: Team) -> Player:
    quarterback = Player(
        player_id="00-0000900", name="Weighted Passer", position="QB",
        team_id=team.team_id, status="ACT",
    )
    db.add(quarterback)
    db.flush()
    return quarterback


def _games(db: Session, team: Team, weeks: int) -> None:
    opponent = Team(name="Denver Broncos", abbreviation="DEN", conference="AFC", division="AFC West")
    db.add(opponent)
    db.flush()
    db.add_all([
        Game(
            game_id=f"{SEASON}_{week:02d}", season=SEASON, week=week, season_type="REG",
            home_team_id=team.team_id, away_team_id=opponent.team_id,
            home_score=20, away_score=17, game_date=date(2025, 9, 7),
        )
        for week in range(1, weeks + 1)
    ])
    db.flush()


def _line(passer: Player, team: Team, week: int, *, attempts, cpoe) -> PlayerStats:
    return PlayerStats(
        player_id=passer.player_id, game_id=f"{SEASON}_{week:02d}", team_id=team.team_id,
        season=SEASON, week=week, season_type="REG",
        attempts=attempts, completions=attempts, passing_yards=attempts * 7,
        cpoe=cpoe, fantasy_points_std=attempts * 0.28,
    )


def _cpoe(client: TestClient) -> float:
    body = client.get(
        LEADERBOARD,
        params={"season": SEASON, "position": "QB", "metric": "cpoe", "min_games": 1},
    ).json()
    return body["data"][0]["cpoe"]


def test_cpoe_is_weighted_by_attempts(client: TestClient, db: Session, team: Team, passer: Player):
    """One big game at +10 and one tiny game at -10 is not 0.0 CPOE.

    40 attempts at +10 and 4 at -10 is (400 - 40) / 44 = +8.18. A flat mean would
    report 0.0 and describe a quarterback who did not play.
    """
    _games(db, team, 2)
    db.add_all([
        _line(passer, team, 1, attempts=40, cpoe=10.0),
        _line(passer, team, 2, attempts=4, cpoe=-10.0),
    ])
    db.flush()

    assert _cpoe(client) == pytest.approx(8.18, abs=0.01)


def test_games_without_the_rate_are_kept_out_of_the_denominator(
    client: TestClient, db: Session, team: Team, passer: Player
):
    """A game with attempts but no charted CPOE must not dilute the mean.

    This is the historical case, not a hypothetical: CPOE starts in 2006 and attempts
    reach 1999, so thousands of quarterback games carry a weight with no value. Adding
    a 100-attempt game with a null CPOE must leave the answer untouched.
    """
    _games(db, team, 3)
    db.add_all([
        _line(passer, team, 1, attempts=40, cpoe=10.0),
        _line(passer, team, 2, attempts=4, cpoe=-10.0),
        _line(passer, team, 3, attempts=100, cpoe=None),
    ])
    db.flush()

    assert _cpoe(client) == pytest.approx(8.18, abs=0.01)


def test_a_single_game_is_its_own_rate(client: TestClient, db: Session, team: Team, passer: Player):
    """The weighting must not distort the trivial case."""
    _games(db, team, 1)
    db.add(_line(passer, team, 1, attempts=30, cpoe=4.5))
    db.flush()

    assert _cpoe(client) == pytest.approx(4.5, abs=0.01)


def test_a_flat_avg_metric_is_untouched(client: TestClient, db: Session, team: Team, passer: Player):
    """Only metrics that declare `weight_by` change; the rest still average flat.

    Shares are deliberately left alone — "average weekly snap share" is a real and
    commonly quoted definition, and volume-weighting it would silently redefine every
    board built on it.
    """
    _games(db, team, 2)
    lines = [
        _line(passer, team, 1, attempts=40, cpoe=10.0),
        _line(passer, team, 2, attempts=4, cpoe=-10.0),
    ]
    lines[0].snap_share, lines[1].snap_share = 1.0, 0.5
    db.add_all(lines)
    db.flush()

    body = client.get(
        LEADERBOARD,
        params={"season": SEASON, "position": "QB", "metric": "cpoe", "min_games": 1},
    ).json()
    assert body["data"][0]["snap_share"] == pytest.approx(0.75, abs=0.001)


def test_the_registry_declares_the_weight(client: TestClient):
    """The UI reads aggregation behaviour from the registry, so it has to say so."""
    metrics = client.get("/api/v1/metrics").json()
    entries = metrics["data"] if isinstance(metrics, dict) else metrics
    cpoe = next(m for m in entries if m["id"] == "cpoe")

    assert cpoe["aggregation"] == "avg"
    assert "weighted by attempts" in cpoe["description"]


# rate -> (numerator column, weight column). Each is an identity: the stored per-game
# rate times its weight is the underlying total, so the weighted mean must equal
# Σtotal / Σweight exactly. That is the property worth testing — it does not depend on
# any number this fixture happens to choose.
IDENTITIES = {
    "yards_per_target": ("receiving_yards", "targets"),
    "yards_per_reception": ("receiving_yards", "receptions"),
    "yards_per_route_run": ("receiving_yards", "routes_run"),
    "targets_per_route_run": ("targets", "routes_run"),
    "adot": ("air_yards", "targets"),
    "racr": ("receiving_yards", "air_yards"),
}


@pytest.fixture
def receiver(db: Session, team: Team) -> Player:
    player = Player(
        player_id="00-0000901", name="Weighted Receiver", position="WR",
        team_id=team.team_id, status="ACT",
    )
    db.add(player)
    db.flush()
    return player


@pytest.fixture
def lopsided(db: Session, team: Team, receiver: Player) -> None:
    """A huge game and a tiny one, so a flat mean and a weighted mean cannot agree."""
    _games(db, team, 2)
    db.add_all([
        PlayerStats(
            player_id=receiver.player_id, game_id=f"{SEASON}_01", team_id=team.team_id,
            season=SEASON, week=1, season_type="REG",
            targets=14, receptions=11, receiving_yards=176, air_yards=140, routes_run=42,
            yards_per_target=176 / 14, yards_per_reception=176 / 11,
            yards_per_route_run=176 / 42, targets_per_route_run=14 / 42,
            adot=140 / 14, racr=176 / 140, fantasy_points_std=17.6,
        ),
        PlayerStats(
            player_id=receiver.player_id, game_id=f"{SEASON}_02", team_id=team.team_id,
            season=SEASON, week=2, season_type="REG",
            # Routes deliberately 10, not 6: at 6 the targets-per-route rate would be
            # 1/3 in both games, flat and weighted means would agree, and the pair of
            # tests below would pass while proving nothing.
            targets=2, receptions=1, receiving_yards=4, air_yards=18, routes_run=10,
            yards_per_target=4 / 2, yards_per_reception=4 / 1,
            yards_per_route_run=4 / 10, targets_per_route_run=2 / 10,
            adot=18 / 2, racr=4 / 18, fantasy_points_std=0.4,
        ),
    ])
    db.flush()


@pytest.mark.parametrize("metric", sorted(IDENTITIES))
def test_weighted_rate_equals_total_over_total(
    client: TestClient, db: Session, lopsided: None, metric: str
):
    """Each weighted rate is Σnumerator / Σweight, not the mean of two per-game rates."""
    numerator, weight = IDENTITIES[metric]
    rows = db.execute(
        text(
            f"select sum({numerator})::float / nullif(sum({weight}), 0) "
            f"from player_stats where player_id = :p and season = :s"
        ),
        {"p": "00-0000901", "s": SEASON},
    ).scalar()

    body = client.get(
        LEADERBOARD,
        params={"season": SEASON, "position": "WR", "metric": "targets", "min_games": 1},
    ).json()

    assert body["data"][0][metric] == pytest.approx(rows, abs=0.005)


@pytest.mark.parametrize("metric", sorted(IDENTITIES))
def test_the_flat_mean_would_have_been_wrong(
    client: TestClient, db: Session, lopsided: None, metric: str
):
    """Guards the guard: if a flat mean happened to agree, the test above proves nothing."""
    flat = db.execute(
        text(f"select avg({metric}) from player_stats where player_id = :p and season = :s"),
        {"p": "00-0000901", "s": SEASON},
    ).scalar()

    body = client.get(
        LEADERBOARD,
        params={"season": SEASON, "position": "WR", "metric": "targets", "min_games": 1},
    ).json()

    assert body["data"][0][metric] != pytest.approx(float(flat), abs=0.005)
