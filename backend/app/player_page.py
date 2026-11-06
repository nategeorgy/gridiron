"""Query-time data for the tabbed player page (November 2026).

The player page became six tabs (Dashboard, Stats, Opportunity, Splits, Career,
Compare), and most of what they draw is already served elsewhere: the season row and its
percentiles by ``/stats/intelligence``, the game log by ``/players/{id}/stats``, the
career by ``/players/{id}/career``, the target map, run lanes and passing network by the
Explore endpoints. This module holds the rest, each one a question no other endpoint
answers:

- **weekly ranks**: each game's number for a set of stats, ranked among every player at
  the position with a stat line that week (the usage grid and "every week, ranked").
- **by quarterback**: a receiver's or back's numbers in the games each quarterback
  started.
- **game splits**: points per game in each kind of game (home, favoured, indoors...).
- **situation splits**: every target, carry or dropback by down, score, field position
  and, from FTN's charting, play type and formation. 2025 on, the game pages' scope.
- **next game**: his next fixture and what that defense has allowed to his position,
  game by game, with the offense's most-used players at it.
- **search index** and **week leaders**: the Player Dashboard.
- **carry histogram**: every carry by yards gained, beside every back's.
- **route tree**: targets by the route the receiver ran (participation, 2016-2025).

Nothing here is stored: every number is aggregated from stat lines or plays per request,
in the request's scoring, and the router caches the whole response by URL.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable, Iterable

from sqlalchemy import Integer, and_, cast, func, or_, select
from sqlalchemy.orm import Session

from app.aggregation import POSITIONS
from app.metrics import REGISTRY_BY_ID
from app.models import Game, Player, PlayerStats, Team
from app.models.game_detail import FIRST_GAME_PAGE_SEASON, GamePlay
from app.models.plays import PlayCharting, PlayRoute, PlayTarget
from app.scoring import (
    POINTS_COMPONENTS,
    TWO_POINT_CONV_WEIGHT,
    ScoringConfig,
    compute_points,
    points_expr,
)
from app.vegas import implied_totals


def _points(config: ScoringConfig, line, position: str) -> float:
    """One stat line's fantasy points in this scoring."""
    return compute_points(config, {name: getattr(line, name) for name in POINTS_COMPONENTS}, position)


def _team_abbreviations(db: Session) -> dict[int, str]:
    return dict(db.execute(select(Team.team_id, Team.abbreviation)).all())


def _num(value) -> float:
    return float(value or 0)


# ---------------------------------------------------------------------------------------
# Weekly ranks
# ---------------------------------------------------------------------------------------
def _ratio(numerator: str, *denominators: str) -> Callable[[dict], float | None]:
    def value(row: dict) -> float | None:
        if row.get(numerator) is None:
            return None
        total = sum(_num(row.get(name)) for name in denominators)
        return row[numerator] / total if total else None
    return value


# Per-game values that are not a stored column: each one divides this game's own
# numbers, never an average of rates. Anything else asked for must be a stored column.
WEEKLY_DERIVED: dict[str, tuple[tuple[str, ...], Callable[[dict], float | None]]] = {
    "yards_per_carry": (("rushing_yards", "carries"), _ratio("rushing_yards", "carries")),
    "yards_per_attempt": (("passing_yards", "attempts"), _ratio("passing_yards", "attempts")),
    "catch_rate": (("receptions", "targets"), _ratio("receptions", "targets")),
    "epa_per_play": (("epa", "attempts", "carries", "targets"), _ratio("epa", "attempts", "carries", "targets")),
    "dropbacks": (
        ("attempts", "sacks_suffered"),
        lambda row: None if row.get("attempts") is None else _num(row["attempts"]) + _num(row.get("sacks_suffered")),
    ),
}
_STAT_COLUMNS = {column.key for column in PlayerStats.__table__.columns}


def weekly_stat_ids(requested: str) -> tuple[str, ...]:
    """The requested ids this endpoint can rank: stored columns, the derived few, points."""
    out: dict[str, None] = {}
    for raw in requested.split(","):
        stat = raw.strip()
        if stat == "fantasy_points" or stat in WEEKLY_DERIVED or stat in _STAT_COLUMNS - {
            "stat_id", "player_id", "game_id", "team_id", "season", "week", "season_type"
        }:
            out.setdefault(stat, None)
    return tuple(out)


def _higher_is_better(stat: str) -> bool:
    definition = REGISTRY_BY_ID.get(stat)
    return definition.higher_is_better if definition is not None else True


def weekly_ranks(
    db: Session, player_id: str, position: str, season: int, season_type: str,
    stats: tuple[str, ...], config: ScoringConfig,
) -> dict:
    """Each of his games this season, every stat ranked among the position that week.

    **The pool is everyone at the position with a stat line that week** (and a value for
    the stat), unqualified, the same rule as a weekly finish: a week is one game, so
    there is nothing to qualify on. The percentile is mid-rank and direction-corrected
    like every other here, so fewer sacks is a higher percentile.
    """
    columns = set(POINTS_COMPONENTS)
    for stat in stats:
        if stat in WEEKLY_DERIVED:
            columns.update(WEEKLY_DERIVED[stat][0])
        elif stat != "fantasy_points":
            columns.add(stat)
    selected = [getattr(PlayerStats, name) for name in sorted(columns)]
    rows = db.execute(
        select(PlayerStats.player_id, PlayerStats.week, PlayerStats.game_id, *selected)
        .join(Player, PlayerStats.player_id == Player.player_id)
        .where(PlayerStats.season == season, PlayerStats.season_type == season_type, Player.position == position)
    ).mappings().all()

    by_week: dict[int, list[dict]] = defaultdict(list)
    for row in rows:
        values = {}
        for stat in stats:
            if stat == "fantasy_points":
                values[stat] = compute_points(config, row, position)
            elif stat in WEEKLY_DERIVED:
                values[stat] = WEEKLY_DERIVED[stat][1](row)
            else:
                values[stat] = row[stat]
        by_week[row["week"]].append({"player_id": row["player_id"], "game_id": row["game_id"], "values": values})

    weeks: dict[int, dict] = {}
    for week, entries in sorted(by_week.items()):
        mine = next((entry for entry in entries if entry["player_id"] == player_id), None)
        if mine is None:
            continue
        cells = {}
        for stat in stats:
            value = mine["values"][stat]
            if value is None:
                continue
            pool = [entry["values"][stat] for entry in entries if entry["values"][stat] is not None]
            higher = _higher_is_better(stat)
            better = sum(1 for other in pool if (other > value if higher else other < value))
            equal = sum(1 for other in pool if other == value)
            worse = len(pool) - better - equal
            cells[stat] = {
                "v": round(value, 4),
                "rank": better + 1,
                "n": len(pool),
                "pct": round(100 * (worse + 0.5 * equal) / len(pool)),
            }
        weeks[week] = {"game_id": mine["game_id"], "stats": cells}

    return {"player_id": player_id, "season": season, "season_type": season_type,
            "stats": list(stats), "weeks": weeks}


# ---------------------------------------------------------------------------------------
# Starting quarterbacks
# ---------------------------------------------------------------------------------------
def starting_quarterbacks(db: Session, game_ids: Iterable[str]) -> dict[tuple[str, int], dict]:
    """The quarterback with the most attempts for each team in each game.

    "Started" is read from the box score rather than a lineup feed: the passer with the
    most attempts is the one a receiver's game was played with, which is the question.
    A gadget throw by a receiver never wins it, since he is not a quarterback.
    """
    ids = list(set(game_ids))
    if not ids:
        return {}
    rows = db.execute(
        select(PlayerStats.game_id, PlayerStats.team_id, PlayerStats.player_id, PlayerStats.attempts,
               Player.name, Player.headshot_url)
        .join(Player, PlayerStats.player_id == Player.player_id)
        .where(PlayerStats.game_id.in_(ids), Player.position == "QB")
    ).all()
    best: dict[tuple[str, int], dict] = {}
    for row in rows:
        key = (row.game_id, row.team_id)
        if key not in best or (row.attempts or 0) > best[key]["attempts"]:
            best[key] = {"qb_id": row.player_id, "name": row.name, "headshot_url": row.headshot_url,
                         "attempts": row.attempts or 0}
    return best


def _team_targets(db: Session, game_ids: Iterable[str]) -> dict[tuple[str, int], int]:
    ids = list(set(game_ids))
    if not ids:
        return {}
    rows = db.execute(
        select(PlayerStats.game_id, PlayerStats.team_id, func.sum(PlayerStats.targets))
        .where(PlayerStats.game_id.in_(ids))
        .group_by(PlayerStats.game_id, PlayerStats.team_id)
    ).all()
    return {(game_id, team_id): int(total or 0) for game_id, team_id, total in rows}


def by_quarterback(db: Session, player_id: str, position: str, config: ScoringConfig) -> dict:
    """His regular-season numbers in the games each quarterback started, season by season.

    Sums, not rates: the page divides them, so a career line is Σ/Σ across seasons
    rather than an average of season rates. Route-based rates only count games with a
    route count, since routes start in 2016 and a season in progress is hand-loaded.
    """
    lines = db.execute(
        select(PlayerStats).where(PlayerStats.player_id == player_id, PlayerStats.season_type == "REG")
    ).scalars().all()
    game_ids = [line.game_id for line in lines]
    starters = starting_quarterbacks(db, game_ids)
    team_targets = _team_targets(db, game_ids)

    groups: dict[tuple[int, str], dict] = {}
    for line in lines:
        starter = starters.get((line.game_id, line.team_id))
        if starter is None or starter["qb_id"] == player_id:
            continue
        key = (line.season, starter["qb_id"])
        group = groups.setdefault(key, {
            "season": line.season, "qb_id": starter["qb_id"], "name": starter["name"],
            "headshot_url": starter["headshot_url"], "games": 0, "fantasy_points": 0.0,
            "targets": 0, "team_targets": 0, "receptions": 0, "receiving_yards": 0, "receiving_epa": 0.0,
            "epa_targets": 0, "carries": 0, "rushing_yards": 0,
            "routes_run": 0, "route_targets": 0, "route_yards": 0,
        })
        group["games"] += 1
        group["fantasy_points"] += _points(config, line, position)
        group["targets"] += line.targets or 0
        group["team_targets"] += team_targets.get((line.game_id, line.team_id), 0)
        group["receptions"] += line.receptions or 0
        group["receiving_yards"] += line.receiving_yards or 0
        if line.receiving_epa is not None:
            group["receiving_epa"] += line.receiving_epa
            group["epa_targets"] += line.targets or 0
        group["carries"] += line.carries or 0
        group["rushing_yards"] += line.rushing_yards or 0
        if line.routes_run:
            group["routes_run"] += line.routes_run
            group["route_targets"] += line.targets or 0
            group["route_yards"] += line.receiving_yards or 0

    rows = sorted(groups.values(), key=lambda g: (-g["season"], -g["games"]))
    for row in rows:
        row["fantasy_points"] = round(row["fantasy_points"], 2)
        row["receiving_epa"] = round(row["receiving_epa"], 3)
    return {"player_id": player_id, "seasons": sorted({row["season"] for row in rows}, reverse=True), "rows": rows}


# ---------------------------------------------------------------------------------------
# Game splits
# ---------------------------------------------------------------------------------------
_SPLIT_FIELDS = {
    "tgt": "targets", "rec": "receptions", "recyd": "receiving_yards", "car": "carries",
    "rushyd": "rushing_yards", "passyd": "passing_yards", "passtd": "passing_tds", "att": "attempts",
}


def _split_row(label: str, games: list[dict]) -> dict:
    count = len(games)
    row = {"label": label, "g": count}
    if not count:
        return row
    row["ppg"] = round(sum(g["pts"] for g in games) / count, 2)
    for key in _SPLIT_FIELDS:
        row[key] = round(sum(g[key] for g in games) / count, 2)
    row["td"] = sum(g["td"] for g in games)
    snaps = [g["snap"] for g in games if g["snap"] is not None]
    row["snap"] = round(sum(snaps) / len(snaps), 4) if snaps else None
    row["best"] = round(max(g["pts"] for g in games), 2)
    row["worst"] = round(min(g["pts"] for g in games), 2)
    return row


def game_splits(db: Session, player_id: str, position: str, season: int, config: ScoringConfig) -> dict:
    """Points per game in each kind of game this regular season.

    Every split is a pair (or a set) of complementary groups, so the page can show each
    beside his overall average. The line and the implied total are the closing market,
    from the schedule; a game with no line is left out of those two splits rather than
    counted as an underdog.
    """
    rows = db.execute(
        select(PlayerStats, Game)
        .join(Game, PlayerStats.game_id == Game.game_id)
        .where(PlayerStats.player_id == player_id, PlayerStats.season == season,
               PlayerStats.season_type == "REG")
        .order_by(PlayerStats.week)
    ).all()
    starters = starting_quarterbacks(db, [line.game_id for line, _ in rows])

    games: list[dict] = []
    for line, game in rows:
        home = line.team_id == game.home_team_id
        scored, allowed = (game.home_score, game.away_score) if home else (game.away_score, game.home_score)
        home_implied, away_implied = implied_totals(game.spread_line, game.total_line)
        spread = None if game.spread_line is None else (game.spread_line if home else -game.spread_line)
        starter = starters.get((line.game_id, line.team_id))
        entry = {
            "week": line.week,
            "pts": _points(config, line, position),
            "td": (line.passing_tds or 0) + (line.rushing_tds or 0) + (line.receiving_tds or 0),
            "snap": line.snap_share,
            "home": home,
            "result": None if scored is None or allowed is None else ("W" if scored > allowed else "L" if scored < allowed else "T"),
            "spread": spread,
            "implied": home_implied if home else away_implied,
            "indoors": (game.roof or "").lower() in ("dome", "closed") if game.roof else None,
            "division": game.div_game,
            "qb": starter,
        }
        for key, column in _SPLIT_FIELDS.items():
            entry[key] = getattr(line, column) or 0
        games.append(entry)

    groups = [
        {"title": "Form", "rows": [_split_row("Last 3 games", games[-3:]), _split_row("All games", games)]},
        {"title": "Where", "rows": [_split_row("Home", [g for g in games if g["home"]]),
                                    _split_row("Away", [g for g in games if not g["home"]])]},
        {"title": "Result", "rows": [_split_row("Wins", [g for g in games if g["result"] == "W"]),
                                     _split_row("Losses", [g for g in games if g["result"] == "L"])]},
        {"title": "Line", "rows": [_split_row("Favored", [g for g in games if g["spread"] is not None and g["spread"] > 0]),
                                   _split_row("Underdog", [g for g in games if g["spread"] is not None and g["spread"] < 0])]},
        {"title": "Implied total", "rows": [
            _split_row("Team total 24+", [g for g in games if g["implied"] is not None and g["implied"] >= 24]),
            _split_row("Team total under 24", [g for g in games if g["implied"] is not None and g["implied"] < 24])]},
        {"title": "Roof", "rows": [_split_row("Dome or roof closed", [g for g in games if g["indoors"] is True]),
                                   _split_row("Outdoors", [g for g in games if g["indoors"] is False])]},
        {"title": "Opponent", "rows": [_split_row("Division", [g for g in games if g["division"]]),
                                       _split_row("Non-division", [g for g in games if g["division"] is False])]},
    ]
    if position != "QB":
        quarterbacks: dict[str, list[dict]] = defaultdict(list)
        names: dict[str, str] = {}
        for g in games:
            if g["qb"]:
                quarterbacks[g["qb"]["qb_id"]].append(g)
                names[g["qb"]["qb_id"]] = g["qb"]["name"]
        if len(quarterbacks) > 1:
            ordered = sorted(quarterbacks.items(), key=lambda item: -len(item[1]))
            groups.append({"title": "Quarterback",
                           "rows": [_split_row(f"With {names[qb]}", rows_) for qb, rows_ in ordered]})
    return {"player_id": player_id, "season": season, "overall": _split_row("All games", games), "groups": groups}


# ---------------------------------------------------------------------------------------
# Situation splits (2025 on)
# ---------------------------------------------------------------------------------------
def _down_label(down: int | None, distance: int | None) -> str | None:
    if down is None:
        return None
    if down == 1:
        return "1st down"
    length = "short (1-3)" if (distance or 0) <= 3 else "medium (4-7)" if distance <= 7 else "long (8+)"
    return f"2nd and {length}" if down == 2 else f"3rd or 4th and {length}"


DOWN_LABELS = ("1st down", "2nd and short (1-3)", "2nd and medium (4-7)", "2nd and long (8+)",
               "3rd or 4th and short (1-3)", "3rd or 4th and medium (4-7)", "3rd or 4th and long (8+)")
SCORE_LABELS = ("Down 9 or more", "Down 1 to 8", "Tied", "Up 1 to 8", "Up 9 or more")
FIELD_LABELS = ("Own half", "Opponent's 21 to 50", "Red zone, 11 to 20", "Inside the 10")
PLAY_TYPE_LABELS = ("Play action", "Screen", "RPO", "Motion at the snap", "No huddle")
FORMATION_LABELS = ("Shotgun", "Under center", "Pistol", "Empty backfield")


def _score_label(margin: int) -> str:
    if margin <= -9:
        return "Down 9 or more"
    if margin < 0:
        return "Down 1 to 8"
    if margin == 0:
        return "Tied"
    return "Up 1 to 8" if margin < 9 else "Up 9 or more"


def _field_label(yardline_100: int | None) -> str | None:
    if yardline_100 is None:
        return None
    if yardline_100 > 50:
        return "Own half"
    if yardline_100 > 20:
        return "Opponent's 21 to 50"
    return "Red zone, 11 to 20" if yardline_100 > 10 else "Inside the 10"


def _charting_labels(chart: PlayCharting | None) -> tuple[list[str], list[str]]:
    if chart is None:
        return [], []
    kinds = [label for flag, label in ((chart.play_action, "Play action"), (chart.screen, "Screen"),
                                       (chart.rpo, "RPO"), (chart.motion, "Motion at the snap"),
                                       (chart.no_huddle, "No huddle")) if flag]
    shapes = []
    location = {"S": "Shotgun", "U": "Under center", "P": "Pistol"}.get(chart.qb_location or "")
    if location:
        shapes.append(location)
    if chart.backfield == 0:
        shapes.append("Empty backfield")
    return kinds, shapes


def _play_credit(config: ScoringConfig, play: GamePlay, player_id: str, position: str) -> tuple[float, int, int]:
    """(points, yards, touchdowns) one play credits this player with, in this scoring."""
    points, yards, tds = 0.0, 0, 0
    two = TWO_POINT_CONV_WEIGHT if play.two_point else 0.0
    if play.passer_id == player_id:
        points += config.pass_yd * (play.passing_yards or 0) + config.pass_td * bool(play.pass_touchdown) \
            + config.pass_int * bool(play.interception) + (two if play.is_pass else 0.0)
        yards += play.passing_yards or 0
        tds += bool(play.pass_touchdown)
    if play.rusher_id == player_id:
        points += config.rush_yd * (play.rushing_yards or 0) + config.rush_td * bool(play.rush_touchdown) \
            + (two if not play.is_pass else 0.0)
        yards += play.rushing_yards or 0
        tds += bool(play.rush_touchdown)
    if play.receiver_id == player_id:
        rec_weight = config.te_rec if config.te_rec is not None and position == "TE" else config.rec
        points += rec_weight * bool(play.complete) + config.rec_yd * (play.receiving_yards or 0) \
            + config.rec_td * bool(play.pass_touchdown) + two
        yards += play.receiving_yards or 0
        tds += bool(play.pass_touchdown)
    if play.fumble_lost_id == player_id:
        points += config.fumble_lost
    return points, yards, tds


def _is_try(play: GamePlay) -> bool:
    return (play.description or "").startswith("TWO-POINT")


def _unit(play: GamePlay, player_id: str | None, position: str) -> bool:
    """Whether a play counts as one of the unit's opportunities: a target for a receiver,
    a carry or target for a back, a dropback or run for a quarterback. With no player,
    whether it is one of the team's (the share's denominator)."""
    if _is_try(play):
        return False
    target = play.is_pass and play.receiver_id is not None
    carry = play.rusher_id is not None and play.rushing_yards is not None
    if position == "QB":
        return (play.passer_id == player_id or play.rusher_id == player_id) if player_id else (play.is_pass or play.is_rush)
    if position == "RB":
        if player_id is None:
            return target or carry
        return (target and play.receiver_id == player_id) or (carry and play.rusher_id == player_id)
    return target and (player_id is None or play.receiver_id == player_id)


def situation_splits(db: Session, player_id: str, position: str, season: int, config: ScoringConfig) -> dict:
    """Every target, carry or dropback he had this season, by the situation it came in.

    From ``game_plays``, so 2025 on. Play type and formation come from FTN's charting and
    appear only when a season has it. The share is his part of the team's opportunities
    of the same kind in that situation (targets for a receiver, carries and targets for a
    back); a quarterback has no share, since nearly every dropback is his.
    """
    if season < FIRST_GAME_PAGE_SEASON:
        return {"player_id": player_id, "season": season, "available": False, "groups": []}
    games = db.execute(
        select(PlayerStats.game_id, PlayerStats.team_id, Game.home_team_id)
        .join(Game, PlayerStats.game_id == Game.game_id)
        .where(PlayerStats.player_id == player_id, PlayerStats.season == season, PlayerStats.season_type == "REG")
    ).all()
    team_of = {game_id: team_id for game_id, team_id, _ in games}
    home_of = {game_id: home for game_id, _, home in games}
    if not team_of:
        return {"player_id": player_id, "season": season, "available": True, "charted": False, "groups": []}

    plays = db.execute(
        select(GamePlay).where(GamePlay.game_id.in_(list(team_of))).order_by(GamePlay.game_id, GamePlay.sequence, GamePlay.play_id)
    ).scalars().all()
    charting = {
        (row.game_id, row.play_id): row
        for row in db.execute(select(PlayCharting).where(PlayCharting.game_id.in_(list(team_of)))).scalars()
    }

    tally: dict[str, dict] = {}

    def bump(label: str, mine: bool, team: bool, play: GamePlay, credit: tuple[float, int, int] | None) -> None:
        row = tally.setdefault(label, {"label": label, "n": 0, "team": 0, "plays": 0, "pts": 0.0, "yds": 0,
                                       "td": 0, "epa": 0.0, "succ": 0})
        row["plays"] += 1
        row["team"] += team
        if mine and credit is not None:
            row["n"] += 1
            row["pts"] += credit[0]
            row["yds"] += credit[1]
            row["td"] += credit[2]
            row["epa"] += play.epa or 0.0
            row["succ"] += bool(play.success)

    previous: dict[str, tuple[int, int]] = {}
    for play in plays:
        score_before = previous.get(play.game_id, (0, 0))
        if play.home_score is not None and play.away_score is not None:
            previous[play.game_id] = (play.home_score, play.away_score)
        if play.team_id != team_of[play.game_id] or not (play.is_pass or play.is_rush):
            continue
        team = _unit(play, None, position)
        mine = _unit(play, player_id, position)
        credit = _play_credit(config, play, player_id, position) if mine else None
        home = play.team_id == home_of[play.game_id]
        margin = (score_before[0] - score_before[1]) * (1 if home else -1)
        kinds, shapes = _charting_labels(charting.get((play.game_id, play.play_id)))
        labels = ["All plays", _down_label(play.down, play.distance), _score_label(margin),
                  _field_label(play.yardline_100), *kinds, *shapes]
        for label in labels:
            if label:
                bump(label, mine, team, play, credit)

    def group(title: str, labels: tuple[str, ...]) -> dict:
        rows = []
        for label in labels:
            row = tally.get(label, {"label": label, "n": 0, "team": 0, "plays": 0, "pts": 0.0, "yds": 0,
                                    "td": 0, "epa": 0.0, "succ": 0})
            rows.append({**row, "pts": round(row["pts"], 2), "epa": round(row["epa"], 3)})
        return {"title": title, "rows": rows}

    charted = bool(charting)
    groups = [group("Down and distance", DOWN_LABELS), group("Score", SCORE_LABELS),
              group("Field position", FIELD_LABELS)]
    if charted:
        groups += [group("Play type", PLAY_TYPE_LABELS), group("Formation", FORMATION_LABELS)]
    overall = group("All plays", ("All plays",))["rows"][0]
    return {"player_id": player_id, "season": season, "available": True, "charted": charted,
            "overall": overall, "groups": groups}


# ---------------------------------------------------------------------------------------
# Next game: what the defense allows
# ---------------------------------------------------------------------------------------
# How many of the offense's players at his position each bar shows: the two receivers a
# defense actually had to cover, one back, one quarterback, one tight end.
PROMINENT_PER_GAME = {"WR": 2, "RB": 1, "TE": 1, "QB": 1}


def _usage_expr(position: str):
    if position == "QB":
        return func.coalesce(func.sum(PlayerStats.attempts), 0) + func.coalesce(func.sum(PlayerStats.carries), 0)
    if position == "RB":
        return func.coalesce(func.sum(PlayerStats.carries), 0) + func.coalesce(func.sum(PlayerStats.targets), 0)
    return func.coalesce(func.sum(PlayerStats.targets), 0)


def next_fixture(db: Session, team_id: int) -> Game | None:
    """His team's next unplayed game: the earliest scheduled game with no score."""
    return db.execute(
        select(Game)
        .where(or_(Game.home_team_id == team_id, Game.away_team_id == team_id), Game.home_score.is_(None),
               Game.game_date.is_not(None))
        .order_by(Game.season.desc(), Game.game_date, Game.week)
        .limit(1)
    ).scalar_one_or_none()


def defense_allows(db: Session, defense_id: int, position: str, season: int, config: ScoringConfig,
                   before=None) -> dict:
    """What one defense allowed to a position in each game it played this season.

    Each game's bar is every player at the position on the offense it faced, added up.
    The faces are that offense's most-used players at the position across its season
    (targets for receivers and tight ends, carries plus targets for backs, attempts plus
    carries for quarterbacks), the ones who played in that game: the players a defense
    had to stop rather than whoever happened to score.
    """
    abbrs = _team_abbreviations(db)
    filters = [Game.season == season, Game.season_type == "REG", Game.home_score.is_not(None),
               or_(Game.home_team_id == defense_id, Game.away_team_id == defense_id)]
    if before is not None:
        filters.append(Game.game_date < before)
    games = db.execute(select(Game).where(*filters).order_by(Game.week)).scalars().all()
    if not games:
        return {"season": season, "games": [], "average": None}
    offense_of = {g.game_id: (g.away_team_id if g.home_team_id == defense_id else g.home_team_id) for g in games}

    lines = db.execute(
        select(PlayerStats, Player.name, Player.headshot_url)
        .join(Player, PlayerStats.player_id == Player.player_id)
        .where(PlayerStats.game_id.in_(list(offense_of)), Player.position == position)
    ).all()
    usage = {
        (team_id, player_id): int(total or 0)
        for team_id, player_id, total in db.execute(
            select(PlayerStats.team_id, PlayerStats.player_id, _usage_expr(position))
            .join(Player, PlayerStats.player_id == Player.player_id)
            .where(PlayerStats.season == season, PlayerStats.season_type == "REG",
                   PlayerStats.team_id.in_(set(offense_of.values())), Player.position == position)
            .group_by(PlayerStats.team_id, PlayerStats.player_id)
        ).all()
    }

    by_game: dict[str, list[dict]] = defaultdict(list)
    for line, name, headshot in lines:
        if line.team_id != offense_of[line.game_id]:
            continue
        by_game[line.game_id].append({
            "player_id": line.player_id, "name": name, "headshot_url": headshot,
            "pts": round(_points(config, line, position), 2),
            "usage": usage.get((line.team_id, line.player_id), 0),
        })

    keep = PROMINENT_PER_GAME.get(position, 1)
    out = []
    for game in games:
        players = sorted(by_game.get(game.game_id, []), key=lambda p: -p["usage"])
        offense = offense_of[game.game_id]
        total = round(sum(p["pts"] for p in players), 2)
        best = max(players, key=lambda p: p["pts"]) if players else None
        out.append({
            "game_id": game.game_id, "week": game.week, "offense": abbrs.get(offense),
            "offense_home": game.home_team_id == offense, "total": total, "count": len(players),
            "prominent": [{k: p[k] for k in ("player_id", "name", "headshot_url", "pts")} for p in players[:keep]],
            "best": {k: best[k] for k in ("player_id", "name", "headshot_url", "pts")} if best else None,
            "others": round(total - sum(p["pts"] for p in players[:keep]), 2),
        })
    average = round(sum(g["total"] for g in out) / len(out), 2) if out else None
    return {"season": season, "games": out, "average": average}


def next_game(db: Session, player: Player, config: ScoringConfig) -> dict:
    """His team's next game, the market's view of it, and what that defense allows.

    The defense's season is the next game's season once the opponent has played in it,
    and the season before otherwise (Week 1), stated in ``allows.season``.
    """
    # Imported here: game_pages imports this module's neighbours, and the header is the
    # game page's own, so a next-game card and the game it links to cannot disagree.
    from app.game_pages import _weekly_ranks, game_header

    if player.team_id is None:
        return {"game": None}
    game = next_fixture(db, player.team_id)
    if game is None or game.season < FIRST_GAME_PAGE_SEASON:
        return {"game": None}
    header = game_header(db, game)
    opponent = game.away_team_id if game.home_team_id == player.team_id else game.home_team_id
    allows = defense_allows(db, opponent, player.position, game.season, config, before=game.game_date)
    if not allows["games"]:
        allows = defense_allows(db, opponent, player.position, game.season - 1, config)
    return {
        "game": header,
        "is_home": game.home_team_id == player.team_id,
        "consensus": _weekly_ranks(db, game).get(player.player_id),
        "allows": allows,
    }


# ---------------------------------------------------------------------------------------
# The Player Dashboard: search index and week leaders
# ---------------------------------------------------------------------------------------
def search_index(db: Session, season: int | None, config: ScoringConfig, finish_weeks: int = 4) -> dict:
    """Every quarterback, back, receiver and tight end with a stat line, for the typeahead.

    The whole index is sent once and searched in the browser, so a keystroke never waits
    on a request. Prominence (the order of equal matches) is career PPR points from the
    stored column, deliberately not the request's scoring: it only decides who is
    listed first, and a stored sum costs one pass over the table per data version
    rather than one per scoring. The current season's numbers are in the request's
    scoring, with his last few weekly finishes.
    """
    abbrs = _team_abbreviations(db)
    career = db.execute(
        select(
            PlayerStats.player_id,
            func.min(PlayerStats.season), func.max(PlayerStats.season),
            func.sum(PlayerStats.fantasy_points_ppr),
        )
        .where(PlayerStats.season_type == "REG")
        .group_by(PlayerStats.player_id)
    ).all()
    span = {pid: (first, last, float(points or 0)) for pid, first, last, points in career}
    players = db.execute(
        select(Player.player_id, Player.name, Player.position, Player.team_id, Player.headshot_url)
        .where(Player.position.in_(POSITIONS), Player.player_id.in_(list(span)))
    ).all()

    current: dict[str, dict] = {}
    weeks: list[int] = []
    if season is not None:
        points = points_expr(config, sum_mode=False)
        rows = db.execute(
            select(PlayerStats.player_id, PlayerStats.week, PlayerStats.team_id, points.label("pts"),
                   Player.position,
                   func.rank().over(partition_by=(PlayerStats.week, Player.position), order_by=points.desc()).label("rank"))
            .join(Player, PlayerStats.player_id == Player.player_id)
            .where(PlayerStats.season == season, PlayerStats.season_type == "REG", Player.position.in_(POSITIONS))
        ).all()
        weeks = sorted({row.week for row in rows})[-finish_weeks:]
        for row in rows:
            entry = current.setdefault(row.player_id, {"g": 0, "pts": 0.0, "fin": {}, "team_id": row.team_id,
                                                       "last_week": 0, "position": row.position})
            entry["g"] += 1
            entry["pts"] += float(row.pts or 0)
            if row.week in weeks:
                entry["fin"][row.week] = row.rank
            if row.week >= entry["last_week"]:
                entry["last_week"], entry["team_id"] = row.week, row.team_id
        # PPG rank among the qualified at each position, the same bar as every season rank.
        from app.percentiles import qualify_games
        min_games = qualify_games(len({row.week for row in rows}))
        for position in POSITIONS:
            pool = sorted(((e["pts"] / e["g"], pid) for pid, e in current.items()
                           if e["position"] == position and e["g"] >= min_games), reverse=True)
            for index, (_, pid) in enumerate(pool, start=1):
                current[pid]["rank"] = index

    out = []
    for pid, name, position, team_id, headshot in players:
        first, last, career_points = span[pid]
        now = current.get(pid)
        team = abbrs.get(now["team_id"]) if now else abbrs.get(team_id)
        out.append([
            pid, name, position, team, first, last,
            now["g"] if now else 0,
            round(now["pts"] / now["g"], 2) if now else None,
            now.get("rank") if now else None,
            [now["fin"].get(week) for week in weeks] if now else None,
            round(career_points, 1),
            headshot,
        ])
    out.sort(key=lambda row: -row[10])
    return {
        "season": season, "finish_weeks": weeks,
        "fields": ["player_id", "name", "position", "team", "first_season", "last_season", "games",
                   "ppg", "ppg_rank", "finishes", "career_points", "headshot_url"],
        "players": out,
    }


def week_leaders(db: Session, season: int, week: int, config: ScoringConfig, limit: int) -> dict:
    """The week's top scorers at each position, with the line that scored it."""
    abbrs = _team_abbreviations(db)
    points = points_expr(config, sum_mode=False)
    leaders: dict[str, list[dict]] = {}
    for position in POSITIONS:
        rows = db.execute(
            select(PlayerStats, Player.name, Player.headshot_url, Game, points.label("pts"))
            .join(Player, PlayerStats.player_id == Player.player_id)
            .join(Game, PlayerStats.game_id == Game.game_id)
            .where(PlayerStats.season == season, PlayerStats.week == week, PlayerStats.season_type == "REG",
                   Player.position == position)
            .order_by(points.desc())
            .limit(limit)
        ).all()
        ids = [line.player_id for line, *_ in rows]
        season_ppg = dict(db.execute(
            select(PlayerStats.player_id, func.avg(points))
            .join(Player, PlayerStats.player_id == Player.player_id)
            .where(PlayerStats.player_id.in_(ids), PlayerStats.season == season, PlayerStats.season_type == "REG",
                   PlayerStats.week <= week)
            .group_by(PlayerStats.player_id)
        ).all()) if ids else {}
        out = []
        for rank, (line, name, headshot, game, pts) in enumerate(rows, start=1):
            home = line.team_id == game.home_team_id
            out.append({
                "rank": rank, "player_id": line.player_id, "name": name, "headshot_url": headshot,
                "team": abbrs.get(line.team_id), "opponent": abbrs.get(game.away_team_id if home else game.home_team_id),
                "home": home, "game_id": game.game_id,
                "team_score": game.home_score if home else game.away_score,
                "opponent_score": game.away_score if home else game.home_score,
                "pts": round(float(pts or 0), 2),
                "season_ppg": round(float(season_ppg.get(line.player_id) or 0), 2),
                "snap_share": line.snap_share,
                **{name_: getattr(line, name_) for name_ in (
                    "completions", "attempts", "passing_yards", "passing_tds", "interceptions", "carries",
                    "rushing_yards", "rushing_tds", "receptions", "targets", "receiving_yards", "receiving_tds")},
            })
        leaders[position] = out
    return {"season": season, "week": week, "scoring": config.model_dump(), "leaders": leaders}


# ---------------------------------------------------------------------------------------
# Carries by yards gained, and the route tree
# ---------------------------------------------------------------------------------------
CARRY_BINS: tuple[tuple[str, int, int], ...] = (
    ("Loss", -99, -1), ("0", 0, 0), ("1-2", 1, 2), ("3-4", 3, 4), ("5-6", 5, 6),
    ("7-9", 7, 9), ("10-14", 10, 14), ("15-19", 15, 19), ("20+", 20, 999),
)


def _bin(yards: int) -> int:
    for index, (_, low, high) in enumerate(CARRY_BINS):
        if low <= yards <= high:
            return index
    return len(CARRY_BINS) - 1


def carry_histogram(db: Session, player_id: str, season: int, season_type: str = "REG") -> dict:
    """Every designed run by yards gained, his and every back's, as shares of each.

    From ``game_plays``, so 2025 on. Designed runs only, as on the run fan: a scramble
    is a pass play that broke down. Every back's carries are the pool, so his bars read
    against the position rather than against his own team.
    """
    if season < FIRST_GAME_PAGE_SEASON:
        return {"available": False, "bins": [label for label, *_ in CARRY_BINS]}
    rows = db.execute(
        select(GamePlay.rusher_id, GamePlay.rushing_yards, Player.position)
        .join(Player, GamePlay.rusher_id == Player.player_id)
        .where(GamePlay.season == season, GamePlay.season_type == season_type, GamePlay.is_rush.is_(True),
               GamePlay.rushing_yards.is_not(None), GamePlay.play_type != "qb_kneel",
               ~func.coalesce(GamePlay.description, "").startswith("TWO-POINT"),
               or_(GamePlay.rusher_id == player_id, Player.position == "RB"))
    ).all()
    mine = [0] * len(CARRY_BINS)
    league = [0] * len(CARRY_BINS)
    for rusher, yards, position in rows:
        index = _bin(yards)
        if rusher == player_id:
            mine[index] += 1
        if position == "RB":
            league[index] += 1
    return {"available": True, "bins": [label for label, *_ in CARRY_BINS], "mine": mine, "league": league,
            "carries": sum(mine), "league_carries": sum(league)}


def route_tree(db: Session, player_id: str, role: str, season: int | None, season_type: str = "REG") -> dict:
    """Targets by the route run, for a receiver (``role=receiver``) or a passer.

    From the participation feed joined to every target. Returns the seasons that have
    any charted route for him, so the page can open on the newest one and say why the
    season in progress is missing.
    """
    column = PlayTarget.passer_id if role == "passer" else PlayTarget.receiver_id
    available = [row[0] for row in db.execute(
        select(PlayTarget.season)
        .join(PlayRoute, and_(PlayRoute.game_id == PlayTarget.game_id, PlayRoute.play_id == PlayTarget.play_id))
        .where(column == player_id, PlayTarget.season_type == season_type)
        .group_by(PlayTarget.season).order_by(PlayTarget.season.desc())
    ).all()]
    if season is None or season not in available:
        season = available[0] if available else None
    if season is None:
        return {"player_id": player_id, "role": role, "season": None, "seasons": [], "routes": [], "total": 0}
    total = db.scalar(select(func.count()).select_from(PlayTarget).where(
        column == player_id, PlayTarget.season == season, PlayTarget.season_type == season_type)) or 0
    rows = db.execute(
        select(PlayRoute.route, func.count(), func.sum(cast(PlayTarget.complete, Integer)),
               func.sum(PlayTarget.yards), func.sum(cast(PlayTarget.touchdown, Integer)),
               func.sum(PlayTarget.epa), func.sum(PlayTarget.air_yards))
        .join(PlayTarget, and_(PlayRoute.game_id == PlayTarget.game_id, PlayRoute.play_id == PlayTarget.play_id))
        .where(column == player_id, PlayTarget.season == season, PlayTarget.season_type == season_type)
        .group_by(PlayRoute.route)
    ).all()
    routes = sorted(
        ({"route": route, "n": n, "rec": int(rec or 0), "yds": int(yds or 0), "td": int(td or 0),
          "epa": round(float(epa or 0), 3), "air": int(air or 0)} for route, n, rec, yds, td, epa, air in rows),
        key=lambda r: -r["n"],
    )
    return {"player_id": player_id, "role": role, "season": season, "seasons": available,
            "routes": routes, "total": int(total), "charted": sum(r["n"] for r in routes)}
