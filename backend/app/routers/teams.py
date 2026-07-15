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
