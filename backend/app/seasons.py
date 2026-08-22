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
from sqlalchemy import text
from sqlalchemy.orm import Session


class SeasonInfo(BaseModel):
    """One season the database knows about."""

    season: int
    games: int
    completed_games: int
    has_stats: bool


def season_summary(db: Session) -> list[SeasonInfo]:
    """Every season in `games`, newest first, with whether it has been played."""
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
        for (season,) in db.execute(
            text("SELECT DISTINCT season FROM player_stats WHERE season IS NOT NULL")
        ).all()
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
