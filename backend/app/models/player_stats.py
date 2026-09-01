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
    rush_att_inside_10: Mapped[int | None] = mapped_column(Integer)
    rush_att_inside_5: Mapped[int | None] = mapped_column(Integer)
    rush_att_inside_2: Mapped[int | None] = mapped_column(Integer)
    rush_attempt_share: Mapped[float | None] = mapped_column(Float)
    opportunity_share: Mapped[float | None] = mapped_column(Float)
    market_share: Mapped[float | None] = mapped_column(Float)
    targets_per_route_run: Mapped[float | None] = mapped_column(Float)
    slot_snaps: Mapped[int | None] = mapped_column(Integer)
    routes_run: Mapped[int | None] = mapped_column(Integer)
    route_participation: Mapped[float | None] = mapped_column(Float)
    unrealized_air_yards: Mapped[float | None] = mapped_column(Float)
    yards_per_route_run: Mapped[float | None] = mapped_column(Float)
    yards_per_target: Mapped[float | None] = mapped_column(Float)
    yards_per_reception: Mapped[float | None] = mapped_column(Float)

    # --- Expected stat components (M2) ---
    # Model estimates from nflverse ffopportunity. Stored as *components* — never as
    # expected fantasy points — so expected points recompute in any league scoring
    # through the same engine as actual points (see app/scoring.py).
    passing_yards_exp: Mapped[float | None] = mapped_column(Float)
    passing_tds_exp: Mapped[float | None] = mapped_column(Float)
    interceptions_exp: Mapped[float | None] = mapped_column(Float)
    rushing_yards_exp: Mapped[float | None] = mapped_column(Float)
    rushing_tds_exp: Mapped[float | None] = mapped_column(Float)
    receiving_yards_exp: Mapped[float | None] = mapped_column(Float)
    receiving_tds_exp: Mapped[float | None] = mapped_column(Float)
    receptions_exp: Mapped[float | None] = mapped_column(Float)
    two_point_conv_exp: Mapped[float | None] = mapped_column(Float)

    # --- Next Gen Stats (M11) ---
    # Player-tracking derivatives, scraped from nextgenstats.nfl.com by nflverse and
    # read through load_nextgen_stats. 2016+, and only for players NGS qualifies, so
    # these are NULL far more often than the columns above.
    #
    # ⚠️ The ``ngs_`` prefix is load-bearing. NGS publishes its own completion
    # percentage over expected and its own depth of target; ``cpoe`` and ``adot``
    # above are computed from nflverse play-by-play. They are different numbers from
    # different models and must never be read as the same column.
    ngs_pass_time_to_throw: Mapped[float | None] = mapped_column(Float)
    ngs_pass_completed_air_yards: Mapped[float | None] = mapped_column(Float)
    ngs_pass_intended_air_yards: Mapped[float | None] = mapped_column(Float)
    ngs_pass_air_yards_differential: Mapped[float | None] = mapped_column(Float)
    ngs_pass_aggressiveness: Mapped[float | None] = mapped_column(Float)
    ngs_pass_air_yards_to_sticks: Mapped[float | None] = mapped_column(Float)
    ngs_pass_expected_completion_pct: Mapped[float | None] = mapped_column(Float)
    ngs_pass_completion_pct_above_expectation: Mapped[float | None] = mapped_column(Float)
    ngs_rec_cushion: Mapped[float | None] = mapped_column(Float)
    ngs_rec_separation: Mapped[float | None] = mapped_column(Float)
    ngs_rec_intended_air_yards: Mapped[float | None] = mapped_column(Float)
    ngs_rec_pct_share_intended_air_yards: Mapped[float | None] = mapped_column(Float)
    ngs_rec_catch_pct: Mapped[float | None] = mapped_column(Float)
    ngs_rec_yac: Mapped[float | None] = mapped_column(Float)
    ngs_rec_expected_yac: Mapped[float | None] = mapped_column(Float)
    ngs_rec_yac_above_expectation: Mapped[float | None] = mapped_column(Float)
    ngs_rush_efficiency: Mapped[float | None] = mapped_column(Float)
    ngs_rush_time_to_los: Mapped[float | None] = mapped_column(Float)
    ngs_rush_pct_attempts_eight_defenders: Mapped[float | None] = mapped_column(Float)
    ngs_rush_expected_yards: Mapped[float | None] = mapped_column(Float)
    ngs_rush_yards_over_expected: Mapped[float | None] = mapped_column(Float)
    ngs_rush_yards_over_expected_per_att: Mapped[float | None] = mapped_column(Float)
    ngs_rush_pct_over_expected: Mapped[float | None] = mapped_column(Float)

    # --- Fantasy stats ---
    fantasy_points_ppr: Mapped[float | None] = mapped_column(Float)
    fantasy_points_half: Mapped[float | None] = mapped_column(Float)
    fantasy_points_std: Mapped[float | None] = mapped_column(Float)
