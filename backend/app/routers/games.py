"""Games: the schedule and its results (M10).

The endpoint CLAUDE.md has listed as a target since the first milestone and nothing
implemented. Every schedule-shaped surface goes through here — the Schedule tab, the
home scoreboard, and anything later that needs "who plays whom".

**Schedule-shaped, so it follows the schedule's season clock.** The newest season with
*stats* is what a leaderboard defaults to; the newest season on the *schedule* is what a
fixture list defaults to, and from March to September those are different years
(``app/seasons.py``). Defaulting this router to the stats season would open the Schedule
tab on a season that finished eight months ago.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, aliased

from app.database import get_db
from app.models import Game, Team
from app.schemas.common import PaginatedResponse, paginated
from app.schemas.game import GameOut, ScoreboardOut, ScoreboardWindow
from app.seasons import latest_scheduled_season
from app.vegas import implied_totals

router = APIRouter(prefix="/games", tags=["games"])


def _game_rows(db: Session, *filters, order_desc: bool = False):
    """Every game matching the filters, joined to both teams' names."""
    home = aliased(Team)
    away = aliased(Team)
    order = [Game.week.desc(), Game.game_date.desc()] if order_desc else [Game.week, Game.game_date]
    return db.execute(
        select(
            Game.game_id, Game.season, Game.week, Game.season_type,
            Game.game_date, Game.kickoff_time,
            Game.home_team_id, Game.away_team_id, Game.home_score, Game.away_score,
            Game.spread_line, Game.total_line, Game.roof, Game.surface, Game.div_game,
            home.abbreviation.label("home_abbreviation"), home.name.label("home_name"),
            away.abbreviation.label("away_abbreviation"), away.name.label("away_name"),
        )
        .join(home, home.team_id == Game.home_team_id, isouter=True)
        .join(away, away.team_id == Game.away_team_id, isouter=True)
        .where(*filters)
        # Kickoff last so a Sunday slate reads 1:00, 4:05, 4:25, 8:20 rather than
        # alphabetically by whichever team happens to be home.
        .order_by(*order, Game.kickoff_time, Game.game_id)
    ).mappings().all()


def _to_game(row: dict) -> GameOut:
    """Shape one row, deriving the result and the market's split of it."""
    home_score, away_score = row["home_score"], row["away_score"]
    played = home_score is not None and away_score is not None
    winner = None
    if played:
        winner = "home" if home_score > away_score else "away" if away_score > home_score else "tie"

    spread, total = row["spread_line"], row["total_line"]
    favorite = favorite_spread = None
    if spread is not None:
        # Positive spread means the HOME team is favoured (the schedule is stored
        # home-team-first). A pick'em has no favourite rather than an arbitrary one.
        if spread > 0:
            favorite, favorite_spread = row["home_abbreviation"], -spread
        elif spread < 0:
            favorite, favorite_spread = row["away_abbreviation"], spread
    home_implied, away_implied = implied_totals(spread, total)

    return GameOut(
        **{key: row[key] for key in (
            "game_id", "season", "week", "season_type", "game_date", "kickoff_time",
            "home_team_id", "away_team_id", "home_score", "away_score",
            "home_abbreviation", "home_name", "away_abbreviation", "away_name",
            "spread_line", "total_line", "roof", "surface", "div_game",
        )},
        played=played, winner=winner,
        favorite=favorite, favorite_spread=favorite_spread,
        home_implied=home_implied, away_implied=away_implied,
    )


@router.get("", response_model=PaginatedResponse[GameOut])
def list_games(
    season: int | None = Query(None, description="Defaults to the newest scheduled season"),
    week: int | None = Query(None, ge=1, le=22),
    season_type: str = Query("REG", pattern="^(REG|POST)$"),
    team_id: int | None = Query(None, description="Games this team played, home or away"),
    limit: int = Query(50, ge=1, le=400),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> PaginatedResponse[GameOut]:
    """The schedule, filterable by season, week and team.

    One team's season is 17 rows, so a whole season (272) fits inside the cap when a
    caller wants the grid rather than a page.
    """
    target = season if season is not None else latest_scheduled_season(db)
    if target is None:
        raise HTTPException(status_code=404, detail="No seasons are loaded")

    filters = [Game.season == target, Game.season_type == season_type]
    if week is not None:
        filters.append(Game.week == week)
    if team_id is not None:
        filters.append((Game.home_team_id == team_id) | (Game.away_team_id == team_id))

    total = db.scalar(select(func.count()).select_from(Game).where(*filters)) or 0
    rows = _game_rows(db, *filters)[offset : offset + limit]
    return paginated([_to_game(dict(row)) for row in rows], total, limit, offset)


@router.get("/weeks")
def game_weeks(
    season: int | None = Query(None, description="Defaults to the newest scheduled season"),
    season_type: str = Query("REG", pattern="^(REG|POST)$"),
    db: Session = Depends(get_db),
) -> dict:
    """Every week of a season with how much of it has been played and priced.

    The week picker needs to say what is behind a week *before* someone clicks it — an
    unplayed week and an unpriced one are different kinds of empty (M6.4).
    """
    target = season if season is not None else latest_scheduled_season(db)
    if target is None:
        raise HTTPException(status_code=404, detail="No seasons are loaded")
    rows = db.execute(
        select(
            Game.week,
            func.count().label("games"),
            func.count(Game.home_score).label("played"),
            func.count(Game.spread_line).label("priced"),
        )
        .where(Game.season == target, Game.season_type == season_type, Game.week.is_not(None))
        .group_by(Game.week)
        .order_by(Game.week)
    ).mappings().all()
    return {"season": target, "season_type": season_type, "weeks": [dict(row) for row in rows]}


def _newest_played_week(db: Session) -> tuple[int, int] | None:
    """The most recent regular-season week with a final score in it."""
    row = db.execute(
        select(Game.season, Game.week)
        .where(Game.season_type == "REG", Game.home_score.is_not(None), Game.week.is_not(None))
        .order_by(Game.season.desc(), Game.week.desc())
        .limit(1)
    ).first()
    return (row.season, row.week) if row else None


def _next_unplayed_week(db: Session) -> tuple[int, int] | None:
    """The earliest regular-season week that has not been played."""
    row = db.execute(
        select(Game.season, Game.week)
        .where(Game.season_type == "REG", Game.home_score.is_(None), Game.week.is_not(None))
        .order_by(Game.season, Game.week)
        .limit(1)
    ).first()
    return (row.season, row.week) if row else None


@router.get("/scoreboard", response_model=ScoreboardOut)
def scoreboard(db: Session = Depends(get_db)) -> ScoreboardOut:
    """The week just played and the week coming up.

    The rule lives here rather than in the client because it depends on the season
    clock, and a client reimplementing it would drift. In season the two windows are
    consecutive weeks; from January to September they straddle two seasons — Week 18 of
    the season that finished beside Week 1 of the one that has not started — which is
    why each window names its own season.

    **Regular season only.** Fantasy ends at Week 17 or 18, so the playoffs are not
    "last week" to anyone this page is for; they would also sit between the two windows
    and make "last / next" read as a gap.
    """
    def window(pair: tuple[int, int] | None) -> ScoreboardWindow | None:
        if pair is None:
            return None
        season, week = pair
        rows = _game_rows(
            db, Game.season == season, Game.season_type == "REG", Game.week == week
        )
        return ScoreboardWindow(
            season=season, week=week, label=f"Week {week}",
            games=[_to_game(dict(row)) for row in rows],
        )

    return ScoreboardOut(last=window(_newest_played_week(db)), next=window(_next_unplayed_week(db)))
