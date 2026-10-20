"""The game pages (October 2026): one game's header, its recap once played, its preview before.

A recap is mostly numbers the site already keeps at other grains, read for one game: stat
lines from ``player_stats`` priced by the scoring engine, team sums from
``team_game_stats``, targets and runs from the Explore tables. What only this module adds
is the game's *order*, from ``game_plays`` and ``game_drives``: the score by quarter, the
win probability along the clock, the scoring plays, every drive and every snap.

A preview is the two teams' seasons set against each other: the line, form against the
spread, each offense against the other defense (the team stats board), the fantasy
players with this week's consensus rank and matchup, the injury report and every meeting
since 2009.

**Scope is ``FIRST_GAME_PAGE_SEASON`` on.** A game before it is a 404, like a team with
no games, rather than a page with half its tabs empty.

**Everything fantasy is priced in the request's scoring**, through the same functions the
leaderboard and the game log use, so a finish on this page and the same finish on a
player page cannot disagree.
"""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import date

from sqlalchemy import exists, func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    Game,
    GameDrive,
    GamePlay,
    InjuryReport,
    Player,
    PlayerRanking,
    PlayerRunLane,
    PlayerStats,
    PlayTarget,
    Team,
    TeamGameStats,
    TeamStaff,
)
from app.models.game_detail import FIRST_GAME_PAGE_SEASON
from app.availability import FIRST_SEASON
from app.scoring import (
    EXPECTED_COMPONENTS,
    POINTS_COMPONENTS,
    TWO_POINT_CONV_WEIGHT,
    ScoringConfig,
    compute_expected_points,
    compute_points,
    points_expr,
)
from app.sos import POSITIONS, points_allowed, resolve_basis
from app.team_stats import BY_ID as TEAM_METRICS
from app.team_stats import team_board, team_breakdown
from app.vegas import implied_totals

POST_WEEKS = {19: "Wild Card", 20: "Divisional round", 21: "Conference championship", 22: "Super Bowl"}

# How many swings the win probability chart numbers, and how many scorers a past meeting lists.
SWINGS = 6
MEETING_SCORERS = 3

# A deep throw, as the target pages count one: 20 or more air yards.
DEEP_AIR_YARDS = 20

# The week's team ranks shown on a recap, and the season metrics a preview compares.
WEEK_RANK_METRICS = ("epa", "suc", "p_epa", "r_epa", "explosive", "pts_drive", "d3", "rz_td", "proe")
TAPE_METRICS = ("ppg", "epa", "suc", "p_epa", "r_epa", "explosive", "pts_drive", "rz_td", "d3", "three_out",
                "sack_rate", "p_yds_g", "r_yds_g", "ypc", "tov_g")
TENDENCY_METRICS = ("pass_rate", "proe", "sec_snap", "plays_g", "gun", "motion", "pa", "screen", "adot",
                    "back_play", "te_play", "two_back")
DEFENSE_TENDENCY_METRICS = ("blitz", "rushers", "box8")

# Weekly consensus ranks are FantasyPros' (pipeline/ingest_rankings.py --weekly). A rank is
# the player's place on his position's board, ordered by consensus, at the newest scrape.
CONSENSUS_SOURCE = "fantasypros"


class GameNotFound(LookupError):
    """No game with this id, or one before the game pages' first season."""


# ---------------------------------------------------------------------------------------
# Text: play-by-play's own description, shortened for a chart label or a scoring line
# ---------------------------------------------------------------------------------------
_NAME = r"([A-Z]\.[\w'\-]+(?:\s[A-Z][\w'\-]+)?)"


def clean_description(text: str | None) -> str:
    """Drop the clock, the formation tag and jersey numbers: "(8:04) (Shotgun) 9-M.Stafford" -> "M.Stafford"."""
    text = re.sub(r"^\(\d*:\d+\)\s*", "", text or "")
    text = re.sub(r"\((?:No Huddle, )?(?:Shotgun|No Huddle)\)\s*", "", text)
    text = re.sub(r"\b\d+-([A-Z])", r"\1", text)
    return text.strip()


def _surname(name: str) -> str:
    return name.split(".", 1)[-1] if "." in name else name


def _yards_phrase(raw: str) -> str:
    yards = 0 if raw == "no gain" else int(raw)
    if yards == 0:
        return "no gain"
    return f"{yards} yard" + ("" if abs(yards) == 1 else "s")


def short_play(text: str | None) -> str:
    """One play in a few words: "Allen to Shakir, 57 yards", "Mevis 48-yard field goal blocked"."""
    s = clean_description(text)
    td = ", TD" if "TOUCHDOWN" in s else ""
    m = re.search(r"([A-Z]\.[\w'\-]+) pass (?:\w+ )*?to ([A-Z]\.[\w'\-]+)(?: to [A-Z]+ \d+)? for (-?\d+|no gain)", s)
    if m:
        return f"{_surname(m.group(1))} to {_surname(m.group(2))}, {_yards_phrase(m.group(3))}{td}"
    m = re.search(r"([A-Z]\.[\w'\-]+) pass .*?INTERCEPTED by ([A-Z]\.[\w'\-]+)", s)
    if m:
        return f"{_surname(m.group(1))} intercepted by {_surname(m.group(2))}"
    m = re.search(r"([A-Z]\.[\w'\-]+) pass incomplete (?:\w+ )*?(?:intended )?for ([A-Z]\.[\w'\-]+)", s)
    if m:
        return f"{_surname(m.group(1))} incomplete to {_surname(m.group(2))}"
    m = re.search(r"([A-Z]\.[\w'\-]+) (\d+) yard field goal is (GOOD|No Good|BLOCKED)", s)
    if m:
        verdict = {"GOOD": "good", "No Good": "missed", "BLOCKED": "blocked"}[m.group(3)]
        return f"{_surname(m.group(1))} {m.group(2)}-yard field goal {verdict}"
    m = re.search(r"([A-Z]\.[\w'\-]+) scrambles .*?for (-?\d+|no gain)", s)
    if m:
        return f"{_surname(m.group(1))} scramble, {_yards_phrase(m.group(2))}{td}"
    m = re.search(r"([A-Z]\.[\w'\-]+) (?:up the middle|left end|left tackle|left guard|right end|right tackle|right guard|rushes)"
                  r"(?: to [A-Z]+ \d+)? for (-?\d+|no gain)", s)
    if m:
        return f"{_surname(m.group(1))} run, {_yards_phrase(m.group(2))}{td}"
    m = re.search(r"([A-Z]\.[\w'\-]+) sacked", s)
    if m:
        return f"{_surname(m.group(1))} sacked"
    m = re.search(r"([A-Z]\.[\w'\-]+) punts (\d+) yards", s)
    if m:
        return f"{_surname(m.group(1))} punts {m.group(2)} yards"
    m = re.search(r"FUMBLES", s)
    if m:
        return re.sub(r"\s*\([^)]*\)", "", s).split(".")[0][:70] + ", fumble"
    return re.sub(r"\s*\([^)]*\)", "", s)[:80]


def scoring_text(score_type: str, text: str | None, try_text: str | None) -> str:
    """A scoring play the way a box score lists it: "Adams 4-yard pass from Stafford (Mevis kick)"."""
    s = clean_description(text)
    main = None
    if score_type == "TD":
        m = re.search(r"([A-Z]\.[\w'\-]+) pass (?:\w+ )*?to ([A-Z]\.[\w'\-]+) for (\d+) yards?, TOUCHDOWN", s)
        if m:
            main = f"{_surname(m.group(2))} {m.group(3)}-yard pass from {_surname(m.group(1))}"
        else:
            m = re.search(r"([A-Z]\.[\w'\-]+) (?:pass .*?INTERCEPTED by |.*?fumble.*?recovered by )?.*?for (\d+) yards?, TOUCHDOWN", s, re.I)
            m2 = re.search(r"INTERCEPTED by ([A-Z]\.[\w'\-]+)", s)
            if m2:
                main = f"{_surname(m2.group(1))} interception return"
            elif m:
                main = f"{_surname(m.group(1))} {m.group(2)}-yard run"
    elif score_type == "FG":
        m = re.search(r"([A-Z]\.[\w'\-]+) (\d+) yard field goal is GOOD", s)
        if m:
            main = f"{_surname(m.group(1))} {m.group(2)}-yard field goal"
    elif score_type == "SAF":
        main = "Safety"
    if main is None:
        main = short_play(text)
    if try_text:
        t = clean_description(try_text)
        m = re.search(r"([A-Z]\.[\w'\-]+) extra point is (GOOD|No Good|Blocked|BLOCKED)", t)
        if m:
            main += f" ({_surname(m.group(1))} kick" + ("" if m.group(2) == "GOOD" else " no good") + ")"
        elif "TWO-POINT" in t:
            m = re.search(r"([A-Z]\.[\w'\-]+) pass to ([A-Z]\.[\w'\-]+) is complete", t)
            r = re.search(r"([A-Z]\.[\w'\-]+) rushes", t)
            if "SUCCEEDS" in t and m:
                main += f" ({_surname(m.group(2))} pass from {_surname(m.group(1))})"
            elif "SUCCEEDS" in t and r:
                main += f" ({_surname(r.group(1))} run)"
            elif "SUCCEEDS" in t:
                main += " (two-point try good)"
            else:
                main += " (two-point try failed)"
    return main


# ---------------------------------------------------------------------------------------
# Shared reads
# ---------------------------------------------------------------------------------------
def elapsed(quarter: int | None, quarter_seconds: int | None, season_type: str) -> int | None:
    """Game seconds before this moment (the pipeline's ``_elapsed``, for plays)."""
    if quarter is None or quarter_seconds is None:
        return None
    if quarter <= 4:
        return (quarter - 1) * 900 + (900 - quarter_seconds)
    period = 600 if season_type == "REG" else 900
    return 3600 + (quarter - 5) * period + (period - quarter_seconds)


def load_game(db: Session, game_id: str) -> Game:
    game = db.get(Game, game_id)
    if game is None or game.season is None or game.season < FIRST_GAME_PAGE_SEASON:
        raise GameNotFound(game_id)
    return game


def _teams(db: Session) -> dict[int, Team]:
    return {team.team_id: team for team in db.scalars(select(Team))}


def _team_block(team: Team | None) -> dict:
    if team is None:
        return {}
    return {"team_id": team.team_id, "abbreviation": team.abbreviation, "name": team.name,
            "logo_url": team.logo_url, "color": team.color, "color2": team.color2}


def week_label(game: Game) -> str:
    if game.season_type == "POST":
        return POST_WEEKS.get(game.week, f"Playoffs week {game.week}")
    return f"Week {game.week}"


def _record_text(wins: int, losses: int, ties: int) -> str:
    return f"{wins}-{losses}" + (f"-{ties}" if ties else "")


def _records(db: Session, season: int, team_ids: tuple[int, ...], through: date | None) -> dict[int, str]:
    """Regular-season records, counting games on or before ``through`` (all played games if None)."""
    filters = [Game.season == season, Game.season_type == "REG", Game.home_score.is_not(None),
               or_(Game.home_team_id.in_(team_ids), Game.away_team_id.in_(team_ids))]
    if through is not None:
        filters.append(Game.game_date <= through)
    tally = {team_id: [0, 0, 0] for team_id in team_ids}
    for game in db.scalars(select(Game).where(*filters)):
        for team_id, scored, allowed in ((game.home_team_id, game.home_score, game.away_score),
                                         (game.away_team_id, game.away_score, game.home_score)):
            if team_id in tally:
                tally[team_id][0 if scored > allowed else 1 if scored < allowed else 2] += 1
    return {team_id: _record_text(*counts) for team_id, counts in tally.items()}


def _rest_days(db: Session, game: Game, team_id: int) -> int | None:
    """Days since this team's previous game in the same season; None in its first game."""
    previous = db.scalar(
        select(func.max(Game.game_date)).where(
            Game.season == game.season, Game.game_date < game.game_date,
            or_(Game.home_team_id == team_id, Game.away_team_id == team_id),
        )
    )
    return (game.game_date - previous).days if previous and game.game_date else None


def no_vig_home_chance(home_moneyline: int | None, away_moneyline: int | None) -> float | None:
    """The home team's chance to win implied by the two moneylines, the bookmaker's margin removed."""
    if home_moneyline is None or away_moneyline is None:
        return None

    def implied(line: int) -> float:
        return 100 / (line + 100) if line > 0 else -line / (-line + 100)

    home, away = implied(home_moneyline), implied(away_moneyline)
    return round(home / (home + away), 4)


def _line_result(game: Game, home: str, away: str) -> dict | None:
    """Who covered and whether the total went over. The spread is the home team's: positive favours it."""
    if game.home_score is None or game.spread_line is None:
        return None
    margin = game.home_score - game.away_score
    covered = home if margin > game.spread_line else away if margin < game.spread_line else None
    total = game.home_score + game.away_score
    over_under = None
    if game.total_line is not None:
        over_under = "over" if total > game.total_line else "under" if total < game.total_line else "push"
    return {"covered": covered, "push": covered is None, "total_points": total, "over_under": over_under}


# ---------------------------------------------------------------------------------------
# The header: both states
# ---------------------------------------------------------------------------------------
def game_header(db: Session, game: Game) -> dict:
    teams = _teams(db)
    home, away = teams.get(game.home_team_id), teams.get(game.away_team_id)
    played = game.home_score is not None and game.away_score is not None

    plays = db.execute(
        select(GamePlay.quarter, func.max(GamePlay.home_score), func.max(GamePlay.away_score))
        .where(GamePlay.game_id == game.game_id, GamePlay.quarter.is_not(None))
        .group_by(GamePlay.quarter).order_by(GamePlay.quarter)
    ).all()
    linescore = None
    if played and plays:
        # Every regulation quarter appears even when nobody scored in it (and has no play
        # row of its own, which a quarter always has but a test fixture may not).
        totals = {quarter: (home_total or 0, away_total or 0) for quarter, home_total, away_total in plays}
        last_period = max(4, max(totals))
        home_line, away_line, prev = [], [], (0, 0)
        for quarter in range(1, last_period + 1):
            home_total, away_total = totals.get(quarter, prev)
            home_total, away_total = max(home_total, prev[0]), max(away_total, prev[1])
            home_line.append(home_total - prev[0])
            away_line.append(away_total - prev[1])
            prev = (home_total, away_total)
        # The last play's running score can trail a final the feed corrected afterwards;
        # the stored final is the one the scoreboard shows, so the last period absorbs it.
        home_line[-1] += game.home_score - prev[0]
        away_line[-1] += game.away_score - prev[1]
        overtimes = last_period - 4
        periods = [str(q) for q in range(1, 5)] + (["OT"] if overtimes == 1 else [f"OT{n}" for n in range(1, overtimes + 1)])
        linescore = {"periods": periods, "home": home_line, "away": away_line}
    overtime = bool(plays) and max(q for q, *_ in plays) >= 5

    pregame = db.scalar(
        select(GamePlay.home_wp).where(GamePlay.game_id == game.game_id, GamePlay.home_wp.is_not(None))
        .order_by(GamePlay.sequence, GamePlay.play_id).limit(1)
    )
    records = _records(db, game.season, (game.home_team_id, game.away_team_id),
                       game.game_date if played and game.season_type == "REG" else None)
    home_implied, away_implied = implied_totals(game.spread_line, game.total_line)
    favorite = None
    if game.spread_line:
        favorite = home.abbreviation if game.spread_line > 0 else away.abbreviation

    def side(team: Team | None, score: int | None, line: list[int] | None) -> dict:
        return {**_team_block(team), "score": score, "record": records.get(team.team_id) if team else None,
                "rest_days": _rest_days(db, game, team.team_id) if team else None, "linescore": line}

    return {
        "game_id": game.game_id, "season": game.season, "week": game.week, "season_type": game.season_type,
        "week_label": week_label(game), "game_date": game.game_date, "kickoff_time": game.kickoff_time,
        "stadium": game.stadium, "roof": game.roof, "surface": game.surface or None, "div_game": game.div_game,
        "status": "final" if played else "upcoming", "played": played, "overtime": overtime,
        "away": side(away, game.away_score, linescore["away"] if linescore else None),
        "home": side(home, game.home_score, linescore["home"] if linescore else None),
        "periods": linescore["periods"] if linescore else None,
        "spread_line": game.spread_line, "total_line": game.total_line, "favorite": favorite,
        "home_implied": home_implied, "away_implied": away_implied,
        "home_moneyline": game.home_moneyline, "away_moneyline": game.away_moneyline,
        "home_win_chance": no_vig_home_chance(game.home_moneyline, game.away_moneyline),
        "pregame_home_wp": round(pregame, 4) if pregame is not None else None,
        "line_result": _line_result(game, home.abbreviation, away.abbreviation) if played else None,
        "has_plays": bool(plays),
        "has_stats": bool(db.scalar(select(exists().where(PlayerStats.game_id == game.game_id)))),
    }


# ---------------------------------------------------------------------------------------
# The recap
# ---------------------------------------------------------------------------------------
def _week_finishes(db: Session, game: Game, config: ScoringConfig, player_ids: set[str]) -> dict[str, tuple[int, int]]:
    """Each player's rank at his position that week, everyone with a line counted (the game log's rule)."""
    if not player_ids:
        return {}
    points = points_expr(config, sum_mode=False)
    ranked = (
        select(
            PlayerStats.player_id.label("player_id"),
            func.rank().over(partition_by=Player.position, order_by=points.desc()).label("position_rank"),
            func.count().over(partition_by=Player.position).label("pool_size"),
        )
        .join(Player, PlayerStats.player_id == Player.player_id)
        .where(PlayerStats.season == game.season, PlayerStats.week == game.week,
               PlayerStats.season_type == game.season_type, Player.position.in_(POSITIONS))
        .subquery()
    )
    rows = db.execute(select(ranked).where(ranked.c.player_id.in_(player_ids))).all()
    return {row.player_id: (row.position_rank, row.pool_size) for row in rows}


def _play_points(config: ScoringConfig, plays: list[GamePlay], positions: dict[str, str]) -> dict[str, dict[int, float]]:
    """Each player's points by period, from every play.

    Every play is priced in the request's scoring from what it credited each player with,
    the stat line's own weights: a two-point conversion is 2 to each player on it, as in
    the standard scoring the stat lines start from. The periods add up to the stat line's
    total on 99% of 2025-26 lines; the rest are return touchdowns, which no offensive play
    credits, and laterals, whose yards belong to a player the play does not name.
    """
    by_period: dict[str, dict[int, float]] = defaultdict(lambda: defaultdict(float))

    def credit(player_id: str | None, points: float, quarter: int) -> None:
        if player_id and points:
            by_period[player_id][quarter] += points

    for play in plays:
        if play.quarter is None:
            continue
        two = TWO_POINT_CONV_WEIGHT if play.two_point else 0.0
        if play.passer_id:
            credit(play.passer_id, config.pass_yd * (play.passing_yards or 0) + config.pass_td * bool(play.pass_touchdown)
                   + config.pass_int * bool(play.interception) + (two if play.is_pass else 0.0), play.quarter)
        if play.rusher_id:
            credit(play.rusher_id, config.rush_yd * (play.rushing_yards or 0) + config.rush_td * bool(play.rush_touchdown)
                   + (two if not play.is_pass else 0.0), play.quarter)
        if play.receiver_id:
            rec_weight = config.te_rec if config.te_rec is not None and positions.get(play.receiver_id) == "TE" else config.rec
            credit(play.receiver_id, rec_weight * bool(play.complete) + config.rec_yd * (play.receiving_yards or 0)
                   + config.rec_td * bool(play.pass_touchdown) + two, play.quarter)
        # A stat line counts the fumbles its player lost with the ball as passer, rusher or
        # receiver; a muffed punt is a special-teams fumble and costs nothing.
        if play.fumble_lost_id and play.fumble_lost_id in (play.passer_id, play.rusher_id, play.receiver_id):
            credit(play.fumble_lost_id, config.fumble_lost, play.quarter)
    return by_period


def _average_coming_in(db: Session, game: Game, config: ScoringConfig, player_ids: set[str]) -> dict[str, tuple[float, int]]:
    """Each player's fantasy points per game this season before this game, in this scoring."""
    if not player_ids:
        return {}
    points = points_expr(config, sum_mode=False)
    rows = db.execute(
        select(PlayerStats.player_id, func.avg(points), func.count())
        .join(Player, PlayerStats.player_id == Player.player_id)
        .where(PlayerStats.season == game.season, PlayerStats.week < game.week, PlayerStats.player_id.in_(player_ids))
        .group_by(PlayerStats.player_id)
    ).all()
    return {player_id: (float(average), games) for player_id, average, games in rows}


def _touches(plays: list[GamePlay], season_type: str) -> list[dict]:
    """Every target and carry in order, for the timeline of who got the ball.

    A target is a pass with a named receiver, a carry any play with a rusher and rushing
    yards (scrambles and kneels included, as the stat lines count them). Two-point tries
    are not either, and a play wiped out by a penalty names no one, so it drops out.
    """
    out = []
    for play in plays:
        t = elapsed(play.quarter, play.quarter_seconds, season_type)
        if t is None or (play.description or "").startswith("TWO-POINT"):
            continue
        if play.receiver_id and play.is_pass:
            out.append({"t": t, "player": play.receiver_id, "kind": "target", "yards": play.receiving_yards or 0,
                        "caught": bool(play.complete), "td": bool(play.pass_touchdown)})
        elif play.rusher_id and play.rushing_yards is not None:
            out.append({"t": t, "player": play.rusher_id, "kind": "carry", "yards": play.rushing_yards,
                        "caught": None, "td": bool(play.rush_touchdown)})
    return out


def _phase_points(config: ScoringConfig, line: PlayerStats, position: str) -> dict[str, float]:
    """A line's points from passing, rushing and receiving, in this scoring, for the rates a
    phase table shows (points per dropback, per carry, per target). Two-point conversions
    and lost fumbles belong to no phase, so the three need not add up to the line's total."""
    def v(name: str) -> float:
        return float(getattr(line, name) or 0)

    rec_weight = config.te_rec if config.te_rec is not None and position == "TE" else config.rec
    return {
        "passing": round(config.pass_yd * v("passing_yards") + config.pass_td * v("passing_tds") + config.pass_int * v("interceptions"), 2),
        "rushing": round(config.rush_yd * v("rushing_yards") + config.rush_td * v("rushing_tds"), 2),
        "receiving": round(rec_weight * v("receptions") + config.rec_yd * v("receiving_yards") + config.rec_td * v("receiving_tds"), 2),
    }


def _player_lines(db: Session, game: Game, config: ScoringConfig, teams: dict[int, Team], plays: list[GamePlay]) -> list[dict]:
    rows = db.execute(
        select(PlayerStats, Player.name, Player.position, Player.headshot_url)
        .join(Player, PlayerStats.player_id == Player.player_id)
        .where(PlayerStats.game_id == game.game_id, Player.position.in_(POSITIONS))
    ).all()
    finishes = _week_finishes(db, game, config, {line.player_id for line, *_ in rows})
    averages = _average_coming_in(db, game, config, {line.player_id for line, *_ in rows})
    by_period = _play_points(config, plays, {line.player_id: position for line, _, position, _ in rows})

    runs: dict[str, dict] = defaultdict(lambda: {"carries": 0, "successes": 0, "explosive": 0, "stuffed": 0})
    for run in db.scalars(select(PlayerRunLane).where(PlayerRunLane.game_id == game.game_id)):
        tally = runs[run.player_id]
        for key in tally:
            tally[key] += getattr(run, key) or 0

    # A passer's throws by depth and field position, from every targeted pass. Throwaways
    # and spikes name no receiver and are not in play_targets, so these count targeted
    # attempts, which is also what a receiver's aDOT counts.
    throws: dict[str, dict] = defaultdict(lambda: {"air_yards": 0, "depth_attempts": 0, "deep_attempts": 0, "red_zone_attempts": 0})
    for target in db.scalars(select(PlayTarget).where(PlayTarget.game_id == game.game_id, PlayTarget.passer_id.is_not(None))):
        tally = throws[target.passer_id]
        if target.air_yards is not None:
            tally["air_yards"] += target.air_yards
            tally["depth_attempts"] += 1
            tally["deep_attempts"] += target.air_yards >= DEEP_AIR_YARDS
        tally["red_zone_attempts"] += target.yardline_100 is not None and target.yardline_100 <= 20

    lines = []
    for line, name, position, headshot in rows:
        fp = compute_points(config, {k: getattr(line, k) for k in POINTS_COMPONENTS}, position)
        xfp = compute_expected_points(config, {k: getattr(line, k) for k in EXPECTED_COMPONENTS}, position)
        rank, pool = finishes.get(line.player_id, (None, None))
        run = runs.get(line.player_id)
        thrown = throws.get(line.player_id)
        # ``epa`` is all three phases; the passing part is what is left of it.
        passing_epa = None if line.epa is None or not line.attempts else line.epa - (line.rushing_epa or 0) - (line.receiving_epa or 0)
        lines.append({
            "player_id": line.player_id, "name": name, "position": position, "headshot_url": headshot,
            "team": teams[line.team_id].abbreviation if line.team_id in teams else None,
            "fantasy_points": round(fp, 2), "expected_fantasy_points": round(xfp, 2) if xfp is not None else None,
            "position_rank": rank, "pool_size": pool,
            "designed_runs": run["carries"] if run else 0,
            "run_success_rate": round(run["successes"] / run["carries"], 4) if run and run["carries"] else None,
            "explosive_runs": run["explosive"] if run else None, "stuffed_runs": run["stuffed"] if run else None,
            "points_by_phase": _phase_points(config, line, position),
            "average_coming_in": round(averages[line.player_id][0], 2) if line.player_id in averages else None,
            "games_coming_in": averages[line.player_id][1] if line.player_id in averages else 0,
            # Points by period, only when the game's plays are stored: {quarter: points}, 5+ overtime.
            "points_by_quarter": ({str(q): round(v, 2) for q, v in sorted(by_period[line.player_id].items())}
                                  if plays else None),
            "passing_epa": round(passing_epa, 3) if passing_epa is not None else None,
            "pass_air_yards": thrown["air_yards"] if thrown else None,
            "pass_depth_attempts": thrown["depth_attempts"] if thrown else None,
            "deep_attempts": thrown["deep_attempts"] if thrown else None,
            "red_zone_attempts": thrown["red_zone_attempts"] if thrown else None,
            **{key: getattr(line, key) for key in (
                "completions", "attempts", "passing_yards", "passing_tds", "interceptions", "sacks_suffered", "cpoe",
                "epa", "rushing_epa", "receiving_epa", "carries", "rushing_yards", "rushing_tds", "targets",
                "receptions", "receiving_yards", "receiving_tds", "adot", "yards_after_catch", "air_yards", "passer_rating",
                "target_share", "air_yards_share", "wopr", "rush_attempt_share", "opportunity_share", "snap_share",
                "snap_count", "routes_run", "route_participation", "targets_per_route_run", "yards_per_route_run",
                "yards_per_target", "red_zone_targets", "red_zone_rush_attempts", "rush_att_inside_10",
                "rush_att_inside_5", "rush_att_inside_2", "fumbles_lost", "passing_first_downs",
                "receiving_first_downs", "rushing_first_downs",
            )},
        })
    lines.sort(key=lambda entry: -entry["fantasy_points"])
    return lines


def _team_box(db: Session, game: Game, teams: dict[int, Team], drives: list[dict]) -> dict[str, dict]:
    """Each offense's game, from the stored per-game sums (rates divided here, as on the team pages)."""
    seconds: dict[str, int] = defaultdict(int)
    for drive in drives:
        seconds[drive["team"]] += drive["seconds"] or 0

    def per(a, b):
        return round(a / b, 4) if a is not None and b else None

    out = {}
    for row in db.scalars(select(TeamGameStats).where(TeamGameStats.game_id == game.game_id, TeamGameStats.side == "o")):
        abbr = teams[row.team_id].abbreviation
        points = game.home_score if row.team_id == game.home_team_id else game.away_score
        out[abbr] = {
            "points": points, "plays": row.plays, "yards": row.yards, "yards_per_play": per(row.yards, row.plays),
            "first_downs": row.first_downs, "passing_yards": row.passing_yards, "rushing_yards": row.rushing_yards,
            "third_down_conversions": row.third_down_conversions, "third_down_attempts": row.third_down_attempts,
            "fourth_down_conversions": row.fourth_down_conversions, "fourth_down_attempts": row.fourth_down_attempts,
            "red_zone_tds": row.red_zone_tds, "red_zone_trips": row.red_zone_trips,
            "turnovers": row.giveaways, "sacks": row.sacks, "penalties": row.penalties, "penalty_yards": row.penalty_yards,
            "explosive_plays": (row.explosive_passes or 0) + (row.explosive_runs or 0),
            "time_of_possession": seconds.get(abbr) or None,
            "epa_per_play": per(row.epa, row.plays), "success_rate": per(row.successes, row.plays),
            "epa_per_dropback": per(row.dropback_epa, row.dropbacks), "epa_per_run": per(row.run_epa, row.designed_runs),
            "pass_rate": per(row.dropbacks, row.plays), "drives": row.drives, "points_per_drive": per(row.drive_points, row.drives),
            "three_and_outs": row.three_and_outs,
            "average_start": per(row.start_yardline_sum, row.start_yardline_drives),
            "neutral_pass_rate": per(row.neutral_dropbacks, row.neutral_plays),
            "pass_rate_over_expected": per(row.neutral_pass_oe_sum, row.neutral_pass_oe_plays),
            "seconds_per_snap": per(row.neutral_seconds_sum, row.neutral_seconds_snaps),
            "adot": per(row.air_yards_sum, row.air_yards_attempts),
            "backs_per_play": per(row.back_snaps, row.snaps), "tight_ends_per_play": per(row.te_snaps, row.snaps),
            "receivers_per_play": per(row.wr_snaps, row.snaps),
        }
    return out


def _league_rates(db: Session, game: Game) -> dict:
    """Every offense's EPA per play and success rate this season, the middle a recap's
    quarter grid tints against."""
    plays, epa, successes = db.execute(
        select(func.sum(TeamGameStats.plays), func.sum(TeamGameStats.epa), func.sum(TeamGameStats.successes))
        .where(TeamGameStats.season == game.season, TeamGameStats.side == "o")
    ).one()
    if not plays:
        return {"epa_per_play": None, "success_rate": None}
    return {"epa_per_play": round(epa / plays, 4), "success_rate": round(successes / plays, 4)}


def _week_ranks(db: Session, game: Game, config: ScoringConfig, abbrs: tuple[str, str]) -> dict | None:
    """Both offenses ranked against everyone who played that week. Regular season only:
    a playoff week has two to eight teams, and "2nd of 2" is not a rank worth showing."""
    if game.season_type != "REG":
        return None
    board = team_board(db, game.season, "REG", str(game.week), config)
    metrics = {}
    for metric_id in WEEK_RANK_METRICS:
        values = board["values"].get(metric_id, {}).get("o", {})
        metrics[metric_id] = {abbr: values.get(abbr) for abbr in abbrs}
    return {"teams": len(board["teams"]), "metrics": metrics}


def game_recap(db: Session, game: Game, config: ScoringConfig) -> dict:
    teams = _teams(db)
    home = teams[game.home_team_id].abbreviation
    away = teams[game.away_team_id].abbreviation
    abbr = {team_id: team.abbreviation for team_id, team in teams.items()}

    plays = list(db.scalars(select(GamePlay).where(GamePlay.game_id == game.game_id)
                            .order_by(GamePlay.sequence, GamePlay.play_id)))
    drive_rows = list(db.scalars(select(GameDrive).where(GameDrive.game_id == game.game_id).order_by(GameDrive.drive)))
    drives = [{
        "drive": d.drive, "team": abbr.get(d.team_id), "quarter": d.quarter, "clock": d.clock, "elapsed": d.elapsed,
        "start": d.start_yardline, "end": d.end_yardline, "plays": d.plays, "yards": d.yards, "first_downs": d.first_downs,
        "seconds": d.seconds, "result": d.result, "points": d.points, "started_by": d.started_by,
    } for d in drive_rows if d.start_yardline is not None]
    by_drive = {d["drive"]: d for d in drives}

    # Win probability: the market's view at kickoff, then the home team's chance after every play.
    series, end = [], 0
    for play in plays:
        t = elapsed(play.quarter, play.quarter_seconds, game.season_type)
        if t is None or play.home_wp_post is None:
            continue
        series.append([t, round(play.home_wp_post, 4)])
        end = max(end, t)
    pregame = next((p.home_wp for p in plays if p.home_wp is not None), None)
    if series and game.home_score is not None:
        final = 1.0 if game.home_score > game.away_score else 0.0 if game.home_score < game.away_score else 0.5
        series.append([end + 1, final])
        end += 1

    swings = []
    for play in plays:
        if play.home_wp is None or play.home_wp_post is None or play.team_id is None:
            continue
        swings.append({
            "elapsed": elapsed(play.quarter, play.quarter_seconds, game.season_type), "quarter": play.quarter,
            "clock": play.clock, "team": abbr.get(play.team_id), "text": short_play(play.description),
            "home_delta": round(play.home_wp_post - play.home_wp, 4), "home_wp": round(play.home_wp_post, 4),
        })
    swings = sorted(swings, key=lambda s: -abs(s["home_delta"]))[:SWINGS]

    # Scoring plays, each touchdown carrying its try.
    scoring = []
    for index, play in enumerate(plays):
        if play.score_type not in ("TD", "FG", "SAF", "DEF2"):
            continue
        try_play = None
        if play.score_type == "TD":
            try_play = next((p for p in plays[index + 1:index + 4]
                             if p.play_type == "extra_point" or (p.description or "").startswith("TWO-POINT")), None)
        last = try_play or play
        drive = by_drive.get(play.drive)
        scoring.append({
            "quarter": play.quarter, "clock": play.clock, "team": abbr.get(play.score_team_id), "type": play.score_type,
            "text": scoring_text(play.score_type, play.description, try_play.description if try_play else None),
            "away_score": last.away_score, "home_score": last.home_score,
            "elapsed": elapsed(play.quarter, play.quarter_seconds, game.season_type),
            "drive": {"plays": drive["plays"], "yards": drive["yards"], "seconds": drive["seconds"]} if drive and drive["team"] == abbr.get(play.score_team_id) else None,
        })

    # Lead changes, ties and the largest leads, from the score after each scoring play.
    lead, changes, ties, biggest = None, 0, 0, {home: 0, away: 0}
    for score in scoring:
        diff = (score["home_score"] or 0) - (score["away_score"] or 0)
        leader = home if diff > 0 else away if diff < 0 else None
        if leader is None:
            ties += 1
        else:
            if lead is not None and leader != lead:
                changes += 1
            lead = leader
            biggest[leader] = max(biggest[leader], abs(diff))

    epa_by_quarter: dict[str, list[dict]] = {home: [], away: []}
    quarters = sorted({p.quarter for p in plays if p.quarter})
    for team in (away, home):
        for quarter in quarters:
            rows = [p for p in plays if p.quarter == quarter and abbr.get(p.team_id) == team
                    and (p.is_pass or p.is_rush) and p.epa is not None]
            epa_by_quarter[team].append({
                "quarter": quarter, "plays": len(rows), "epa": round(sum(p.epa for p in rows), 2),
                "success_rate": round(sum(1 for p in rows if p.success) / len(rows), 4) if rows else None,
            })

    players = _player_lines(db, game, config, teams, plays)
    passers = defaultdict(list)
    for line in players:
        if line["position"] == "QB" and (line["attempts"] or 0) >= 5:
            passers[line["team"]].append(line["player_id"])

    return {
        "game_id": game.game_id, "scoring": config.model_dump(),
        "win_probability": {"pregame": round(pregame, 4) if pregame is not None else None, "end": end, "series": series},
        "swings": swings, "scoring_plays": scoring, "drives": drives,
        "flow": {"lead_changes": changes, "ties": ties, "largest_lead": biggest,
                 "plays": sum(1 for p in plays if p.is_pass or p.is_rush)},
        "epa_by_quarter": epa_by_quarter,
        "touches": _touches(plays, game.season_type),
        "league": _league_rates(db, game),
        "team_box": _team_box(db, game, teams, drives),
        "week_ranks": _week_ranks(db, game, config, (away, home)),
        "players": players,
        "passers": passers,
        "has_targets": bool(db.scalar(select(exists().where(PlayTarget.game_id == game.game_id)))),
    }


def game_play_list(db: Session, game: Game) -> dict:
    """Every play, in order, for the play-by-play tab."""
    abbr = {team.team_id: team.abbreviation for team in db.scalars(select(Team))}
    plays = db.scalars(select(GamePlay).where(GamePlay.game_id == game.game_id).order_by(GamePlay.sequence, GamePlay.play_id))
    out = []
    for play in plays:
        before, after = play.home_wp, play.home_wp_post
        out.append({
            "play_id": play.play_id, "quarter": play.quarter, "clock": play.clock, "team": abbr.get(play.team_id),
            "drive": play.drive, "down": play.down, "distance": play.distance, "yardline": play.yardline,
            "type": play.play_type, "text": clean_description(play.description),
            "epa": round(play.epa, 3) if play.epa is not None else None,
            "home_wp": round(after, 4) if after is not None else None,
            "home_wp_delta": round(after - before, 4) if after is not None and before is not None else None,
            "score_type": play.score_type, "touchdown": play.touchdown, "turnover": play.turnover,
            "away_score": play.away_score, "home_score": play.home_score,
        })
    return {"game_id": game.game_id, "plays": out}


# ---------------------------------------------------------------------------------------
# The preview
# ---------------------------------------------------------------------------------------
def _team_results(db: Session, season: int, team_id: int, before: date | None) -> list[dict]:
    """Every game this team has played this season, with the line from its own side."""
    filters = [Game.season == season, Game.home_score.is_not(None),
               or_(Game.home_team_id == team_id, Game.away_team_id == team_id)]
    if before is not None:
        filters.append(Game.game_date < before)
    abbr = {team.team_id: team.abbreviation for team in db.scalars(select(Team))}
    out = []
    for game in db.scalars(select(Game).where(*filters).order_by(Game.game_date)):
        is_home = game.home_team_id == team_id
        scored, allowed = (game.home_score, game.away_score) if is_home else (game.away_score, game.home_score)
        # The stored spread favours the home team when positive, so from the away side it flips.
        line = None if game.spread_line is None else (game.spread_line if is_home else -game.spread_line)
        margin = scored - allowed
        out.append({
            "game_id": game.game_id, "week": game.week, "season_type": game.season_type,
            "opponent": abbr.get(game.away_team_id if is_home else game.home_team_id), "home": is_home,
            "points_for": scored, "points_against": allowed,
            "result": "W" if margin > 0 else "L" if margin < 0 else "T",
            "favored_by": line,
            "cover": None if line is None else ("W" if margin > line else "L" if margin < line else "P"),
            "total_line": game.total_line,
            "over_under": None if game.total_line is None else
            ("O" if scored + allowed > game.total_line else "U" if scored + allowed < game.total_line else "P"),
        })
    return out


def _slate(db: Session, game: Game, abbrs: dict[int, str]) -> dict:
    """Where this game's implied totals and total sit among the week's priced games."""
    games = list(db.scalars(select(Game).where(Game.season == game.season, Game.week == game.week,
                                               Game.season_type == game.season_type, Game.total_line.is_not(None),
                                               Game.spread_line.is_not(None))))
    offenses = []
    for g in games:
        home_total, away_total = implied_totals(g.spread_line, g.total_line)
        offenses += [(home_total, g.home_team_id), (away_total, g.away_team_id)]
    offenses.sort(key=lambda pair: -pair[0])
    ranks = {team_id: index + 1 for index, (_, team_id) in enumerate(offenses)}
    totals = sorted((g.total_line for g in games), reverse=True)
    return {
        "offenses": len(offenses), "games": len(games),
        "implied_rank": {abbrs[t]: ranks.get(t) for t in (game.home_team_id, game.away_team_id)},
        "total_rank": totals.index(game.total_line) + 1 if game.total_line in totals else None,
    }


def _meetings(db: Session, game: Game, config: ScoringConfig, abbrs: dict[int, str]) -> list[dict]:
    """Every meeting since FIRST_SEASON, newest first, with its top fantasy scorers in this scoring."""
    pair = (game.home_team_id, game.away_team_id)
    meetings = list(db.scalars(
        select(Game).where(Game.home_team_id.in_(pair), Game.away_team_id.in_(pair), Game.home_score.is_not(None),
                           Game.season >= FIRST_SEASON, Game.game_id != game.game_id)
        .order_by(Game.game_date.desc())
    ))
    if not meetings:
        return []
    points = points_expr(config, sum_mode=False)
    scorers = defaultdict(list)
    for row in db.execute(
        select(PlayerStats.game_id, PlayerStats.player_id, PlayerStats.team_id, Player.name, Player.position,
               Player.headshot_url, points.label("points"))
        .join(Player, PlayerStats.player_id == Player.player_id)
        .where(PlayerStats.game_id.in_([m.game_id for m in meetings]), Player.position.in_(POSITIONS))
        .order_by(PlayerStats.game_id, points.desc())
    ):
        if len(scorers[row.game_id]) < MEETING_SCORERS:
            scorers[row.game_id].append({"player_id": row.player_id, "name": row.name, "position": row.position,
                                         "headshot_url": row.headshot_url, "team": abbrs.get(row.team_id),
                                         "fantasy_points": round(row.points, 2)})
    out = []
    for m in meetings:
        home, away = abbrs.get(m.home_team_id), abbrs.get(m.away_team_id)
        out.append({
            "game_id": m.game_id, "season": m.season, "week": m.week, "season_type": m.season_type,
            "week_label": week_label(m), "home": home, "away": away, "home_score": m.home_score, "away_score": m.away_score,
            "winner": home if m.home_score > m.away_score else away if m.away_score > m.home_score else None,
            "spread_line": m.spread_line, "total_line": m.total_line,
            "line_result": _line_result(m, home, away), "top_scorers": scorers.get(m.game_id, []),
        })
    return out


def _weekly_ranks(db: Session, game: Game) -> dict[str, dict]:
    """This week's consensus position rank for every ranked player, from the newest weekly boards."""
    if game.season_type != "REG":
        return {}
    newest = (
        select(PlayerRanking.ranking_type, func.max(PlayerRanking.scraped_at).label("scraped_at"))
        .where(PlayerRanking.season == game.season, PlayerRanking.week == game.week, PlayerRanking.source == CONSENSUS_SOURCE,
               PlayerRanking.ranking_type.in_([f"weekly-{p.lower()}" for p in POSITIONS]))
        .group_by(PlayerRanking.ranking_type).subquery()
    )
    rows = db.execute(
        select(PlayerRanking.player_id, PlayerRanking.ranking_type, PlayerRanking.ecr, PlayerRanking.best,
               PlayerRanking.worst, PlayerRanking.scraped_at)
        .join(newest, (PlayerRanking.ranking_type == newest.c.ranking_type) & (PlayerRanking.scraped_at == newest.c.scraped_at))
        .where(PlayerRanking.season == game.season, PlayerRanking.week == game.week, PlayerRanking.source == CONSENSUS_SOURCE)
        .order_by(PlayerRanking.ranking_type, PlayerRanking.ecr)
    ).all()
    ranks, counter = {}, defaultdict(int)
    for row in rows:
        counter[row.ranking_type] += 1
        position = row.ranking_type.split("-", 1)[1].upper()
        ranks[row.player_id] = {"rank": counter[row.ranking_type], "label": f"{position}{counter[row.ranking_type]}",
                                "ecr": row.ecr, "best": row.best, "worst": row.worst, "as_of": row.scraped_at}
    return ranks


def _dvp(db: Session, season: int, config: ScoringConfig, abbrs: dict[int, str], team_ids: tuple[int, int]) -> dict:
    """Points each of these two defenses allows to each position, ranked among 32 (1 = most allowed)."""
    allowed = points_allowed(db, season, config)
    out = {abbrs[t]: {} for t in team_ids}
    league = {}
    for position in POSITIONS:
        table = sorted(((value, team) for (team, pos), value in allowed.items() if pos == position), reverse=True)
        league[position] = round(sum(value for value, _ in table) / len(table), 2) if table else None
        for index, (value, team) in enumerate(table):
            if team in team_ids:
                out[abbrs[team]][position] = {"points_allowed": round(value, 2), "rank": index + 1, "teams": len(table)}
    return {"defenses": out, "league": league}


def _season_players(db: Session, game: Game, season: int, config: ScoringConfig, abbrs: dict[int, str],
                    weekly_ranks: dict, injuries: dict, dvp: dict) -> dict[str, list[dict]]:
    """Each team's fantasy players: season to date for this team, week by week, and this game's matchup."""
    team_ids = (game.away_team_id, game.home_team_id)
    filters = [PlayerStats.season == season, PlayerStats.season_type == "REG", PlayerStats.team_id.in_(team_ids),
               Player.position.in_(POSITIONS)]
    if season == game.season and game.season_type == "REG":
        filters.append(PlayerStats.week < game.week)
    rows = db.execute(
        select(PlayerStats, Player.name, Player.position, Player.headshot_url, Player.team_id.label("current_team"))
        .join(Player, PlayerStats.player_id == Player.player_id).where(*filters).order_by(PlayerStats.week)
    ).all()

    # Weekly finishes for the same weeks, among everyone at the position (unqualified, as in the game log).
    points = points_expr(config, sum_mode=False)
    weeks = sorted({line.week for line, *_ in rows})
    finish = {}
    if weeks:
        ranked = (
            select(PlayerStats.player_id.label("player_id"), PlayerStats.week.label("week"),
                   func.rank().over(partition_by=(PlayerStats.week, Player.position), order_by=points.desc()).label("rank"))
            .join(Player, PlayerStats.player_id == Player.player_id)
            .where(PlayerStats.season == season, PlayerStats.season_type == "REG", PlayerStats.week.in_(weeks),
                   Player.position.in_(POSITIONS))
            .subquery()
        )
        ids = {line.player_id for line, *_ in rows}
        finish = {(r.player_id, r.week): r.rank for r in db.execute(select(ranked).where(ranked.c.player_id.in_(ids)))}

    # A team's weeks without a game are byes.
    played_weeks = {}
    for team_id in team_ids:
        played_weeks[team_id] = {w for (w,) in db.execute(select(Game.week).where(
            Game.season == season, Game.season_type == "REG", Game.home_score.is_not(None),
            or_(Game.home_team_id == team_id, Game.away_team_id == team_id)))}
    all_weeks = sorted(set().union(*played_weeks.values())) if played_weeks else []

    people: dict[tuple[str, int], dict] = {}
    for line, name, position, headshot, current_team in rows:
        if current_team not in team_ids:
            continue  # gone since: cut or traded away
        key = (line.player_id, line.team_id)
        person = people.setdefault(key, {"player_id": line.player_id, "name": name, "position": position,
                                         "headshot_url": headshot, "team": abbrs.get(line.team_id), "lines": {}})
        fp = compute_points(config, {k: getattr(line, k) for k in POINTS_COMPONENTS}, position)
        xfp = compute_expected_points(config, {k: getattr(line, k) for k in EXPECTED_COMPONENTS}, position)
        person["lines"][line.week] = {"fp": fp, "xfp": xfp, "target_share": line.target_share,
                                      "rush_attempt_share": line.rush_attempt_share, "snap_share": line.snap_share,
                                      "targets": line.targets or 0, "carries": line.carries or 0,
                                      "rz": (line.red_zone_targets or 0) + (line.rush_att_inside_10 or 0)}

    def mean(values):
        values = [v for v in values if v is not None]
        return round(sum(values) / len(values), 4) if values else None

    out: dict[str, list[dict]] = {abbrs[t]: [] for t in team_ids}
    for (player_id, team_id), person in people.items():
        lines = person.pop("lines")
        games = len(lines)
        opponent = game.home_team_id if team_id == game.away_team_id else game.away_team_id
        injury = injuries.get((team_id, player_id))
        person.update({
            "games": games,
            "fantasy_points": round(sum(l["fp"] for l in lines.values()), 2),
            "fantasy_ppg": round(sum(l["fp"] for l in lines.values()) / games, 2),
            "expected_fantasy_ppg": round(sum(l["xfp"] or 0 for l in lines.values()) / games, 2)
            if any(l["xfp"] is not None for l in lines.values()) else None,
            "target_share": mean(l["target_share"] for l in lines.values()),
            "rush_attempt_share": mean(l["rush_attempt_share"] for l in lines.values()),
            "snap_share": mean(l["snap_share"] for l in lines.values()),
            "targets": sum(l["targets"] for l in lines.values()), "carries": sum(l["carries"] for l in lines.values()),
            "weeks": [
                {"week": w, "bye": True} if w not in played_weeks[team_id] else
                {"week": w, "played": False} if w not in lines else
                {"week": w, "played": True, "fantasy_points": round(lines[w]["fp"], 2),
                 "position_rank": finish.get((player_id, w)), "target_share": lines[w]["target_share"],
                 "rush_attempt_share": lines[w]["rush_attempt_share"], "snap_share": lines[w]["snap_share"]}
                for w in all_weeks
            ],
            "consensus": weekly_ranks.get(player_id),
            "injury": injury,
            "matchup": dvp["defenses"].get(abbrs[opponent], {}).get(person["position"]),
        })
        out[person["team"]].append(person)
    for team in out:
        out[team].sort(key=lambda p: -(p["fantasy_ppg"] or 0))
    return out


def _board_values(board: dict, metric_ids: tuple[str, ...], abbrs: tuple[str, str]) -> list[dict]:
    """Selected team metrics for two teams, both sides, with ranks and league means."""
    out = []
    for metric_id in metric_ids:
        metric = TEAM_METRICS.get(metric_id)
        values = board["values"].get(metric_id)
        if metric is None or values is None:
            continue
        out.append({
            "id": metric_id, "label": metric.label, "fmt": metric.fmt,
            "o": {abbr: values.get("o", {}).get(abbr) for abbr in abbrs},
            "d": {abbr: values.get("d", {}).get(abbr) for abbr in abbrs},
            "o_mean": values.get("o_mean"), "d_mean": values.get("d_mean"),
        })
    return out


def game_preview(db: Session, game: Game, config: ScoringConfig) -> dict:
    teams = _teams(db)
    abbrs = {team_id: team.abbreviation for team_id, team in teams.items()}
    home, away = abbrs[game.home_team_id], abbrs[game.away_team_id]
    team_ids = (game.away_team_id, game.home_team_id)

    # The season the numbers describe: this one once it has a game in it, the last one before.
    current = [PlayerStats.season == game.season, PlayerStats.season_type == "REG"]
    if game.season_type == "REG":
        current.append(PlayerStats.week < game.week)
    basis = game.season if db.scalar(select(exists().where(*current))) else game.season - 1

    weekly_ranks = _weekly_ranks(db, game)
    injuries, report = {}, []
    for row in db.scalars(select(InjuryReport).where(
            InjuryReport.season == game.season, InjuryReport.season_type == game.season_type,
            InjuryReport.week == game.week, InjuryReport.team_id.in_(team_ids))):
        entry = {"status": row.status, "injury": row.injury, "practice": row.practice_status}
        injuries[(row.team_id, row.player_id)] = entry
        report.append({"team": abbrs[row.team_id], "player_id": row.player_id, "name": row.name,
                       "position": row.position, **entry})
    status_order = {"Out": 0, "Doubtful": 1, "Questionable": 2}
    report.sort(key=lambda r: (status_order.get(r["status"], 3), r["team"], r["name"] or ""))

    dvp_season, dvp_kind, dvp_weeks = resolve_basis(db, game.season)
    dvp = _dvp(db, dvp_season, config, abbrs, team_ids) if dvp_season else {"defenses": {home: {}, away: {}}, "league": {}}

    board = team_board(db, basis, "REG", "", config)
    breakdowns = {t: team_breakdown(db, t, basis, "REG", "") for t in team_ids}
    staff = {abbrs[s.team_id]: {"head_coach": s.head_coach, "offensive_coordinator": s.offensive_coordinator,
                                "defensive_coordinator": s.defensive_coordinator}
             for s in db.scalars(select(TeamStaff).where(TeamStaff.season == game.season, TeamStaff.team_id.in_(team_ids)))}

    return {
        "game_id": game.game_id, "scoring": config.model_dump(), "basis_season": basis,
        "form": {abbrs[t]: _team_results(db, game.season, t, game.game_date) for t in team_ids},
        "slate": _slate(db, game, abbrs),
        "meetings": _meetings(db, game, config, abbrs),
        "players": _season_players(db, game, basis, config, abbrs, weekly_ranks, injuries, dvp),
        "points_allowed": {**dvp, "basis": {"season": dvp_season, "kind": dvp_kind, "weeks": dvp_weeks}},
        "injuries": report,
        "tape": _board_values(board, TAPE_METRICS, (away, home)),
        "tendencies": _board_values(board, TENDENCY_METRICS, (away, home)),
        "defense_tendencies": _board_values(board, DEFENSE_TENDENCY_METRICS, (away, home)),
        "teams_ranked": len(board["teams"]),
        "trend": {abbrs[t]: breakdowns[t]["trend"] for t in team_ids},
        "pass_depth": {abbrs[t]: breakdowns[t]["pass_depth"] for t in team_ids},
        "staff": staff,
    }
