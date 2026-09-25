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
    # The team he played this game for, in the code that team used at the time (M8).
    # Not the same as the player's current team once scope reaches back to 1999:
    # Marshall Faulk's 2001 line belongs to STL, while `players.team_id` says LA.
    team_abbreviation: str | None = None

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

    # Contact, pressure and tracking columns a player page's game log reads (M13). All
    # coverage-limited: PFR's from 2018, NGS's from 2016 and only for the games NGS
    # qualified the player in — so a null here is routinely "not measured", never zero.
    rush_yards_before_contact: int | None = None
    rush_yards_after_contact: int | None = None
    bad_throw_rate: float | None = None
    drops_by_receivers: int | None = None
    ngs_rush_yards_over_expected: float | None = None
    ngs_pass_intended_air_yards: float | None = None

    # Everything else a leaderboard tab can show, so the player page's game log can show
    # the same tabs one game at a time (September 2026). Same coverage caveat as above.
    passing_first_downs: int | None = None
    rushing_first_downs: int | None = None
    receiving_first_downs: int | None = None
    sacks_suffered: int | None = None
    sack_fumbles_lost: int | None = None
    pressure_rate: float | None = None
    times_blitzed: int | None = None
    rush_broken_tackles: int | None = None
    rec_broken_tackles: int | None = None
    receiving_drops: int | None = None
    passer_rating_when_targeted: float | None = None
    ngs_pass_time_to_throw: float | None = None
    ngs_pass_completed_air_yards: float | None = None
    ngs_pass_air_yards_differential: float | None = None
    ngs_pass_aggressiveness: float | None = None
    ngs_pass_air_yards_to_sticks: float | None = None
    ngs_pass_expected_completion_pct: float | None = None
    ngs_rec_separation: float | None = None
    ngs_rec_cushion: float | None = None
    ngs_rec_yac: float | None = None
    ngs_rec_expected_yac: float | None = None
    ngs_rec_yac_above_expectation: float | None = None
    ngs_rush_yards_over_expected_per_att: float | None = None
    ngs_rush_expected_yards: float | None = None
    ngs_rush_pct_over_expected: float | None = None
    ngs_rush_efficiency: float | None = None
    ngs_rush_time_to_los: float | None = None
    ngs_rush_pct_attempts_eight_defenders: float | None = None

    # Where this game finished among the player's position that week, in the request's
    # scoring (M13). Computed, never stored: it depends on the scoring config.
    position_rank: int | None = None
    pool_size: int | None = None

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
    passing_first_downs_exp: float | None = None
    rushing_first_downs_exp: float | None = None
    receiving_first_downs_exp: float | None = None
    completions_exp: float | None = None

    # Fantasy
    fantasy_points_ppr: float | None = None
    fantasy_points_half: float | None = None
    fantasy_points_std: float | None = None

    # Scoring-aware, computed per-request from the requested league scoring
    # (not stored columns — see app/scoring.py).
    fantasy_points: float | None = None
    expected_fantasy_points: float | None = None
