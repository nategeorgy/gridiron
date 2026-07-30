"""Stat-line response schemas (per-game game log)."""

from datetime import date

from pydantic import BaseModel, ConfigDict


class StatLineOut(BaseModel):
    """A single player's stat line for one game, with game context."""

    model_config = ConfigDict(from_attributes=True)

    # Game context
    game_id: str
    season: int | None = None
    week: int | None = None
    season_type: str | None = None
    game_date: date | None = None
    team_id: int | None = None
    opponent_abbreviation: str | None = None

    # General
    passing_yards: int | None = None
    passing_tds: int | None = None
    interceptions: int | None = None
    completions: int | None = None
    attempts: int | None = None
    rushing_yards: int | None = None
    rushing_tds: int | None = None
    carries: int | None = None
    receiving_yards: int | None = None
    receiving_tds: int | None = None
    receptions: int | None = None
    targets: int | None = None
    fumbles: int | None = None
    fumbles_lost: int | None = None

    # Advanced
    epa: float | None = None
    cpoe: float | None = None
    air_yards: float | None = None
    air_yards_share: float | None = None
    target_share: float | None = None
    racr: float | None = None
    wopr: float | None = None
    snap_count: int | None = None
    snap_share: float | None = None
    yards_after_catch: float | None = None
    adot: float | None = None
    passer_rating: float | None = None
    rushing_epa: float | None = None
    receiving_epa: float | None = None
    red_zone_rush_share: float | None = None
    red_zone_rush_attempts: int | None = None
    red_zone_targets: int | None = None
    rush_att_inside_10: int | None = None
    rush_att_inside_5: int | None = None
    rush_att_inside_2: int | None = None
    rush_attempt_share: float | None = None
    opportunity_share: float | None = None
    market_share: float | None = None
    targets_per_route_run: float | None = None
    slot_snaps: int | None = None
    routes_run: int | None = None
    route_participation: float | None = None
    unrealized_air_yards: float | None = None
    yards_per_route_run: float | None = None
    yards_per_target: float | None = None
    yards_per_reception: float | None = None

    # Expected components (M2 — ffopportunity model estimates)
    passing_yards_exp: float | None = None
    passing_tds_exp: float | None = None
    interceptions_exp: float | None = None
    rushing_yards_exp: float | None = None
    rushing_tds_exp: float | None = None
    receiving_yards_exp: float | None = None
    receiving_tds_exp: float | None = None
    receptions_exp: float | None = None
    two_point_conv_exp: float | None = None

    # Fantasy
    fantasy_points_ppr: float | None = None
    fantasy_points_half: float | None = None
    fantasy_points_std: float | None = None

    # Scoring-aware, computed per-request from the requested league scoring
    # (not stored columns — see app/scoring.py).
    fantasy_points: float | None = None
    expected_fantasy_points: float | None = None
