"""Player endpoints: search, profile, per-game game log, and fantasy intelligence."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.cache import VersionedCache, cached_response
from app.career import career_seasons
from app.percentiles import percentile_metric_ids
from app.player_page import (
    by_quarterback,
    carry_histogram,
    game_splits,
    next_game,
    route_tree,
    search_index,
    situation_splits,
    weekly_ranks,
    weekly_stat_ids,
)
from app.seasons import current_season
from app.database import get_db
from app.intelligence import breakdown, build_intelligence, resolve_window
from app.league import parse_league
from app.models import DepthChartEntry, Game, Player, PlayerStats, PlayerTargetDepth, PlayTarget, Team
from app.models.player_target_depth import DEPTH_BUCKETS
from app.schemas.common import PaginatedResponse, paginated
from app.schemas.player import DepthChartSlot, PlayerDetailOut, PlayerOut
from app.schemas.stats import StatLineOut
from app.scoring import (
    EXPECTED_COMPONENTS,
    POINTS_COMPONENTS,
    ScoringConfig,
    compute_expected_points,
    compute_points,
    parse_scoring,
    points_expr,
)

router = APIRouter(prefix="/players", tags=["players"])

# Whole responses for the player page's per-player endpoints (November 2026), keyed on
# the URL plus the data version like every cached_response store. A popular player's
# page is the same few URLs for everyone until the next write.
_PLAYER_RESPONSES: VersionedCache[bytes] = VersionedCache(max_entries=256)
_INDEX_RESPONSES: VersionedCache[bytes] = VersionedCache(max_entries=8)


def _scoring(spec: str):
    try:
        return parse_scoring(spec)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _known(db: Session, player_id: str) -> Player:
    player = db.get(Player, player_id)
    if player is None:
        raise HTTPException(status_code=404, detail="Player not found")
    return player


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
    player_ids: str | None = Query(
        None, description="Comma-separated player ids — resolve a known list in one call"
    ),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> PaginatedResponse[PlayerOut]:
    """List/search players with pagination.

    ``player_ids`` is for a caller that already knows who it wants and needs the
    identity columns — name, position, team, headshot. Without it, resolving a list of
    six players means six requests, and the leaderboard is the wrong endpoint to ask
    (it aggregates stat lines, so a player with no stats in the window vanishes).
    """
    filters = []
    if search:
        filters.append(Player.name.ilike(f"%{search}%"))
    if position:
        filters.append(Player.position == position.upper())
    if team_id is not None:
        filters.append(Player.team_id == team_id)
    if player_ids:
        wanted = [pid.strip() for pid in player_ids.split(",") if pid.strip()]
        # An explicitly empty list means "none", never "no filter" — the trap the M5
        # watchlist filter documents on the leaderboard.
        filters.append(Player.player_id.in_(wanted or [""]))

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


@router.get("/index")
@cached_response(_INDEX_RESPONSES)
def get_search_index(
    request: Request,
    scoring: str = Query("ppr", description="Scoring for this season's PPG, rank and finishes"),
    db: Session = Depends(get_db),
) -> dict:
    """Every QB, RB, WR and TE since the first season, for the Player Dashboard's search.

    Sent whole and searched in the browser, so typing never waits on a request. Rows are
    arrays in ``fields`` order to keep ~2,600 players small.
    """
    return search_index(db, current_season(db), _scoring(scoring))


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


@router.get("/{player_id}/career")
def get_player_career(
    player_id: str,
    season_type: str = Query("REG", pattern="^(REG|POST)$"),
    scoring: str = Query(
        "ppr",
        description="League scoring as preset[:overrides] — the finishes are re-ranked "
                    "in it, so a superflex or TE-premium league sees its own career",
    ),
    percentiles: str = Query("", description="Metric ids to rank each season among the position's qualified players"),
    lines: str = Query("", description="Metric ids to add the position's pooled rate and Nth-best season for"),
    line_rank: int | None = Query(None, ge=1, le=64, description="The N in Nth-best season, e.g. 24 for WR24"),
    db: Session = Depends(get_db),
) -> dict:
    """Season-by-season career with each season's finish among the player's position.

    Total-points finish ranks everyone who played; the per-game finish ranks only
    players who cleared the qualification bar, so a two-game cameo cannot post the
    league's best PPG season (see ``app/career.py``).
    """
    player = db.get(Player, player_id)
    if player is None:
        raise HTTPException(status_code=404, detail="Player not found")
    try:
        config = parse_scoring(scoring)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    seasons = career_seasons(
        db, player_id, player.position, config, season_type,
        percentile_ids=percentile_metric_ids(percentiles) if percentiles else (),
        line_ids=tuple(m for m in lines.split(",") if m) if lines else (),
        line_rank=line_rank,
    )
    return {
        "player_id": player_id,
        "name": player.name,
        "position": player.position,
        "season_type": season_type,
        "scoring": config.model_dump(),
        "data": seasons,
        "total": len(seasons),
    }


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


def _weekly_finishes(
    db: Session,
    player_id: str,
    position: str,
    config: ScoringConfig,
    seasons: set[int],
) -> dict[str, tuple[int, int]]:
    """Each of this player's games, ranked among his position that week (M13).

    Returns ``{game_id: (rank, pool_size)}``. One window-function query over every week
    of every season the player appears in, rather than a query per week — a 23-season
    quarterback would otherwise be ~400 round trips.

    **The pool is everyone at the position with a stat line that week**, deliberately
    unqualified: a week is one game, so there is no sample to qualify on, and "WR40 that
    week" is how a weekly finish is quoted. ``RANK()`` is competition ranking, so ties
    share a place and the next one skips — the same rule as every other rank here.

    Scored with ``points_expr``, the SQL twin of the engine that fills
    ``fantasy_points`` on each line, so the finish and the points beside it cannot be
    computed two different ways (TE premium included, which is why ``Player`` is
    joined).
    """
    if not seasons:
        return {}
    points = points_expr(config, sum_mode=False)
    week = (PlayerStats.season, PlayerStats.week, PlayerStats.season_type)
    ranked = (
        select(
            PlayerStats.player_id.label("player_id"),
            PlayerStats.game_id.label("game_id"),
            func.rank().over(partition_by=week, order_by=points.desc()).label("position_rank"),
            func.count().over(partition_by=week).label("pool_size"),
        )
        .join(Player, PlayerStats.player_id == Player.player_id)
        .where(Player.position == position, PlayerStats.season.in_(seasons))
        .subquery()
    )
    rows = db.execute(
        select(ranked.c.game_id, ranked.c.position_rank, ranked.c.pool_size)
        .where(ranked.c.player_id == player_id)
    ).all()
    return {row.game_id: (row.position_rank, row.pool_size) for row in rows}


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

    finishes = _weekly_finishes(
        db, player_id, player.position, config, {stat_line.season for stat_line, *_ in rows}
    )
    pass_depth: dict[str, float] = {}
    if player.position == "QB" and rows:
        pass_depth = {
            game_id: float(total) / count
            for game_id, total, count in db.execute(
                select(PlayTarget.game_id, func.sum(PlayTarget.air_yards), func.count(PlayTarget.air_yards))
                .where(PlayTarget.season.in_({stat_line.season for stat_line, *_ in rows}),
                       PlayTarget.passer_id == player_id)
                .group_by(PlayTarget.game_id)
            ).all()
            if count
        }

    items: list[StatLineOut] = []
    for stat_line, game_date, home_team_id, away_team_id in rows:
        opponent_id = (
            away_team_id if stat_line.team_id == home_team_id else home_team_id
        )
        line = StatLineOut.model_validate(stat_line)
        line.game_date = game_date
        line.opponent_abbreviation = team_abbr.get(opponent_id)
        line.team_abbreviation = team_abbr.get(stat_line.team_id)
        # Fantasy + expected points in the requested scoring, from the same engine
        # the leaderboard uses (M1 spine A).
        components = {name: getattr(stat_line, name) for name in POINTS_COMPONENTS}
        line.fantasy_points = round(compute_points(config, components, player.position), 3)
        expected_components = {name: getattr(stat_line, name) for name in EXPECTED_COMPONENTS}
        expected = compute_expected_points(config, expected_components, player.position)
        line.expected_fantasy_points = round(expected, 3) if expected is not None else None
        line.position_rank, line.pool_size = finishes.get(stat_line.game_id, (None, None))
        line.pass_adot = round(pass_depth[stat_line.game_id], 2) if stat_line.game_id in pass_depth else None
        items.append(line)

    return paginated(items, len(items), limit=len(items) or 1, offset=0)


# --- The tabbed player page (November 2026) ------------------------------------------------

@router.get("/{player_id}/weekly-ranks")
@cached_response(_PLAYER_RESPONSES)
def get_weekly_ranks(
    request: Request,
    player_id: str,
    season: int | None = Query(None),
    season_type: str = Query("REG", pattern="^(REG|POST)$"),
    stats: str = Query("fantasy_points", description="Stored columns, a few per-game rates, or fantasy_points"),
    scoring: str = Query("ppr"),
    db: Session = Depends(get_db),
) -> dict:
    """Each of his games, every stat ranked among everyone at his position that week."""
    player = _known(db, player_id)
    wanted = weekly_stat_ids(stats)
    if not wanted:
        raise HTTPException(status_code=400, detail="No rankable stat in stats=")
    return weekly_ranks(db, player_id, player.position, season or current_season(db), season_type,
                        wanted, _scoring(scoring))


@router.get("/{player_id}/by-quarterback")
@cached_response(_PLAYER_RESPONSES)
def get_by_quarterback(
    request: Request, player_id: str, scoring: str = Query("ppr"), db: Session = Depends(get_db),
) -> dict:
    """His numbers in the games each quarterback started, season by season."""
    player = _known(db, player_id)
    return by_quarterback(db, player_id, player.position, _scoring(scoring))


@router.get("/{player_id}/splits")
@cached_response(_PLAYER_RESPONSES)
def get_splits(
    request: Request,
    player_id: str,
    season: int | None = Query(None),
    scoring: str = Query("ppr"),
    db: Session = Depends(get_db),
) -> dict:
    """Game splits (home, favoured, indoors...) and situation splits (down, score, play type)."""
    player = _known(db, player_id)
    season = season or current_season(db)
    config = _scoring(scoring)
    return {
        "season": season,
        "games": game_splits(db, player_id, player.position, season, config),
        "situations": situation_splits(db, player_id, player.position, season, config),
    }


@router.get("/{player_id}/next-game")
@cached_response(_PLAYER_RESPONSES)
def get_next_game(
    request: Request, player_id: str, scoring: str = Query("ppr"), db: Session = Depends(get_db),
) -> dict:
    """His team's next game and what that defense has allowed to his position, game by game."""
    return next_game(db, _known(db, player_id), _scoring(scoring))


@router.get("/{player_id}/carries")
@cached_response(_PLAYER_RESPONSES)
def get_carries(
    request: Request, player_id: str, season: int | None = Query(None), db: Session = Depends(get_db),
) -> dict:
    """Every designed run by yards gained, his and every back's (2025 on)."""
    _known(db, player_id)
    return carry_histogram(db, player_id, season or current_season(db))


@router.get("/{player_id}/routes")
@cached_response(_PLAYER_RESPONSES)
def get_routes(
    request: Request,
    player_id: str,
    season: int | None = Query(None, description="Omit for the newest season with charted routes"),
    role: str = Query("receiver", pattern="^(receiver|passer)$"),
    db: Session = Depends(get_db),
) -> dict:
    """Targets by the route run, from the participation feed (2016 on, a season behind)."""
    _known(db, player_id)
    return route_tree(db, player_id, role, season)
