"""Game ORM model."""

from datetime import date

from sqlalchemy import Date, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Game(Base):
    """A single NFL game."""

    __tablename__ = "games"

    game_id: Mapped[str] = mapped_column(String(50), primary_key=True)
    season: Mapped[int | None] = mapped_column(Integer, index=True)
    week: Mapped[int | None] = mapped_column(Integer, index=True)
    season_type: Mapped[str | None] = mapped_column(String(20))
    home_team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.team_id"))
    away_team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.team_id"))
    home_score: Mapped[int | None] = mapped_column(Integer)
    away_score: Mapped[int | None] = mapped_column(Integer)
    game_date: Mapped[date | None] = mapped_column(Date)
