"""PlayerStats ORM model — one row per player per game.

NOTE: Season-level derived metrics (fantasy_ppg_ppr/half/std and
routes_run_per_game) are intentionally NOT columns here. They are computed in
the API by aggregating these per-game rows. See CLAUDE.md.
"""

from sqlalchemy import Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PlayerStats(Base):
    """A player's statistical line for a single game."""

    __tablename__ = "player_stats"
    __table_args__ = (UniqueConstraint("player_id", "game_id", name="uq_player_game"),)

    stat_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    player_id: Mapped[str] = mapped_column(
        ForeignKey("players.player_id"), index=True, nullable=False
    )
    game_id: Mapped[str] = mapped_column(
        ForeignKey("games.game_id"), index=True, nullable=False
    )
    team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.team_id"))
    season: Mapped[int | None] = mapped_column(Integer, index=True)
    week: Mapped[int | None] = mapped_column(Integer, index=True)
    season_type: Mapped[str | None] = mapped_column(String(20))

    # --- General stats ---
    passing_yards: Mapped[int | None] = mapped_column(Integer)
    passing_tds: Mapped[int | None] = mapped_column(Integer)
    interceptions: Mapped[int | None] = mapped_column(Integer)
    completions: Mapped[int | None] = mapped_column(Integer)
    attempts: Mapped[int | None] = mapped_column(Integer)
    rushing_yards: Mapped[int | None] = mapped_column(Integer)
    rushing_tds: Mapped[int | None] = mapped_column(Integer)
    carries: Mapped[int | None] = mapped_column(Integer)
    receiving_yards: Mapped[int | None] = mapped_column(Integer)
    receiving_tds: Mapped[int | None] = mapped_column(Integer)
    receptions: Mapped[int | None] = mapped_column(Integer)
    targets: Mapped[int | None] = mapped_column(Integer)
    fumbles: Mapped[int | None] = mapped_column(Integer)
    fumbles_lost: Mapped[int | None] = mapped_column(Integer)

    # --- Advanced stats ---
    epa: Mapped[float | None] = mapped_column(Float)
    cpoe: Mapped[float | None] = mapped_column(Float)
    air_yards: Mapped[float | None] = mapped_column(Float)
    air_yards_share: Mapped[float | None] = mapped_column(Float)
    target_share: Mapped[float | None] = mapped_column(Float)
    racr: Mapped[float | None] = mapped_column(Float)
    wopr: Mapped[float | None] = mapped_column(Float)
    snap_count: Mapped[int | None] = mapped_column(Integer)
    snap_share: Mapped[float | None] = mapped_column(Float)
    yards_after_catch: Mapped[float | None] = mapped_column(Float)
    adot: Mapped[float | None] = mapped_column(Float)
    passer_rating: Mapped[float | None] = mapped_column(Float)
    rushing_epa: Mapped[float | None] = mapped_column(Float)
    receiving_epa: Mapped[float | None] = mapped_column(Float)
    red_zone_rush_share: Mapped[float | None] = mapped_column(Float)
    red_zone_rush_attempts: Mapped[int | None] = mapped_column(Integer)
    red_zone_targets: Mapped[int | None] = mapped_column(Integer)
    targets_per_route_run: Mapped[float | None] = mapped_column(Float)
    slot_snaps: Mapped[int | None] = mapped_column(Integer)
    routes_run: Mapped[int | None] = mapped_column(Integer)
    route_participation: Mapped[float | None] = mapped_column(Float)
    unrealized_air_yards: Mapped[float | None] = mapped_column(Float)
    yards_per_route_run: Mapped[float | None] = mapped_column(Float)
    yards_per_target: Mapped[float | None] = mapped_column(Float)
    yards_per_reception: Mapped[float | None] = mapped_column(Float)

    # --- Fantasy stats ---
    fantasy_points_ppr: Mapped[float | None] = mapped_column(Float)
    fantasy_points_half: Mapped[float | None] = mapped_column(Float)
    fantasy_points_std: Mapped[float | None] = mapped_column(Float)
