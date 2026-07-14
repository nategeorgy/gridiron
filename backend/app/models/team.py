"""Team ORM model."""

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Team(Base):
    """An NFL team."""

    __tablename__ = "teams"

    team_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str | None] = mapped_column(String(100))
    abbreviation: Mapped[str | None] = mapped_column(String(5), index=True)
    conference: Mapped[str | None] = mapped_column(String(10))
    division: Mapped[str | None] = mapped_column(String(20))

    players: Mapped[list["Player"]] = relationship(back_populates="team")  # noqa: F821
