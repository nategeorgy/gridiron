"""The tabbed player page's endpoints (November 2026).

What is pinned here is each one's definition, the part that would read plausibly while
being wrong:

- **weekly ranks** rank among everyone at the position *that week*, and a lower-is-better
  stat (sacks) ranks the fewest first, with the percentile flipped to match.
- **by quarterback** groups a receiver's games by the quarterback with the most attempts
  that game, never by the quarterback the team employs now.
- **next game** splits each bar into the offense's most-used players at the position by
  season usage, two receivers but one back, and states the defense's own average.
- **career lines** are aggregated first (Σ/Σ), and the rank line is the Nth best
  qualified season.
"""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.career import _pooled
from app.models import Game, GamePlay, Player, PlayerStats, PlayCharting, PlayRoute, PlayTarget, Team


def _line(player_id, game_id, team_id, week, season=2026, **stats) -> PlayerStats:
    """A stat line whose stored standard points agree with its yards and touchdowns.

    ``compute_points`` starts from ``fantasy_points_std`` (CLAUDE.md), so a fixture
    without it would score every line as zero plus receptions.
    """
    std = 0.1 * (stats.get("receiving_yards", 0) + stats.get("rushing_yards", 0)) + 0.04 * stats.get("passing_yards", 0) \
        + 6 * (stats.get("receiving_tds", 0) + stats.get("rushing_tds", 0)) + 4 * stats.get("passing_tds", 0) \
        - 2 * stats.get("interceptions", 0)
    return PlayerStats(player_id=player_id, game_id=game_id, team_id=team_id, season=season, week=week,
                       season_type="REG", fantasy_points_std=round(std, 2), **stats)


@pytest.fixture
def world(db: Session, team: Team, player: Player) -> dict:
    """Kansas City and Denver over two weeks, with a third week to play.

    KC: Mahomes starts Week 1, a backup starts Week 2. Two receivers, one back.
    DEN: two receivers; Sutton is their most-targeted, Mims scores more in Week 1.
    """
    den = Team(name="Denver Broncos", abbreviation="DEN", conference="AFC", division="AFC West")
    db.add(den)
    db.flush()
    kc = team.team_id
    people = [
        Player(player_id="QB-BACKUP", name="Carson Wentz", position="QB", team_id=kc),
        Player(player_id="WR-RICE", name="Rashee Rice", position="WR", team_id=kc),
        Player(player_id="WR-WORTHY", name="Xavier Worthy", position="WR", team_id=kc),
        Player(player_id="RB-PACHECO", name="Isiah Pacheco", position="RB", team_id=kc),
        Player(player_id="WR-SUTTON", name="Courtland Sutton", position="WR", team_id=den.team_id),
        Player(player_id="WR-MIMS", name="Marvin Mims", position="WR", team_id=den.team_id),
        Player(player_id="RB-DOBBINS", name="J.K. Dobbins", position="RB", team_id=den.team_id),
    ]
    db.add_all(people)
    db.add_all([
        Game(game_id="2026_01_DEN_KC", season=2026, week=1, season_type="REG", home_team_id=kc, away_team_id=den.team_id,
             home_score=27, away_score=20, game_date=date(2026, 9, 13), spread_line=6.5, total_line=46.0, roof="outdoors", div_game=True),
        Game(game_id="2026_02_KC_DEN", season=2026, week=2, season_type="REG", home_team_id=den.team_id, away_team_id=kc,
             home_score=24, away_score=10, game_date=date(2026, 9, 20), spread_line=-1.0, total_line=44.0, roof="dome", div_game=True),
        Game(game_id="2026_03_DEN_KC", season=2026, week=3, season_type="REG", home_team_id=kc, away_team_id=den.team_id,
             game_date=date(2026, 9, 27), spread_line=3.0, total_line=45.0),
    ])
    db.flush()
    g1, g2 = "2026_01_DEN_KC", "2026_02_KC_DEN"
    db.add_all([
        _line(player.player_id, g1, kc, 1, attempts=35, completions=24, passing_yards=280, passing_tds=2, sacks_suffered=1, carries=4, rushing_yards=20),
        _line("QB-BACKUP", g1, kc, 1, attempts=2, completions=1, passing_yards=8, sacks_suffered=0),
        _line("QB-BACKUP", g2, kc, 2, attempts=30, completions=18, passing_yards=190, passing_tds=1, sacks_suffered=4),
        _line("WR-RICE", g1, kc, 1, targets=10, receptions=7, receiving_yards=90, receiving_tds=1, routes_run=30, receiving_epa=4.0),
        _line("WR-RICE", g2, kc, 2, targets=6, receptions=4, receiving_yards=40, routes_run=28, receiving_epa=-1.0),
        _line("WR-WORTHY", g1, kc, 1, targets=4, receptions=2, receiving_yards=30, routes_run=25),
        _line("RB-PACHECO", g1, kc, 1, carries=15, rushing_yards=70, targets=2, receptions=2, receiving_yards=10),
        _line("WR-SUTTON", g1, den.team_id, 1, targets=9, receptions=5, receiving_yards=50),
        _line("WR-SUTTON", g2, den.team_id, 2, targets=8, receptions=6, receiving_yards=70),
        _line("WR-MIMS", g1, den.team_id, 1, targets=3, receptions=3, receiving_yards=80, receiving_tds=1),
        _line("RB-DOBBINS", g1, den.team_id, 1, carries=12, rushing_yards=40),
    ])
    db.flush()
    return {"kc": kc, "den": den.team_id, "g1": g1, "g2": g2}


def test_weekly_ranks_rank_the_week_and_flip_lower_is_better(client: TestClient, world, player):
    rice = client.get("/api/v1/players/WR-RICE/weekly-ranks", params={"season": 2026, "stats": "targets,fantasy_points"}).json()
    week1 = rice["weeks"]["1"]["stats"]
    # Week 1's receivers: Rice 10, Sutton 9, Worthy 4, Mims 3.
    assert week1["targets"] == {"v": 10, "rank": 1, "n": 4, "pct": 88}
    sacks = client.get(f"/api/v1/players/{player.player_id}/weekly-ranks", params={"season": 2026, "stats": "sacks_suffered"}).json()
    # Week 1's quarterbacks: Mahomes taken down once, the backup never. Fewer is better.
    cell = sacks["weeks"]["1"]["stats"]["sacks_suffered"]
    assert cell["rank"] == 2 and cell["pct"] == 25


def test_by_quarterback_reads_the_starter_from_attempts(client: TestClient, world, player):
    data = client.get("/api/v1/players/WR-RICE/by-quarterback").json()
    by_qb = {row["name"]: row for row in data["rows"]}
    # The backup threw twice in Week 1, but Mahomes started it.
    assert by_qb["Patrick Mahomes"]["games"] == 1 and by_qb["Patrick Mahomes"]["targets"] == 10
    assert by_qb["Carson Wentz"]["games"] == 1 and by_qb["Carson Wentz"]["targets"] == 6
    # The team's targets come from every stat line in the game, Worthy and the back included.
    assert by_qb["Patrick Mahomes"]["team_targets"] == 16


def test_game_splits_name_the_quarterbacks_only_when_there_were_two(client: TestClient, world):
    data = client.get("/api/v1/players/WR-RICE/splits", params={"season": 2026}).json()["games"]
    groups = {group["title"]: group["rows"] for group in data["groups"]}
    assert [row["label"] for row in groups["Quarterback"]] == ["With Patrick Mahomes", "With Carson Wentz"]
    assert groups["Where"][0]["g"] == 1 and groups["Where"][1]["g"] == 1
    assert groups["Roof"][0]["label"] == "Dome or roof closed" and groups["Roof"][0]["g"] == 1
    sutton = client.get("/api/v1/players/WR-SUTTON/splits", params={"season": 2026}).json()["games"]
    assert "Quarterback" not in {group["title"] for group in sutton["groups"]}


def test_situation_splits_count_his_targets_and_the_teams(client: TestClient, db: Session, world, player):
    kc, g1 = world["kc"], world["g1"]
    db.add_all([
        GamePlay(game_id=g1, play_id=10, season=2026, week=1, season_type="REG", sequence=1, quarter=1, team_id=kc,
                 down=1, distance=10, yardline_100=75, play_type="pass", is_pass=True, passer_id=player.player_id,
                 receiver_id="WR-RICE", complete=True, receiving_yards=12, passing_yards=12, epa=0.8, success=True,
                 home_score=0, away_score=0),
        GamePlay(game_id=g1, play_id=20, season=2026, week=1, season_type="REG", sequence=2, quarter=1, team_id=kc,
                 down=3, distance=2, yardline_100=8, play_type="pass", is_pass=True, passer_id=player.player_id,
                 receiver_id="WR-WORTHY", epa=-0.5, home_score=0, away_score=0),
        PlayCharting(game_id=g1, play_id=10, season=2026, week=1, season_type="REG", play_action=True, qb_location="U", backfield=1),
        PlayCharting(game_id=g1, play_id=20, season=2026, week=1, season_type="REG", play_action=False, qb_location="S", backfield=0),
    ])
    db.flush()
    situations = client.get("/api/v1/players/WR-RICE/splits", params={"season": 2026}).json()["situations"]
    assert situations["charted"] is True
    groups = {group["title"]: {row["label"]: row for row in group["rows"]} for group in situations["groups"]}
    assert groups["Down and distance"]["1st down"]["n"] == 1
    third = groups["Down and distance"]["3rd or 4th and short (1-3)"]
    assert third["n"] == 0 and third["team"] == 1  # Worthy's target counts toward the share
    assert groups["Play type"]["Play action"]["n"] == 1
    assert groups["Formation"]["Empty backfield"]["team"] == 1
    # 1 PPR point for the catch and 1.2 for twelve yards.
    assert situations["overall"]["pts"] == pytest.approx(2.2)


def test_next_game_splits_each_bar_into_the_most_used_receivers(client: TestClient, world):
    data = client.get("/api/v1/players/WR-RICE/next-game").json()
    assert data["game"]["game_id"] == "2026_03_DEN_KC" and data["is_home"] is True
    allows = data["allows"]
    week1 = next(game for game in allows["games"] if game["week"] == 1)
    # Denver's defense in Week 1 faced Kansas City: Rice and Worthy are KC's two most-targeted.
    assert [p["name"] for p in week1["prominent"]] == ["Rashee Rice", "Xavier Worthy"]
    # Every KC receiver that day in PPR: Rice 7 + 9.0 + 6, Worthy 2 + 3.0.
    assert week1["total"] == pytest.approx(27.0)
    assert allows["average"] == pytest.approx((27.0 + 8.0) / 2)
    back = client.get("/api/v1/players/RB-DOBBINS/next-game").json()["allows"]
    assert all(len(game["prominent"]) <= 1 for game in back["games"])


def test_career_lines_are_pooled_not_averaged():
    rows = [
        {"games_played": 1, "fantasy_points": 30.0, "receiving_yards": 100, "routes_run": 20, "yards_per_route_run": 5.0},
        {"games_played": 10, "fantasy_points": 100.0, "receiving_yards": 300, "routes_run": 300, "yards_per_route_run": 1.0},
    ]
    # Σpoints / Σgames, not the mean of 30 and 10.
    assert _pooled(rows, "fantasy_ppg") == pytest.approx(130 / 11)
    # Yards per route run is weighted by routes: Σ(rate x routes) / Σroutes = 400 / 320.
    assert _pooled(rows, "yards_per_route_run") == pytest.approx(400 / 320)


def test_search_index_and_week_leaders(client: TestClient, world):
    index = client.get("/api/v1/players/index").json()
    at = {field: i for i, field in enumerate(index["fields"])}
    rows = {row[at["player_id"]]: row for row in index["players"]}
    assert rows["WR-RICE"][at["games"]] == 2 and rows["WR-RICE"][at["team"]] == "KC"
    leaders = client.get("/api/v1/stats/week-leaders", params={"season": 2026, "week": 1}).json()["leaders"]
    receivers = [row["name"] for row in leaders["WR"]]
    # Rice 7 rec + 9.0 yds + 6 TD = 22.0 PPR, Mims 3 + 8.0 + 6 = 17.0.
    assert receivers[:2] == ["Rashee Rice", "Marvin Mims"]
    assert leaders["WR"][0]["team_score"] == 27 and leaders["WR"][0]["opponent"] == "DEN"


def test_route_tree_folds_routes_and_names_its_season(client: TestClient, db: Session, world, player):
    g1, kc = world["g1"], world["kc"]
    db.add_all([
        PlayTarget(game_id=g1, play_id=10, season=2026, week=1, season_type="REG", team_id=kc, passer_id=player.player_id,
                   receiver_id="WR-RICE", complete=True, yards=12, epa=0.8, air_yards=8),
        PlayTarget(game_id=g1, play_id=20, season=2026, week=1, season_type="REG", team_id=kc, passer_id=player.player_id,
                   receiver_id="WR-RICE", complete=False, yards=0, epa=-0.4, air_yards=20),
        PlayRoute(game_id=g1, play_id=10, season=2026, week=1, season_type="REG", route="SLANT"),
        PlayRoute(game_id=g1, play_id=20, season=2026, week=1, season_type="REG", route="GO"),
    ])
    db.flush()
    data = client.get("/api/v1/players/WR-RICE/routes").json()
    assert data["season"] == 2026 and data["seasons"] == [2026]
    assert {route["route"]: route["n"] for route in data["routes"]} == {"SLANT": 1, "GO": 1}
    passer = client.get(f"/api/v1/players/{player.player_id}/routes", params={"role": "passer"}).json()
    assert passer["charted"] == 2
