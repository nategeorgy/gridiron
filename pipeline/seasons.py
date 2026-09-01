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
between March and September the computed default always contains one.

**A feed also has a floor, and they are all different (M8).** Extending the project
scope back to 1999 turned the upper bound into only half the problem: ``load_pbp``
starts in 1999, ``load_depth_charts`` in 2001, ``load_ff_opportunity`` in 2006,
``load_snap_counts`` in 2013 and ``load_participation`` in 2016 — and three of those
*raise* below their floor exactly like an unstarted season does. So a feed is
described here by both ends of its window, and every ingest clamps to it.

``load_participation`` is the odd one: it ends as well as starts. FTN stopped
publishing it, and nflreadpy caps it at the roster year minus one, so it is the only
feed whose newest season is behind the clock.
"""

import logging
from dataclasses import dataclass

import nflreadpy as nfl

logger = logging.getLogger("pipeline.seasons")

# The first season in project scope. The only hardcoded year left in the pipeline:
# it is a scope decision (how far back we backfill), not a fact about today.
#
# 1999 is not arbitrary — it is the first season nflverse publishes play-by-play for,
# so it is the floor of the whole ecosystem rather than a preference.
FIRST_SEASON = 1999


@dataclass(frozen=True)
class Feed:
    """One nflverse data feed and the window of seasons it can serve.

    ``clock`` is which of nflreadpy's two rollovers bounds the feed above — see the
    module docstring. ``first_season`` is where the feed starts; ``lag`` is how many
    seasons *behind* its clock the feed ends, which is zero for everything except
    participation.
    """

    name: str
    clock: str  # "roster" | "stats"
    first_season: int
    lag: int = 0

    def latest(self) -> int:
        """The newest season this feed can serve."""
        return nfl.get_current_season(roster=(self.clock == "roster")) - self.lag

    def window(self) -> tuple[int, int]:
        """(first, last) season this feed can serve, ignoring project scope."""
        return self.first_season, self.latest()


# The two clocks, kept as feeds so existing call sites read unchanged. Everything
# derived from games being played uses STATS; anything that exists before kickoff
# (schedule, rosters, players) uses ROSTER.
STATS = Feed("stats", clock="stats", first_season=1999)
ROSTER = Feed("roster", clock="roster", first_season=1999)

# Feeds with a floor of their own. Each floor is enforced by nflreadpy itself — a
# season below it raises ValueError rather than returning empty — so these are not
# defensive guesses but the library's own contract.
PBP = Feed("pbp", clock="stats", first_season=1999)
EXPECTED = Feed("expected", clock="stats", first_season=2006)  # load_ff_opportunity
# load_snap_counts: nflreadpy documents (and accepts) 2012, but that season's PFR
# file is empty upstream, so the first season with data is 2013.
SNAPS = Feed("snaps", clock="stats", first_season=2013)
DEPTH_CHARTS = Feed("depth_charts", clock="roster", first_season=2001)
# Participation runs a season BEHIND, not dead. FTN publishes it only once a season's
# post-season is complete, so nflreadpy caps it at the ROSTER year minus one. Through
# the summer the roster year is already the upcoming season, which makes the ceiling
# look like a discontinuation if you check it in August — it is not. The clock here has
# to be the roster one to match the library's own bound exactly.
PARTICIPATION = Feed("participation", clock="roster", first_season=2016, lag=1)
# load_nextgen_stats: nflverse scrapes nextgenstats.nfl.com; the site's own archive
# starts in 2016. Stats clock, because a tracking number only exists once the game has
# been played.
NEXTGEN = Feed("nextgen", clock="stats", first_season=2016)


def latest_season(feed: Feed = STATS) -> int:
    """Return the newest season ``feed`` can serve."""
    return feed.latest()


def default_seasons(feed: Feed = STATS) -> list[int]:
    """Return every season in project scope that ``feed`` can serve.

    Clamped at *both* ends: a feed that starts in 2012 gets 2012 onwards even though
    project scope reaches back to 1999.
    """
    first = max(FIRST_SEASON, feed.first_season)
    return list(range(first, feed.latest() + 1))


def in_season() -> bool:
    """True once the current roster year has actually kicked off.

    The two clocks agreeing *is* the definition of in-season: from mid-March the
    roster year is the upcoming season while the stats year is still the last one
    played, and they converge at the first game. The scheduled stats refresh uses
    this to stay idle through the summer instead of re-downloading finished seasons
    every week.
    """
    return ROSTER.latest() == STATS.latest()


def clamp_seasons(seasons: list[int], feed: Feed = STATS) -> list[int]:
    """Drop seasons ``feed`` cannot serve, logging what was skipped and why.

    Both ends matter. Requesting an unstarted season raises inside nflreadpy, and so
    does requesting one before the feed exists — and either way a single bad season
    fails the whole run, because the loaders take the list in one call.
    """
    first, last = feed.window()
    kept = [season for season in seasons if first <= season <= last]

    too_new = [season for season in seasons if season > last]
    too_old = [season for season in seasons if season < first]
    if too_new:
        logger.warning(
            "skipping season(s) %s: the %s feed has nothing for them yet "
            "(latest available: %d)",
            too_new, feed.name, last,
        )
    if too_old:
        logger.info(
            "skipping season(s) %s: the %s feed starts in %d",
            too_old, feed.name, first,
        )
    return kept
