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
from app.seasons import latest_scheduled_season, newest_played_week, next_unplayed_week
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
            home.logo_url.label("home_logo_url"),
            away.abbreviation.label("away_abbreviation"), away.name.label("away_name"),
            away.logo_url.label("away_logo_url"),
        )
        .join(home, home.team_id == Game.home_team_id, isouter=True)
        .join(away, away.team_id == Game.away_team_id, isouter=True)
        .where(*filters)
        # Kickoff last so a Sunday slate reads 1:00, 4:05, 4:25, 8:20 rather than
        # alphabetically by whichever team happens to be home.
        .order_by(*order, Game.kickoff_time, Game.game_id)
    ).mappings().all()


def _season_records(db: Session, season: int) -> dict[str, str]:
    """Each team's record over the season's completed regular-season games.

    Formatted here rather than in the client because the tie is the awkward part: it is
    dropped when there are none ("2-0") and shown when there are ("1-1-1"), and two
    surfaces deciding that separately is two chances to disagree.
    """
    home = aliased(Team)
    away = aliased(Team)
    rows = db.execute(
        select(
            home.abbreviation.label("home"), away.abbreviation.label("away"),
            Game.home_score, Game.away_score,
        )
        .join(home, Game.home_team_id == home.team_id)
        .join(away, Game.away_team_id == away.team_id)
        .where(
            Game.season == season,
            Game.season_type == "REG",
            Game.home_score.is_not(None),
            Game.away_score.is_not(None),
        )
    ).mappings().all()

    tally: dict[str, list[int]] = {}
    for row in rows:
        for team, scored, allowed in (
            (row["home"], row["home_score"], row["away_score"]),
            (row["away"], row["away_score"], row["home_score"]),
        ):
            entry = tally.setdefault(team, [0, 0, 0])
            entry[0 if scored > allowed else 1 if scored < allowed else 2] += 1

    return {
        team: f"{wins}-{losses}" + (f"-{ties}" if ties else "")
        for team, (wins, losses, ties) in tally.items()
    }


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
            "home_abbreviation", "home_name", "home_logo_url",
            "away_abbreviation", "away_name", "away_logo_url",
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


@router.get("/scoreboard", response_model=ScoreboardOut)
def scoreboard(db: Session = Depends(get_db)) -> ScoreboardOut:
    """The week just played and the week coming up.

    The rule lives here rather than in the client because it depends on the season
    clock, and a client reimplementing it would drift. "Last" is the newest week that is
    mostly final and "next" is the first week after it with a game to play, so from the
    Monday of a week to the Sunday of the next they read Week N and Week N+1. In season
    the two windows are consecutive weeks; from January to September they straddle two
    seasons — Week 18 of the season that finished beside Week 1 of the one that has not
    started — which is why each window names its own season.

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
            # Records belong to the window, not the fixture: the two windows straddle
            # two seasons from January to September, and each one's records are its own.
            records=_season_records(db, season),
        )

    last = newest_played_week(db)
    return ScoreboardOut(last=window(last), next=window(next_unplayed_week(db, after=last)))
