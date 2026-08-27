"""Draft endpoints (M9): ranking boards, and grading a mock draft.

Two routers live here. The public one (`/draft`) serves boards and grades mocks and
needs no account — a mock draft is the feature, not the persistence. The account one
(`/me/ranking-boards`, `/me/mock-drafts`) follows the M5 rules exactly: **no endpoint
accepts a user id**, the id comes from the verified token and nowhere else, and every
lookup filters on `user_id` *and* the primary key so a guessed id 404s like a missing
one.

The one rule specific to this module: **a private ranking source can never be named.**
`app/rankings.py` resolves a source through a fail-closed registry, and a private
source, an unknown source, another user's board and a board that never existed all
produce the same 404. A caller cannot use these endpoints to discover that a private
board exists, which matters because several of the blended inputs are paywalled.

See docs/design/M9-draft.md §5.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_optional_user
from app.database import get_db
from app.intelligence import resolve_window
from app.league import parse_league
from app.mock_draft import grade_picks, grade_rosters
from app.models import (
    MockDraft,
    MockDraftPick,
    Player,
    RankingBoard,
    RankingBoardEntry,
    Team,
    User,
)
from app.ranking_import import ImportError_, match_players, parse_csv
from app.rankings import (
    USER_BOARD_PREFIX,
    build_rankings,
    default_ranking_type,
    latest_context,
    list_boards,
    resolve_board,
)
from app.schemas.draft import (
    MAX_BOARDS,
    BoardEntriesIn,
    BoardEntryOut,
    BoardImportIn,
    BoardImportOut,
    MockDraftCreate,
    MockDraftOut,
    MockGradeIn,
    RankingBoardCreate,
    RankingBoardDetail,
    RankingBoardOut,
    RankingBoardUpdate,
)
from app.scoring import parse_scoring
from app.seasons import current_season

router = APIRouter(prefix="/draft", tags=["draft"])
account_router = APIRouter(prefix="/me", tags=["account"])

MAX_MOCKS = 100

# How a board may be ordered. Deliberately short: a ranking board's own order is the
# thing being shown, and every extra sort is another way to stop looking at it.
BOARD_SORTS = {"board": "rank", "value": "value_rank", "sos": "sos"}


def _configs(scoring: str, league: str):
    """Parse the two per-request configs, turning a bad spec into a 400."""
    try:
        return parse_scoring(scoring), parse_league(league)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# --- Public: boards ----------------------------------------------------------


@router.get("/sources")
def draft_sources(
    league: str = Query("12", description="League context, e.g. '12' or '12:superflex=1'"),
    ranking_type: str | None = Query(
        None, description="Override the variant this league would otherwise get."
    ),
    week: int | None = Query(
        None, ge=0, description="0 for draft boards; a week number for weekly rankings."
    ),
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> dict:
    """Every board this caller may pick, plus which context they are in.

    Private sources are absent by construction — `list_boards` iterates the registry's
    public entries, never the sources actually held.
    """
    _, league_config = _configs("ppr", league)
    season, held_week, _ = latest_context(db, league_config)
    resolved_week = held_week if week is None else week
    resolved_type = ranking_type or default_ranking_type(league_config, resolved_week)

    return {
        "data": list_boards(
            db, resolved_type, season, resolved_week,
            user_id=user.user_id if user else None,
        ),
        "season": season,
        "week": resolved_week,
        "ranking_type": resolved_type,
        # What the page calls itself. The draft board becomes a weekly board the
        # moment weekly rankings are ingested — nothing here is calendar-driven.
        "context": "draft" if resolved_week == 0 else "weekly",
    }


@router.get("/rankings")
def draft_rankings(
    source: str = Query("consensus", description="Board id: 'consensus', 'fantasypros', or 'board:<uuid>'"),
    season: int | None = Query(
        None,
        description="Valuation season — the last season played. Defaults to the "
                    "newest season with stats. Not the season being ranked.",
    ),
    season_type: str = Query("REG", pattern="^(REG|POST)$"),
    week: int | None = Query(None, ge=0, description="0 for draft boards; a week number otherwise."),
    ranking_type: str | None = Query(None, description="Override the league's variant."),
    scoring: str = Query("ppr"),
    league: str = Query("12"),
    position: str | None = Query(None, description="QB, RB, WR, or TE"),
    sort: str = Query("board", pattern="^(board|value|sos)$"),
    order: str = Query("asc", pattern="^(asc|desc)$"),
    min_games: int | None = Query(None, ge=0),
    player_ids: str = Query("", description="Comma-separated ids to narrow to (watchlist)"),
    limit: int = Query(100, ge=1, le=800),
    offset: int = Query(0, ge=0),
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> dict:
    """One board's players, with our valuation of each beside the board's order.

    Two seasons are in play and they are different for most of the calendar: the board
    is for the season about to be played, while the valuation reads the last season
    actually played. `season` names the latter.
    """
    config, league_config = _configs(scoring, league)

    ranking_season, held_week, _ = latest_context(db, league_config)
    resolved_week = held_week if week is None else week
    # In-season a position filter selects that position's weekly board rather than
    # filtering the overall one — see `default_ranking_type`.
    resolved_type = ranking_type or default_ranking_type(
        league_config, resolved_week, position
    )

    board = resolve_board(
        db, source, resolved_type, ranking_season, resolved_week,
        user_id=user.user_id if user else None,
    )
    if board is None:
        # Private, unknown, someone else's, and never-existed are one answer.
        raise HTTPException(status_code=404, detail="No such ranking board.")

    # No completed season is not an error here: the board still renders, with the
    # valuation columns empty. See `build_rankings`.
    valuation_season = season if season is not None else current_season(db)
    window = (
        resolve_window(db, valuation_season, season_type, None)
        if valuation_season is not None
        else None
    )
    rows, context = build_rankings(
        db, board, window, config, league_config,
        min_games=min_games, position=position,
    )

    # Applied after ranks are assigned, so a watchlist view still shows each player's
    # real place on the board rather than renumbering them 1..n.
    wanted = {value for value in player_ids.split(",") if value.strip()}
    if wanted:
        rows = [row for row in rows if row["player_id"] in wanted]

    key = BOARD_SORTS[sort]
    descending = order == "desc"

    def sort_key(row: dict) -> tuple[int, float]:
        """Unranked sorts last in both directions. A player we cannot value is not
        rank zero; floating them to the top would be a claim about them."""
        value = row.get(key)
        if value is None:
            return (1, 0.0)
        return (0, -value if descending else value)

    rows.sort(key=sort_key)
    total = len(rows)

    return {
        "data": rows[offset : offset + limit],
        "total": total,
        "page": (offset // limit) + 1 if limit else 1,
        "limit": limit,
        "offset": offset,
        "sort": sort,
        "order": order,
        "context": "draft" if resolved_week == 0 else "weekly",
        "valuation_season": valuation_season,
        "season_type": season_type,
        "window": window.as_dict() if window else None,
        "scoring": config.model_dump(),
        "league": league_config.model_dump(),
        "board": context["board"],
        "board_label": context["board_label"],
        "board_kind": context["board_kind"],
        "attribution": context["attribution"],
        "ranking_type": context["ranking_type"],
        "ranking_season": context["ranking_season"],
        "week": context["week"],
        "sources_count": context["sources_count"],
        "scraped_at": context["scraped_at"],
        "ranked_players": context["ranked_players"],
        "valued_players": context["valued_players"],
        "min_games": context.get("min_games"),
        "replacement": context.get("replacement"),
    }


# --- Public: grading a mock --------------------------------------------------


@router.post("/mock-grade")
def mock_grade(
    payload: MockGradeIn,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> dict:
    """Value every roster out of a finished mock, in the caller's scoring and league.

    Deliberately takes the rosters rather than a stored draft id: the room runs in the
    browser and a mock never requires an account, so there may be nothing stored to
    refer to.
    """
    config, league_config = _configs(payload.scoring, payload.league)

    valuation_season = payload.season if payload.season is not None else current_season(db)
    if valuation_season is None:
        raise HTTPException(status_code=404, detail="No seasons with stats are loaded")
    window = resolve_window(db, valuation_season, "REG", None)

    rosters = {team.draft_slot: team.player_ids for team in payload.teams}
    teams, context = grade_rosters(db, window, config, league_config, rosters)

    board_ranks: dict[str, int] = {}
    if payload.picks and payload.bot_source:
        ranking_season, week, board_type = latest_context(db, league_config)
        board = resolve_board(
            db, payload.bot_source, board_type, ranking_season, week,
            user_id=user.user_id if user else None,
        )
        if board is not None:
            board_ranks = {entry["player_id"]: entry["rank"] for entry in board.entries}

    picks = grade_picks(
        [pick.model_dump() for pick in payload.picks], board_ranks, teams
    ) if payload.picks else []

    return {
        "teams": teams,
        "picks": picks,
        "valuation_season": valuation_season,
        "scoring": config.model_dump(),
        "league": league_config.model_dump(),
        **context,
    }


# --- Account: ranking boards -------------------------------------------------


def _get_board(db: Session, user_id: UUID, board_id: UUID) -> RankingBoard:
    """One of this user's boards, or 404.

    Filtered on owner *and* key so another user's board is indistinguishable from one
    that does not exist — never a 403, which would confirm it.
    """
    board = db.scalar(
        select(RankingBoard).where(
            RankingBoard.board_id == board_id, RankingBoard.user_id == user_id
        )
    )
    if board is None:
        raise HTTPException(status_code=404, detail="Ranking board not found.")
    return board


def _entry_count(db: Session, board_id: UUID) -> int:
    """How many players are on a board."""
    return db.scalar(
        select(func.count())
        .select_from(RankingBoardEntry)
        .where(RankingBoardEntry.board_id == board_id)
    )


def _hydrated_entries(db: Session, board_id: UUID) -> list[BoardEntryOut]:
    """A board's players in order, with enough identity to render a row."""
    rows = db.execute(
        select(
            RankingBoardEntry.player_id,
            RankingBoardEntry.rank,
            RankingBoardEntry.tier,
            RankingBoardEntry.note,
            Player.name,
            Player.position,
            Player.headshot_url,
            Team.abbreviation.label("team_abbreviation"),
        )
        .join(Player, Player.player_id == RankingBoardEntry.player_id)
        .outerjoin(Team, Team.team_id == Player.team_id)
        .where(RankingBoardEntry.board_id == board_id)
        .order_by(RankingBoardEntry.rank)
    ).mappings().all()
    return [BoardEntryOut(**row) for row in rows]


def _board_detail(db: Session, board: RankingBoard) -> RankingBoardDetail:
    """A board plus its players."""
    entries = _hydrated_entries(db, board.board_id)
    return RankingBoardDetail(
        **RankingBoardOut.model_validate(board).model_dump(exclude={"entry_count"}),
        entry_count=len(entries),
        entries=entries,
    )


def _write_entries(db: Session, board_id: UUID, entries: list) -> None:
    """Replace a board's players wholesale, densifying rank from list order.

    Delete-then-insert rather than an upsert, for the same reason the depth-chart
    ingest replaces a team's rows: this is *current state*. A player dragged off a
    board does not reappear with a worse rank — he stops being on it, and an upsert
    would leave him there forever.
    """
    db.execute(delete(RankingBoardEntry).where(RankingBoardEntry.board_id == board_id))
    seen: set[str] = set()
    rank = 0
    for entry in entries:
        if entry.player_id in seen:
            continue  # a board cannot rank the same player twice
        seen.add(entry.player_id)
        rank += 1
        db.add(
            RankingBoardEntry(
                board_id=board_id,
                player_id=entry.player_id,
                rank=rank,
                tier=entry.tier,
                note=entry.note,
            )
        )


@account_router.get("/ranking-boards", response_model=list[RankingBoardOut])
def list_ranking_boards(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[RankingBoardOut]:
    """This user's boards, most recently edited first."""
    rows = db.execute(
        select(RankingBoard, func.count(RankingBoardEntry.player_id))
        .outerjoin(RankingBoardEntry, RankingBoardEntry.board_id == RankingBoard.board_id)
        .where(RankingBoard.user_id == user.user_id)
        .group_by(RankingBoard.board_id)
        .order_by(RankingBoard.updated_at.desc())
    ).all()
    return [
        RankingBoardOut.model_validate(board).model_copy(update={"entry_count": count})
        for board, count in rows
    ]


@account_router.post(
    "/ranking-boards", response_model=RankingBoardDetail, status_code=status.HTTP_201_CREATED
)
def create_ranking_board(
    payload: RankingBoardCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RankingBoardDetail:
    """Create a board, optionally seeded with its players in the same call."""
    existing = db.scalar(
        select(func.count()).select_from(RankingBoard).where(RankingBoard.user_id == user.user_id)
    )
    if existing >= MAX_BOARDS:
        raise HTTPException(
            status_code=409, detail=f"You already have {MAX_BOARDS} boards."
        )

    board = RankingBoard(
        user_id=user.user_id,
        name=payload.name,
        ranking_type=payload.ranking_type,
        origin="custom",
        seeded_from=payload.seeded_from,
    )
    db.add(board)
    try:
        db.flush()
        _write_entries(db, board.board_id, payload.entries)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="You already have a board with that name."
        ) from exc
    db.refresh(board)
    return _board_detail(db, board)


@account_router.get("/ranking-boards/{board_id}", response_model=RankingBoardDetail)
def get_ranking_board(
    board_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RankingBoardDetail:
    """One board with its players, in order."""
    return _board_detail(db, _get_board(db, user.user_id, board_id))


@account_router.patch("/ranking-boards/{board_id}", response_model=RankingBoardDetail)
def update_ranking_board(
    board_id: UUID,
    payload: RankingBoardUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RankingBoardDetail:
    """Rename or re-type a board. Players are replaced through their own endpoint."""
    board = _get_board(db, user.user_id, board_id)
    if payload.name is not None:
        board.name = payload.name
    if payload.ranking_type is not None:
        board.ranking_type = payload.ranking_type
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="You already have a board with that name."
        ) from exc
    db.refresh(board)
    return _board_detail(db, board)


@account_router.put("/ranking-boards/{board_id}/entries", response_model=RankingBoardDetail)
def replace_ranking_board_entries(
    board_id: UUID,
    payload: BoardEntriesIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RankingBoardDetail:
    """Replace a board's players with this ordering. Position in the list is the rank."""
    board = _get_board(db, user.user_id, board_id)
    _write_entries(db, board.board_id, payload.entries)
    board.origin = "custom"
    db.commit()
    db.refresh(board)
    return _board_detail(db, board)


@account_router.delete("/ranking-boards/{board_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ranking_board(
    board_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Delete a board and its players."""
    board = _get_board(db, user.user_id, board_id)
    db.delete(board)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@account_router.post(
    "/ranking-boards/import", response_model=BoardImportOut, status_code=status.HTTP_201_CREATED
)
def import_ranking_board(
    payload: BoardImportIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BoardImportOut:
    """Turn an uploaded CSV into a board, reporting every row it could not resolve.

    The board is created from what *did* match rather than rejected wholesale — a
    board missing four deep sleepers is still the board the user wanted — but the
    misses come back with their ranks so the holes are visible rather than silent.
    """
    existing = db.scalar(
        select(func.count()).select_from(RankingBoard).where(RankingBoard.user_id == user.user_id)
    )
    if existing >= MAX_BOARDS:
        raise HTTPException(status_code=409, detail=f"You already have {MAX_BOARDS} boards.")

    try:
        parsed = parse_csv(payload.content)
    except ImportError_ as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    result = match_players(db, parsed)
    if not result.entries:
        raise HTTPException(
            status_code=400,
            detail="None of those players could be matched. Check the player and "
                   "position columns against the template.",
        )

    board = RankingBoard(
        user_id=user.user_id,
        name=payload.name,
        ranking_type=payload.ranking_type,
        origin="upload",
        seeded_from=None,
    )
    db.add(board)
    try:
        db.flush()
        for entry in result.entries:
            db.add(RankingBoardEntry(board_id=board.board_id, **entry))
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="You already have a board with that name."
        ) from exc
    db.refresh(board)

    return BoardImportOut(
        board=_board_detail(db, board),
        matched=len(result.entries),
        unmatched=[row.__dict__ for row in result.unmatched],
        out_of_scope=result.out_of_scope,
        total_rows=result.total_rows,
    )


# --- Account: mock draft history ---------------------------------------------


@account_router.get("/mock-drafts", response_model=list[MockDraftOut])
def list_mock_drafts(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[MockDraft]:
    """This user's finished mocks, newest first."""
    return db.execute(
        select(MockDraft)
        .where(MockDraft.user_id == user.user_id)
        .order_by(MockDraft.created_at.desc())
        .limit(MAX_MOCKS)
    ).scalars().all()


@account_router.post(
    "/mock-drafts", response_model=MockDraftOut, status_code=status.HTTP_201_CREATED
)
def create_mock_draft(
    payload: MockDraftCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MockDraft:
    """Save a finished mock to this user's history.

    The grade is stored **as it was given** rather than recomputed on read: replacement
    level moves as the season's data lands, and a history that silently re-grades
    itself is not a history.
    """
    count = db.scalar(
        select(func.count()).select_from(MockDraft).where(MockDraft.user_id == user.user_id)
    )
    if count >= MAX_MOCKS:
        # Drop the oldest rather than refusing: a draft history is a rolling record,
        # and failing to save the mock someone just spent fifteen minutes on to
        # protect a row count would be the wrong trade.
        oldest = db.scalar(
            select(MockDraft)
            .where(MockDraft.user_id == user.user_id)
            .order_by(MockDraft.created_at)
            .limit(1)
        )
        if oldest is not None:
            db.delete(oldest)

    mock = MockDraft(
        user_id=user.user_id,
        scoring_spec=payload.scoring_spec,
        league_spec=payload.league_spec,
        teams=payload.teams,
        rounds=payload.rounds,
        draft_slot=payload.draft_slot,
        bot_source=payload.bot_source,
        bot_randomness=payload.bot_randomness,
        grade_vorp=payload.grade_vorp,
        grade_rank=payload.grade_rank,
    )
    db.add(mock)
    db.flush()
    for pick in payload.picks:
        db.add(MockDraftPick(mock_id=mock.mock_id, **pick.model_dump()))
    db.commit()
    db.refresh(mock)
    return mock


@account_router.get("/mock-drafts/{mock_id}")
def get_mock_draft(
    mock_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """One saved mock, with its picks in order."""
    mock = db.scalar(
        select(MockDraft).where(
            MockDraft.mock_id == mock_id, MockDraft.user_id == user.user_id
        )
    )
    if mock is None:
        raise HTTPException(status_code=404, detail="Mock draft not found.")

    picks = db.execute(
        select(
            MockDraftPick.pick_number,
            MockDraftPick.round,
            MockDraftPick.team_slot,
            MockDraftPick.player_id,
            MockDraftPick.is_user,
            MockDraftPick.auto,
            Player.name,
            Player.position,
            Team.abbreviation.label("team_abbreviation"),
        )
        .join(Player, Player.player_id == MockDraftPick.player_id)
        .outerjoin(Team, Team.team_id == Player.team_id)
        .where(MockDraftPick.mock_id == mock_id)
        .order_by(MockDraftPick.pick_number)
    ).mappings().all()

    return {
        "mock": MockDraftOut.model_validate(mock).model_dump(),
        "picks": [dict(pick) for pick in picks],
    }


@account_router.delete("/mock-drafts/{mock_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_mock_draft(
    mock_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Delete a saved mock."""
    mock = db.scalar(
        select(MockDraft).where(
            MockDraft.mock_id == mock_id, MockDraft.user_id == user.user_id
        )
    )
    if mock is None:
        raise HTTPException(status_code=404, detail="Mock draft not found.")
    db.delete(mock)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
