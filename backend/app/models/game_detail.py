"""Per-game detail for the game pages: every play, every drive, and the injury report.

The game pages (October 2026) recap a finished game and preview an upcoming one. Most of
a recap is already stored at other grains: stat lines in ``player_stats``, team sums in
``team_game_stats``, targets in ``play_targets``. What none of those can give is the
game's *order*: the score after each play, the win probability along the clock, which
drive scored, what happened on the last snap of the fourth quarter. So this stores the
play itself (``game_plays``) and the drive it belonged to (``game_drives``), both from
nflverse play-by-play.

**Scope is 2025 on** (``FIRST_GAME_PAGE_SEASON``), a scope decision rather than a fact
about the feed: play-by-play reaches back to 1999, but the game pages were asked for
"last season, this season, and going forward". Widening it is the constant plus a
backfill, in the pipeline (``pipeline/seasons.py``), here and in the frontend constants.

``injury_reports`` is the weekly practice and game-status report, for the previews. It
is **current state per team and week** and is replaced, never upserted: a player taken
off a report stops appearing in the feed rather than reappearing as healthy.

Every table here is replaced per game (plays, drives) or per team-week (injuries) by
``replace_scoped`` in the pipeline, for the reason ``play_targets`` is: a stat correction
can renumber or remove a play, and an upsert would keep the stale row forever.
"""

from sqlalchemy import Boolean, Float, ForeignKey, Integer, SmallInteger, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

# The first season the game pages cover. Mirrored in pipeline/seasons.py and
# frontend/src/constants/index.js; tests/test_game_pages.py fails if they drift.
FIRST_GAME_PAGE_SEASON = 2025

# How a scoring play scored, as stored in ``GamePlay.score_type``.
SCORE_TYPES: tuple[str, ...] = ("TD", "FG", "XP", "2PT", "SAF", "DEF2")


class GamePlay(Base):
    """One play: when it happened, who had the ball, what it said, and what it changed.

    ``home_wp`` and ``home_wp_post`` are nflfastR's **spread-adjusted** win probability for
    the home team before and after the play, so a chart starts where the market started
    rather than at 50%. ``home_score`` / ``away_score`` are the running score *after* the
    play. ``description`` is play-by-play's own text, stored as published; the API
    shortens it for display.
    """

    __tablename__ = "game_plays"
    game_id: Mapped[str] = mapped_column(ForeignKey("games.game_id"), primary_key=True)
    play_id: Mapped[int] = mapped_column(Integer, primary_key=True)

    season: Mapped[int] = mapped_column(Integer)
    week: Mapped[int] = mapped_column(Integer)
    season_type: Mapped[str] = mapped_column(String(20))
    # Play-by-play's own ordering; play_id is not always monotonic across a review.
    sequence: Mapped[int | None] = mapped_column(Integer)

    quarter: Mapped[int | None] = mapped_column(SmallInteger)   # 5 is overtime
    clock: Mapped[str | None] = mapped_column(String(5))        # "13:28", as the feed quotes it
    quarter_seconds: Mapped[int | None] = mapped_column(SmallInteger)
    team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.team_id"))  # the offense
    drive: Mapped[int | None] = mapped_column(SmallInteger)

    down: Mapped[int | None] = mapped_column(SmallInteger)
    distance: Mapped[int | None] = mapped_column(SmallInteger)
    yardline: Mapped[str | None] = mapped_column(String(10))     # "BUF 34"
    yardline_100: Mapped[int | None] = mapped_column(SmallInteger)

    play_type: Mapped[str | None] = mapped_column(String(20))
    description: Mapped[str | None] = mapped_column(Text)
    yards: Mapped[int | None] = mapped_column(SmallInteger)
    epa: Mapped[float | None] = mapped_column(Float)
    success: Mapped[bool | None] = mapped_column(Boolean)
    is_pass: Mapped[bool] = mapped_column(Boolean, default=False)
    is_rush: Mapped[bool] = mapped_column(Boolean, default=False)
    touchdown: Mapped[bool] = mapped_column(Boolean, default=False)
    turnover: Mapped[bool] = mapped_column(Boolean, default=False)
    penalty: Mapped[bool] = mapped_column(Boolean, default=False)

    home_wp: Mapped[float | None] = mapped_column(Float)
    home_wp_post: Mapped[float | None] = mapped_column(Float)
    home_score: Mapped[int | None] = mapped_column(SmallInteger)
    away_score: Mapped[int | None] = mapped_column(SmallInteger)

    # Set on scoring plays only: how, and which team the points went to (the defense on
    # a pick-six or a safety).
    score_type: Mapped[str | None] = mapped_column(String(4))
    score_team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.team_id"))

    # The play's players and what each was credited with, as play-by-play states them, so
    # a recap can price every play in any scoring (points by quarter). No
    # foreign keys, like play_targets: a fullback's carry is still a play. Yards are NULL
    # where the role is absent: a sack has no passing yards, not zero.
    passer_id: Mapped[str | None] = mapped_column(String(50))
    rusher_id: Mapped[str | None] = mapped_column(String(50))
    receiver_id: Mapped[str | None] = mapped_column(String(50))
    fumble_lost_id: Mapped[str | None] = mapped_column(String(50))
    passing_yards: Mapped[int | None] = mapped_column(SmallInteger)
    rushing_yards: Mapped[int | None] = mapped_column(SmallInteger)
    receiving_yards: Mapped[int | None] = mapped_column(SmallInteger)
    complete: Mapped[bool] = mapped_column(Boolean, default=False)
    interception: Mapped[bool] = mapped_column(Boolean, default=False)
    pass_touchdown: Mapped[bool] = mapped_column(Boolean, default=False)
    rush_touchdown: Mapped[bool] = mapped_column(Boolean, default=False)
    two_point: Mapped[bool] = mapped_column(Boolean, default=False)   # a successful conversion


class GameDrive(Base):
    """One possession: where it started and ended, how long it took, and how it ended.

    ``start_yardline`` and ``end_yardline`` are yards from the offense's **own** goal line
    (0-100), so every drive in a chart runs the same direction. ``points`` is what the
    offense scored on it, the try included.
    """

    __tablename__ = "game_drives"

    game_id: Mapped[str] = mapped_column(ForeignKey("games.game_id"), primary_key=True)
    drive: Mapped[int] = mapped_column(SmallInteger, primary_key=True)

    season: Mapped[int] = mapped_column(Integer)
    week: Mapped[int] = mapped_column(Integer)
    season_type: Mapped[str] = mapped_column(String(20))
    team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.team_id"))

    quarter: Mapped[int | None] = mapped_column(SmallInteger)
    clock: Mapped[str | None] = mapped_column(String(5))
    elapsed: Mapped[int | None] = mapped_column(Integer)   # game seconds before the drive began
    start_yardline: Mapped[int | None] = mapped_column(SmallInteger)
    end_yardline: Mapped[int | None] = mapped_column(SmallInteger)
    plays: Mapped[int | None] = mapped_column(SmallInteger)
    yards: Mapped[int | None] = mapped_column(SmallInteger)
    first_downs: Mapped[int | None] = mapped_column(SmallInteger)
    seconds: Mapped[int | None] = mapped_column(SmallInteger)   # time of possession
    result: Mapped[str | None] = mapped_column(String(30))       # "Touchdown", "Punt", ...
    points: Mapped[int | None] = mapped_column(SmallInteger)
    started_by: Mapped[str | None] = mapped_column(String(40))  # "KICKOFF", "INTERCEPTION", ...


class InjuryReport(Base):
    """One player's line on a team's weekly injury report.

    ``player_id`` carries **no foreign key**: the report lists linemen and defenders,
    who are not in ``players``, and the preview shows them by name. A skill player's id
    still joins to ``players``, which is how the fantasy table marks him.
    """

    __tablename__ = "injury_reports"

    season: Mapped[int] = mapped_column(Integer, primary_key=True)
    season_type: Mapped[str] = mapped_column(String(20), primary_key=True)
    week: Mapped[int] = mapped_column(Integer, primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.team_id"), primary_key=True)
    player_id: Mapped[str] = mapped_column(String(50), primary_key=True)

    name: Mapped[str | None] = mapped_column(String(100))
    position: Mapped[str | None] = mapped_column(String(10))
    status: Mapped[str | None] = mapped_column(String(30))            # Out / Doubtful / Questionable
    injury: Mapped[str | None] = mapped_column(String(60))
    practice_status: Mapped[str | None] = mapped_column(String(60))
