"""Team-level play-by-play sums: one row per team, per game, per side of the ball.

The team pages and team leaderboards need rates (EPA per play, pass rate over expected,
red zone TD rate, share of throws that go deep) for any set of weeks. A rate cannot be
averaged across weeks, so this table stores only **sums and counts**, and every rate is
computed on the way out as ``sum(numerator) / sum(denominator)`` over the window asked
for. Aggregate first, divide last: the same rule the player registry follows.

``side`` is ``"o"`` for the plays this team ran with the ball and ``"d"`` for the plays
its opponent ran against it, so one set of columns describes an offense and a defense.
Team-level box score columns that belong to the team rather than to a side (penalties,
giveaways, takeaways) are written on both rows and read from the side that owns them.

Written by ``pipeline/ingest_team_stats.py``. Columns sourced from a feed that does not
cover a season are NULL, never 0: FTN charting starts in 2022, participation covers
2016 to the season before last, snap counts start in 2013.
"""

from sqlalchemy import Column, Float, ForeignKey, Index, Integer, String, Table

from app.models.base import Base

# (column, meaning). Every value is a count or a sum over the team's plays in one game.
PLAY_COLUMNS: tuple[tuple[str, str], ...] = (
    ("plays", "scrimmage plays with an EPA: dropbacks (sacks and scrambles included) and designed runs"),
    ("dropbacks", "qb_dropback plays"),
    ("designed_runs", "rushes that were not dropbacks"),
    ("epa", "sum of EPA"),
    ("successes", "plays with positive EPA"),
    ("dropback_epa", "EPA on dropbacks"),
    ("dropback_successes", "successful dropbacks"),
    ("run_epa", "EPA on designed runs"),
    ("run_successes", "successful designed runs"),
    ("yards", "yards gained"),
    ("explosive_passes", "dropbacks gaining 20+ yards"),
    ("explosive_runs", "designed runs gaining 10+ yards"),
    ("pass_attempts", "pass attempts, sacks excluded"),
    ("completions", "completed passes"),
    ("passing_yards", "passing yards"),
    ("passing_tds", "passing touchdowns"),
    ("interceptions", "interceptions thrown"),
    ("sacks", "sacks taken"),
    ("cpoe_sum", "sum of CPOE over attempts that carry one"),
    ("cpoe_attempts", "attempts carrying a CPOE"),
    ("air_yards_sum", "air yards over attempts that carry them"),
    ("air_yards_attempts", "attempts carrying air yards"),
    ("yac_sum", "yards after catch over completions that carry it"),
    ("yac_completions", "completions carrying YAC"),
    ("rushing_yards", "yards on designed runs"),
    ("rushing_tds", "touchdowns on designed runs"),
    ("stuffs", "designed runs for zero yards or less"),
    ("first_downs", "first downs gained"),
    ("neutral_plays", "plays in neutral situations (1st-3rd down, win probability 20-80%, outside the last two minutes of a half)"),
    ("neutral_dropbacks", "dropbacks in neutral situations"),
    ("neutral_pass_oe_sum", "sum of nflfastR pass_oe (percentage points) in neutral situations"),
    ("neutral_pass_oe_plays", "neutral plays carrying pass_oe"),
    ("neutral_seconds_sum", "seconds to the next snap in the same drive, neutral situations, gaps of 1-60 s"),
    ("neutral_seconds_snaps", "snaps counted in neutral_seconds_sum"),
    ("third_down_conversions", "third downs converted"),
    ("third_down_attempts", "third downs attempted"),
    ("fourth_down_conversions", "fourth downs converted on a go-for-it play"),
    ("fourth_down_attempts", "fourth downs gone for"),
    ("fourth_down_decisions", "fourth downs faced: runs, passes, punts and field goals"),
    ("fourth_down_goes", "fourth downs where the offense ran a play"),
    ("drives", "offensive drives"),
    ("drive_points", "offensive points: touchdowns, the tries after them, field goals"),
    ("red_zone_trips", "drives that reached the opponent's 20"),
    ("red_zone_tds", "red zone trips ending in a touchdown"),
    ("three_and_outs", "drives ending in a punt with no first down"),
    ("turnover_drives", "drives ending in a turnover"),
    ("start_yardline_sum", "starting field position summed, yards from the offense's own goal line"),
    ("start_yardline_drives", "drives counted in start_yardline_sum"),
    ("snaps", "offensive snaps (side d: the opponent's), from snap counts"),
    ("penalties", "accepted penalties on the team (both sides of the ball)"),
    ("penalty_yards", "penalty yards on the team"),
    ("giveaways", "interceptions thrown plus fumbles lost"),
    ("takeaways", "interceptions plus opponent fumbles recovered"),
    # FTN charting (2022+)
    ("ftn_plays", "plays FTN charted"),
    ("shotgun_plays", "charted plays from shotgun or pistol"),
    ("under_center_plays", "charted plays under center"),
    ("motion_plays", "charted plays with motion"),
    ("no_huddle_plays", "charted plays without a huddle"),
    ("empty_plays", "charted plays with an empty backfield"),
    ("rpo_plays", "charted RPOs"),
    ("ftn_dropbacks", "charted dropbacks"),
    ("play_action_dropbacks", "charted dropbacks with play action"),
    ("screen_dropbacks", "charted screens"),
    ("blitzed_dropbacks", "charted dropbacks with at least one blitzer"),
    ("pass_rushers_sum", "pass rushers summed over charted dropbacks"),
    ("pass_rushers_dropbacks", "charted dropbacks carrying a pass rusher count"),
    ("ftn_designed_runs", "charted designed runs"),
    ("stacked_box_runs", "charted designed runs into eight or more in the box"),
    ("ftn_attempts", "charted pass attempts"),
    ("throwaways", "charted throwaways"),
    ("catchable_throws", "charted catchable throws"),
    ("drops", "charted drops"),
    ("interception_worthy", "charted interception-worthy throws"),
    # participation (2016 to the season before last)
    ("coverage_dropbacks", "dropbacks with a charted man or zone coverage"),
    ("man_dropbacks", "of those, man coverage"),
)

# Pass depth on attempts with air yards: behind the line (<0), short (0-9),
# intermediate (10-19), deep (20+).
DEPTHS: tuple[str, ...] = ("behind", "short", "intermediate", "deep")
DEPTH_FIELDS: tuple[str, ...] = ("attempts", "epa", "successes", "completions", "yards")

# Designed runs by nflfastR's run_location and run_gap, left end to right end.
LANES: tuple[str, ...] = ("left_end", "left_tackle", "left_guard", "middle", "right_guard", "right_tackle", "right_end")
LANE_FIELDS: tuple[str, ...] = ("runs", "epa", "successes", "yards")

BUCKET_COLUMNS: tuple[str, ...] = tuple(
    [f"depth_{d}_{f}" for d in DEPTHS for f in DEPTH_FIELDS]
    + [f"lane_{lane}_{f}" for lane in LANES for f in LANE_FIELDS]
)
SUM_COLUMNS: tuple[str, ...] = tuple(name for name, _ in PLAY_COLUMNS) + BUCKET_COLUMNS

team_game_stats_table = Table(
    "team_game_stats",
    Base.metadata,
    Column("team_id", Integer, ForeignKey("teams.team_id"), primary_key=True),
    Column("game_id", String(50), ForeignKey("games.game_id"), primary_key=True),
    Column("side", String(1), primary_key=True),
    Column("opponent_id", Integer, ForeignKey("teams.team_id")),
    Column("season", Integer),
    Column("week", Integer),
    Column("season_type", String(20)),
    *[Column(name, Float) for name in SUM_COLUMNS],
    Index("ix_team_game_stats_season", "season", "season_type"),
)


class TeamGameStats(Base):
    """One team's sums on one side of the ball in one game."""

    __table__ = team_game_stats_table
