"""The game pages (October 2026): header, recap, play list and preview for one game.

Three things here look right while being wrong, which is why they are pinned.

**Point of view.** The schedule is stored home-team-first, so "who covered" and a team's
own line ("favoured by 1.5") both need the home spread read from the right side. A preview
that forgot to flip an away game's line shows every road favourite as an underdog.

**Scoring.** Fantasy points and the week's finish are priced in the request's scoring. A
reception-heavy line and a touchdown-heavy one swap places between PPR and standard, so the
finish has to move with the points beside it.

**Scope.** The pages start at ``FIRST_GAME_PAGE_SEASON``, a constant mirrored in the
pipeline and the frontend. An older game is a 404, not a page with every tab empty.
"""

import re
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.game_pages import _play_points, _touches, scoring_text, short_play
from app.models import Game, GamePlay, InjuryReport, Player, PlayerRanking, PlayerStats, Team
from app.models.game_detail import FIRST_GAME_PAGE_SEASON
from app.scoring import parse_scoring

GAME = "2026_05_DEN_KC"
NEXT = "2026_06_KC_DEN"
ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def opponent(db: Session) -> Team:
    team = Team(name="Denver Broncos", abbreviation="DEN", conference="AFC", division="AFC West")
    db.add(team)
    db.flush()
    return team


def _play(seq, quarter, seconds, clock, team, wp, wp_post, home, away, desc, score_type=None, scorer=None, play_type="pass", **extra):
    return GamePlay(
        game_id=GAME, play_id=seq * 10, season=2026, week=5, season_type="REG", sequence=seq,
        quarter=quarter, quarter_seconds=seconds, clock=clock, team_id=team, drive=seq,
        play_type=play_type, description=desc, home_wp=wp, home_wp_post=wp_post,
        home_score=home, away_score=away, score_type=score_type, score_team_id=scorer, **extra,
    )


@pytest.fixture
def games(db: Session, team: Team, opponent: Team) -> dict:
    """Kansas City (home) loses to Denver in overtime in Week 5, a week after beating them
    in Denver; the teams meet again in Denver in Week 6, not yet played."""
    kc, den = team.team_id, opponent.team_id
    db.add_all([
        Game(game_id="2024_05_DEN_KC", season=2024, week=5, season_type="REG", home_team_id=kc, away_team_id=den,
             home_score=20, away_score=17, game_date=date(2024, 10, 6)),
        # Week 4 in Denver: DEN favoured by 1.5 at home, KC won by 4.
        Game(game_id="2026_04_KC_DEN", season=2026, week=4, season_type="REG", home_team_id=den, away_team_id=kc,
             home_score=20, away_score=24, game_date=date(2026, 10, 4), spread_line=1.5, total_line=43.0),
        # Week 5 in Kansas City: KC favoured by 3, lost 10-13 in overtime.
        Game(game_id=GAME, season=2026, week=5, season_type="REG", home_team_id=kc, away_team_id=den,
             home_score=10, away_score=13, game_date=date(2026, 10, 11), spread_line=3.0, total_line=44.0,
             home_moneyline=-150, away_moneyline=130, stadium="GEHA Field at Arrowhead Stadium"),
        # Week 6 back in Denver: KC favoured by 2.5 on the road. Not played.
        Game(game_id=NEXT, season=2026, week=6, season_type="REG", home_team_id=den, away_team_id=kc,
             game_date=date(2026, 10, 18), spread_line=-2.5, total_line=45.0, home_moneyline=115, away_moneyline=-135),
    ])
    db.flush()
    db.add_all([
        _play(1, 1, 900, "15:00", den, 0.60, 0.60, 0, 0, "W.Lutz kicks 65 yards", play_type="kickoff"),
        _play(2, 1, 600, "10:00", den, 0.60, 0.52, 0, 3, "(10:00) 3-W.Lutz 40 yard field goal is GOOD, Center-41-M.Fraboni.", "FG", den, "field_goal"),
        _play(3, 2, 500, "08:20", kc, 0.52, 0.70, 6, 3, "(8:20) (Shotgun) 15-P.Mahomes pass short left to 87-T.Kelce for 12 yards, TOUCHDOWN.", "TD", kc, touchdown=True),
        _play(4, 2, 495, "08:15", kc, 0.70, 0.71, 7, 3, "25-H.Butker extra point is GOOD, Center-41-J.Winchester.", "XP", kc, "extra_point"),
        _play(5, 4, 300, "05:00", den, 0.71, 0.40, 7, 9, "(5:00) 30-J.Williams up the middle for 3 yards, TOUCHDOWN.", "TD", den, "run", touchdown=True, is_rush=True),
        _play(6, 4, 295, "04:55", den, 0.40, 0.40, 7, 10, "3-W.Lutz extra point is GOOD, Center-41-M.Fraboni.", "XP", den, "extra_point"),
        _play(7, 4, 10, "00:10", kc, 0.40, 0.55, 10, 10, "(:10) 25-H.Butker 33 yard field goal is GOOD, Center-41-J.Winchester.", "FG", kc, "field_goal"),
        _play(8, 5, 300, "05:00", den, 0.55, 0.0, 10, 13, "(5:00) 3-W.Lutz 45 yard field goal is GOOD, Center-41-M.Fraboni.", "FG", den, "field_goal"),
    ])
    catcher = Player(player_id="00-0000101", name="Catch Volume", position="WR", team_id=kc)
    scorer = Player(player_id="00-0000102", name="Score Touchdowns", position="WR", team_id=den)
    db.add_all([catcher, scorer])
    db.flush()
    db.add_all([
        # Ten catches and no touchdown: 20.0 in PPR, 10.0 in standard.
        PlayerStats(player_id=catcher.player_id, game_id=GAME, team_id=kc, season=2026, week=5, season_type="REG",
                    receptions=10, receiving_yards=100, receiving_tds=0, targets=12, fantasy_points_std=10.0,
                    receptions_exp=8.0, receiving_yards_exp=80.0, receiving_tds_exp=0.5),
        # Five catches and a touchdown: 17.0 in PPR, 12.0 in standard.
        PlayerStats(player_id=scorer.player_id, game_id=GAME, team_id=den, season=2026, week=5, season_type="REG",
                    receptions=5, receiving_yards=60, receiving_tds=1, targets=6, fantasy_points_std=12.0),
        PlayerStats(player_id=catcher.player_id, game_id="2026_04_KC_DEN", team_id=kc, season=2026, week=4,
                    season_type="REG", receptions=4, receiving_yards=40, targets=6, fantasy_points_std=4.0),
        InjuryReport(season=2026, season_type="REG", week=6, team_id=kc, player_id=catcher.player_id,
                     name="Catch Volume", position="WR", status="Questionable", injury="Ankle",
                     practice_status="Limited Participation in Practice"),
        InjuryReport(season=2026, season_type="REG", week=6, team_id=den, player_id="00-0099999",
                     name="Big Tackle", position="T", status="Out", injury="Knee"),
        PlayerRanking(player_id=catcher.player_id, source="fantasypros", ranking_type="weekly-wr", season=2026, week=6,
                      scraped_at=date(2026, 10, 15), ecr=3.5),
        PlayerRanking(player_id=scorer.player_id, source="fantasypros", ranking_type="weekly-wr", season=2026, week=6,
                      scraped_at=date(2026, 10, 15), ecr=2.1),
        # An older scrape of the same week, which must not count.
        PlayerRanking(player_id=catcher.player_id, source="fantasypros", ranking_type="weekly-wr", season=2026, week=6,
                      scraped_at=date(2026, 10, 12), ecr=1.0),
    ])
    db.flush()
    return {"kc": kc, "den": den}


def test_the_scope_constant_agrees_everywhere():
    pipeline = (ROOT / "pipeline" / "seasons.py").read_text()
    frontend = (ROOT / "frontend" / "src" / "constants" / "index.js").read_text()
    assert int(re.search(r"^FIRST_GAME_PAGE_SEASON = (\d+)", pipeline, re.M).group(1)) == FIRST_GAME_PAGE_SEASON
    assert int(re.search(r"FIRST_GAME_PAGE_SEASON = (\d+)", frontend).group(1)) == FIRST_GAME_PAGE_SEASON


def test_a_game_before_the_first_season_is_not_found(client: TestClient, games: dict):
    assert client.get("/api/v1/games/2024_05_DEN_KC").status_code == 404
    assert client.get("/api/v1/games/nonsense").status_code == 404


def test_the_header_reads_the_score_by_quarter_and_who_covered(client: TestClient, games: dict):
    body = client.get(f"/api/v1/games/{GAME}").json()

    assert body["status"] == "final" and body["overtime"] is True
    # A scoreless third quarter still gets its zero.
    assert body["periods"] == ["1", "2", "3", "4", "OT"]
    assert body["away"]["linescore"] == [3, 0, 0, 7, 3]
    assert body["home"]["linescore"] == [0, 7, 0, 3, 0]
    # Home favoured by 3 and lost: the away side covered, and 23 points stayed under 44.
    assert body["favorite"] == "KC"
    assert body["line_result"]["covered"] == "DEN"
    assert body["line_result"]["over_under"] == "under"
    # Records through this game only, not the season as it stands.
    assert body["home"]["record"] == "1-1" and body["away"]["record"] == "1-1"
    assert body["home"]["rest_days"] == 7
    assert body["pregame_home_wp"] == 0.6
    assert body["stadium"] == "GEHA Field at Arrowhead Stadium"
    assert 0.5 < body["home_win_chance"] < 0.6


def test_the_recap_prices_points_and_finishes_in_the_requested_scoring(client: TestClient, games: dict):
    ppr = {p["name"]: p for p in client.get(f"/api/v1/games/{GAME}/recap", params={"scoring": "ppr"}).json()["players"]}
    std = {p["name"]: p for p in client.get(f"/api/v1/games/{GAME}/recap", params={"scoring": "std"}).json()["players"]}

    assert ppr["Catch Volume"]["fantasy_points"] == 20.0 and ppr["Catch Volume"]["position_rank"] == 1
    assert ppr["Score Touchdowns"]["fantasy_points"] == 17.0 and ppr["Score Touchdowns"]["position_rank"] == 2
    assert std["Score Touchdowns"]["position_rank"] == 1 and std["Catch Volume"]["position_rank"] == 2
    assert ppr["Catch Volume"]["pool_size"] == 2
    # Each phase's points, for the per-dropback, per-carry and per-target rates.
    assert ppr["Score Touchdowns"]["points_by_phase"] == {"passing": 0.0, "rushing": 0.0, "receiving": 17.0}
    assert std["Catch Volume"]["points_by_phase"]["receiving"] == 10.0
    assert ppr["Catch Volume"]["expected_fantasy_points"] == pytest.approx(8.0 + 8.0 + 3.0)


def test_the_recap_tells_the_game_in_order(client: TestClient, games: dict):
    body = client.get(f"/api/v1/games/{GAME}/recap").json()

    scoring = body["scoring_plays"]
    assert [s["type"] for s in scoring] == ["FG", "TD", "TD", "FG", "FG"]
    assert scoring[1]["text"] == "Kelce 12-yard pass from Mahomes (Butker kick)"
    assert (scoring[1]["away_score"], scoring[1]["home_score"]) == (3, 7)
    # DEN 3-0, KC 7-3, DEN 10-7, tied 10-10, DEN 13-10.
    assert body["flow"]["lead_changes"] == 2 and body["flow"]["ties"] == 1
    assert body["flow"]["largest_lead"] == {"KC": 4, "DEN": 3}

    wp = body["win_probability"]
    assert wp["pregame"] == 0.6
    assert wp["series"][-1][1] == 0.0  # the home team lost
    assert body["swings"][0]["text"] == "Lutz 45-yard field goal good"


def test_each_play_is_priced_by_quarter_for_the_players_on_it():
    qb, rb, te, returner = "qb", "rb", "te", "kr"
    plays = [
        # Q1: a 20-yard touchdown pass to the tight end.
        GamePlay(quarter=1, passer_id=qb, receiver_id=te, complete=True, passing_yards=20, receiving_yards=20,
                 pass_touchdown=True, is_pass=True),
        # Q2: a 15-yard touchdown run, then the back runs in the two-point try.
        GamePlay(quarter=2, rusher_id=rb, rushing_yards=15, rush_touchdown=True, is_rush=True),
        GamePlay(quarter=2, rusher_id=rb, two_point=True, is_rush=True),
        # Q3: an interception thrown at the tight end.
        GamePlay(quarter=3, passer_id=qb, receiver_id=te, interception=True, is_pass=True),
        # Q4: a muffed punt costs the returner nothing; a fumble on a run costs the back.
        GamePlay(quarter=4, fumble_lost_id=returner, play_type="punt"),
        GamePlay(quarter=4, rusher_id=rb, rushing_yards=3, fumble_lost_id=rb, is_rush=True),
    ]
    positions = {qb: "QB", rb: "RB", te: "TE", returner: "WR"}
    points = _play_points(parse_scoring("ppr_te"), plays, positions)

    assert points[te] == {1: pytest.approx(1.5 + 2.0 + 6.0)}
    assert points[qb] == {1: pytest.approx(0.8 + 4.0), 3: pytest.approx(-2.0)}
    assert points[rb] == {2: pytest.approx(1.5 + 6.0 + 2.0), 4: pytest.approx(0.3 - 2.0)}
    assert returner not in points


def test_every_target_and_carry_is_a_touch_in_order():
    plays = [
        GamePlay(quarter=1, quarter_seconds=800, receiver_id="wr", is_pass=True, complete=True, receiving_yards=12),
        GamePlay(quarter=1, quarter_seconds=700, receiver_id="wr", is_pass=True, complete=False),
        GamePlay(quarter=2, quarter_seconds=600, rusher_id="rb", rushing_yards=3, rush_touchdown=True, is_rush=True),
        # A scramble is a carry, as the stat line counts it.
        GamePlay(quarter=3, quarter_seconds=300, rusher_id="qb", rushing_yards=9, is_pass=True),
        # A two-point try and a play wiped out by a penalty are neither.
        GamePlay(quarter=3, quarter_seconds=290, receiver_id="wr", is_pass=True, complete=True,
                 description="TWO-POINT CONVERSION ATTEMPT. J.Allen pass to D.Kincaid is complete. ATTEMPT SUCCEEDS."),
        GamePlay(quarter=4, quarter_seconds=100, play_type="no_play", description="(No Play)"),
    ]
    touches = _touches(plays, "REG")

    assert [(t["player"], t["kind"]) for t in touches] == [("wr", "target"), ("wr", "target"), ("rb", "carry"), ("qb", "carry")]
    assert touches[0]["t"] == 100 and touches[0]["caught"] and not touches[1]["caught"]
    assert touches[2]["td"] and touches[3]["yards"] == 9


def test_the_recap_carries_each_players_average_coming_in(client: TestClient, games: dict):
    body = client.get(f"/api/v1/games/{GAME}/recap", params={"scoring": "ppr"}).json()
    players = {p["name"]: p for p in body["players"]}

    # Week 4: four catches for 40 yards, 8.0 in PPR. Week 5 itself does not count.
    assert players["Catch Volume"]["average_coming_in"] == 8.0
    assert players["Catch Volume"]["games_coming_in"] == 1
    assert players["Score Touchdowns"]["average_coming_in"] is None
    assert players["Score Touchdowns"]["games_coming_in"] == 0
    # The game's plays are stored, so every line says how its points fell by quarter.
    assert players["Catch Volume"]["points_by_quarter"] == {}
    assert set(body["league"]) == {"epa_per_play", "success_rate"}


def test_an_unplayed_game_has_no_recap(client: TestClient, games: dict):
    assert client.get(f"/api/v1/games/{NEXT}/recap").status_code == 404


def test_the_preview_reads_each_line_from_its_own_side(client: TestClient, games: dict):
    body = client.get(f"/api/v1/games/{NEXT}/preview").json()

    week4, week5 = body["form"]["KC"]
    # In Denver the home spread of +1.5 favoured Denver, so Kansas City was the underdog.
    assert week4["favored_by"] == -1.5 and week4["cover"] == "W" and week4["result"] == "W"
    assert week5["favored_by"] == 3.0 and week5["cover"] == "L"
    # Kansas City is the road favourite, so it has the higher implied total.
    assert body["slate"]["implied_rank"] == {"KC": 1, "DEN": 2}
    assert [m["game_id"] for m in body["meetings"]][:2] == [GAME, "2026_04_KC_DEN"]
    assert body["meetings"][0]["top_scorers"][0]["name"] == "Catch Volume"


def test_the_preview_carries_consensus_ranks_and_the_injury_report(client: TestClient, games: dict):
    body = client.get(f"/api/v1/games/{NEXT}/preview").json()

    catcher = next(p for p in body["players"]["KC"] if p["name"] == "Catch Volume")
    # Ordered by consensus at the newest scrape: 2.1 is WR1, 3.5 is WR2.
    assert catcher["consensus"]["label"] == "WR2"
    assert catcher["injury"]["status"] == "Questionable"
    assert catcher["games"] == 2 and catcher["fantasy_ppg"] == pytest.approx((8.0 + 20.0) / 2)
    assert [w.get("position_rank") for w in catcher["weeks"]] == [1, 1]
    # Out before Questionable, and a lineman named even though he is not a tracked player.
    assert [r["name"] for r in body["injuries"]] == ["Big Tackle", "Catch Volume"]


@pytest.mark.parametrize("desc, expected", [
    ("(8:48) (Shotgun) 17-J.Allen pass short middle to 10-K.Shakir to LA 22 for 57 yards (5-K.Kinchens).", "Allen to Shakir, 57 yards"),
    ("(4:16) 92-H.Mevis 48 yard field goal is BLOCKED (15-G.Rousseau), Center-49-J.Cardona.", "Mevis 48-yard field goal blocked"),
    ("(2:45) 4-J.Cook up the middle to LA 27 for no gain (90-T.Davis).", "Cook run, no gain"),
    ("(:08) (No Huddle, Shotgun) 23-K.Williams left guard for 1 yard, TOUCHDOWN.", "Williams run, 1 yard, TD"),
])
def test_short_play_text(desc: str, expected: str):
    assert short_play(desc) == expected


def test_a_failed_two_point_try_is_named():
    text = scoring_text("TD", "(14:20) 9-M.Stafford pass short left to 12-P.Nacua for 2 yards, TOUCHDOWN.",
                        "TWO-POINT CONVERSION ATTEMPT. 9-M.Stafford is sacked. ATTEMPT FAILS.")
    assert text == "Nacua 2-yard pass from Stafford (two-point try failed)"
