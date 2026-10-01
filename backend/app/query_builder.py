"""The Query Builder: search every game or season since 2009 by any stat.

A search is a scope (positions, seasons, season type, team, rookies) plus a set of stat
ranges, answered as a list of games, a list of seasons, or a count of matching games per
player.

It runs against an **in-memory copy of every player-game**, not against Postgres. A
query builder is interactive: every range change is a new request, and every filter
card draws a histogram of its stat across the scope. Answered from ``player_stats``,
each of those reads the whole table, which is the Disk IO pattern that exhausted
Supabase's budget in September 2026 (see ``app/cache.py``). The copy is ~98,000 rows by
~40 columns, about 20 MB as numpy arrays, loaded once per data version and streamed in
chunks so the load never holds the table as Python objects.

**Aggregation follows the leaderboards.** Counts are summed; shares are a flat mean of
the weeks (the boards' "average weekly target share"); rates are the ratio of the summed
parts (Σyards / Σtargets, never a mean of weekly rates); CPOE is weighted by attempts.
Fantasy points use the scoring engine's own formula, term for term, so a half-PPR
search scores exactly as the half-PPR leaderboard does.

**Weekly finish** ranks everyone at the position with a stat line that week, in the
request's scoring: the pool and the competition-ranking rule of the player page's game
log (``_weekly_finishes`` in ``routers/players.py``).

**A range filters on the grain being searched.** In a games search "targets 10+" is a
game with ten targets; in a seasons search it is a season with ten. Histograms show the
scope before any stat range is applied, so a card never hides the values it filters out.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cache import VersionedCache
from app.metrics import REGISTRY_BY_ID
from app.models import Game, Player, PlayerStats, Team
from app.scoring import (
    EXPECTED_COMPONENTS,
    EXPECTED_WEIGHT_COLUMNS,
    POINTS_COMPONENTS,
    STANDARD_WEIGHTS,
    TWO_POINT_CONV_WEIGHT,
    WEIGHT_COLUMNS,
    ScoringConfig,
)

POSITIONS = ("QB", "RB", "WR", "TE")
GRAINS = ("games", "seasons")
MODES = ("list", "count")
SEASON_TYPES = ("REG", "POST", "ALL")
ROOKIE_FILTERS = ("any", "only", "exclude")
PLAYOFF_ROUNDS = {1: "WC", 2: "DIV", 3: "CONF", 4: "SB"}

HISTOGRAM_BINS = 26
MAX_CONDITIONS = 8
MAX_LIMIT = 5000
CHUNK_ROWS = 5000


# --- fields ----------------------------------------------------------------------------

@dataclass(frozen=True)
class QueryField:
    """One searchable stat, and how a game and a season value are built from the frame.

    ``kind`` is one of:
      sum        the sum of ``sources`` (a game is NULL only if every source is)
      mean       flat mean of the weekly values present (shares)
      weighted   ``sources[0]`` averaged with ``sources[1]`` as the weight (CPOE)
      ratio      Σ``sources[0]`` / Σ``sources[1]``
      points, expected, over_expected   fantasy points in the request's scoring
      per_game   fantasy points per game (seasons only)
      finish     weekly finish (games only)
      finishes   games finishing at or inside ``threshold`` (seasons only)
      games      games played (seasons only)
    """

    id: str
    group: str
    kind: str
    sources: tuple[str, ...] = ()
    grains: tuple[str, ...] = GRAINS
    threshold: int | None = None
    label: str = ""
    short: str = ""
    format: str | int = 1
    higher_is_better: bool = True
    description: str = ""

    def payload(self) -> dict:
        return {
            "id": self.id, "group": self.group, "label": self.label, "short": self.short,
            "format": self.format, "higher_is_better": self.higher_is_better,
            "grains": list(self.grains), "description": self.description,
        }


def _field(id: str, group: str, kind: str, *sources: str, **meta) -> QueryField:
    """A field, labelled from the metric registry when the registry has the stat."""
    registered = REGISTRY_BY_ID.get(id)
    defaults = {}
    if registered is not None:
        defaults = {
            "label": registered.label, "short": registered.short, "format": registered.format,
            "higher_is_better": registered.higher_is_better, "description": registered.description,
        }
    if kind in ("sum", "mean") and not sources:
        sources = (id,)
    return QueryField(id=id, group=group, kind=kind, sources=sources, **{**defaults, **meta})


FIELDS: tuple[QueryField, ...] = (
    _field("fantasy_points", "Fantasy", "points"),
    _field("fantasy_ppg", "Fantasy", "per_game", grains=("seasons",)),
    _field("expected_fantasy_points", "Fantasy", "expected"),
    _field("fantasy_points_over_expected", "Fantasy", "over_expected"),
    _field("weekly_finish", "Fantasy", "finish", grains=("games",), label="Weekly Finish", short="FINISH",
           format="int", higher_is_better=False,
           description="Rank among everyone at the position that week, in your scoring. 1 is the week's top scorer."),
    _field("top_12_weeks", "Fantasy", "finishes", grains=("seasons",), threshold=12, label="Top-12 Weeks",
           short="TOP 12", format="int", description="Weeks finishing 12th or better at the position."),
    _field("top_24_weeks", "Fantasy", "finishes", grains=("seasons",), threshold=24, label="Top-24 Weeks",
           short="TOP 24", format="int", description="Weeks finishing 24th or better at the position."),

    _field("completions", "Passing", "sum"),
    _field("attempts", "Passing", "sum"),
    _field("passing_yards", "Passing", "sum"),
    _field("passing_tds", "Passing", "sum"),
    _field("interceptions", "Passing", "sum"),
    _field("completion_pct", "Passing", "ratio", "completions", "attempts"),
    _field("yards_per_attempt", "Passing", "ratio", "passing_yards", "attempts"),
    _field("cpoe", "Passing", "weighted", "cpoe", "attempts"),
    _field("sacks_suffered", "Passing", "sum"),

    _field("carries", "Rushing", "sum"),
    _field("rushing_yards", "Rushing", "sum"),
    _field("rushing_tds", "Rushing", "sum"),
    _field("yards_per_carry", "Rushing", "ratio", "rushing_yards", "carries"),
    _field("red_zone_rush_attempts", "Rushing", "sum"),
    _field("rush_att_inside_5", "Rushing", "sum"),
    _field("rush_attempt_share", "Rushing", "mean"),

    _field("targets", "Receiving", "sum"),
    _field("receptions", "Receiving", "sum"),
    _field("receiving_yards", "Receiving", "sum"),
    _field("receiving_tds", "Receiving", "sum"),
    _field("catch_rate", "Receiving", "ratio", "receptions", "targets"),
    _field("yards_per_target", "Receiving", "ratio", "receiving_yards", "targets"),
    _field("air_yards", "Receiving", "sum"),
    _field("adot", "Receiving", "ratio", "air_yards", "targets"),
    _field("yards_after_catch", "Receiving", "sum"),
    _field("red_zone_targets", "Receiving", "sum"),
    _field("target_share", "Receiving", "mean"),
    _field("air_yards_share", "Receiving", "mean"),

    _field("games", "Usage", "games", grains=("seasons",), label="Games", short="G", format="int",
           description="Games played in the scope searched."),
    _field("snap_share", "Usage", "mean"),
    _field("routes_run", "Usage", "sum"),
    _field("route_participation", "Usage", "mean"),
    _field("opportunity_share", "Usage", "mean"),
    _field("touches", "Usage", "sum", "carries", "receptions", label="Touches", short="TCH", format="int",
           description="Carries plus receptions."),
    _field("scrimmage_yards", "Usage", "sum", "rushing_yards", "receiving_yards", label="Scrimmage Yards",
           short="SCRIM", format="int", description="Rushing plus receiving yards."),
    _field("total_tds", "Usage", "sum", "rushing_tds", "receiving_tds", label="Total TDs", short="TD",
           format="int", description="Rushing plus receiving touchdowns."),
)
FIELDS_BY_ID = {field.id: field for field in FIELDS}

# Columns the frame loads: every source above, plus what the scoring engine reads.
# The scoring components stay float64 so a weekly finish breaks ties exactly as the
# game log's SQL RANK() does; everything else is float32.
_SCORING_COLUMNS = tuple(dict.fromkeys((*POINTS_COMPONENTS, *EXPECTED_COMPONENTS)))
_FRAME_COLUMNS = tuple(dict.fromkeys(
    (*_SCORING_COLUMNS, *(source for field in FIELDS for source in field.sources))
))


# --- the frame ---------------------------------------------------------------------------

@dataclass
class Frame:
    """Every player-game in the database, as parallel arrays."""

    player: np.ndarray    # int32, index into ``people``
    game: np.ndarray      # int32, index into ``games``
    team: np.ndarray      # int32 team_id (0 when unknown)
    season: np.ndarray    # int16
    week: np.ndarray      # int16
    post: np.ndarray      # bool: a playoff game
    position: np.ndarray  # int8, index into POSITIONS
    rookie: np.ndarray    # bool: the player's rookie season
    columns: dict[str, np.ndarray]
    people: list[dict]
    games: list[tuple]    # (home_team_id, away_team_id, home_score, away_score)
    teams: dict[int, str]
    last_regular_week: dict[int, int]

    @property
    def size(self) -> int:
        return len(self.player)


_FRAMES: VersionedCache[Frame] = VersionedCache(max_entries=1)


def get_frame(db: Session) -> Frame:
    """The frame at the current data version (loaded on the first search after a write)."""
    return _FRAMES.get_or_compute(db, "frame", lambda: _load_frame(db))


def _load_frame(db: Session) -> Frame:
    people_rows = db.execute(
        select(Player.player_id, Player.name, Player.position, Player.headshot_url, Player.rookie_season)
        .where(Player.position.in_(POSITIONS))
    ).all()
    person_index = {row.player_id: index for index, row in enumerate(people_rows)}
    people = [
        {"player_id": row.player_id, "name": row.name, "position": row.position, "headshot_url": row.headshot_url}
        for row in people_rows
    ]
    person_position = np.array([POSITIONS.index(row.position) for row in people_rows], dtype=np.int8)
    person_rookie = np.array([row.rookie_season or -1 for row in people_rows], dtype=np.int16)

    game_rows = db.execute(
        select(Game.game_id, Game.season, Game.week, Game.season_type, Game.home_team_id, Game.away_team_id,
               Game.home_score, Game.away_score)
    ).all()
    game_index = {row.game_id: index for index, row in enumerate(game_rows)}
    games = [(row.home_team_id, row.away_team_id, row.home_score, row.away_score) for row in game_rows]
    last_regular_week: dict[int, int] = {}
    for row in game_rows:
        if row.season_type == "REG":
            last_regular_week[row.season] = max(last_regular_week.get(row.season, 0), row.week)

    names = ("player", "game", "team", "season", "week", "post", *_FRAME_COLUMNS)
    parts: dict[str, list[np.ndarray]] = {name: [] for name in names}
    result = db.execute(
        select(PlayerStats.player_id, PlayerStats.game_id, PlayerStats.team_id, PlayerStats.season,
               PlayerStats.week, PlayerStats.season_type,
               *(getattr(PlayerStats, name) for name in _FRAME_COLUMNS))
        .execution_options(yield_per=CHUNK_ROWS)
    )
    for chunk in result.partitions():
        player_ids, game_ids, team_ids, seasons, weeks, types, *values = zip(*chunk)
        person = np.array([person_index.get(value, -1) for value in player_ids], dtype=np.int32)
        game = np.array([game_index.get(value, -1) for value in game_ids], dtype=np.int32)
        keep = (person >= 0) & (game >= 0)
        parts["player"].append(person[keep])
        parts["game"].append(game[keep])
        parts["team"].append(np.array([value or 0 for value in team_ids], dtype=np.int32)[keep])
        parts["season"].append(np.array(seasons, dtype=np.int16)[keep])
        parts["week"].append(np.array(weeks, dtype=np.int16)[keep])
        parts["post"].append(np.array([value == "POST" for value in types], dtype=bool)[keep])
        for name, column in zip(_FRAME_COLUMNS, values):
            dtype = np.float64 if name in _SCORING_COLUMNS else np.float32
            parts[name].append(np.array(column, dtype=dtype)[keep])

    def joined(name: str, dtype) -> np.ndarray:
        return np.concatenate(parts[name]) if parts[name] else np.zeros(0, dtype=dtype)

    player = joined("player", np.int32)
    season = joined("season", np.int16)
    return Frame(
        player=player,
        game=joined("game", np.int32),
        team=joined("team", np.int32),
        season=season,
        week=joined("week", np.int16),
        post=joined("post", bool),
        position=person_position[player] if len(player) else np.zeros(0, dtype=np.int8),
        rookie=(person_rookie[player] == season) if len(player) else np.zeros(0, dtype=bool),
        columns={
            name: joined(name, np.float64 if name in _SCORING_COLUMNS else np.float32) for name in _FRAME_COLUMNS
        },
        people=people,
        games=games,
        teams=dict(db.execute(select(Team.team_id, Team.abbreviation)).all()),
        last_regular_week=last_regular_week,
    )


# --- scoring ----------------------------------------------------------------------------

@dataclass
class Scored:
    """Fantasy points, expected points and weekly finish for every row, in one scoring."""

    points: np.ndarray    # float64
    expected: np.ndarray  # float64, NaN where the row has no expected components at all
    finish: np.ndarray    # int32, competition rank within (season, type, week, position)


_SCORED: VersionedCache[Scored] = VersionedCache(max_entries=4)


def get_scored(db: Session, config: ScoringConfig) -> Scored:
    key = ("scored", tuple(sorted(config.model_dump().items())))
    return _SCORED.get_or_compute(db, key, lambda: score_frame(get_frame(db), config))


def score_frame(frame: Frame, config: ScoringConfig) -> Scored:
    """The scoring engine's formula, vectorised.

    Term for term ``points_expr`` / ``compute_points`` and ``compute_expected_points``
    in ``app/scoring.py``, in the same order, so a row scores to the same float as the
    SQL the game log ranks by.
    """
    def col(name: str) -> np.ndarray:
        return np.nan_to_num(frame.columns[name].astype(np.float64), nan=0.0)

    rec_weight = np.full(frame.size, config.rec, dtype=np.float64)
    if config.te_rec is not None:
        rec_weight[frame.position == POSITIONS.index("TE")] = config.te_rec

    points = col("fantasy_points_std") + rec_weight * col("receptions")
    for weight, column in WEIGHT_COLUMNS.items():
        delta = getattr(config, weight) - STANDARD_WEIGHTS[weight]
        if delta:
            points = points + delta * col(column)

    expected = rec_weight * col("receptions_exp") + TWO_POINT_CONV_WEIGHT * col("two_point_conv_exp")
    for weight, column in EXPECTED_WEIGHT_COLUMNS.items():
        expected = expected + getattr(config, weight) * col(column)
    modelled = np.zeros(frame.size, dtype=bool)
    for name in EXPECTED_COMPONENTS:
        modelled |= ~np.isnan(frame.columns[name])
    expected[~modelled] = np.nan

    return Scored(points=points, expected=expected, finish=_weekly_finish(frame, points))


def _weekly_finish(frame: Frame, points: np.ndarray) -> np.ndarray:
    """RANK() OVER (PARTITION BY season, type, week, position ORDER BY points DESC)."""
    if not frame.size:
        return np.zeros(0, dtype=np.int32)
    group = (((frame.season.astype(np.int64) * 2 + frame.post) * 32 + frame.week) * 4 + frame.position)
    order = np.lexsort((-points, group))
    grouped, scored = group[order], points[order]
    index = np.arange(frame.size)
    starts = np.r_[True, grouped[1:] != grouped[:-1]]
    new_value = starts | np.r_[True, scored[1:] != scored[:-1]]
    group_start = np.maximum.accumulate(np.where(starts, index, 0))
    tie_start = np.maximum.accumulate(np.where(new_value, index, 0))
    finish = np.empty(frame.size, dtype=np.int32)
    finish[order] = tie_start - group_start + 1
    return finish


# --- a search ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Condition:
    field: QueryField
    low: float | None = None
    high: float | None = None

    def test(self, values: np.ndarray) -> np.ndarray:
        """Rows inside the range. NULL never matches a bound (NaN compares false)."""
        mask = np.ones(len(values), dtype=bool)
        if self.low is not None:
            mask &= values >= self.low - 1e-9
        if self.high is not None:
            mask &= values <= self.high + 1e-9
        return mask


@dataclass(frozen=True)
class Search:
    grain: str = "games"
    mode: str = "list"
    positions: tuple[str, ...] = POSITIONS
    first_season: int | None = None
    last_season: int | None = None
    season_type: str = "REG"
    # Only weeks up to and including this one in each season. With grain "seasons" it
    # turns a season into "the season through Week N", which is how an early-season
    # pace is compared with every other year's first N weeks.
    last_week: int | None = None
    team_id: int | None = None
    rookies: str = "any"
    conditions: tuple[Condition, ...] = ()
    sort: str | None = None
    order: str | None = None


def parse_conditions(raw: str) -> tuple[Condition, ...]:
    """Parse ``field:min:max,field:min:max``; either bound may be empty.

    Raises ValueError (the router's 400) on an unknown field, a bad number, a range
    that runs backwards, or more conditions than a search takes.
    """
    conditions: list[Condition] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        name, _, bounds = part.partition(":")
        field = FIELDS_BY_ID.get(name)
        if field is None:
            raise ValueError(f"Unknown field '{name}'.")
        low_text, _, high_text = bounds.partition(":")
        try:
            low = float(low_text) if low_text.strip() else None
            high = float(high_text) if high_text.strip() else None
        except ValueError as exc:
            raise ValueError(f"The range for '{name}' must be numbers.") from exc
        if low is not None and high is not None and low > high:
            raise ValueError(f"The range for '{name}' runs backwards ({low} to {high}).")
        conditions.append(Condition(field=field, low=low, high=high))
    if len(conditions) > MAX_CONDITIONS:
        raise ValueError(f"A search takes at most {MAX_CONDITIONS} stat filters.")
    return tuple(conditions)


def _scope(frame: Frame, search: Search) -> np.ndarray:
    """Indices of the rows the search is about, before any stat range."""
    mask = np.isin(frame.position, [POSITIONS.index(position) for position in search.positions])
    if search.first_season is not None:
        mask &= frame.season >= search.first_season
    if search.last_season is not None:
        mask &= frame.season <= search.last_season
    if search.season_type == "REG":
        mask &= ~frame.post
    elif search.season_type == "POST":
        mask &= frame.post
    if search.last_week is not None:
        mask &= frame.week <= search.last_week
    if search.team_id is not None:
        mask &= frame.team == search.team_id
    if search.rookies == "only":
        mask &= frame.rookie
    elif search.rookies == "exclude":
        mask &= ~frame.rookie
    return np.flatnonzero(mask)


def _game_values(field: QueryField, frame: Frame, scored: Scored, rows: np.ndarray) -> np.ndarray:
    """One value per game for ``rows``."""
    if field.kind == "points":
        return scored.points[rows]
    if field.kind == "expected":
        return scored.expected[rows]
    if field.kind == "over_expected":
        return scored.points[rows] - scored.expected[rows]
    if field.kind == "finish":
        return scored.finish[rows].astype(np.float64)
    if field.kind in ("sum", "mean"):
        stacked = [frame.columns[source][rows].astype(np.float64) for source in field.sources]
        if len(stacked) == 1:
            return stacked[0]
        present = np.zeros(len(rows), dtype=bool)
        for values in stacked:
            present |= ~np.isnan(values)
        total = np.sum([np.nan_to_num(values) for values in stacked], axis=0)
        return np.where(present, total, np.nan)
    if field.kind == "weighted":
        return frame.columns[field.sources[0]][rows].astype(np.float64)
    if field.kind == "ratio":
        numerator = frame.columns[field.sources[0]][rows].astype(np.float64)
        denominator = frame.columns[field.sources[1]][rows].astype(np.float64)
        with np.errstate(divide="ignore", invalid="ignore"):
            return np.where(denominator > 0, numerator / denominator, np.nan)
    raise ValueError(f"'{field.id}' is not a game stat.")


@dataclass
class SeasonGroups:
    """The scope's rows grouped into player-seasons."""

    rows: np.ndarray       # frame indices, the scope
    inverse: np.ndarray    # group of each scope row
    player: np.ndarray     # per group
    season: np.ndarray     # per group
    latest: np.ndarray     # per group: frame index of the latest game (for the team)
    count: int


def _last_in_group(order: np.ndarray, groups: np.ndarray) -> np.ndarray:
    """``order`` sorts positions by group; the last position of each group, in group order."""
    if not len(order):
        return order
    sorted_groups = groups[order]
    return order[np.r_[sorted_groups[1:] != sorted_groups[:-1], True]]


def _group_seasons(frame: Frame, rows: np.ndarray) -> SeasonGroups:
    keys = frame.player[rows].astype(np.int64) * 10_000 + frame.season[rows]
    unique, inverse = np.unique(keys, return_inverse=True)
    lateness = frame.week[rows].astype(np.int64) + frame.post[rows] * 100
    latest = _last_in_group(np.lexsort((lateness, inverse)), inverse)
    return SeasonGroups(
        rows=rows, inverse=inverse, player=(unique // 10_000).astype(np.int32),
        season=(unique % 10_000).astype(np.int16), latest=rows[latest], count=len(unique),
    )


def _season_values(field: QueryField, frame: Frame, scored: Scored, groups: SeasonGroups) -> np.ndarray:
    """One value per player-season, aggregated the way the leaderboards aggregate."""
    rows, inverse, size = groups.rows, groups.inverse, groups.count

    def total(values: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        present = ~np.isnan(values)
        sums = np.bincount(inverse, weights=np.where(present, values, 0.0), minlength=size)
        counts = np.bincount(inverse, weights=present.astype(np.float64), minlength=size)
        return sums, counts

    def summed(values: np.ndarray) -> np.ndarray:
        sums, counts = total(values)
        return np.where(counts > 0, sums, np.nan)

    games = np.bincount(inverse, minlength=size).astype(np.float64)
    with np.errstate(divide="ignore", invalid="ignore"):
        if field.kind == "games":
            return games
        if field.kind == "points":
            return summed(scored.points[rows])
        if field.kind == "per_game":
            return summed(scored.points[rows]) / games
        if field.kind == "expected":
            return summed(scored.expected[rows])
        if field.kind == "over_expected":
            return summed(scored.points[rows]) - summed(scored.expected[rows])
        if field.kind == "finishes":
            return np.bincount(inverse, weights=(scored.finish[rows] <= field.threshold).astype(np.float64),
                               minlength=size)
        if field.kind == "sum":
            return summed(_game_values(field, frame, scored, rows))
        if field.kind == "mean":
            sums, counts = total(frame.columns[field.sources[0]][rows].astype(np.float64))
            return np.where(counts > 0, sums / counts, np.nan)
        if field.kind == "weighted":
            values = frame.columns[field.sources[0]][rows].astype(np.float64)
            weights = np.nan_to_num(frame.columns[field.sources[1]][rows].astype(np.float64))
            weights = np.where(np.isnan(values), 0.0, weights)
            numerator = np.bincount(inverse, weights=np.nan_to_num(values) * weights, minlength=size)
            denominator = np.bincount(inverse, weights=weights, minlength=size)
            return np.where(denominator > 0, numerator / denominator, np.nan)
        if field.kind == "ratio":
            numerator, _ = total(frame.columns[field.sources[0]][rows].astype(np.float64))
            denominator, _ = total(frame.columns[field.sources[1]][rows].astype(np.float64))
            return np.where(denominator > 0, numerator / denominator, np.nan)
    raise ValueError(f"'{field.id}' is not a season stat.")


def _histogram(values: np.ndarray, condition: Condition) -> dict:
    """The scope's distribution for one filter card, with a suggested starting bound."""
    present = values[~np.isnan(values)]
    if not len(present):
        return {"lo": 0, "hi": 1, "counts": [0] * HISTOGRAM_BINS, "total": 0, "in_range": 0, "suggested": None}
    lo, hi = (float(value) for value in np.quantile(present, [0.01, 0.99]))
    if condition.field.format == "int":
        lo, hi = float(np.floor(lo)), float(np.ceil(hi))
    if hi <= lo:
        hi = lo + 1
    counts, _ = np.histogram(np.clip(present, lo, hi), bins=HISTOGRAM_BINS, range=(lo, hi))
    field = condition.field
    quantile = float(np.quantile(present, 0.8 if field.higher_is_better else 0.2))
    return {
        "lo": _rounded(lo, field), "hi": _rounded(hi, field), "counts": counts.tolist(),
        "total": int(len(present)), "in_range": int(condition.test(present).sum()),
        "suggested": {("min" if field.higher_is_better else "max"): _rounded(quantile, field)},
    }


def _rounded(value, field: QueryField | None = None):
    """JSON-safe: NaN becomes None, whole-number fields become ints."""
    if value is None:
        return None
    value = float(value)
    if value != value:
        return None
    if field is not None and field.format == "int":
        return int(round(value))
    if field is not None and field.format == "pct":
        return round(value, 4)
    return round(value, 3)


# The count mode's own columns, which are about a player rather than a stat.
COUNT_COLUMNS = (
    {"key": "matches", "label": "Matching Games", "short": "MATCHES", "format": "int", "higher_is_better": True},
    {"key": "games", "label": "Games Played", "short": "G", "format": "int", "higher_is_better": True},
    {"key": "rate", "label": "Share of Games", "short": "RATE", "format": "pct", "higher_is_better": True},
    {"key": "avg_points", "label": "Average Fantasy Points in Them", "short": "AVG FPTS", "format": 1,
     "higher_is_better": True},
)


def _column(field: QueryField, condition_ids: set[str]) -> dict:
    return {"key": field.id, "label": field.label, "short": field.short, "format": field.format,
            "higher_is_better": field.higher_is_better, "filtered": field.id in condition_ids}


def _stat_columns(search: Search) -> list[QueryField]:
    """What the table shows, in order. Only these can be sorted by."""
    filtered = [condition.field for condition in search.conditions]
    if search.grain == "games":
        fixed = ("fantasy_points", "weekly_finish")
        return [*dict.fromkeys(field for field in filtered if field.id not in fixed),
                *(FIELDS_BY_ID[name] for name in fixed)]
    lead, fixed = ("games",), ("fantasy_points", "fantasy_ppg", "top_12_weeks")
    return [FIELDS_BY_ID["games"],
            *dict.fromkeys(field for field in filtered if field.id not in lead + fixed),
            *(FIELDS_BY_ID[name] for name in fixed)]


def _sort_rows(values: np.ndarray, descending: bool, tiebreak: np.ndarray) -> np.ndarray:
    """Positions sorted by ``values`` (NULL last either way), then by ``tiebreak`` desc."""
    missing = np.isnan(values)
    keyed = np.where(missing, 0.0, -values if descending else values)
    return np.lexsort((-np.nan_to_num(tiebreak), keyed, missing))


def run_search(db: Session, search: Search, config: ScoringConfig, limit: int = 100, offset: int = 0) -> dict:
    """Answer one search: the page of rows asked for, the totals, and each card's histogram."""
    for condition in search.conditions:
        if search.grain not in condition.field.grains:
            raise ValueError(f"{condition.field.label} can only be searched by {condition.field.grains[0]}.")
    frame = get_frame(db)
    scored = get_scored(db, config)
    rows = _scope(frame, search)
    condition_ids = {condition.field.id for condition in search.conditions}

    if search.grain == "games":
        values = {field.id: _game_values(field, frame, scored, rows) for field in
                  dict.fromkeys([c.field for c in search.conditions] + _stat_columns(search))}
        groups = None
    else:
        groups = _group_seasons(frame, rows)
        values = {field.id: _season_values(field, frame, scored, groups) for field in
                  dict.fromkeys([c.field for c in search.conditions] + _stat_columns(search))}

    histograms = {condition.field.id: _histogram(values[condition.field.id], condition)
                  for condition in search.conditions}
    size = len(rows) if groups is None else groups.count
    matched = np.ones(size, dtype=bool)
    for condition in search.conditions:
        matched &= condition.test(values[condition.field.id])
    hits = np.flatnonzero(matched)

    common = {
        "grain": search.grain, "mode": search.mode, "season_type": search.season_type,
        "histograms": histograms, "limit": limit, "offset": offset,
    }
    if search.grain == "games" and search.mode == "count":
        return {**common, **_count_page(frame, scored, rows, hits, search, limit, offset)}

    columns = _stat_columns(search)
    sortable = {field.id: field for field in columns}
    sort_field = sortable.get(search.sort) or next(
        (field for field in columns if field.id in condition_ids), FIELDS_BY_ID["fantasy_points"])
    descending = (search.order or ("desc" if sort_field.higher_is_better else "asc")) == "desc"
    tiebreak = values["fantasy_points"][hits]
    ordered = hits[_sort_rows(values[sort_field.id][hits], descending, tiebreak)]
    page = ordered[offset:offset + limit]

    if groups is None:
        players = frame.player[rows[hits]]
        items = [_game_row(frame, rows[position], {field.id: values[field.id][position] for field in columns})
                 for position in page]
    else:
        players = groups.player[hits]
        items = [_season_row(frame, groups, group, {field.id: values[field.id][group] for field in columns})
                 for group in page]
    for item in items:
        for field in columns:
            item[field.id] = _rounded(item[field.id], field)

    return {
        **common,
        "total": int(len(hits)), "players": int(len(np.unique(players))),
        "sort": sort_field.id, "order": "desc" if descending else "asc",
        "columns": [_column(field, condition_ids) for field in columns],
        "rows": items,
    }


def _person(frame: Frame, player_index: int, team_id: int) -> dict:
    return {**frame.people[player_index], "team": frame.teams.get(team_id)}


def _week_label(frame: Frame, index: int) -> str:
    week = int(frame.week[index])
    if not frame.post[index]:
        return str(week)
    playoff_round = week - frame.last_regular_week.get(int(frame.season[index]), 17)
    return PLAYOFF_ROUNDS.get(playoff_round, f"P{playoff_round}")


def _game_context(frame: Frame, index: int) -> dict:
    home_id, away_id, home_score, away_score = frame.games[frame.game[index]]
    team_id = int(frame.team[index])
    home = team_id == home_id
    score, against = (home_score, away_score) if home else (away_score, home_score)
    result = None
    if score is not None and against is not None:
        result = "W" if score > against else "L" if score < against else "T"
    return {
        "season": int(frame.season[index]), "week": int(frame.week[index]),
        "season_type": "POST" if frame.post[index] else "REG", "week_label": _week_label(frame, index),
        "home": home, "opponent": frame.teams.get(away_id if home else home_id),
        "team_score": score, "opponent_score": against, "result": result,
    }


def _game_row(frame: Frame, index: int, stats: dict) -> dict:
    return {**_person(frame, frame.player[index], int(frame.team[index])), **_game_context(frame, index), **stats}


def _season_row(frame: Frame, groups: SeasonGroups, group: int, stats: dict) -> dict:
    latest = groups.latest[group]
    return {**_person(frame, groups.player[group], int(frame.team[latest])), "season": int(groups.season[group]),
            **stats}


def _count_page(frame: Frame, scored: Scored, rows: np.ndarray, hits: np.ndarray, search: Search,
                limit: int, offset: int) -> dict:
    """Matching games counted per player: how often, out of how many, and the best one."""
    matched_rows = rows[hits]
    players, inverse, matches = np.unique(frame.player[matched_rows], return_inverse=True, return_counts=True)
    played = np.bincount(frame.player[rows], minlength=len(frame.people))[players]
    points = scored.points[matched_rows]
    average = np.bincount(inverse, weights=points, minlength=len(players)) / matches
    best = matched_rows[_last_in_group(np.lexsort((points, inverse)), inverse)]
    lateness = (frame.season[matched_rows].astype(np.int64) * 1000 + frame.post[matched_rows] * 100
                + frame.week[matched_rows])
    latest = matched_rows[_last_in_group(np.lexsort((lateness, inverse)), inverse)]

    stats = {"matches": matches.astype(np.float64), "games": played.astype(np.float64),
             "rate": matches / np.maximum(played, 1), "avg_points": average}
    sort_key = search.sort if search.sort in stats else "matches"
    descending = (search.order or "desc") == "desc"
    tiebreak = average if sort_key == "matches" else stats["matches"]
    ordered = _sort_rows(stats[sort_key], descending, tiebreak)
    items = []
    for group in ordered[offset:offset + limit]:
        best_index = best[group]
        items.append({
            **_person(frame, players[group], int(frame.team[latest[group]])),
            "matches": int(matches[group]), "games": int(played[group]),
            "rate": round(float(stats["rate"][group]), 4), "avg_points": round(float(average[group]), 3),
            "best": {**_game_context(frame, best_index), "fantasy_points": round(float(scored.points[best_index]), 3)},
        })
    return {
        "total": int(len(hits)), "players": int(len(players)),
        "sort": sort_key, "order": "desc" if descending else "asc",
        "columns": [{**column, "filtered": column["key"] == "matches"} for column in COUNT_COLUMNS],
        "rows": items,
    }


def field_catalog() -> list[dict]:
    """Every searchable stat, grouped, for the builder's "add a filter" menu."""
    return [field.payload() for field in FIELDS]
