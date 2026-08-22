"""Seasons endpoint — which seasons the database holds, and which one is current.

The frontend used to carry `SEASONS = [2025, 2024, …]` as a literal array, which was
correct until the day a new season started and then quietly wrong: every board would
have kept defaulting to the previous year while the games people cared about were
being played. M6 is the milestone where the app has to know what year it is, so the
answer comes from the data instead of from a constant.

The logic lives in `app.seasons` because the draft board needs the same answer — see
the note there on why "current" means the newest season *with stats* rather than the
newest season on the schedule.

Both facts are returned, because they answer different questions: a stat board offers
seasons with `has_stats`, while schedule-shaped surfaces (the Vegas board, a team's
fixture list) can offer every season in `data`.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.seasons import SeasonInfo, current_season, season_summary

router = APIRouter(prefix="/seasons", tags=["seasons"])


class SeasonsResponse(BaseModel):
    """Every season held, newest first, plus the one boards should open on."""

    data: list[SeasonInfo]
    total: int
    current_season: int | None


@router.get("", response_model=SeasonsResponse)
def list_seasons(db: Session = Depends(get_db)) -> SeasonsResponse:
    """Return every season in the database and the current (latest with stats) one."""
    seasons = season_summary(db)
    return SeasonsResponse(
        data=seasons,
        total=len(seasons),
        current_season=current_season(db, seasons),
    )
