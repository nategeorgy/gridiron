"""The Explore endpoints: passing networks, target maps, run lanes and the Query Builder.

What is pinned here is what fails silently. A network that drops a target to a player we
do not track still renders, with every share quietly wrong. A season built from the mean
of weekly rates instead of Σ/Σ still prints a plausible number. A weekly finish computed
twice (once in the game log, once in the Query Builder) can drift without either page
looking broken. And a search sorted by a column it does not show looks like a bug report.
"""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Game, Player, PlayerRunLane, PlayerStats, PlayTarget, Team
from app.query_builder import POSITIONS, Frame, score_frame
from app.scoring import compute_points, parse_scoring

SEASON = 2025
WEEK_ONE, WEEK_TWO, LAST_YEAR = f"{SEASON}_01_KC_DEN", f"{SEASON}_02_KC_DEN", f"{SEASON - 1}_01_KC_DEN"
UNTRACKED = "00-0099999"  # a fullback: targeted, but not in `players`


@pytest.fixture
def league(db: Session) -> dict:
    home = Team(name="Kansas City Chiefs", abbreviation="KC", conference="AFC", division="AFC West")
    away = Team(name="Denver Broncos", abbreviation="DEN", conference="AFC", division="AFC West")
    db.add_all([home, away])
    db.flush()
    for game_id, season, week in ((WEEK_ONE, SEASON, 1), (WEEK_TWO, SEASON, 2), (LAST_YEAR, SEASON - 1, 1)):
        db.add(Game(game_id=game_id, season=season, week=week, season_type="REG", home_team_id=home.team_id,
                    away_team_id=away.team_id, home_score=27, away_score=20, game_date=date(season, 9, 7 * week)))
    db.flush()

    def make(player_id: str, name: str, position: str, rookie_season: int = 2018) -> Player:
        player = Player(player_id=player_id, name=name, position=position, team_id=home.team_id, status="ACT",
                        rookie_season=rookie_season)
        db.add(player)
        return player

    people = {
        "qb": make("00-0000001", "Quarterback One", "QB"),
        "wr": make("00-0000002", "Receiver One", "WR"),
        "rookie": make("00-0000003", "Rookie Receiver", "WR", rookie_season=SEASON),
        "te": make("00-0000004", "Tight End One", "TE"),
        "rb": make("00-0000005", "Back One", "RB"),
        "den_wr": make("00-0000006", "Bronco Receiver", "WR"),
    }
    db.flush()
    return {"home": home, "away": away, **people}


def _target(game_id: str, play_id: int, week: int, team: Team, passer: Player, receiver_id: str, *,
            air: int | None, side: str | None, complete: bool = False, yards: int = 0, touchdown: bool = False,
            interception: bool = False, epa: float = 0.0, down: int = 1, yardline: int = 60,
            season: int = SEASON) -> PlayTarget:
    return PlayTarget(
        game_id=game_id, play_id=play_id, season=season, week=week, season_type="REG", team_id=team.team_id,
        passer_id=passer.player_id, receiver_id=receiver_id, air_yards=air, location=side, complete=complete,
        touchdown=touchdown, interception=interception, first_down=False, yards=yards,
        yards_after_catch=None, epa=epa, down=down, yardline_100=yardline,
    )


@pytest.fixture
def targets(db: Session, league: dict) -> dict:
    qb, kc = league["qb"], league["home"]
    wr, te = league["wr"].player_id, league["te"].player_id
    db.add_all([
        # Receiver One: one target at every depth, one red-zone target on third down.
        _target(WEEK_ONE, 1, 1, kc, qb, wr, air=-2, side="middle", complete=True, yards=6, epa=0.2),
        _target(WEEK_ONE, 2, 1, kc, qb, wr, air=5, side="left", complete=True, yards=9, epa=0.5),
        _target(WEEK_ONE, 3, 1, kc, qb, wr, air=25, side="right", complete=True, yards=31, touchdown=True, epa=3.0),
        _target(WEEK_TWO, 4, 2, kc, qb, wr, air=15, side="middle", complete=True, yards=15, epa=1.1),
        _target(WEEK_TWO, 5, 2, kc, qb, wr, air=12, side="right", epa=-0.8, down=3, yardline=15),
        # Tight End One: one short target, and one play-by-play charted without a depth.
        _target(WEEK_ONE, 6, 1, kc, qb, te, air=8, side="middle", complete=True, yards=8, epa=0.3),
        _target(WEEK_TWO, 7, 2, kc, qb, te, air=None, side=None, complete=True, yards=4, epa=0.1),
        # The fullback nobody tracks.
        _target(WEEK_ONE, 8, 1, kc, qb, UNTRACKED, air=1, side="left", interception=True, epa=-2.5),
    ])
    db.flush()
    return league


# --- passing network -----------------------------------------------------------------------

def _network(client: TestClient, league: dict, **params) -> dict:
    response = client.get("/api/v1/explore/network",
                          params={"passer_id": league["qb"].player_id, "season": SEASON, **params})
    assert response.status_code == 200, response.text
    return response.json()


def test_every_target_counts_including_one_to_a_player_we_do_not_track(client: TestClient, targets: dict) -> None:
    network = _network(client, targets)
    assert network["totals"]["targets"] == 8
    by_name = {receiver["name"]: receiver for receiver in network["receivers"]}
    assert by_name["Receiver One"]["targets"] == 5
    assert by_name["Tight End One"]["targets"] == 2
    # Kept, unnamed, so the client can fold it into "others" without skewing the shares.
    unnamed = by_name[None]
    assert unnamed["targets"] == 1 and unnamed["player_id"] is None and unnamed["interceptions"] == 1


def test_depth_and_side_buckets(client: TestClient, targets: dict) -> None:
    receiver = next(r for r in _network(client, targets)["receivers"] if r["name"] == "Receiver One")
    assert receiver["depth"] == [1, 1, 2, 1]  # behind, short (0-9), intermediate (10-19), deep (20+)
    assert receiver["locations"] == [1, 2, 2]  # left, middle, right
    # zones are depth * 3 + side: the deep target went right, the short one left
    assert receiver["zones"][3 * 3 + 2] == 1 and receiver["zones"][1 * 3 + 0] == 1
    assert receiver["adot"] == round((-2 + 5 + 25 + 15 + 12) / 5, 2)


def test_a_target_with_no_depth_still_counts_as_a_target(client: TestClient, targets: dict) -> None:
    tight_end = next(r for r in _network(client, targets)["receivers"] if r["name"] == "Tight End One")
    assert tight_end["targets"] == 2 and tight_end["receptions"] == 2 and tight_end["yards"] == 12
    assert sum(tight_end["depth"]) == 1  # only the charted one can be placed
    assert tight_end["adot"] == 8.0


def test_situation_and_weeks_narrow_the_plays(client: TestClient, targets: dict) -> None:
    red_zone = _network(client, targets, situation="red_zone")
    assert red_zone["totals"]["targets"] == 1
    late = _network(client, targets, situation="late_downs")
    assert late["totals"]["targets"] == 1
    week_two = _network(client, targets, weeks="2")
    assert week_two["totals"]["targets"] == 3


def test_network_rejects_what_it_cannot_answer(client: TestClient, targets: dict) -> None:
    assert client.get("/api/v1/explore/network", params={"passer_id": "nobody", "season": SEASON}).status_code == 404
    assert client.get("/api/v1/explore/network", params={"passer_id": targets["qb"].player_id, "season": SEASON,
                                                         "situation": "goal_line"}).status_code == 422
    assert client.get("/api/v1/explore/network", params={"passer_id": targets["qb"].player_id, "season": SEASON,
                                                         "weeks": "1,40"}).status_code == 400


# --- target analysis ---------------------------------------------------------------------

def test_board_filters_narrow_the_list_but_never_the_average(client: TestClient, targets: dict) -> None:
    everyone = client.get("/api/v1/explore/targets", params={"season": SEASON, "positions": "WR,TE"}).json()
    busy = client.get("/api/v1/explore/targets",
                      params={"season": SEASON, "positions": "WR,TE", "min_targets": 3}).json()
    assert {player["name"] for player in everyone["players"]} == {"Receiver One", "Tight End One"}
    assert [player["name"] for player in busy["players"]] == ["Receiver One"]
    # The tight-end average is every tight-end target, whatever the minimum.
    assert busy["averages"]["TE"] == everyone["averages"]["TE"]
    assert busy["averages"]["TE"]["targets"] == 2


def test_board_histogram_is_one_yard_bins(client: TestClient, targets: dict) -> None:
    board = client.get("/api/v1/explore/targets", params={"season": SEASON, "positions": "WR"}).json()
    receiver = board["players"][0]
    assert sum(receiver["hist"]) == 5
    assert receiver["hist"][25 - (-10)] == 1  # the 25-yard target, in the bin for 25


def test_player_targets_by_role(client: TestClient, targets: dict) -> None:
    drawn = client.get(f"/api/v1/explore/players/{targets['wr'].player_id}/targets", params={"season": SEASON}).json()
    assert len(drawn["targets"]) == 5 and drawn["average"]["position"] == "WR"
    thrown = client.get(f"/api/v1/explore/players/{targets['qb'].player_id}/targets",
                        params={"season": SEASON, "role": "passer"}).json()
    assert len(thrown["targets"]) == 8 and thrown["summary"]["targets"] == 8
    assert thrown["average"]["position"] is None  # a passer is set against every target


def test_team_targets(client: TestClient, targets: dict) -> None:
    team = client.get(f"/api/v1/explore/teams/{targets['home'].team_id}/targets", params={"season": SEASON}).json()
    assert team["summary"]["targets"] == 8 and team["team"]["abbreviation"] == "KC"
    assert client.get("/api/v1/explore/teams/99999/targets", params={"season": SEASON}).status_code == 404


# --- run lanes -----------------------------------------------------------------------------

def test_run_lanes_and_how_each_carry_ended(client: TestClient, db: Session, league: dict) -> None:
    back = league["rb"].player_id
    db.add_all([
        PlayerRunLane(player_id=back, game_id=WEEK_ONE, lane="le", season=SEASON, week=1, season_type="REG",
                      carries=4, yards=30, successes=2, first_downs=1, touchdowns=0,
                      stuffed=1, short=1, medium=1, explosive=1),
        PlayerRunLane(player_id=back, game_id=WEEK_ONE, lane="unknown", season=SEASON, week=1, season_type="REG",
                      carries=1, yards=2, successes=0, first_downs=0, touchdowns=0,
                      stuffed=0, short=1, medium=0, explosive=0),
    ])
    db.flush()
    runs = client.get(f"/api/v1/explore/players/{back}/runs", params={"season": SEASON}).json()
    assert runs["carries"] == 5 and runs["yards"] == 32
    assert [lane["lane"] for lane in runs["lanes"]] == ["le", "lt", "lg", "mid", "rg", "rt", "re"]
    assert runs["lanes"][0]["carries"] == 4
    assert runs["outcomes"] == {"stuffed": 1, "short": 2, "medium": 1, "explosive": 1}
    assert runs["average"]["carries"] == 5  # the only back in the league


# --- query builder -----------------------------------------------------------------------

def _line(player: Player, game_id: str, week: int, *, season: int = SEASON, team: Team, **stats) -> PlayerStats:
    receptions, yards = stats.get("receptions", 0), stats.get("receiving_yards", 0)
    stats.setdefault("fantasy_points_std", round(yards * 0.1 + stats.get("receiving_tds", 0) * 6, 2))
    return PlayerStats(player_id=player.player_id, game_id=game_id, team_id=team.team_id, season=season,
                       week=week, season_type="REG", receptions=receptions, receiving_yards=yards, **{
                           key: value for key, value in stats.items() if key not in ("receptions", "receiving_yards")})


@pytest.fixture
def lines(db: Session, league: dict) -> dict:
    kc, den = league["home"], league["away"]
    db.add_all([
        # Receiver One: a 10-target game at 10 yards a target, and a 2-target game at 20.
        _line(league["wr"], WEEK_ONE, 1, team=kc, targets=10, receptions=8, receiving_yards=100, target_share=0.30,
              routes_run=30),
        _line(league["wr"], WEEK_TWO, 2, team=kc, targets=2, receptions=2, receiving_yards=40, target_share=0.10),
        _line(league["wr"], LAST_YEAR, 1, season=SEASON - 1, team=kc, targets=11, receptions=5, receiving_yards=60,
              target_share=0.28),
        # A rookie who ties Receiver One's week-two standard points exactly.
        _line(league["rookie"], WEEK_TWO, 2, team=kc, targets=6, receptions=2, receiving_yards=40,
              target_share=0.20),
        # The Denver receiver, in the same games from the other side.
        _line(league["den_wr"], WEEK_ONE, 1, team=den, targets=12, receptions=9, receiving_yards=150,
              receiving_tds=1, target_share=0.40),
        # A tight end with a monster game: never in the receivers' weekly pool.
        _line(league["te"], WEEK_ONE, 1, team=kc, targets=14, receptions=12, receiving_yards=200, target_share=0.4),
    ])
    db.flush()
    return league


def _query(client: TestClient, **params) -> dict:
    response = client.get("/api/v1/explore/query", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def test_a_game_search(client: TestClient, lines: dict) -> None:
    result = _query(client, positions="WR", where="targets:10:")
    assert result["total"] == 3 and result["players"] == 2
    assert result["sort"] == "targets" and result["order"] == "desc"
    assert [row["targets"] for row in result["rows"]] == [12, 11, 10]
    first = result["rows"][0]
    assert first["name"] == "Bronco Receiver" and first["opponent"] == "KC" and first["home"] is False
    assert first["result"] == "L" and first["team_score"] == 20


def test_the_weekly_finish_matches_the_game_log(client: TestClient, lines: dict) -> None:
    """One definition of a weekly finish, computed in two places, must agree everywhere."""
    for scoring in ("ppr", "std", "half"):
        rows = _query(client, positions="WR,TE", season_type="ALL", scoring=scoring, limit=50)["rows"]
        assert rows
        for row in rows:
            log = client.get(f"/api/v1/players/{row['player_id']}/stats",
                             params={"scoring": scoring, "season": row["season"]}).json()["data"]
            game = next(line for line in log if line["week"] == row["week"])
            assert row["weekly_finish"] == game["position_rank"], (scoring, row["name"], row["week"])
            assert row["fantasy_points"] == pytest.approx(game["fantasy_points"], abs=1e-3)


def test_ties_share_a_finish(client: TestClient, lines: dict) -> None:
    rows = _query(client, positions="WR", where="weekly_finish::5", scoring="std",
                  first_season=SEASON, last_season=SEASON)["rows"]
    week_two = sorted((row["name"], row["weekly_finish"]) for row in rows if row["week"] == 2)
    assert week_two == [("Receiver One", 1), ("Rookie Receiver", 1)]


def test_a_season_is_summed_before_it_is_divided(client: TestClient, lines: dict) -> None:
    result = _query(client, grain="seasons", positions="WR", first_season=SEASON, last_season=SEASON,
                    where="yards_per_target::,target_share::")
    receiver = next(row for row in result["rows"] if row["name"] == "Receiver One")
    assert receiver["games"] == 2
    assert receiver["yards_per_target"] == pytest.approx(140 / 12, abs=1e-3)  # not the mean of 10 and 20
    assert receiver["target_share"] == pytest.approx(0.20, abs=1e-4)  # a share is the flat weekly mean


def test_a_season_range_filters_the_season_not_its_games(client: TestClient, lines: dict) -> None:
    result = _query(client, grain="seasons", positions="WR", where="targets:12:")
    assert {(row["name"], row["season"]) for row in result["rows"]} == {
        ("Receiver One", SEASON), ("Bronco Receiver", SEASON)}


def test_last_week_cuts_every_season_at_the_same_week(client: TestClient, lines: dict) -> None:
    """The home page's Record Book compares a season's first N weeks with every other year's."""
    result = _query(client, grain="seasons", positions="WR", last_week=1, where="targets::")
    receiver = {row["season"]: row for row in result["rows"] if row["name"] == "Receiver One"}
    assert receiver[SEASON]["games"] == 1 and receiver[SEASON]["targets"] == 10  # week 2's two targets are cut
    assert receiver[SEASON - 1]["targets"] == 11  # last season's week 1 is still in
    assert result["last_week"] == 1
    games = _query(client, positions="WR", last_week=1, where="targets::")
    assert {row["week"] for row in games["rows"]} == {1}


def test_count_of_games_by_player(client: TestClient, lines: dict) -> None:
    result = _query(client, positions="WR", where="receiving_yards:40:", mode="count")
    receiver = next(row for row in result["rows"] if row["name"] == "Receiver One")
    assert receiver["matches"] == 3 and receiver["games"] == 3 and receiver["rate"] == 1.0
    assert receiver["best"]["week"] == 1 and receiver["best"]["season"] == SEASON
    assert result["sort"] == "matches"
    assert [column["key"] for column in result["columns"]] == ["matches", "games", "rate", "avg_points"]


def test_sorting_is_only_by_what_the_table_shows(client: TestClient, lines: dict) -> None:
    result = _query(client, positions="WR", where="targets:10:", sort="receptions")
    shown = [column["key"] for column in result["columns"]]
    assert "receptions" not in shown and result["sort"] == "targets"
    by_points = _query(client, positions="WR", where="targets:10:", sort="fantasy_points", order="asc")
    assert by_points["sort"] == "fantasy_points" and by_points["order"] == "asc"
    points = [row["fantasy_points"] for row in by_points["rows"]]
    assert points == sorted(points)


def test_a_missing_value_never_matches_a_range(client: TestClient, lines: dict) -> None:
    result = _query(client, positions="WR", where="routes_run:0:")
    assert result["total"] == 1  # only the one line with routes charted


def test_rookies(client: TestClient, lines: dict) -> None:
    rookies = _query(client, positions="WR", rookies="only")
    assert {row["name"] for row in rookies["rows"]} == {"Rookie Receiver"}
    veterans = _query(client, positions="WR", rookies="exclude")
    assert "Rookie Receiver" not in {row["name"] for row in veterans["rows"]}


def test_histograms_show_the_scope_before_the_range(client: TestClient, lines: dict) -> None:
    result = _query(client, positions="WR", where="targets:10:")
    histogram = result["histograms"]["targets"]
    assert histogram["total"] == 5 and histogram["in_range"] == 3
    assert sum(histogram["counts"]) == 5


def test_bad_searches_are_400s(client: TestClient, lines: dict) -> None:
    for where in ("nonsense:1:", "targets:ten:", "targets:10:5", "fantasy_ppg:10:"):
        assert client.get("/api/v1/explore/query", params={"where": where}).status_code == 400, where
    assert client.get("/api/v1/explore/query", params={"grain": "seasons", "where": "weekly_finish::12"}).status_code == 400
    assert client.get("/api/v1/explore/query", params={"team": "XXX"}).status_code == 400


def test_vectorised_scoring_matches_the_engine() -> None:
    """``score_frame`` is ``compute_points`` term for term, TE premium included."""
    import numpy as np

    rows = [
        {"fantasy_points_std": 12.4, "receptions": 6, "passing_yards": 0, "passing_tds": 0, "interceptions": 0,
         "rushing_yards": 20, "rushing_tds": 0, "receiving_yards": 84, "receiving_tds": 1, "fumbles_lost": 1},
        {"fantasy_points_std": 3.1, "receptions": 5, "passing_yards": 0, "passing_tds": 0, "interceptions": 0,
         "rushing_yards": 0, "rushing_tds": 0, "receiving_yards": 31, "receiving_tds": 0, "fumbles_lost": 0},
    ]
    positions = ["WR", "TE"]
    columns = {name: np.array([row.get(name, np.nan) for row in rows], dtype=np.float64)
               for name in ("fantasy_points_std", "receptions", "passing_yards", "passing_tds", "interceptions",
                            "rushing_yards", "rushing_tds", "receiving_yards", "receiving_tds", "fumbles_lost",
                            "receptions_exp", "two_point_conv_exp", "passing_yards_exp", "passing_tds_exp",
                            "interceptions_exp", "rushing_yards_exp", "rushing_tds_exp", "receiving_yards_exp",
                            "receiving_tds_exp")}
    frame = Frame(
        player=np.array([0, 1], dtype=np.int32), game=np.array([0, 0], dtype=np.int32),
        team=np.array([1, 1], dtype=np.int32), season=np.array([SEASON, SEASON], dtype=np.int16),
        week=np.array([1, 1], dtype=np.int16), post=np.array([False, False]),
        position=np.array([POSITIONS.index(position) for position in positions], dtype=np.int8),
        rookie=np.array([False, False]), columns=columns, people=[], games=[], teams={}, last_regular_week={},
    )
    for spec in ("ppr", "half", "std", "ppr_te", "ppr:pass_td=6,fumble_lost=-1,rec_yd=0.2"):
        config = parse_scoring(spec)
        scored = score_frame(frame, config)
        for index, row in enumerate(rows):
            assert scored.points[index] == pytest.approx(compute_points(config, row, positions[index]), abs=1e-9)
        assert np.isnan(scored.expected).all()  # no expected components: "not modelled", never zero
