"""Player ORM model."""

from datetime import date

from sqlalchemy import Date, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Player(Base):
    """An NFL player (QB, RB, WR, or TE within project scope)."""

    __tablename__ = "players"

    player_id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str | None] = mapped_column(String(100), index=True)
    position: Mapped[str | None] = mapped_column(String(5), index=True)
    team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.team_id"))
    jersey_number: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str | None] = mapped_column(String(20))
    headshot_url: Mapped[str | None] = mapped_column(String(255))

    # --- Biographical (M6). Published by load_players all along; stored from M6.0
    # because age and draft capital are draft-board inputs, not trivia. draft_team is
    # a bare abbreviation rather than a foreign key: it can name a franchise that no
    # longer exists under that code (OAK, SD, STL), and teams holds today's 32.
    birth_date: Mapped[date | None] = mapped_column(Date)
    height: Mapped[int | None] = mapped_column(Integer)  # inches
    weight: Mapped[int | None] = mapped_column(Integer)  # pounds
    college_name: Mapped[str | None] = mapped_column(String(100))
    college_conference: Mapped[str | None] = mapped_column(String(100))
    draft_year: Mapped[int | None] = mapped_column(Integer)
    draft_round: Mapped[int | None] = mapped_column(Integer)
    draft_pick: Mapped[int | None] = mapped_column(Integer)
    draft_team: Mapped[str | None] = mapped_column(String(10))
    rookie_season: Mapped[int | None] = mapped_column(Integer)
    years_of_experience: Mapped[int | None] = mapped_column(Integer)

    team: Mapped["Team | None"] = relationship(back_populates="players")  # noqa: F821
