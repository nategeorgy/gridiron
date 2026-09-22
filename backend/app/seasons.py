"""Which seasons the database holds, and which one is "current" (M6.0).

The distinction this module exists to draw: a season appears on the **schedule**
months before anyone plays a game in it. The 2026 fixtures were in `games` in August
2026 with no player line recorded against any of them. So the newest season and the
newest *usable* season are different things for most of the year, and defaulting a
board to the former would open the app on an empty table.

**Current means the newest season with stats.** Every default season in the product
resolves through here rather than through a constant, so the rollover is a consequence
of the pipeline running rather than of anyone editing a literal.
"""

from pydantic import BaseModel
from sqlalchemy import and_, func, or_, select, text
from sqlalchemy.orm import Session

from app.cache import VersionedCache
from app.models import Game, PlayerStats

# One entry: the summary takes no arguments. Nearly every page asks for it (the frontend
# fetches /seasons on load, and a dozen endpoints resolve their default season through
# it), and its DISTINCT over player_stats reads ~11 MB of index per call.
_SUMMARY: VersionedCache[list] = VersionedCache(max_entries=1)

# One entry per (season, season_type); a couple of dozen covers every season held.
_WEEK_BOUNDS: VersionedCache[tuple[int, int]] = VersionedCache(max_entries=64)


# ⚠️ A "loose index scan", not the `SELECT DISTINCT season` this used to be, and the
# difference is the whole reason the endpoint was usable.
#
# Postgres does not turn a plain DISTINCT over an indexed column into a skip scan: it
# reads every row and hash-aggregates. That is a **sequential scan of `player_stats`**
# to learn eighteen integers, measured here at 5,963 buffer pages (~47 MB) against 61
# (~0.5 MB) for the form below. Locally the difference is invisible (17 ms vs 0.1 ms,
# because the table is in page cache); on Supabase's smallest instance `player_stats`
# does not fit in memory, so those pages are real disk reads against a throttled IO
# budget, and the endpoint took over two minutes and then 500ed.
#
# The recursive form walks `ix_player_stats_season` instead: find the lowest season,
# then repeatedly ask for the lowest season strictly greater than the last one. That is
# one index probe per season held rather than one heap read per stat line, so its cost
# tracks the number of SEASONS and not the size of the table, which is the property
# that matters, since the table grows every week and the season count grows once a year.
#
# The trailing NULL is expected: the recursion terminates by probing past the last
# season and getting no row, so the caller filters it out.
_DISTINCT_STAT_SEASONS = """
WITH RECURSIVE seasons_held AS (
    SELECT MIN(season) AS season FROM player_stats WHERE season IS NOT NULL
    UNION ALL
    SELECT (SELECT MIN(season) FROM player_stats WHERE season > seasons_held.season)
    FROM seasons_held WHERE seasons_held.season IS NOT NULL
)
SELECT season FROM seasons_held WHERE season IS NOT NULL
"""


class SeasonInfo(BaseModel):
    """One season the database knows about."""

    season: int
    games: int
    completed_games: int
    has_stats: bool


def season_summary(db: Session) -> list[SeasonInfo]:
    """Every season in `games`, newest first, with whether it has been played.

    Cached per data version (``app/cache.py``). The list is copied on the way out; the
    ``SeasonInfo`` entries in it are shared, and every caller only reads them.
    """
    return list(_SUMMARY.get_or_compute(db, None, lambda: _season_summary(db)))


def _season_summary(db: Session) -> list[SeasonInfo]:
    """The uncached half of :func:`season_summary`."""
    # A game counts as completed once it has a score — what separates "the schedule
    # knows about this season" from "this season has happened".
    game_rows = db.execute(
        text(
            "SELECT season, COUNT(*) AS games, COUNT(home_score) AS completed "
            "FROM games WHERE season IS NOT NULL GROUP BY season ORDER BY season DESC"
        )
    ).all()
    stat_seasons = {
        season
        for (season,) in db.execute(text(_DISTINCT_STAT_SEASONS)).all()
        if season is not None
    }
    return [
        SeasonInfo(
            season=season,
            games=games,
            completed_games=completed,
            has_stats=season in stat_seasons,
        )
        for season, games, completed in game_rows
    ]


def week_bounds(db: Session, season: int, season_type: str) -> tuple[int, int] | None:
    """The first and last week of ``season`` that have stat lines, or None if it has none.

    None rather than a default pair, because the callers disagree about what an empty
    season means: a window falls back to (1, 1) and scores nobody, while the trending
    board returns an empty result that says why. Deciding here would make one of them
    wrong.

    ⚠️ **The cheapest-looking query in the app, and one of the most expensive.** With
    accurate table statistics Postgres answers `MIN(week)/MAX(week)` by walking the
    `week` index from each end and discarding rows from other seasons — and the season
    in progress has only low week numbers, so the MAX scan walks nearly the whole table
    before it finds one. Measured at ~110 MB of random reads for 2026 in week 1, against
    ~6 pages for the same answer from an index led by `season`.

    Three surfaces asked this question separately (the Insight windows, the trending
    card, and the percentile pool's denominator), so it lives here once, cached per data
    version. The cold read is handled too, by the `(season, season_type, week)` index in
    migration 1dbc965aa956 — the cache alone would have left the trap live for the first
    request after every write.
    """

    def query() -> tuple[int, int] | None:
        bounds = db.execute(
            select(func.min(PlayerStats.week), func.max(PlayerStats.week)).where(
                PlayerStats.season == season, PlayerStats.season_type == season_type
            )
        ).one()
        if bounds[0] is None or bounds[1] is None:
            return None
        return bounds[0], bounds[1]

    return _WEEK_BOUNDS.get_or_compute(db, (season, season_type), query)


def newest_played_week(db: Session) -> tuple[int, int] | None:
    """The newest regular-season week in which most of the games are final.

    *Most*, not any. A week reads as "just played" once its Sunday slate is in, with
    Monday night still to come — and not when only its Thursday opener is. The first
    rule took any final, which made a week "last" from Thursday night while its
    earliest unplayed game also made it "next", so the home scoreboard showed the same
    week in both tabs until Monday night's result arrived.
    """
    row = db.execute(
        select(Game.season, Game.week)
        .where(Game.season_type == "REG", Game.week.is_not(None))
        .group_by(Game.season, Game.week)
        .having(func.count(Game.home_score) * 2 > func.count())
        .order_by(Game.season.desc(), Game.week.desc())
        .limit(1)
    ).first()
    return (row.season, row.week) if row else None


def next_unplayed_week(
    db: Session, after: tuple[int, int] | None, season: int | None = None
) -> tuple[int, int] | None:
    """The earliest regular-season week after ``after`` that still has a game to play.

    Strictly after, so "last" and "next" are never the same week — which also means a
    game postponed out of an earlier week cannot pin "next" to the past. ``season``
    narrows the answer to one season, for a surface showing a season of the user's
    choosing (the Vegas board) rather than whatever comes next on the calendar.
    """
    query = select(Game.season, Game.week).where(
        Game.season_type == "REG", Game.home_score.is_(None), Game.week.is_not(None)
    )
    if after is not None:
        after_season, after_week = after
        query = query.where(
            or_(
                Game.season > after_season,
                and_(Game.season == after_season, Game.week > after_week),
            )
        )
    if season is not None:
        query = query.where(Game.season == season)
    row = db.execute(query.order_by(Game.season, Game.week).limit(1)).first()
    return (row.season, row.week) if row else None


def current_season(db: Session, summary: list[SeasonInfo] | None = None) -> int | None:
    """The newest season with stats, or the newest scheduled one if none has any.

    The fallback matters on a freshly seeded database — schedule ingested, stats not
    yet. Answering None there would leave every board with no season to request at
    all, which is a worse failure than naming a season that happens to be empty.
    """
    summary = season_summary(db) if summary is None else summary
    with_stats = [entry.season for entry in summary if entry.has_stats]
    if with_stats:
        return max(with_stats)
    return summary[0].season if summary else None


def latest_scheduled_season(db: Session, summary: list[SeasonInfo] | None = None) -> int | None:
    """The newest season the schedule knows about, played or not.

    The counterpart to :func:`current_season`: a team's fixture list, its betting lines
    and its depth chart are all about the season *coming*, while its production is about
    the season *last played*. Surfaces that mix the two need both answers.
    """
    summary = season_summary(db) if summary is None else summary
    return summary[0].season if summary else None
