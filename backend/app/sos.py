"""Strength of schedule (M6.3) — how hard each team's fixtures are, by position.

The measurement is **fantasy points allowed per game** by each defense to each position,
and it is computed **through the scoring engine on every request**. That is not
decoration: in a TE-premium league the tight ends a defense gives up are worth more, so
the hardest schedule for a tight end is a different list of teams. Storing a rating
would mean one row per scoring context — the same trap M2 avoided by storing expected
*components* and M3 avoided by never materialising an intelligence score.

Difficulty is a **0–100 percentile among the 32 defenses, where higher is harder**,
rather than a rank. Ranks invite exactly the ambiguity this feature cannot afford —
"the number one defense against receivers" and "the number one schedule" point in
opposite directions — and a percentile also says *how much* harder rather than only
which side of the median.

**Which season's defenses?**

A schedule is about the season coming; a defense's numbers come from games played. In
August the only complete answer is last season, and defenses change over an offseason —
so the basis is stated on every response rather than assumed. It switches to the current
season once ``MIN_BASIS_WEEKS`` of it exist, then widens with every week played. No
blending across seasons: a number that is 60% one year and 40% another is harder to
argue with than either, and this feature's whole value is being arguable.
"""

from __future__ import annotations

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session, aliased

from app.intelligence import Pool
from app.models import Game, Player, PlayerStats, Team
from app.scoring import ScoringConfig, points_expr

POSITIONS = ("QB", "RB", "WR", "TE")

# Weeks of the current season needed before its defensive numbers replace last
# season's. Four is about where a rate stops being one bad Sunday.
MIN_BASIS_WEEKS = 4

# The fantasy postseason in the overwhelmingly common setup. A first-class window
# because "who has the easiest playoff schedule" is a draft-day tiebreaker.
FANTASY_PLAYOFF_WEEKS = (15, 16, 17)
NEXT_N_WEEKS = 4

WINDOWS = ("full", "ros", "next4", "playoffs")


def resolve_basis(db: Session, schedule_season: int) -> tuple[int | None, str, int]:
    """Pick the season whose defensive numbers to use. Returns (season, kind, weeks)."""
    weeks_played = db.scalar(
        select(func.count(func.distinct(PlayerStats.week))).where(
            PlayerStats.season == schedule_season, PlayerStats.season_type == "REG"
        )
    ) or 0
    if weeks_played >= MIN_BASIS_WEEKS:
        return schedule_season, "current_season", weeks_played

    prior = db.scalar(
        select(func.max(PlayerStats.season)).where(PlayerStats.season < schedule_season)
    )
    if prior is None:
        # Nothing earlier to fall back on: use whatever the season itself has, even if
        # it is one week. Saying so is better than returning an empty board.
        return (schedule_season, "current_season", weeks_played) if weeks_played else (None, "none", 0)

    prior_weeks = db.scalar(
        select(func.count(func.distinct(PlayerStats.week))).where(
            PlayerStats.season == prior, PlayerStats.season_type == "REG"
        )
    ) or 0
    return prior, "prior_season", prior_weeks


def points_allowed(
    db: Session, season: int, config: ScoringConfig
) -> dict[tuple[int, str], float]:
    """Fantasy points per game each defense allowed to each position, in this scoring.

    The opponent is derived rather than stored: a stat line knows the team that produced
    it and the game it happened in, so the defense is whichever side of that game the
    player was not on.
    """
    defense_team_id = case(
        (PlayerStats.team_id == Game.home_team_id, Game.away_team_id),
        else_=Game.home_team_id,
    )
    rows = db.execute(
        select(
            defense_team_id.label("defense_team_id"),
            Player.position.label("position"),
            points_expr(config, sum_mode=True).label("points"),
            func.count(func.distinct(PlayerStats.game_id)).label("games"),
        )
        .join(Game, PlayerStats.game_id == Game.game_id)
        .join(Player, PlayerStats.player_id == Player.player_id)
        .where(
            PlayerStats.season == season,
            PlayerStats.season_type == "REG",
            Player.position.in_(POSITIONS),
        )
        # Position is grouped as well as the defense because a TE-premium config makes
        # the points expression itself depend on it.
        .group_by(defense_team_id, Player.position)
    ).all()

    return {
        (row.defense_team_id, row.position): row.points / row.games
        for row in rows
        if row.defense_team_id is not None and row.games
    }


def _difficulty_scale(allowed: dict[tuple[int, str], float], position: str) -> Pool:
    """The distribution of points allowed to one position, across every defense."""
    return Pool([
        value for (_, pos), value in allowed.items() if pos == position
    ])


def _difficulty(pool: Pool, points_allowed_pg: float | None) -> float | None:
    """0–100, higher = harder. A defense allowing the fewest points scores highest."""
    percentile = pool.percentile(points_allowed_pg)
    return None if percentile is None else round((1 - percentile) * 100, 1)


def _window_weeks(
    window: str, weeks: list[int], first_unplayed: int | None
) -> set[int]:
    """Which weeks of the schedule a window covers."""
    if window == "playoffs":
        return {week for week in weeks if week in FANTASY_PLAYOFF_WEEKS}
    if window in ("ros", "next4"):
        if first_unplayed is None:
            return set()  # the season is over; there is no rest of it
        remaining = sorted(week for week in weeks if week >= first_unplayed)
        return set(remaining[:NEXT_N_WEEKS]) if window == "next4" else set(remaining)
    return set(weeks)


def _defense_ratings(
    allowed: dict[tuple[int, str], float], position: str
) -> dict[int, dict]:
    """Each defense's points allowed to one position, plus its 0–100 difficulty."""
    pool = _difficulty_scale(allowed, position)
    return {
        team_id: {
            "points_allowed_pg": round(value, 2),
            "difficulty": _difficulty(pool, value),
        }
        for (team_id, pos), value in allowed.items()
        if pos == position
    }


def _load_schedule(db: Session, schedule_season: int) -> tuple[list, list[int], int | None]:
    """The season's games, its week numbers, and the first week not yet played."""
    home_team = aliased(Team)
    away_team = aliased(Team)
    games = db.execute(
        select(
            Game.week, Game.home_team_id, Game.away_team_id,
            Game.home_score, Game.away_score,
            home_team.abbreviation.label("home_abbreviation"),
            away_team.abbreviation.label("away_abbreviation"),
        )
        .outerjoin(home_team, Game.home_team_id == home_team.team_id)
        .outerjoin(away_team, Game.away_team_id == away_team.team_id)
        .where(Game.season == schedule_season, Game.season_type == "REG")
        .order_by(Game.week)
    ).mappings().all()

    weeks = sorted({game["week"] for game in games if game["week"] is not None})
    unplayed = [
        game["week"] for game in games
        if game["week"] is not None and game["home_score"] is None
    ]
    return games, weeks, (min(unplayed) if unplayed else None)


def _by_team(games: list, team_ids: set[int], defense: dict[int, dict]) -> dict[int, dict[int, dict]]:
    """Each team's fixtures keyed by week, with the opponent's rating attached."""
    schedules: dict[int, dict[int, dict]] = {team_id: {} for team_id in team_ids}
    for game in games:
        for team_id, opponent_id, is_home, abbreviation in (
            (game["home_team_id"], game["away_team_id"], True, game["away_abbreviation"]),
            (game["away_team_id"], game["home_team_id"], False, game["home_abbreviation"]),
        ):
            if team_id not in schedules:
                continue
            rating = defense.get(opponent_id, {})
            schedules[team_id][game["week"]] = {
                "week": game["week"],
                "opponent_team_id": opponent_id,
                "opponent": abbreviation,
                "is_home": is_home,
                "difficulty": rating.get("difficulty"),
                "points_allowed_pg": rating.get("points_allowed_pg"),
            }
    return schedules


def _average_difficulty(schedule: list[dict | None], covered: set[int]) -> tuple[float | None, int]:
    """Mean opponent difficulty over the covered weeks, and how many games that was.

    A bye is an absent fixture, not an easy one, so it is skipped rather than counted —
    averaging it in as zero would make a team's bye week look like a gift.
    """
    rated = [
        game["difficulty"] for game in schedule
        if game and game["week"] in covered and game["difficulty"] is not None
    ]
    return (round(sum(rated) / len(rated), 1) if rated else None), len(rated)


def _ranked(rows: list[dict]) -> list[dict]:
    """Sort easiest-first and number them. "Whose schedule opens up" is the question."""
    rows.sort(key=lambda row: (row["difficulty"] is None, row["difficulty"] or 0))
    for rank, row in enumerate(rows, start=1):
        row["rank"] = rank if row["difficulty"] is not None else None
    return rows


def team_summary(
    db: Session, schedule_season: int, config: ScoringConfig, windows: tuple[str, ...]
) -> tuple[dict[int, dict[str, dict[str, dict]]], dict]:
    """Every team's difficulty at every position, over each requested window.

    What the team page's strip reads. Shares the two queries with :func:`build_sos`
    rather than running them once per position.
    """
    basis_season, basis_kind, basis_weeks = resolve_basis(db, schedule_season)
    allowed = points_allowed(db, basis_season, config) if basis_season else {}
    games, weeks, first_unplayed = _load_schedule(db, schedule_season)

    team_ids = {game["home_team_id"] for game in games} | {game["away_team_id"] for game in games}
    team_ids.discard(None)

    summary: dict[int, dict[str, dict[str, dict]]] = {team_id: {} for team_id in team_ids}
    for position in POSITIONS:
        schedules = _by_team(games, team_ids, _defense_ratings(allowed, position))
        for window in windows:
            covered = _window_weeks(window, weeks, first_unplayed)
            rows = []
            for team_id in team_ids:
                schedule = [schedules[team_id].get(week) for week in weeks]
                difficulty, played = _average_difficulty(schedule, covered)
                rows.append({"team_id": team_id, "difficulty": difficulty, "games": played})
            for row in _ranked(rows):
                summary[row["team_id"]].setdefault(position, {})[window] = {
                    "difficulty": row["difficulty"],
                    "rank": row["rank"],
                    "games": row["games"],
                }

    return summary, {
        "basis": {"season": basis_season, "kind": basis_kind, "weeks": basis_weeks},
        "teams": len(team_ids),
    }


def build_sos(
    db: Session,
    schedule_season: int,
    config: ScoringConfig,
    position: str,
    window: str = "full",
) -> tuple[list[dict], dict]:
    """Every team's fixtures rated for one position. Returns ``(rows, context)``."""
    basis_season, basis_kind, basis_weeks = resolve_basis(db, schedule_season)
    allowed = points_allowed(db, basis_season, config) if basis_season else {}
    defense = _defense_ratings(allowed, position)

    games, weeks, first_unplayed = _load_schedule(db, schedule_season)
    covered = _window_weeks(window, weeks, first_unplayed)

    # Only teams that actually play *this season*. This is a per-season question, not
    # a data-hygiene one: a franchise can be real and still have no fixtures in a season
    # the caller asked about, and a board must not rank it. (It also used to be the only
    # thing keeping four historical franchise codes off this board; the pipeline no
    # longer ingests those and migration 8530feb2c2ff removed them, so that part is now
    # defence in depth rather than the fix.)
    playing = {game["home_team_id"] for game in games} | {game["away_team_id"] for game in games}
    playing.discard(None)
    teams = db.execute(
        select(Team).where(Team.team_id.in_(playing)).order_by(Team.name)
    ).scalars().all()
    schedules = _by_team(games, {team.team_id for team in teams}, defense)

    rows = []
    for team in teams:
        schedule = [schedules[team.team_id].get(week) for week in weeks]
        difficulty, played = _average_difficulty(schedule, covered)
        rows.append({
            "team_id": team.team_id,
            "abbreviation": team.abbreviation,
            "name": team.name,
            "difficulty": difficulty,
            "games": played,
            "schedule": schedule,
        })
    _ranked(rows)

    context = {
        "position": position,
        "window": window,
        "weeks": weeks,
        "first_unplayed_week": first_unplayed,
        "window_weeks": sorted(covered),
        "basis": {
            "season": basis_season,
            "kind": basis_kind,
            "weeks": basis_weeks,
        },
        "defense": [
            {
                "team_id": team.team_id,
                "abbreviation": team.abbreviation,
                **defense.get(team.team_id, {"points_allowed_pg": None, "difficulty": None}),
            }
            for team in teams
        ],
    }
    return rows, context
