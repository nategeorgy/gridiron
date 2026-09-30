"""Team personnel usage and coaching staff, for the team pages.

``team_personnel`` is one row per team, per game, per offensive personnel grouping
("11" is one back and one tight end). It comes from nflverse participation data, which
covers 2016 to the season before last.

``team_personnel_season`` is the season in progress, which participation does not
reach. It arrives by hand as season-to-date totals per team and grouping ("through
Week 3"), so it cannot be split into games and has its own table: one row per team,
season and grouping, replaced whole by each newer file. The team pages read it only
for a window that holds every game it counts (``app/team_stats.py``).

``team_staff`` is the head coach and coordinators for a team's season, from a CSV kept
in the repo (``pipeline/data/staff/team_staff.csv``). Each role is a list of
``[name, note]`` pairs in order, so a midseason change reads "Ken Dorsey (fired after
Week 10), then Joe Brady (interim)" without a second table. No feed publishes
coordinators, and the schedule feed's head coach field was wrong for three 2026 teams.
"""

from sqlalchemy import JSON, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class TeamPersonnel(Base):
    """One team's plays in one personnel grouping in one game."""

    __tablename__ = "team_personnel"

    team_id: Mapped[int] = mapped_column(ForeignKey("teams.team_id"), primary_key=True)
    game_id: Mapped[str] = mapped_column(ForeignKey("games.game_id"), primary_key=True)
    grouping: Mapped[str] = mapped_column(String(4), primary_key=True)  # "11", "12", ...
    season: Mapped[int | None] = mapped_column(Integer, index=True)
    week: Mapped[int | None] = mapped_column(Integer)
    season_type: Mapped[str | None] = mapped_column(String(20))
    plays: Mapped[float | None] = mapped_column(Float)
    dropbacks: Mapped[float | None] = mapped_column(Float)
    epa: Mapped[float | None] = mapped_column(Float)
    successes: Mapped[float | None] = mapped_column(Float)
    yards: Mapped[float | None] = mapped_column(Float)


class TeamPersonnelSeason(Base):
    """One team's season to date in one personnel grouping, from a hand-supplied file.

    Stored as the file states it (usage share, EPA per play and success rate), not as
    sums: the file gives rates, and multiplying them back out would invent precision.
    ``epa_per_play`` and ``success_rate`` are NULL where the file withholds them (it
    does under 20 plays).
    """

    __tablename__ = "team_personnel_season"

    team_id: Mapped[int] = mapped_column(ForeignKey("teams.team_id"), primary_key=True)
    season: Mapped[int] = mapped_column(Integer, primary_key=True)
    season_type: Mapped[str] = mapped_column(String(20), primary_key=True)
    grouping: Mapped[str] = mapped_column(String(4), primary_key=True)  # "11", "12", ...
    through_week: Mapped[int] = mapped_column(Integer)
    plays: Mapped[float] = mapped_column(Float)
    share: Mapped[float | None] = mapped_column(Float)
    epa_per_play: Mapped[float | None] = mapped_column(Float)
    success_rate: Mapped[float | None] = mapped_column(Float)


class TeamStaff(Base):
    """A team's head coach and coordinators for one season."""

    __tablename__ = "team_staff"

    team_id: Mapped[int] = mapped_column(ForeignKey("teams.team_id"), primary_key=True)
    season: Mapped[int] = mapped_column(Integer, primary_key=True)
    head_coach: Mapped[list | None] = mapped_column(JSON)
    offensive_coordinator: Mapped[list | None] = mapped_column(JSON)
    defensive_coordinator: Mapped[list | None] = mapped_column(JSON)
