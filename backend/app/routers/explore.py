"""Explore endpoints: passing networks, target maps, run lanes and the Query Builder.

The Scatter and Player Comparison pages read ``/stats/intelligence`` and the player game
log like the rest of the site; everything here is the play-level data only the Explore
tab (and the target maps on player and team pages) asks for. See ``app/explore.py`` and
``app/query_builder.py``.

Every GET whose answer is a function of its URL and the data is served through
``cached_response``: a passing network is the same for everyone who asks for it, so the
second visitor costs nothing. The Query Builder is not, because its engine already
answers from memory and a search changes on every drag of a range.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cache import VersionedCache, cached_response
from app.database import get_db
from app.explore import (
    SITUATIONS,
    Window,
    league_average,
    league_run_average,
    passer_list,
    passing_network,
    run_lanes,
    target_board,
    target_detail,
)
from app.models import Player, Team
from app.query_builder import (
    GRAINS,
    MAX_LIMIT,
    MODES,
    POSITIONS as QUERY_POSITIONS,
    ROOKIE_FILTERS,
    SEASON_TYPES,
    Search,
    field_catalog,
    parse_columns,
    parse_conditions,
    run_search,
)
from app.scoring import parse_scoring
from app.seasons import current_season

router = APIRouter(prefix="/explore", tags=["explore"])

# Receivers only: a quarterback is never the one targeted.
TARGET_POSITIONS = ("WR", "TE", "RB")

# Sized from measured bodies (2025, full season): a passing network is ~15 kB, a
# player's targets ~30 kB, a team's ~90 kB, and the widest target board (every WR, TE
# and back with a target) ~450 kB.
_NETWORK_RESPONSES: VersionedCache[bytes] = VersionedCache(max_entries=48)
_BOARD_RESPONSES: VersionedCache[bytes] = VersionedCache(max_entries=16)
_TARGET_RESPONSES: VersionedCache[bytes] = VersionedCache(max_entries=64)

SEASON_TYPE = Query("REG", pattern="^(REG|POST)$")
SITUATION = Query("all", pattern=f"^({'|'.join(SITUATIONS)})$",
                  description="all, red_zone (inside the 20) or late_downs (third and fourth down)")
WEEKS = Query("", description="Comma-separated weeks, e.g. '3,4,5'. Empty for the whole season.")


def _weeks(raw: str) -> tuple[int, ...] | None:
    """A week selection, 400-ing on anything that is not a week."""
    weeks: set[int] = set()
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        if not part.isdigit() or not 1 <= int(part) <= 22:
            raise HTTPException(status_code=400, detail=f"'{part}' is not a week between 1 and 22.")
        weeks.add(int(part))
    return tuple(sorted(weeks)) or None


def _window(db: Session, season: int | None, season_type: str, weeks: str, situation: str = "all") -> Window:
    return Window(season=season or current_season(db), season_type=season_type, weeks=_weeks(weeks),
                  situation=situation)


def _team_id(db: Session, abbreviation: str) -> int | None:
    """A team abbreviation as its id; an unknown one is a 400, never an empty answer."""
    if not abbreviation.strip():
        return None
    team_id = db.scalar(select(Team.team_id).where(Team.abbreviation == abbreviation.strip().upper()))
    if team_id is None:
        raise HTTPException(status_code=400, detail=f"Unknown team '{abbreviation}'")
    return team_id


def _player(db: Session, player_id: str) -> Player:
    player = db.get(Player, player_id)
    if player is None:
        raise HTTPException(status_code=404, detail="Player not found")
    return player


def _window_payload(window: Window) -> dict:
    return {"season": window.season, "season_type": window.season_type, "weeks": list(window.weeks or []),
            "situation": window.situation}


# --- passing network ---------------------------------------------------------------------

@router.get("/passers")
@cached_response(_NETWORK_RESPONSES)
def passers(
    request: Request,
    season: int | None = Query(None, description="Season year. Defaults to the newest season with stats."),
    season_type: str = SEASON_TYPE,
    db: Session = Depends(get_db),
) -> dict:
    """Every passer with enough targets that season to draw a network, by team.

    A quarterback who played for two teams is listed under each.
    """
    season = season or current_season(db)
    return {"season": season, "season_type": season_type, "data": passer_list(db, season, season_type)}


@router.get("/network")
@cached_response(_NETWORK_RESPONSES)
def network(
    request: Request,
    passer_id: str = Query(..., description="The quarterback's player id"),
    season: int | None = Query(None),
    season_type: str = SEASON_TYPE,
    weeks: str = WEEKS,
    situation: str = SITUATION,
    team: str = Query("", description="Only his games for this team (a same-team comparison)"),
    db: Session = Depends(get_db),
) -> dict:
    """One quarterback's targets by receiver: volume, depth, side, result and EPA."""
    _player(db, passer_id)
    return passing_network(db, _window(db, season, season_type, weeks, situation), passer_id, _team_id(db, team))


# --- target analysis ---------------------------------------------------------------------

@router.get("/targets")
@cached_response(_BOARD_RESPONSES)
def targets_board(
    request: Request,
    season: int | None = Query(None),
    season_type: str = SEASON_TYPE,
    weeks: str = WEEKS,
    situation: str = SITUATION,
    positions: str = Query("WR", description="Comma-separated, from WR, TE and RB"),
    team: str = Query("", description="Team abbreviation (his latest team in the window)"),
    min_targets: int = Query(0, ge=0, description="Targets needed to be listed"),
    db: Session = Depends(get_db),
) -> dict:
    """Every receiver's depth, side and air-yard profile, with the position averages.

    The averages are every target thrown to the position in the same window, so they do
    not move with the minimum or the team filter.
    """
    wanted = {part.strip().upper() for part in positions.split(",")}
    position_list = tuple(position for position in TARGET_POSITIONS if position in wanted) or ("WR",)
    window = _window(db, season, season_type, weeks, situation)
    team_id = _team_id(db, team)
    abbreviation = team.strip().upper() if team_id is not None else None
    players = [
        player for player in target_board(db, window, position_list)
        if player["targets"] >= min_targets and (abbreviation is None or player["team"] == abbreviation)
    ]
    players.sort(key=lambda player: -player["targets"])
    return {
        **_window_payload(window), "positions": list(position_list), "team": abbreviation, "min_targets": min_targets,
        "players": players,
        "averages": {position: league_average(db, window, position) for position in position_list},
    }


@router.get("/players/{player_id}/targets")
@cached_response(_TARGET_RESPONSES)
def player_targets(
    request: Request,
    player_id: str,
    season: int | None = Query(None),
    season_type: str = SEASON_TYPE,
    weeks: str = WEEKS,
    situation: str = SITUATION,
    role: str = Query("receiver", pattern="^(receiver|passer)$",
                      description="receiver: the targets he drew. passer: the targets he threw."),
    db: Session = Depends(get_db),
) -> dict:
    """Every target one player drew (or threw), with his tally and the average to set it against.

    A receiver is compared with every target thrown to his position; a passer with every
    target thrown in the league.
    """
    player = _player(db, player_id)
    window = _window(db, season, season_type, weeks, situation)
    if role == "passer":
        detail = target_detail(db, window, passer_id=player_id)
        average = league_average(db, window, None)
    else:
        detail = target_detail(db, window, receiver_id=player_id)
        average = league_average(db, window, player.position)
    return {
        **_window_payload(window), "role": role,
        "player": {"player_id": player.player_id, "name": player.name, "position": player.position,
                   "headshot_url": player.headshot_url},
        **detail, "average": average,
    }


@router.get("/teams/{team_id}/targets")
@cached_response(_TARGET_RESPONSES)
def team_targets(
    request: Request,
    team_id: int,
    season: int | None = Query(None),
    season_type: str = SEASON_TYPE,
    weeks: str = WEEKS,
    situation: str = SITUATION,
    db: Session = Depends(get_db),
) -> dict:
    """Every target a team threw, with its tally and the league average."""
    team = db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")
    window = _window(db, season, season_type, weeks, situation)
    return {
        **_window_payload(window),
        "team": {"team_id": team.team_id, "abbreviation": team.abbreviation, "name": team.name},
        **target_detail(db, window, team_id=team_id), "average": league_average(db, window, None),
    }


# --- run lanes -----------------------------------------------------------------------------

@router.get("/players/{player_id}/runs")
@cached_response(_TARGET_RESPONSES)
def player_runs(
    request: Request,
    player_id: str,
    season: int | None = Query(None),
    season_type: str = SEASON_TYPE,
    weeks: str = WEEKS,
    db: Session = Depends(get_db),
) -> dict:
    """One player's designed runs by lane and how each carry ended, beside every back's."""
    _player(db, player_id)
    season = season or current_season(db)
    week_list = _weeks(weeks)
    return {**run_lanes(db, player_id, season, season_type, week_list),
            "average": league_run_average(db, season, season_type, week_list)}


# --- query builder -------------------------------------------------------------------------

@router.get("/query/fields")
def query_fields() -> dict:
    """Every stat the Query Builder can search, grouped, with how it formats."""
    return {"fields": field_catalog()}


@router.get("/query")
def query(
    grain: str = Query("games", pattern=f"^({'|'.join(GRAINS)})$", description="games or seasons"),
    mode: str = Query("list", pattern=f"^({'|'.join(MODES)})$",
                      description="list, or count (matching games per player; games only)"),
    positions: str = Query("", description="Comma-separated from QB, RB, WR, TE. Empty for all four."),
    first_season: int | None = Query(None, description="First season searched. Defaults to the first held."),
    last_season: int | None = Query(None, description="Last season searched. Defaults to the newest."),
    season_type: str = Query("REG", pattern=f"^({'|'.join(SEASON_TYPES)})$", description="REG, POST or ALL"),
    last_week: int | None = Query(None, ge=1, le=22, description="Only weeks up to and including this one in "
                                  "each season, so a seasons search compares the first N weeks of every year"),
    team: str = Query("", description="Team abbreviation: only games played for that team"),
    rookies: str = Query("any", pattern=f"^({'|'.join(ROOKIE_FILTERS)})$", description="any, only or exclude"),
    where: str = Query("", description="Stat ranges as field:min:max, comma-separated; either bound may be "
                                       "empty. Shares are fractions (0.25, not 25)."),
    columns: str | None = Query(None, description="The columns shown after the filtered stats, comma-separated "
                                "field ids. Absent for the grain's defaults, empty for none; a field the grain "
                                "cannot show is skipped. Ignored by mode=count."),
    sort: str = Query("", description="A column the result shows. Defaults to the first filtered stat."),
    order: str = Query("", pattern="^(asc|desc|)$", description="Defaults to the column's better direction"),
    scoring: str = Query("ppr", description="League scoring as preset[:overrides]"),
    limit: int = Query(100, ge=1, le=MAX_LIMIT),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> dict:
    """Search every game or season since 2009 by any stat."""
    try:
        config = parse_scoring(scoring)
        conditions = parse_conditions(where)
        chosen = parse_columns(columns, grain)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    wanted = {part.strip().upper() for part in positions.split(",") if part.strip()}
    position_list = tuple(position for position in QUERY_POSITIONS if position in wanted) or QUERY_POSITIONS
    if first_season is not None and last_season is not None and first_season > last_season:
        first_season, last_season = last_season, first_season
    search = Search(
        grain=grain, mode=mode if grain == "games" else "list", positions=position_list,
        first_season=first_season, last_season=last_season, season_type=season_type, last_week=last_week,
        team_id=_team_id(db, team), rookies=rookies, conditions=conditions, columns=chosen,
        sort=sort or None, order=order or None,
    )
    try:
        result = run_search(db, search, config, limit=limit, offset=offset)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {**result, "positions": list(position_list), "first_season": first_season, "last_season": last_season,
            "last_week": last_week,
            "team": team.strip().upper() or None, "rookies": rookies, "scoring": config.model_dump()}
