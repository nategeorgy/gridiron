"""Which seasons the pipeline should ingest, and which the feeds can actually serve.

Every ingest script used to carry ``DEFAULT_SEASONS = list(range(2020, 2026))`` — a
literal that was right the day it was written and silently wrong from the following
September. M6 is the milestone where the app has to know what year it is, so the
range is computed instead.

**Two rollover dates matter, and nflreadpy owns both:**

- **Roster year** (``get_current_season(roster=True)``) rolls over on 15 March. The
  schedule, rosters, players and depth charts for an upcoming season exist months
  before kickoff — the 2026 schedule was published while 2025 was still the most
  recent season anyone had played.
- **Stats year** (``get_current_season()``) rolls over on the Thursday after Labor
  Day, i.e. at the first game. ``load_pbp``, ``load_player_stats``,
  ``load_snap_counts``, ``load_participation`` and ``load_ff_opportunity`` all
  *raise* for a season that has not started.

That second rule is why :func:`clamp_seasons` exists. The loaders take the whole
season list in one call, so a single unavailable season fails the entire run — and
between March and September the computed default always contains one. Rather than
let a scheduled job fail every week from spring to kickoff, the unavailable seasons
are dropped and logged.
"""

import logging

import nflreadpy as nfl

logger = logging.getLogger("pipeline.seasons")

# The first season in project scope. The only hardcoded year left in the pipeline:
# it is a scope decision (how far back we backfill), not a fact about today.
FIRST_SEASON = 2020

ROSTER = "roster"
STATS = "stats"


def latest_season(feed: str = STATS) -> int:
    """Return the newest season ``feed`` can serve.

    ``ROSTER`` covers schedules, rosters, players and depth charts; ``STATS`` covers
    everything derived from games actually being played.
    """
    if feed not in (ROSTER, STATS):
        raise ValueError(f"unknown feed {feed!r} (expected {ROSTER!r} or {STATS!r})")
    return nfl.get_current_season(roster=(feed == ROSTER))


def default_seasons(feed: str = STATS) -> list[int]:
    """Return every season in project scope that ``feed`` can serve."""
    return list(range(FIRST_SEASON, latest_season(feed) + 1))


def in_season() -> bool:
    """True once the current roster year has actually kicked off.

    The two clocks agreeing *is* the definition of in-season: from mid-March the
    roster year is the upcoming season while the stats year is still the last one
    played, and they converge at the first game. The scheduled stats refresh uses
    this to stay idle through the summer instead of re-downloading six finished
    seasons every week.
    """
    return latest_season(ROSTER) == latest_season(STATS)


def clamp_seasons(seasons: list[int], feed: str = STATS) -> list[int]:
    """Drop seasons ``feed`` cannot serve yet, logging what was skipped.

    Requesting an unstarted season raises inside nflreadpy, and one bad season fails
    a whole run — so a scheduled job that always asks for the current season needs
    this between March and kickoff.
    """
    latest = latest_season(feed)
    kept = [season for season in seasons if season <= latest]
    skipped = [season for season in seasons if season > latest]
    if skipped:
        logger.warning(
            "skipping season(s) %s: the %s feed has nothing for them yet "
            "(latest available: %d)",
            skipped, feed, latest,
        )
    return kept
