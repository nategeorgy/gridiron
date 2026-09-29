"""The Explore tab's play-level views: passing networks, target maps, run lanes.

Everything here aggregates ``play_targets`` / ``player_run_lanes`` on the way out, for
whatever season, weeks and situation a request names, so nothing about a view is baked
into the data. Aggregation is in Python over the matching rows: a season is ~17,000
targets, one query pulls them, and the same pass fills every bucket a chart needs (depth,
side, zone, a one-yard air-yard histogram) without a query per bucket.

**Depth buckets** are the conventional nflverse split used everywhere else on the site:
behind the line (< 0), short (0-9), intermediate (10-19), deep (20+). **Zones** are those
four depths crossed with the three sides play-by-play records (left, middle, right),
indexed ``depth * 3 + side``.

**A target with no charted depth or side still counts** as a target, a catch and its
yards; it is only left out of the buckets it cannot be placed in, which is why a bucket
total can be a few short of the target count.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.cache import VersionedCache
from app.models import Player, PlayerRunLane, PlayerStats, PlayTarget, Team
from app.models.plays import PASS_LOCATIONS, RUN_LANES

DEPTHS = ("behind", "short", "intermediate", "deep")
HIST_MIN, HIST_MAX = -10, 45  # one-yard air-yard bins, clamped at both ends
SITUATIONS = ("all", "red_zone", "late_downs")


def depth_index(air_yards: int | None) -> int | None:
    """Which of the four depth buckets a target falls in."""
    if air_yards is None:
        return None
    if air_yards < 0:
        return 0
    if air_yards < 10:
        return 1
    if air_yards < 20:
        return 2
    return 3


@dataclass(frozen=True)
class Window:
    """The plays a request is about."""

    season: int
    season_type: str = "REG"
    weeks: tuple[int, ...] | None = None
    situation: str = "all"

    def filters(self) -> list:
        clauses = [PlayTarget.season == self.season, PlayTarget.season_type == self.season_type]
        if self.weeks:
            clauses.append(PlayTarget.week.in_(self.weeks))
        if self.situation == "red_zone":
            clauses.append(PlayTarget.yardline_100 <= 20)
        elif self.situation == "late_downs":
            clauses.append(PlayTarget.down >= 3)
        return clauses


# --- tallies ----------------------------------------------------------------------------

def new_tally() -> dict:
    return {
        "targets": 0, "receptions": 0, "yards": 0, "touchdowns": 0, "interceptions": 0, "first_downs": 0,
        "epa": 0.0, "air_yards": 0, "charted": 0,
        "locations": [0, 0, 0],
        "depth": [0, 0, 0, 0], "depth_receptions": [0, 0, 0, 0], "depth_yards": [0, 0, 0, 0],
        "depth_touchdowns": [0, 0, 0, 0], "depth_epa": [0.0, 0.0, 0.0, 0.0],
        "zones": [0] * 12, "zone_receptions": [0] * 12,
        "weeks": set(),
    }


def add_target(tally: dict, row, histogram: list[int] | None = None) -> None:
    """Fold one target into a tally (and optionally a one-yard air-yard histogram)."""
    tally["targets"] += 1
    tally["receptions"] += int(row.complete)
    tally["yards"] += row.yards or 0
    tally["touchdowns"] += int(row.touchdown)
    tally["interceptions"] += int(row.interception)
    tally["first_downs"] += int(row.first_down)
    tally["epa"] += row.epa or 0.0
    tally["weeks"].add(row.week)
    side = PASS_LOCATIONS.index(row.location) if row.location in PASS_LOCATIONS else None
    if side is not None:
        tally["locations"][side] += 1
    depth = depth_index(row.air_yards)
    if depth is None:
        return
    tally["air_yards"] += row.air_yards
    tally["charted"] += 1
    tally["depth"][depth] += 1
    tally["depth_receptions"][depth] += int(row.complete)
    tally["depth_yards"][depth] += row.yards or 0
    tally["depth_touchdowns"][depth] += int(row.touchdown)
    tally["depth_epa"][depth] += row.epa or 0.0
    if side is not None:
        tally["zones"][depth * 3 + side] += 1
        tally["zone_receptions"][depth * 3 + side] += int(row.complete)
    if histogram is not None:
        histogram[min(HIST_MAX, max(HIST_MIN, row.air_yards)) - HIST_MIN] += 1


def finish_tally(tally: dict) -> dict:
    """A tally as the API returns it: rounded, with the rates a chart reads."""
    out = {key: value for key, value in tally.items() if key != "weeks"}
    out["games"] = len(tally["weeks"])
    out["epa"] = round(tally["epa"], 2)
    out["depth_epa"] = [round(value, 2) for value in tally["depth_epa"]]
    out["adot"] = round(tally["air_yards"] / tally["charted"], 2) if tally["charted"] else None
    out["epa_per_target"] = round(tally["epa"] / tally["targets"], 3) if tally["targets"] else None
    return out


def _players(db: Session, ids: Iterable[str]) -> dict[str, dict]:
    """Name, position and headshot for the ids we track (others come back absent)."""
    ids = [value for value in set(ids) if value]
    if not ids:
        return {}
    rows = db.execute(
        select(Player.player_id, Player.name, Player.position, Player.headshot_url).where(Player.player_id.in_(ids))
    ).all()
    return {row.player_id: {"name": row.name, "position": row.position, "headshot_url": row.headshot_url} for row in rows}


def _abbreviations(db: Session) -> dict[int, str]:
    return dict(db.execute(select(Team.team_id, Team.abbreviation)).all())


def _target_columns():
    return (PlayTarget.week, PlayTarget.air_yards, PlayTarget.location, PlayTarget.complete, PlayTarget.touchdown,
            PlayTarget.interception, PlayTarget.first_down, PlayTarget.yards, PlayTarget.epa)


# --- passing network ---------------------------------------------------------------------

def passer_list(db: Session, season: int, season_type: str) -> list[dict]:
    """Everyone who threw enough targets in a season to have a network, grouped by team.

    The bar is 10% of the busiest passer's targets (at least 5), so it scales with how
    much of the season has been played rather than hiding every backup in Week 2.
    """
    rows = db.execute(
        select(PlayTarget.passer_id, PlayTarget.team_id, func.count().label("targets"),
               func.count(func.distinct(PlayTarget.game_id)).label("games"))
        .where(PlayTarget.season == season, PlayTarget.season_type == season_type, PlayTarget.passer_id.is_not(None))
        .group_by(PlayTarget.passer_id, PlayTarget.team_id)
    ).all()
    if not rows:
        return []
    floor = max(5, round(max(row.targets for row in rows) * 0.10))
    people = _players(db, (row.passer_id for row in rows))
    abbr = _abbreviations(db)
    passers = [
        {"player_id": row.passer_id, "team": abbr.get(row.team_id), "targets": row.targets, "games": row.games,
         **people[row.passer_id]}
        for row in rows
        if row.targets >= floor and row.passer_id in people
    ]
    passers.sort(key=lambda entry: (entry["team"] or "", -entry["targets"]))
    return passers


def passing_network(db: Session, window: Window, passer_id: str, team_id: int | None = None) -> dict:
    """One passer's targets, receiver by receiver, with depth, side and zone splits.

    ``team_id`` narrows to the games he played for that team, which is what a same-team
    comparison needs (a quarterback traded mid-season threw to two different rooms).
    Receivers outside ``players`` come back with ``name: None``: the client folds them
    into "other" rather than naming them from play-by-play's abbreviated form.
    """
    abbr = _abbreviations(db)
    clauses = [*window.filters(), PlayTarget.passer_id == passer_id]
    if team_id is not None:
        clauses.append(PlayTarget.team_id == team_id)
    rows = db.execute(select(PlayTarget.receiver_id, PlayTarget.team_id, *_target_columns()).where(*clauses)).all()

    total = new_tally()
    per_receiver: dict[str | None, dict] = {}
    team_counts: dict[int, int] = {}
    for row in rows:
        add_target(total, row)
        add_target(per_receiver.setdefault(row.receiver_id, new_tally()), row)
        team_counts[row.team_id] = team_counts.get(row.team_id, 0) + 1
    main_team_id = max(team_counts, key=team_counts.get) if team_counts else team_id

    people = _players(db, [passer_id, *per_receiver])
    receivers = []
    for receiver_id, tally in per_receiver.items():
        person = people.get(receiver_id) or {"name": None, "position": None, "headshot_url": None}
        receivers.append({"player_id": receiver_id if receiver_id in people else None, **person, **finish_tally(tally)})
    receivers.sort(key=lambda entry: -entry["targets"])

    return {
        "season": window.season, "season_type": window.season_type, "weeks": list(window.weeks or []),
        "situation": window.situation,
        "passer": {"player_id": passer_id, **(people.get(passer_id) or {}), "team": abbr.get(main_team_id),
                   **_passing_line(db, window, passer_id, main_team_id if team_id is not None else None)},
        "totals": finish_tally(total),
        "receivers": receivers,
        "teammates": _teammates(db, window.season, window.season_type, passer_id, main_team_id, abbr),
    }


def _passing_line(db: Session, window: Window, passer_id: str, team_id: int | None) -> dict:
    """The passer's box score for the same weeks (situation does not apply to a box score)."""
    clauses = [PlayerStats.player_id == passer_id, PlayerStats.season == window.season,
               PlayerStats.season_type == window.season_type]
    if window.weeks:
        clauses.append(PlayerStats.week.in_(window.weeks))
    if team_id is not None:
        clauses.append(PlayerStats.team_id == team_id)
    row = db.execute(
        select(
            func.count(func.distinct(PlayerStats.game_id)).label("games"),
            func.sum(PlayerStats.completions).label("completions"),
            func.sum(PlayerStats.attempts).label("attempts"),
            func.sum(PlayerStats.passing_yards).label("passing_yards"),
            func.sum(PlayerStats.passing_tds).label("passing_tds"),
            func.sum(PlayerStats.interceptions).label("interceptions"),
            (func.sum(PlayerStats.cpoe * PlayerStats.attempts)
             / func.nullif(func.sum(PlayerStats.attempts).filter(PlayerStats.cpoe.is_not(None)), 0)).label("cpoe"),
        ).where(*clauses)
    ).one()
    return {
        "games": row.games or 0,
        "completions": int(row.completions or 0), "attempts": int(row.attempts or 0),
        "passing_yards": int(row.passing_yards or 0), "passing_tds": int(row.passing_tds or 0),
        "interceptions": int(row.interceptions or 0),
        "cpoe": round(row.cpoe, 2) if row.cpoe is not None else None,
    }


def _teammates(db: Session, season: int, season_type: str, passer_id: str, team_id: int | None,
               abbr: dict[int, str]) -> list[dict]:
    """Other passers who threw for the same team that season, for a side-by-side."""
    if team_id is None:
        return []
    rows = db.execute(
        select(PlayTarget.passer_id, func.count().label("targets"), func.count(func.distinct(PlayTarget.game_id)).label("games"))
        .where(PlayTarget.season == season, PlayTarget.season_type == season_type, PlayTarget.team_id == team_id,
               PlayTarget.passer_id.is_not(None), PlayTarget.passer_id != passer_id)
        .group_by(PlayTarget.passer_id)
    ).all()
    team_total = sum(row.targets for row in rows)
    people = _players(db, (row.passer_id for row in rows))
    return sorted(
        ({"player_id": row.passer_id, "targets": row.targets, "games": row.games, "team": abbr.get(team_id),
          **people[row.passer_id]}
         for row in rows if row.passer_id in people and row.targets >= max(15, team_total * 0.05)),
        key=lambda entry: -entry["targets"],
    )


# --- target analysis ---------------------------------------------------------------------

_BOARDS: VersionedCache[list[dict]] = VersionedCache(max_entries=24)


def target_board(db: Session, window: Window, positions: tuple[str, ...]) -> list[dict]:
    """Every receiver at these positions: depth, side, zone and a one-yard air-yard histogram.

    Unfiltered by volume or team, so one cached board serves every minimum and every
    team a page asks for; the caller narrows it on the way out.
    """
    def compute() -> list[dict]:
        rows = db.execute(
            select(PlayTarget.receiver_id, PlayTarget.team_id, Player.name, Player.position, Player.headshot_url,
                   *_target_columns())
            .join(Player, Player.player_id == PlayTarget.receiver_id)
            .where(*window.filters(), Player.position.in_(positions))
        ).all()
        abbr = _abbreviations(db)
        players: dict[str, dict] = {}
        for row in rows:
            entry = players.get(row.receiver_id)
            if entry is None:
                entry = players[row.receiver_id] = {
                    "player_id": row.receiver_id, "name": row.name, "position": row.position,
                    "headshot_url": row.headshot_url, "tally": new_tally(), "hist": [0] * (HIST_MAX - HIST_MIN + 1),
                    "last_week": -1, "team": None,
                }
            add_target(entry["tally"], row, entry["hist"])
            if row.week >= entry["last_week"]:
                entry["last_week"], entry["team"] = row.week, abbr.get(row.team_id)
        return [
            {"player_id": entry["player_id"], "name": entry["name"], "position": entry["position"],
             "headshot_url": entry["headshot_url"], "team": entry["team"], "hist": entry["hist"],
             **finish_tally(entry["tally"])}
            for entry in players.values()
        ]

    return _BOARDS.get_or_compute(db, ("board", window, positions), compute)


def target_detail(db: Session, window: Window, *, receiver_id: str | None = None, passer_id: str | None = None,
                  team_id: int | None = None) -> dict:
    """Every target for one receiver, one passer or one team, and their tally.

    The list is what "every target" draws and what a heatmap smooths; the tally fills
    the zone grid and the depth table beside it.
    """
    clauses = window.filters()
    if receiver_id:
        clauses.append(PlayTarget.receiver_id == receiver_id)
    if passer_id:
        clauses.append(PlayTarget.passer_id == passer_id)
    if team_id is not None:
        clauses.append(PlayTarget.team_id == team_id)
    rows = db.execute(
        select(*_target_columns(), PlayTarget.yards_after_catch)
        .where(*clauses).order_by(PlayTarget.week, PlayTarget.game_id, PlayTarget.play_id)
    ).all()
    tally = new_tally()
    for row in rows:
        add_target(tally, row)
    return {
        "summary": finish_tally(tally),
        "targets": [
            {"week": row.week, "air_yards": row.air_yards, "location": row.location, "complete": row.complete,
             "touchdown": row.touchdown, "interception": row.interception, "yards": row.yards,
             "yards_after_catch": row.yards_after_catch,
             "epa": round(row.epa, 3) if row.epa is not None else None}
            for row in rows
        ],
    }


_AVERAGES: VersionedCache[dict] = VersionedCache(max_entries=48)


def league_average(db: Session, window: Window, position: str | None = None) -> dict:
    """The average target for a position (or every target, for passers and teams), pooled.

    Pooled means every target counts once, so a 150-target receiver weighs more than a
    40-target one, as he should in "where do receivers get targeted". It is the whole
    position rather than a qualified subset, so it does not move when a page's minimum
    changes. ``heat`` is a one-yard air-yard histogram per side, which is what a heatmap
    needs to draw the average for comparison.
    """
    def compute() -> dict:
        query = select(*_target_columns())
        if position:
            query = query.join(Player, Player.player_id == PlayTarget.receiver_id).where(Player.position == position)
        rows = db.execute(query.where(*window.filters())).all()
        tally = new_tally()
        heat = [[0] * (HIST_MAX - HIST_MIN + 1) for _ in PASS_LOCATIONS]
        for row in rows:
            add_target(tally, row)
            if row.air_yards is not None and row.location in PASS_LOCATIONS:
                heat[PASS_LOCATIONS.index(row.location)][min(HIST_MAX, max(HIST_MIN, row.air_yards)) - HIST_MIN] += 1
        summary = finish_tally(tally)
        zone_total, depth_total = sum(tally["zones"]), sum(tally["depth"])
        return {
            "position": position,
            "targets": summary["targets"],
            "adot": summary["adot"],
            "epa_per_target": summary["epa_per_target"],
            "catch_rate": round(summary["receptions"] / summary["targets"], 4) if summary["targets"] else None,
            "zone_shares": [round(value / zone_total, 4) if zone_total else 0 for value in tally["zones"]],
            "depth_shares": [round(value / depth_total, 4) if depth_total else 0 for value in tally["depth"]],
            "depth_epa_per_target": [round(epa / count, 3) if count else None
                                     for epa, count in zip(tally["depth_epa"], tally["depth"])],
            "heat": heat,
        }

    return _AVERAGES.get_or_compute(db, ("average", window, position), compute)


# --- run lanes ------------------------------------------------------------------------------

_RUN_COLUMNS = ("carries", "yards", "successes", "first_downs", "touchdowns", "stuffed", "short", "medium", "explosive")
_LANE_COLUMNS = ("carries", "yards", "successes", "first_downs", "touchdowns")


def _run_summary(rows) -> dict:
    """Lane rows (one per lane, summed) as the charts read them: lanes left to right, and
    how every carry ended. ``unknown`` counts toward the totals but has no lane to draw."""
    by_lane = {row.lane: row for row in rows}
    totals = dict.fromkeys(_RUN_COLUMNS, 0)
    lanes = []
    for lane in RUN_LANES:
        row = by_lane.get(lane)
        values = {name: int(getattr(row, name) or 0) if row else 0 for name in _RUN_COLUMNS}
        for name, value in values.items():
            totals[name] += value
        if lane != "unknown":
            lanes.append({"lane": lane, **{name: values[name] for name in _LANE_COLUMNS}})
    return {
        "carries": totals["carries"], "yards": totals["yards"], "successes": totals["successes"],
        "first_downs": totals["first_downs"], "touchdowns": totals["touchdowns"],
        "lanes": lanes,
        "outcomes": {name: totals[name] for name in ("stuffed", "short", "medium", "explosive")},
    }


def _lane_sums():
    return (PlayerRunLane.lane, *(func.sum(getattr(PlayerRunLane, name)).label(name) for name in _RUN_COLUMNS))


def _run_filters(season: int, season_type: str, weeks: tuple[int, ...] | None) -> list:
    clauses = [PlayerRunLane.season == season, PlayerRunLane.season_type == season_type]
    if weeks:
        clauses.append(PlayerRunLane.week.in_(weeks))
    return clauses


def run_lanes(db: Session, player_id: str, season: int, season_type: str, weeks: tuple[int, ...] | None) -> dict:
    """One player's designed runs by lane, and how they ended."""
    rows = db.execute(
        select(*_lane_sums())
        .where(PlayerRunLane.player_id == player_id, *_run_filters(season, season_type, weeks))
        .group_by(PlayerRunLane.lane)
    ).all()
    return {"player_id": player_id, "season": season, "season_type": season_type, "weeks": list(weeks or []),
            **_run_summary(rows)}


_RUN_AVERAGES: VersionedCache[dict] = VersionedCache(max_entries=24)


def league_run_average(db: Session, season: int, season_type: str, weeks: tuple[int, ...] | None,
                       position: str = "RB") -> dict:
    """Every designed run by a position's players, pooled: the reference line on the lane
    and carry-outcome charts."""
    def compute() -> dict:
        rows = db.execute(
            select(*_lane_sums())
            .join(Player, Player.player_id == PlayerRunLane.player_id)
            .where(Player.position == position, *_run_filters(season, season_type, weeks))
            .group_by(PlayerRunLane.lane)
        ).all()
        return {"position": position, **_run_summary(rows)}

    return _RUN_AVERAGES.get_or_compute(db, ("runs", season, season_type, weeks, position), compute)
