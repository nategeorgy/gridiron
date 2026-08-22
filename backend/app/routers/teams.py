"""Team endpoints: list teams, season team stats, and the team page (M6.2)."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import exists, func, select
from sqlalchemy.orm import Session, aliased

from app.aggregation import aggregate_select, finalize_row, games_expr, window_filters
from app.database import get_db
from app.models import DepthChartEntry, Game, Player, PlayerStats, Team
from app.schemas.team import TeamOut
from app.scoring import ScoringConfig, parse_scoring
from app.seasons import current_season, latest_scheduled_season
from app.sos import team_summary
from app.utils.dates import age_in_years

router = APIRouter(prefix="/teams", tags=["teams"])


@router.get("", response_model=list[TeamOut])
def list_teams(db: Session = Depends(get_db)) -> list[Team]:
    """Return all teams, ordered by name."""
    return db.scalars(select(Team).order_by(Team.name)).all()


# Summed offensive columns available for the team leaderboard.
TEAM_SUM_METRICS = [
    "passing_yards", "passing_tds", "interceptions", "completions", "attempts",
    "rushing_yards", "rushing_tds", "carries", "receiving_yards", "receiving_tds",
    "receptions", "targets", "epa", "fantasy_points_ppr",
]
# Derived metrics -> a function of the aggregated row.
TEAM_DERIVED = {
    "total_yards": lambda r: (r["passing_yards"] or 0) + (r["rushing_yards"] or 0),
    "total_tds": lambda r: (r["passing_tds"] or 0) + (r["rushing_tds"] or 0),
    "yards_per_game": lambda r: (
        ((r["passing_yards"] or 0) + (r["rushing_yards"] or 0)) / r["games"]
        if r["games"] else None
    ),
}
TEAM_METRICS = set(TEAM_SUM_METRICS) | set(TEAM_DERIVED) | {"games"}


@router.get("/leaderboard")
def team_leaderboard(
    season: int = Query(..., description="Season year, e.g. 2024"),
    season_type: str = Query("REG", pattern="^(REG|POST)$"),
    metric: str = Query("total_yards", description="Metric to rank by"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
) -> dict:
    """Rank all teams by aggregated offensive production for a season."""
    if metric not in TEAM_METRICS:
        raise HTTPException(status_code=400, detail=f"Unknown metric '{metric}'")

    games = func.count(func.distinct(PlayerStats.game_id))
    labeled = [func.sum(getattr(PlayerStats, name)).label(name) for name in TEAM_SUM_METRICS]

    rows = db.execute(
        select(
            Team.team_id, Team.name.label("name"),
            Team.abbreviation.label("abbreviation"),
            games.label("games"), *labeled,
        )
        .join(Team, PlayerStats.team_id == Team.team_id)
        .where(PlayerStats.season == season, PlayerStats.season_type == season_type)
        .group_by(Team.team_id, Team.name, Team.abbreviation)
    ).mappings().all()

    results = []
    for row in rows:
        record = {key: (round(value, 3) if isinstance(value, float) else value)
                  for key, value in row.items()}
        for key, func_ in TEAM_DERIVED.items():
            value = func_(row)
            record[key] = round(value, 3) if isinstance(value, float) else value
        results.append(record)

    reverse = order == "desc"

    def sort_key(record: dict):
        value = record.get(metric)
        if value is not None:
            return value
        # Push nulls to the bottom regardless of sort direction.
        return float("-inf") if reverse else float("inf")

    results.sort(key=sort_key, reverse=reverse)

    return {
        "data": results, "total": len(results),
        "season": season, "season_type": season_type,
        "metric": metric, "order": order,
    }


@router.get("/{team_id}/stats")
def team_stats(
    team_id: int,
    season: int = Query(..., description="Season year, e.g. 2024"),
    season_type: str = Query("REG", pattern="^(REG|POST)$"),
    db: Session = Depends(get_db),
) -> dict:
    """Return aggregated offensive stats for a team in a given season."""
    team = db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")

    row = db.execute(
        select(
            func.count(func.distinct(PlayerStats.game_id)).label("games"),
            func.coalesce(func.sum(PlayerStats.passing_yards), 0).label("passing_yards"),
            func.coalesce(func.sum(PlayerStats.passing_tds), 0).label("passing_tds"),
            func.coalesce(func.sum(PlayerStats.interceptions), 0).label("interceptions"),
            func.coalesce(func.sum(PlayerStats.rushing_yards), 0).label("rushing_yards"),
            func.coalesce(func.sum(PlayerStats.rushing_tds), 0).label("rushing_tds"),
            func.coalesce(func.sum(PlayerStats.receiving_yards), 0).label("receiving_yards"),
            func.coalesce(func.sum(PlayerStats.receiving_tds), 0).label("receiving_tds"),
            func.sum(PlayerStats.epa).label("epa"),
        ).where(
            PlayerStats.team_id == team_id,
            PlayerStats.season == season,
            PlayerStats.season_type == season_type,
        )
    ).mappings().one()

    return {
        "team": TeamOut.model_validate(team).model_dump(),
        "season": season,
        "season_type": season_type,
        **dict(row),
    }


# --- The team page (M6.2) ---------------------------------------------------------

DEPTH_CHART_POSITIONS = ("QB", "RB", "WR", "TE")

def _has_ever_played(db: Session, team_id: int) -> bool:
    """Does this team appear in any game, in any season?"""
    return db.scalar(
        select(
            exists().where(
                (Game.home_team_id == team_id) | (Game.away_team_id == team_id)
            )
        )
    )


# The two windows worth a strip on a team page: the whole season, and the weeks a
# fantasy title is decided in. "Rest of season" belongs on the board, where a manager
# is comparing teams rather than reading one.
TEAM_SOS_WINDOWS = ("full", "playoffs")


def _implied_total(spread_line: float | None, total_line: float | None, is_home: bool) -> float | None:
    """The points this team is expected to score, from the spread and the total.

    nflverse's ``spread_line`` is from the **home** team's perspective — positive means
    the home team is favoured — so the halves are added for the home side and subtracted
    for the away side. Derived rather than stored: it is arithmetic on two columns that
    always move together.
    """
    if spread_line is None or total_line is None:
        return None
    half_spread = spread_line / 2
    return round(total_line / 2 + (half_spread if is_home else -half_spread), 2)


def _schedule(db: Session, team_id: int, season: int, season_type: str) -> list[dict]:
    """Every game this team plays in a season, from their own point of view.

    Home and away are flattened away: a fixture list wants "vs BUF" and "at KC", the
    team's own score first, and the betting line expressed as what *this* team is
    expected to score.
    """
    home_team = aliased(Team)
    away_team = aliased(Team)
    rows = db.execute(
        select(
            Game.game_id, Game.week, Game.game_date, Game.season_type,
            Game.home_team_id, Game.away_team_id,
            Game.home_score, Game.away_score,
            Game.spread_line, Game.total_line,
            home_team.abbreviation.label("home_abbreviation"),
            away_team.abbreviation.label("away_abbreviation"),
        )
        .outerjoin(home_team, Game.home_team_id == home_team.team_id)
        .outerjoin(away_team, Game.away_team_id == away_team.team_id)
        .where(
            Game.season == season,
            Game.season_type == season_type,
            (Game.home_team_id == team_id) | (Game.away_team_id == team_id),
        )
        .order_by(Game.week)
    ).mappings().all()

    schedule = []
    for row in rows:
        is_home = row["home_team_id"] == team_id
        team_score = row["home_score"] if is_home else row["away_score"]
        opponent_score = row["away_score"] if is_home else row["home_score"]
        result = None
        if team_score is not None and opponent_score is not None:
            result = "W" if team_score > opponent_score else "L" if team_score < opponent_score else "T"

        schedule.append({
            "game_id": row["game_id"],
            "week": row["week"],
            "game_date": row["game_date"],
            "is_home": is_home,
            "opponent": row["away_abbreviation"] if is_home else row["home_abbreviation"],
            "team_score": team_score,
            "opponent_score": opponent_score,
            "result": result,
            "spread_line": row["spread_line"],
            "total_line": row["total_line"],
            # Positive spread means the home team is favoured, so flip it for the
            # away side: every row reads as this team's own number.
            "team_spread": (
                None if row["spread_line"] is None
                else (row["spread_line"] if is_home else -row["spread_line"])
            ),
            "implied_total": _implied_total(row["spread_line"], row["total_line"], is_home),
        })
    return schedule


def _record(schedule: list[dict]) -> dict:
    """Wins, losses and ties over the games that have actually been played."""
    played = [game for game in schedule if game["result"] is not None]
    return {
        "wins": sum(1 for game in played if game["result"] == "W"),
        "losses": sum(1 for game in played if game["result"] == "L"),
        "ties": sum(1 for game in played if game["result"] == "T"),
        "played": len(played),
    }


def _production(
    db: Session, player_ids: list[str], season: int, config: ScoringConfig
) -> dict[str, dict]:
    """Each player's fantasy production in a season, in the requested scoring.

    Goes through the same aggregation and scoring engine as the leaderboard, so a depth
    chart in a TE-premium league shows TE-premium points — the alternative would be the
    one place in the product quoting somebody a number from a league they are not in.
    """
    if not player_ids:
        return {}
    games = games_expr()
    rows = db.execute(
        aggregate_select(
            window_filters(season, "REG", player_ids=tuple(player_ids)), games
        )
    ).mappings().all()
    return {row["player_id"]: finalize_row(dict(row), config) for row in rows}


def _depth_chart(
    db: Session, team_id: int, season: int, production_season: int | None, config: ScoringConfig
) -> tuple[dict[str, list[dict]], str | None]:
    """The team's chart grouped by position, with each player's fantasy production."""
    rows = db.execute(
        select(
            DepthChartEntry.pos_abb,
            DepthChartEntry.pos_rank,
            DepthChartEntry.snapshot_at,
            Player.player_id,
            Player.name,
            Player.headshot_url,
            Player.birth_date,
            Player.years_of_experience,
        )
        .join(Player, DepthChartEntry.player_id == Player.player_id)
        .where(DepthChartEntry.team_id == team_id, DepthChartEntry.season == season)
        .order_by(DepthChartEntry.pos_abb, DepthChartEntry.pos_rank)
    ).mappings().all()

    production = _production(
        db, [row["player_id"] for row in rows], production_season, config
    ) if production_season else {}

    chart: dict[str, list[dict]] = {position: [] for position in DEPTH_CHART_POSITIONS}
    snapshot_at = None
    for row in rows:
        if row["pos_abb"] not in chart:
            continue
        snapshot_at = snapshot_at or row["snapshot_at"]
        stats = production.get(row["player_id"], {})
        chart[row["pos_abb"]].append({
            "player_id": row["player_id"],
            "name": row["name"],
            "headshot_url": row["headshot_url"],
            "age": age_in_years(row["birth_date"]),
            "years_of_experience": row["years_of_experience"],
            "pos_rank": row["pos_rank"],
            "games_played": stats.get("games_played"),
            "fantasy_points": stats.get("fantasy_points"),
            "fantasy_ppg": stats.get("fantasy_ppg"),
            "expected_fantasy_ppg": stats.get("expected_fantasy_ppg"),
        })
    return chart, snapshot_at.isoformat() if snapshot_at else None


@router.get("/{team_id}")
def team_detail(
    team_id: int,
    season: int | None = Query(
        None, description="Schedule season. Defaults to the newest season on the schedule."
    ),
    season_type: str = Query("REG", pattern="^(REG|POST)$"),
    scoring: str = Query("ppr", description="League scoring, e.g. 'ppr' or 'ppr:te_rec=1.5'"),
    db: Session = Depends(get_db),
) -> dict:
    """One team: record, fixtures with their betting lines, and the current depth chart.

    **Two seasons are in play.** The schedule, the lines and the depth chart describe
    the season *coming*; fantasy production describes the last season *played*. Those
    are different years from spring until kickoff, so both are named in the response
    rather than left for the caller to assume.
    """
    team = db.get(Team, team_id)
    if team is None or not _has_ever_played(db, team_id):
        # A team with no games in any season is not a team this database knows
        # anything about, and rendering a 200 for it produced a page with no record,
        # no fixtures and no depth chart — a page that looked broken rather than
        # empty. `load_teams()` publishes historical franchise codes alongside current
        # ones (LAR, OAK, SD, STL), which is where those rows came from; the pipeline
        # no longer ingests them and migration 8530feb2c2ff removed the ones already
        # written, so this is the third layer rather than the only one.
        #
        # Deliberately *any* season, not the requested one: a team with games but none
        # in the season asked about is an empty season, which the page renders
        # perfectly well and which a 404 would misreport as a missing team.
        raise HTTPException(status_code=404, detail="Team not found")
    try:
        config = parse_scoring(scoring)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    schedule_season = season if season is not None else latest_scheduled_season(db)
    if schedule_season is None:
        raise HTTPException(status_code=404, detail="No seasons are loaded")

    # Show production from the requested season when it has been played, and from the
    # last completed season otherwise — so a team page opened in August is not blank.
    latest_played = current_season(db)
    production_season = (
        schedule_season
        if latest_played is not None and schedule_season <= latest_played
        else latest_played
    )

    schedule = _schedule(db, team_id, schedule_season, season_type)
    chart, snapshot_at = _depth_chart(db, team_id, schedule_season, production_season, config)

    # Strength of schedule for this team at each position (M6.3). Computed rather than
    # stored, in the same scoring as everything else on the page — a TE-premium league
    # has a different hardest schedule for tight ends.
    sos_summary, sos_context = team_summary(db, schedule_season, config, TEAM_SOS_WINDOWS)

    return {
        "team": TeamOut.model_validate(team).model_dump(),
        "season": schedule_season,
        "season_type": season_type,
        "production_season": production_season,
        "record": _record(schedule),
        "next_game": next((game for game in schedule if game["result"] is None), None),
        "schedule": schedule,
        "depth_chart": chart,
        "depth_chart_as_of": snapshot_at,
        "sos": sos_summary.get(team_id, {}),
        "sos_basis": sos_context["basis"],
        "scoring": config.model_dump(),
    }
