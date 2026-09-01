"""Which stored columns are trustworthy in which seasons (M8).

Extending project scope back to 1999 exposed a problem that did not exist when scope
started in 2020: **the columns are not all available for the same years, and the feeds
do not say so.** They report a missing stat as ``0``, not as NULL — so a 2004 receiver
with 90 catches arrives carrying ``targets = 0``, and a 2001 one carries
``air_yards = 0``. Stored as-is, those zeros are worse than missing data: they sort,
they average, and they quietly poison every share, rate and percentile derived from
them. A leaderboard would rank Torry Holt's 2003 season at zero targets and mean it.

So this module is the one place that says when a column is real, and
:func:`mask_unavailable` NULLs the rest at ingest time. NULL is the honest value: the
API already renders it as "—" and sorts it last, and every downstream share and rate
inherits the null instead of dividing by a lie.

**Every window here was measured, not assumed** — see
``docs/design/M8-historical-depth.md`` for the audit. The short version, by cause:

- **1999–2005 has no charted passing data.** The NFL did not publish air yards, pass
  length or pass location before 2006, so ``cpoe`` and ``yards_after_catch`` do not
  exist before then. nflverse carries the columns and fills them with zeros.
- **2003–2008 loses the receiver on incomplete passes.** Play-by-play in those seasons
  names a receiver only on *completions*, so an incompletion cannot be attributed to
  anyone. That makes ``targets`` unrecoverable, and with it every share, rate and model
  estimate built on targets — including receiving air yards, which are only counted on
  caught balls.

  ⚠️ **This gap is easy to talk yourself out of, so here is the evidence.** In 2006–2008
  ``load_ff_opportunity`` *looks* like it has the missing targets: its league-wide
  ``rec_attempt`` total is ~17,800, exactly the right magnitude, while the weekly stats
  feed reports zero. It does not. Those targets sit on ~700 rows a season with **no
  player id** — the unattributed incompletions. Per player, ``rec_attempt`` equals
  ``receptions`` in 94–99% of player-games (Randy Moss, 2007: 105 targets, 105
  catches), against 32–39% in every healthy season. The same is true of its receiving
  model: expected receptions, yards and touchdowns run at 0.67 / 0.62 / 0.50 of actual
  in 2006–2008, against ~0.98 from 2009. Its **passing and rushing** numbers are sound
  throughout, which is why those keep the earlier floor.
- **Snaps start in 2013.** nflreadpy documents 2012 as the floor and accepts it, but
  that season's Pro Football Reference file is empty upstream.
- **Routes start in 2016** and always stop a season short of the roster year: the
  participation feed is delivered only once a season's post-season is complete.

Rushing is the happy exception: ``rusher_player_id`` is 100% populated in every season
back to 1999, so carries, red-zone rushing and the inside-10/5/2 columns are complete
for the whole range. Receptions, receiving yards and receiving touchdowns are complete
too — a completion always names its receiver.
"""

from dataclasses import dataclass, field

# The participation feed publishes on a one-season lag (FTN delivers after the
# post-season), so routes always stop a year short of the roster year. The ceiling is
# resolved at runtime rather than hardcoded — see pipeline/seasons.py.
from seasons import PARTICIPATION


@dataclass(frozen=True)
class Availability:
    """The seasons in which one stored column carries a real value.

    ``last=None`` means "still published". ``gaps`` are inclusive ranges inside the
    window where the data is missing anyway — the 2003–2008 receiver blackout is the
    only one, and it is the reason this is a set of ranges rather than a floor.
    """

    first: int
    last: int | None = None
    gaps: tuple[tuple[int, int], ...] = field(default_factory=tuple)
    note: str = ""

    def covers(self, season: int) -> bool:
        """True if this column carries real data for ``season``."""
        if season < self.first:
            return False
        if self.last is not None and season > self.last:
            return False
        return not any(start <= season <= end for start, end in self.gaps)


# The first season of the whole ecosystem: nflverse play-by-play starts here, so a
# column with no restriction of its own is available from 1999 and is simply absent
# from the table below.
FIRST_CHARTED_SEASON = 1999

# The year the NFL began publishing where a pass was thrown.
FIRST_AIR_YARDS_SEASON = 2006

# Play-by-play records a receiver only on completions in these seasons, so a target
# cannot be attributed. Unrecoverable from any feed — see the module docstring.
RECEIVER_BLACKOUT = ((2003, 2008),)

# Receiving data needs both: a charted air yard, and a receiver named on the
# incompletions that make up a third of all targets.
FIRST_RECEIVING_ADVANCED_SEASON = 2009

_TARGETS = Availability(
    first=FIRST_CHARTED_SEASON, gaps=RECEIVER_BLACKOUT,
    note="Play-by-play names a receiver only on completions from 2003 to 2008, so "
         "incompletions cannot be attributed and targets are unrecoverable.",
)
# Air yards are counted per target, so they need the receiver on incompletions too.
_RECEIVING_ADVANCED = Availability(
    first=FIRST_RECEIVING_ADVANCED_SEASON,
    note="Needs charted air yards (2006+) and a receiver named on incomplete passes "
         "(2009+).",
)
# Charted at the passer, who is never in doubt — so this only waits for 2006.
_CHARTED_AT_PASSER = Availability(
    first=FIRST_AIR_YARDS_SEASON,
    note="The NFL did not publish air yards, pass length or pass location before 2006.",
)
_EXPECTED_SOUND = Availability(
    first=FIRST_AIR_YARDS_SEASON,
    note="The nflverse ffopportunity model starts in 2006.",
)
_EXPECTED_RECEIVING = Availability(
    first=FIRST_RECEIVING_ADVANCED_SEASON,
    note="The nflverse ffopportunity model starts in 2006, and its receiving side is "
         "fed by targets — so it runs at roughly two-thirds of actual until 2009, "
         "while incompletions cannot be attributed.",
)

# The Next Gen Stats columns (M11). Listed once and reused, because every one of them
# shares a single window and the list is long enough that repeating it invites a typo
# that the mirror test would report as a drift.
NEXTGEN_COLUMNS: tuple[str, ...] = (
    "ngs_pass_time_to_throw",
    "ngs_pass_completed_air_yards",
    "ngs_pass_intended_air_yards",
    "ngs_pass_air_yards_differential",
    "ngs_pass_aggressiveness",
    "ngs_pass_air_yards_to_sticks",
    "ngs_pass_expected_completion_pct",
    "ngs_pass_completion_pct_above_expectation",
    "ngs_rec_cushion",
    "ngs_rec_separation",
    "ngs_rec_intended_air_yards",
    "ngs_rec_pct_share_intended_air_yards",
    "ngs_rec_catch_pct",
    "ngs_rec_yac",
    "ngs_rec_expected_yac",
    "ngs_rec_yac_above_expectation",
    "ngs_rush_efficiency",
    "ngs_rush_time_to_los",
    "ngs_rush_pct_attempts_eight_defenders",
    "ngs_rush_expected_yards",
    "ngs_rush_yards_over_expected",
    "ngs_rush_yards_over_expected_per_att",
    "ngs_rush_pct_over_expected",
)

# Only columns with a restriction appear here. Anything absent is available from 1999.
COLUMN_AVAILABILITY: dict[str, Availability] = {
    # --- Targets and everything that divides by them ---
    "targets": _TARGETS,
    "target_share": _TARGETS,
    "yards_per_target": _TARGETS,
    "red_zone_targets": _TARGETS,

    # --- Receiving charted data: needs air yards AND the incompletion's receiver ---
    "air_yards": _RECEIVING_ADVANCED,
    "air_yards_share": _RECEIVING_ADVANCED,
    "adot": _RECEIVING_ADVANCED,
    "racr": _RECEIVING_ADVANCED,
    "wopr": _RECEIVING_ADVANCED,
    "unrealized_air_yards": _RECEIVING_ADVANCED,
    # Computed in ingest_expected from ffopportunity, so it needs that model (2006+)
    # *and* attributable targets — the later of the two.
    "opportunity_share": _RECEIVING_ADVANCED,

    # --- Charted at the passer, or only on completions: available from 2006 ---
    "cpoe": _CHARTED_AT_PASSER,
    "yards_after_catch": _CHARTED_AT_PASSER,

    # --- Market shares, computed from ffopportunity's *actual* team totals rather
    # than its model, so they are sound as soon as that feed starts.
    **{
        column: _EXPECTED_SOUND
        for column in ("market_share", "rush_attempt_share")
    },

    # --- Expected components: the whole family waits for 2009, including the passing
    # and rushing sides that are individually fine from 2006.
    #
    # The reason is that nothing consumes a component on its own. Expected *fantasy
    # points* is their sum, and a sum treats a missing part as zero — so in 2006-2008
    # a receiver's expected points would be his rushing expectation and almost nothing
    # else, a number that is non-null, badly wrong, and indistinguishable from a real
    # one. Keeping the sound halves would buy expected points for quarterbacks in
    # three seasons at the cost of silently mis-ranking every skill player in them.
    **{
        column: _EXPECTED_RECEIVING
        for column in (
            "passing_yards_exp", "passing_tds_exp", "interceptions_exp",
            "rushing_yards_exp", "rushing_tds_exp",
            "receiving_yards_exp", "receiving_tds_exp", "receptions_exp",
            "two_point_conv_exp",
        )
    },

    # --- Snaps: Pro Football Reference, 2013+ ---
    **{
        column: Availability(
            first=2013,
            note="Pro Football Reference snap counts. nflreadpy documents 2012 as the "
                 "floor and accepts it, but the 2012 file is empty upstream — "
                 "measured, not assumed.",
        )
        for column in ("snap_count", "snap_share")
    },

    # --- Routes: the participation feed, 2016 until it stopped ---
    **{
        column: Availability(
            first=2016, last=PARTICIPATION.latest(),
            note="Derived from the nflverse participation feed, which publishes on "
                 "a one-season lag: FTN delivers a season only after its post-season "
                 "is complete, so routes always stop a year short of the roster year.",
        )
        for column in (
            "routes_run", "route_participation",
            "targets_per_route_run", "yards_per_route_run",
        )
    },

    # --- Next Gen Stats: nflverse's scrape of nextgenstats.nfl.com, 2016+ ---
    #
    # Two separate limits, and only the first is a season window. NGS publishes from
    # 2016, so nothing before that exists at all. But *inside* the window it covers
    # only players it qualifies — roughly 65 receivers in a week where 200+ play — and
    # it files a player under one phase only, so a pass-catching back has rushing NGS
    # and no receiving NGS. That second limit is per player, not per season, so it
    # cannot live in this table: it shows up simply as NULL on the rows the feed
    # skipped, which is the honest rendering of "NGS did not rank him".
    **{
        column: Availability(
            first=2016,
            note=(
                "NFL Next Gen Stats, scraped from nextgenstats.nfl.com by nflverse. "
                "Published from 2016, and only for players NGS qualifies — and only for "
                "the WEEKS it qualifies them, which is the sharper limit: the weekly feed "
                "requires roughly 15 attempts, 5 targets or 10 carries, so in 2024 a "
                "receiver's published weeks covered a median 79% of his targets and a "
                "back's 86% of his carries (quarterbacks: 100%). A season aggregate built "
                "from these rows describes a player's busier games."
            ),
        )
        for column in NEXTGEN_COLUMNS
    },

    # No free source has ever published per-player alignment.
    "slot_snaps": Availability(first=9999, note="No free source publishes it."),
}

# player_target_depth needs an air-yard value *and* a receiver on every pass, including
# incompletions — the same pair of conditions the receiving columns wait for.
FIRST_TARGET_DEPTH_SEASON = FIRST_RECEIVING_ADVANCED_SEASON


def available(column: str, season: int) -> bool:
    """True if ``column`` carries real data in ``season``."""
    window = COLUMN_AVAILABILITY.get(column)
    return True if window is None else window.covers(season)


def mask_unavailable(row: dict, season: int) -> dict:
    """NULL every column in ``row`` that does not exist in ``season``.

    Mutates and returns the row. The feeds report an unavailable stat as ``0`` rather
    than as missing, so this is what stops a zero that means "never recorded" from
    being stored beside zeros that mean "none this week".
    """
    for column in row:
        if not available(column, season):
            row[column] = None
    return row


def unavailable_columns(season: int) -> list[str]:
    """Every restricted column that does not exist in ``season``, for logging."""
    return sorted(
        column for column in COLUMN_AVAILABILITY if not available(column, season)
    )
