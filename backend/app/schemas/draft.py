"""Draft request/response schemas (M9) — ranking boards and mock drafts.

Validation lives here rather than in the router, for the M5 reason: a rule is stated
once and applies to create and update alike. The scoring and league specs are checked
by parsing them through the same functions that serve a request, so a board that saves
cleanly is a board that will render.

**A CSV arrives as a JSON string, not as a multipart upload.** A ranking board is at
most a few tens of kilobytes of text, the frontend already speaks JSON everywhere, and
multipart would mean adding `python-multipart` to a deployed service to carry a
payload smaller than most of our API responses.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.league import parse_league
from app.ranking_import import MAX_ROWS
from app.scoring import parse_scoring

# Board kinds a user board may claim to be. Same vocabulary as
# `player_rankings.ranking_type`, narrowed to the ones a user would actually keep a
# board of — a user board is a cheat sheet, not a mirror of every FantasyPros page.
USER_RANKING_TYPES: tuple[str, ...] = (
    "redraft-overall",
    "redraft-op",
    "dynasty-overall",
    "best-overall",
    "weekly-offense",
    "weekly-op",
)

MAX_BOARDS = 25
MAX_ENTRIES = MAX_ROWS
# A generous ceiling on the raw text of an upload: 800 rows of `1,Player Name,WR,CIN,1`
# is well under 64 KB, so this rejects a mis-dropped spreadsheet without ever
# rejecting a real board.
MAX_CSV_BYTES = 256_000


def _clean_name(value: str) -> str:
    """Trim a user-supplied name and reject one that is only whitespace."""
    name = value.strip()
    if not name:
        raise ValueError("Name cannot be blank.")
    return name


def _check_scoring_spec(value: str) -> str:
    """Reject a scoring spec the API could not later parse."""
    parse_scoring(value)  # raises on a malformed spec
    return value.strip()


def _check_league_spec(value: str) -> str:
    """Reject a league spec the API could not later parse."""
    parse_league(value)
    return value.strip()


def _check_ranking_type(value: str) -> str:
    """Reject a board kind the API would not know how to compare against."""
    if value not in USER_RANKING_TYPES:
        raise ValueError(f"Board type must be one of: {', '.join(USER_RANKING_TYPES)}.")
    return value


# --- Ranking boards ----------------------------------------------------------


class BoardEntryIn(BaseModel):
    """One player on a board being saved.

    There is no ``rank`` field: **position in the list is the rank**. A board is
    edited by dragging, so the client always holds the whole ordering, and accepting a
    rank as well would create two sources of truth that can disagree.
    """

    player_id: str = Field(min_length=1, max_length=50)
    tier: int | None = Field(default=None, ge=1, le=99)
    note: str | None = Field(default=None, max_length=200)


class BoardEntryOut(BaseModel):
    """One player on a saved board, hydrated enough to render a row."""

    player_id: str
    name: str | None = None
    position: str | None = None
    team_abbreviation: str | None = None
    headshot_url: str | None = None
    rank: int
    tier: int | None = None
    note: str | None = None


class RankingBoardOut(BaseModel):
    """A user's board in a listing — metadata only, no entries."""

    model_config = ConfigDict(from_attributes=True)

    board_id: UUID
    name: str
    ranking_type: str
    origin: str
    seeded_from: str | None = None
    entry_count: int = 0
    created_at: datetime
    updated_at: datetime


class RankingBoardDetail(RankingBoardOut):
    """A board with its players, in order."""

    entries: list[BoardEntryOut] = []


class RankingBoardCreate(BaseModel):
    """Create a board, optionally with its players in one call."""

    name: str = Field(min_length=1, max_length=60)
    ranking_type: str = "redraft-overall"
    # Where this started, for provenance in the UI. Free text: it may name a global
    # source or a board that is later deleted, and the history should survive that.
    seeded_from: str | None = Field(default=None, max_length=60)
    entries: list[BoardEntryIn] = Field(default_factory=list, max_length=MAX_ENTRIES)

    _name = field_validator("name")(_clean_name)
    _type = field_validator("ranking_type")(_check_ranking_type)


class RankingBoardUpdate(BaseModel):
    """Rename or re-type a board. Entries are replaced through their own endpoint."""

    name: str | None = Field(default=None, min_length=1, max_length=60)
    ranking_type: str | None = None

    _name = field_validator("name")(_clean_name)
    _type = field_validator("ranking_type")(_check_ranking_type)


class BoardEntriesIn(BaseModel):
    """Replace a board's players wholesale — the only way a board is edited."""

    entries: list[BoardEntryIn] = Field(max_length=MAX_ENTRIES)


class UnmatchedRow(BaseModel):
    """A CSV row we would not guess at, returned so the user can see the hole."""

    rank: int
    name: str
    position: str
    team: str | None = None
    # 'unknown' — no player of that name and position; 'ambiguous' — several, and
    # nothing in the row separates them.
    reason: str


class BoardImportIn(BaseModel):
    """A CSV upload: the file's text, plus what to call the board it becomes."""

    name: str = Field(min_length=1, max_length=60)
    ranking_type: str = "redraft-overall"
    content: str = Field(min_length=1, max_length=MAX_CSV_BYTES)

    _name = field_validator("name")(_clean_name)
    _type = field_validator("ranking_type")(_check_ranking_type)


class BoardImportOut(BaseModel):
    """The board that was created, and an honest account of what did not make it."""

    board: RankingBoardDetail
    matched: int
    unmatched: list[UnmatchedRow] = []
    out_of_scope: int = 0
    total_rows: int = 0


# --- Mock drafts -------------------------------------------------------------


class MockTeamIn(BaseModel):
    """One team's roster out of a finished mock."""

    draft_slot: int = Field(ge=1, le=32)
    player_ids: list[str] = Field(default_factory=list, max_length=40)


class MockPickIn(BaseModel):
    """One pick, for the per-pick reach/steal read."""

    pick_number: int = Field(ge=1)
    round: int = Field(ge=1)
    team_slot: int = Field(ge=1, le=32)
    player_id: str = Field(min_length=1, max_length=50)
    is_user: bool = False
    auto: bool = False


class MockGradeIn(BaseModel):
    """Grade a finished mock. Requires no account — a mock is never gated."""

    scoring: str = "ppr"
    league: str = "12"
    # The valuation season. Defaults to the newest season with stats.
    season: int | None = None
    teams: list[MockTeamIn] = Field(min_length=1, max_length=32)
    picks: list[MockPickIn] = Field(default_factory=list, max_length=640)
    # The board the bots drafted from, so picks can be graded against the market the
    # room actually had.
    bot_source: str | None = Field(default=None, max_length=60)

    _scoring = field_validator("scoring")(_check_scoring_spec)
    _league = field_validator("league")(_check_league_spec)


class MockDraftOut(BaseModel):
    """A saved mock in the user's history."""

    model_config = ConfigDict(from_attributes=True)

    mock_id: UUID
    scoring_spec: str
    league_spec: str
    teams: int
    rounds: int
    draft_slot: int
    bot_source: str
    bot_randomness: float
    grade_vorp: float | None = None
    grade_rank: int | None = None
    created_at: datetime


class MockDraftCreate(BaseModel):
    """Save a finished mock to the user's history."""

    scoring_spec: str = Field(min_length=1, max_length=500)
    league_spec: str = Field(min_length=1, max_length=200)
    teams: int = Field(ge=2, le=32)
    rounds: int = Field(ge=1, le=40)
    draft_slot: int = Field(ge=1, le=32)
    bot_source: str = Field(min_length=1, max_length=60)
    bot_randomness: float = Field(default=0.5, ge=0, le=1)
    grade_vorp: float | None = None
    grade_rank: int | None = None
    picks: list[MockPickIn] = Field(default_factory=list, max_length=640)

    _scoring = field_validator("scoring_spec")(_check_scoring_spec)
    _league = field_validator("league_spec")(_check_league_spec)
