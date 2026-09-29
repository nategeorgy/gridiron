"""Play-level rows for the Explore tab: every target, and every designed run by lane.

``player_target_depth`` (M4) sums targets into four depth buckets and three sides per
game, which is enough for a depth bar and a zone grid but not for anything that needs
the play itself: who threw it (the passing network), how far it travelled to the yard
(the heatmap and the air-yard distributions), or the situation it came in (red zone,
third down). So this stores **one row per target**, and the Explore endpoints aggregate
on the way out, for whatever weeks and situation a request asks for.

Runs are different: nothing asks for a single carry, only for how a back's carries split
across the line and how each one ended. So ``player_run_lanes`` is aggregated at ingest,
one row per player, game and run lane, which keeps it a fraction of the size of a
per-carry table.

Written by ``pipeline/ingest_plays.py`` from nflverse play-by-play, 2009 on (the first
season with a receiver named on incompletions, as for ``player_target_depth``).
"""

from sqlalchemy import Boolean, Float, ForeignKey, Index, Integer, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

# Sides as nflfastR records them, from the passer's point of view.
PASS_LOCATIONS: tuple[str, ...] = ("left", "middle", "right")

# Run lanes, left to right across the line: nflfastR's run_location and run_gap
# ("left" + "end", "left" + "tackle", ...; "middle" has no gap). "unknown" holds the
# few designed runs play-by-play gives no direction.
RUN_LANES: tuple[str, ...] = ("le", "lt", "lg", "mid", "rg", "rt", "re", "unknown")


class PlayTarget(Base):
    """One targeted pass: who threw it, who it was for, how deep, which side, and how it ended.

    ``passer_id`` and ``receiver_id`` deliberately carry **no foreign key**. A target to a
    fullback or a two-way defensive back is real (Travis Hunter drew 45 in 2025), and
    those players are not in ``players``, which holds QB/RB/WR/TE only. Dropping their
    targets would make every quarterback's total and every receiver's share of it wrong,
    so the row is kept and the API labels an unknown receiver as "other".
    """

    __tablename__ = "play_targets"
    __table_args__ = (
        Index("ix_play_targets_season_passer", "season", "passer_id"),
        Index("ix_play_targets_season_receiver", "season", "receiver_id"),
        Index("ix_play_targets_season_team", "season", "team_id"),
    )

    game_id: Mapped[str] = mapped_column(ForeignKey("games.game_id"), primary_key=True)
    play_id: Mapped[int] = mapped_column(Integer, primary_key=True)

    season: Mapped[int] = mapped_column(Integer)
    week: Mapped[int] = mapped_column(Integer)
    season_type: Mapped[str] = mapped_column(String(20))
    team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.team_id"))

    passer_id: Mapped[str | None] = mapped_column(String(50))
    receiver_id: Mapped[str | None] = mapped_column(String(50))

    # NULL on the ~1% of targets play-by-play gives no depth or side (never 0: a
    # target caught at the line of scrimmage is a real 0 air yards).
    air_yards: Mapped[int | None] = mapped_column(SmallInteger)
    location: Mapped[str | None] = mapped_column(String(6))

    complete: Mapped[bool] = mapped_column(Boolean, default=False)
    touchdown: Mapped[bool] = mapped_column(Boolean, default=False)
    interception: Mapped[bool] = mapped_column(Boolean, default=False)
    first_down: Mapped[bool] = mapped_column(Boolean, default=False)
    # Receiving yards, 0 on an incompletion.
    yards: Mapped[int] = mapped_column(SmallInteger, default=0)
    yards_after_catch: Mapped[int | None] = mapped_column(SmallInteger)
    epa: Mapped[float | None] = mapped_column(Float)

    down: Mapped[int | None] = mapped_column(SmallInteger)
    yardline_100: Mapped[int | None] = mapped_column(SmallInteger)


class PlayerRunLane(Base):
    """One player's designed runs through one lane in one game, and how they ended.

    Designed runs only: a scramble is a pass play that broke down, and a kneel is not
    an attempt to gain anything. The four outcome columns partition ``carries`` by yards
    gained: stuffed (0 or fewer), short (1-3), medium (4-9), explosive (10 or more).
    """

    __tablename__ = "player_run_lanes"
    __table_args__ = (Index("ix_player_run_lanes_player_season", "player_id", "season"),)

    player_id: Mapped[str] = mapped_column(ForeignKey("players.player_id"), primary_key=True)
    game_id: Mapped[str] = mapped_column(ForeignKey("games.game_id"), primary_key=True)
    lane: Mapped[str] = mapped_column(String(8), primary_key=True)

    season: Mapped[int] = mapped_column(Integer)
    week: Mapped[int] = mapped_column(Integer)
    season_type: Mapped[str] = mapped_column(String(20))

    carries: Mapped[int] = mapped_column(Integer, default=0)
    yards: Mapped[int] = mapped_column(Integer, default=0)
    successes: Mapped[int] = mapped_column(Integer, default=0)
    first_downs: Mapped[int] = mapped_column(Integer, default=0)
    touchdowns: Mapped[int] = mapped_column(Integer, default=0)
    stuffed: Mapped[int] = mapped_column(Integer, default=0)
    short: Mapped[int] = mapped_column(Integer, default=0)
    medium: Mapped[int] = mapped_column(Integer, default=0)
    explosive: Mapped[int] = mapped_column(Integer, default=0)
