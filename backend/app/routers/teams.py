"""Team endpoints: list teams and season team stats."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import PlayerStats, Team
from app.schemas.team import TeamOut

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
