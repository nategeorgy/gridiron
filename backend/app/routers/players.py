"""Player endpoints: search, profile, and per-game game log."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Game, Player, PlayerStats, Team
from app.schemas.common import PaginatedResponse, paginated
from app.schemas.player import PlayerOut
from app.schemas.stats import StatLineOut

router = APIRouter(prefix="/players", tags=["players"])


def _to_player_out(player: Player, team_abbreviation: str | None) -> PlayerOut:
    """Build a PlayerOut, injecting the joined team abbreviation."""
    out = PlayerOut.model_validate(player)
    out.team_abbreviation = team_abbreviation
    return out


@router.get("", response_model=PaginatedResponse[PlayerOut])
def list_players(
    search: str | None = Query(None, description="Case-insensitive name search"),
    position: str | None = Query(None, description="QB, RB, WR, or TE"),
    team_id: int | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> PaginatedResponse[PlayerOut]:
    """List/search players with pagination."""
    filters = []
    if search:
        filters.append(Player.name.ilike(f"%{search}%"))
    if position:
        filters.append(Player.position == position.upper())
    if team_id is not None:
        filters.append(Player.team_id == team_id)

    total = db.scalar(select(func.count()).select_from(Player).where(*filters))

    rows = db.execute(
        select(Player, Team.abbreviation)
        .outerjoin(Team, Player.team_id == Team.team_id)
        .where(*filters)
        .order_by(Player.name)
        .limit(limit)
        .offset(offset)
    ).all()

    items = [_to_player_out(player, abbr) for player, abbr in rows]
    return paginated(items, total or 0, limit, offset)


@router.get("/{player_id}", response_model=PlayerOut)
def get_player(player_id: str, db: Session = Depends(get_db)) -> PlayerOut:
    """Return a single player's profile."""
    row = db.execute(
        select(Player, Team.abbreviation)
        .outerjoin(Team, Player.team_id == Team.team_id)
        .where(Player.player_id == player_id)
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Player not found")
    player, abbr = row
    return _to_player_out(player, abbr)


@router.get("/{player_id}/stats", response_model=PaginatedResponse[StatLineOut])
def get_player_game_log(
    player_id: str,
    season: int | None = Query(None),
    season_type: str | None = Query(None, pattern="^(REG|POST)$"),
    db: Session = Depends(get_db),
) -> PaginatedResponse[StatLineOut]:
    """Return a player's per-game stat lines (game log), newest season first."""
    if db.get(Player, player_id) is None:
        raise HTTPException(status_code=404, detail="Player not found")

    team_abbr = dict(db.execute(select(Team.team_id, Team.abbreviation)).all())

    filters = [PlayerStats.player_id == player_id]
    if season is not None:
        filters.append(PlayerStats.season == season)
    if season_type is not None:
        filters.append(PlayerStats.season_type == season_type)

    rows = db.execute(
        select(PlayerStats, Game.game_date, Game.home_team_id, Game.away_team_id)
        .join(Game, PlayerStats.game_id == Game.game_id)
        .where(*filters)
        .order_by(PlayerStats.season.desc(), PlayerStats.week)
    ).all()

    items: list[StatLineOut] = []
    for stat_line, game_date, home_team_id, away_team_id in rows:
        opponent_id = (
            away_team_id if stat_line.team_id == home_team_id else home_team_id
        )
        line = StatLineOut.model_validate(stat_line)
        line.game_date = game_date
        line.opponent_abbreviation = team_abbr.get(opponent_id)
        items.append(line)

    return paginated(items, len(items), limit=len(items) or 1, offset=0)
