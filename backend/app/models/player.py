"""Player ORM model."""

from sqlalchemy import ForeignKey, Integer, String
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

    team: Mapped["Team | None"] = relationship(back_populates="players")  # noqa: F821
