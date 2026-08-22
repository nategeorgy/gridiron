"""Game ORM model."""

from datetime import date

from sqlalchemy import Boolean, Date, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Game(Base):
    """A single NFL game.

    Beyond the schedule and result, a game carries the **betting market's view of
    it** (M6). Those columns come from the same nflverse schedule feed and are
    populated for past games (closing lines) *and* for upcoming ones — which is why
    the Vegas board needs no external odds API. Implied team totals are derived from
    ``spread_line`` and ``total_line`` at query time rather than stored, since they
    are pure arithmetic on two columns that move together.
    """

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

    # --- Betting market (M6). NULL on games the market has not priced yet. ---
    # spread_line is from the home team's perspective: positive = home favoured.
    spread_line: Mapped[float | None] = mapped_column(Float)
    total_line: Mapped[float | None] = mapped_column(Float)
    home_moneyline: Mapped[int | None] = mapped_column(Integer)
    away_moneyline: Mapped[int | None] = mapped_column(Integer)
    over_odds: Mapped[int | None] = mapped_column(Integer)
    under_odds: Mapped[int | None] = mapped_column(Integer)

    # --- Game context (M6). Environment a fantasy projection cares about. ---
    roof: Mapped[str | None] = mapped_column(String(20))
    surface: Mapped[str | None] = mapped_column(String(20))
    div_game: Mapped[bool | None] = mapped_column(Boolean)
