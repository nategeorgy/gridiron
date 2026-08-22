"""Player endpoints: search, profile, per-game game log, and fantasy intelligence."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.intelligence import breakdown, build_intelligence, resolve_window
from app.league import parse_league
from app.models import DepthChartEntry, Game, Player, PlayerStats, PlayerTargetDepth, Team
from app.models.player_target_depth import DEPTH_BUCKETS
from app.schemas.common import PaginatedResponse, paginated
from app.schemas.player import DepthChartSlot, PlayerDetailOut, PlayerOut
from app.schemas.stats import StatLineOut
from app.scoring import (
    EXPECTED_COMPONENTS,
    POINTS_COMPONENTS,
    compute_expected_points,
    compute_points,
    parse_scoring,
)

router = APIRouter(prefix="/players", tags=["players"])


def _to_player_out(
    player: Player,
    team_abbreviation: str | None,
    schema: type[PlayerOut] = PlayerOut,
) -> PlayerOut:
    """Build a player response, injecting the joined team abbreviation.

    ``schema`` picks the shape: the lean ``PlayerOut`` for search results, or
    ``PlayerDetailOut`` for the profile. It has to be validated from the ORM object
    directly — building a ``PlayerOut`` and letting FastAPI widen it to the detail
    model would silently produce a player whose whole biography is null.
    """
    out = schema.model_validate(player)
    out.team_abbreviation = team_abbreviation
    return out


def _depth_chart_slot(db: Session, player_id: str) -> DepthChartSlot | None:
    """This player's current depth-chart position, if one is published (M6.2).

    Newest season first, because the table holds one row per player per season and a
    player page is asking about now. Returns None rather than raising when no chart
    covers them — an undrafted rookie in June is a normal state, not an error.
    """
    row = db.execute(
        select(
            DepthChartEntry.pos_abb,
            DepthChartEntry.pos_rank,
            DepthChartEntry.season,
            DepthChartEntry.snapshot_at,
            Team.abbreviation,
        )
        .outerjoin(Team, DepthChartEntry.team_id == Team.team_id)
        .where(DepthChartEntry.player_id == player_id)
        .order_by(DepthChartEntry.season.desc(), DepthChartEntry.pos_rank)
        .limit(1)
    ).first()
    if row is None:
        return None
    return DepthChartSlot(
        team_abbreviation=row.abbreviation,
        pos_abb=row.pos_abb,
        pos_rank=row.pos_rank,
        season=row.season,
        as_of=row.snapshot_at,
    )


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


@router.get("/{player_id}", response_model=PlayerDetailOut)
def get_player(player_id: str, db: Session = Depends(get_db)) -> PlayerDetailOut:
    """Return a single player's profile."""
    row = db.execute(
        select(Player, Team.abbreviation)
        .outerjoin(Team, Player.team_id == Team.team_id)
        .where(Player.player_id == player_id)
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Player not found")
    player, abbr = row
    out = _to_player_out(player, abbr, PlayerDetailOut)
    out.depth_chart = _depth_chart_slot(db, player_id)
    return out


@router.get("/{player_id}/intelligence")
def get_player_intelligence(
    player_id: str,
    season: int = Query(..., description="Season year, e.g. 2024"),
    last_weeks: int | None = Query(
        None, ge=1, le=22, description="Trailing window: the last N played weeks"
    ),
    season_type: str = Query("REG", pattern="^(REG|POST)$"),
    scoring: str = Query("ppr", description="League scoring as preset[:overrides]"),
    league: str = Query("12", description="League context as teams[:slot=value]"),
    db: Session = Depends(get_db),
) -> dict:
    """This player's M3 scores, with the component breakdown behind each one.

    The scores are only meaningful against a pool, so the pool is built exactly as the
    board builds it and this player is then read out of it. A player below the games
    threshold is still scored against that pool and flagged ``qualified: false``.
    """
    player = db.get(Player, player_id)
    if player is None:
        raise HTTPException(status_code=404, detail="Player not found")
    try:
        config = parse_scoring(scoring)
        league_config = parse_league(league)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    window = resolve_window(db, season, season_type, last_weeks)
    rows, context = build_intelligence(db, window, config, league_config)

    record = next((row for row in rows if row["player_id"] == player_id), None)
    if record is None:
        raise HTTPException(
            status_code=404,
            detail=f"No {season} {season_type} stats for this player in that window",
        )

    position_pool = context["replacement"].get(record.get("position"), {})
    return {
        "player_id": player_id,
        "name": record.get("name"),
        "position": record.get("position"),
        "window": window.as_dict(),
        "scoring": config.model_dump(),
        "league": league_config.model_dump(),
        "qualified": record.get("qualified", False),
        "min_games": context["min_games"],
        "games_played": record.get("games_played"),
        "pool_size": position_pool.get("pool_size"),
        "replacement": position_pool,
        "scores": {
            "vorp": record.get("vorp"),
            "vorp_ppg": record.get("vorp_ppg"),
            "fantasy_opportunity_rating": record.get("fantasy_opportunity_rating"),
            "positive_regression_index": record.get("positive_regression_index"),
            "sell_high_index": record.get("sell_high_index"),
        },
        "supporting": {
            "fantasy_ppg": record.get("fantasy_ppg"),
            "expected_fantasy_ppg": record.get("expected_fantasy_ppg"),
            "fantasy_points_over_expected": record.get("fantasy_points_over_expected"),
            "tds_over_expected": record.get("tds_over_expected"),
            "efficiency_over_baseline": record.get("efficiency_over_baseline"),
            "opportunity_trend": record.get("opportunity_trend"),
            "replacement_ppg": record.get("replacement_ppg"),
        },
        "breakdown": breakdown(
            record, context["inputs"][player_id], context["percentiles"][player_id]
        ),
    }


@router.get("/{player_id}/target-depth")
def get_player_target_depth(
    player_id: str,
    season: int = Query(..., description="Season year, e.g. 2024"),
    season_type: str = Query("REG", pattern="^(REG|POST)$"),
    db: Session = Depends(get_db),
) -> dict:
    """This player's targets and production by pass depth (M4).

    Direction is summed away here — it is stored so the directional grid needs no
    migration later, but the shipped chart is depth-only. Buckets with no targets are
    still returned, so the chart keeps a stable four-bucket shape rather than
    collapsing when a player never ran anything deep.
    """
    if db.get(Player, player_id) is None:
        raise HTTPException(status_code=404, detail="Player not found")

    rows = db.execute(
        select(
            PlayerTargetDepth.depth_bucket,
            func.sum(PlayerTargetDepth.targets).label("targets"),
            func.sum(PlayerTargetDepth.receptions).label("receptions"),
            func.sum(PlayerTargetDepth.receiving_yards).label("receiving_yards"),
            func.sum(PlayerTargetDepth.receiving_tds).label("receiving_tds"),
            func.sum(PlayerTargetDepth.air_yards).label("air_yards"),
        )
        .where(
            PlayerTargetDepth.player_id == player_id,
            PlayerTargetDepth.season == season,
            PlayerTargetDepth.season_type == season_type,
        )
        .group_by(PlayerTargetDepth.depth_bucket)
    ).mappings().all()

    by_bucket = {row["depth_bucket"]: row for row in rows}
    total_targets = sum(int(row["targets"] or 0) for row in rows)

    buckets = []
    for bucket in DEPTH_BUCKETS:
        row = by_bucket.get(bucket)
        targets = int(row["targets"]) if row and row["targets"] is not None else 0
        receptions = int(row["receptions"]) if row and row["receptions"] is not None else 0
        yards = int(row["receiving_yards"]) if row and row["receiving_yards"] is not None else 0
        buckets.append({
            "depth_bucket": bucket,
            "targets": targets,
            "receptions": receptions,
            "receiving_yards": yards,
            "receiving_tds": int(row["receiving_tds"]) if row and row["receiving_tds"] is not None else 0,
            "air_yards": int(row["air_yards"]) if row and row["air_yards"] is not None else 0,
            "target_share": round(targets / total_targets, 4) if total_targets else None,
            "catch_rate": round(receptions / targets, 4) if targets else None,
            "yards_per_target": round(yards / targets, 2) if targets else None,
        })

    return {
        "player_id": player_id,
        "season": season,
        "season_type": season_type,
        "total_targets": total_targets,
        "data": buckets,
    }


@router.get("/{player_id}/stats", response_model=PaginatedResponse[StatLineOut])
def get_player_game_log(
    player_id: str,
    season: int | None = Query(None),
    season_type: str | None = Query(None, pattern="^(REG|POST)$"),
    scoring: str = Query(
        "ppr",
        description="League scoring as preset[:overrides] — sets fantasy_points and "
                    "expected_fantasy_points on each stat line",
    ),
    db: Session = Depends(get_db),
) -> PaginatedResponse[StatLineOut]:
    """Return a player's per-game stat lines (game log), newest season first."""
    player = db.get(Player, player_id)
    if player is None:
        raise HTTPException(status_code=404, detail="Player not found")
    try:
        config = parse_scoring(scoring)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

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
        # Fantasy + expected points in the requested scoring, from the same engine
        # the leaderboard uses (M1 spine A).
        components = {name: getattr(stat_line, name) for name in POINTS_COMPONENTS}
        line.fantasy_points = round(compute_points(config, components, player.position), 3)
        expected_components = {name: getattr(stat_line, name) for name in EXPECTED_COMPONENTS}
        expected = compute_expected_points(config, expected_components, player.position)
        line.expected_fantasy_points = round(expected, 3) if expected is not None else None
        items.append(line)

    return paginated(items, len(items), limit=len(items) or 1, offset=0)
