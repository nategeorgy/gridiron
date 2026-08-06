"""Account request/response schemas (M5).

Validation lives here rather than in the router so the rules are stated once and
apply to create and update alike. The two spec fields are validated by parsing them
through the same functions the API uses to serve a request — a profile that saves
cleanly is a profile that will render.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.league import parse_league
from app.schemas.player import PlayerOut
from app.scoring import parse_scoring

# Route sections a saved view may point at. This is a *safety envelope*, not a copy
# of the frontend's board registry: the catalog of 19 boards lives in
# constants/boards.js, and duplicating it here would be a fourth place the same list
# has to be kept in sync. What the backend must guarantee is narrower and stable —
# that a stored path is a same-origin app route and can never become an off-site
# redirect. The frontend, which owns the registry, rejects unknown boards at save time.
SAVED_VIEW_SECTIONS: tuple[str, ...] = ("fantasy", "insight", "nfl", "explore")


# --- Shared field validators -------------------------------------------------
# Plain functions, referenced by both the create and update schemas, so a rule is
# written once and cannot drift between the two.


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


def _check_path(value: str) -> str:
    """Reject anything that is not a plain, same-origin app route.

    A saved view is a stored URL, so this is the one place a stored value could turn
    into a redirect off the site. Rules: exactly one leading slash (``//host`` is
    protocol-relative and would leave the origin), a known section, and no scheme.
    """
    path = value.strip()
    if not path.startswith("/") or path.startswith("//"):
        raise ValueError("Path must be an app route beginning with '/'.")
    if ":" in path or "\\" in path:
        raise ValueError("Path must not contain a scheme.")
    segments = [segment for segment in path.strip("/").split("/") if segment]
    # A browser resolves ".." before the router ever sees the path, so a traversal
    # segment would walk straight back out of the section checked below.
    if ".." in segments:
        raise ValueError("Path must not contain relative segments.")
    section = segments[0] if segments else ""
    if section not in SAVED_VIEW_SECTIONS:
        raise ValueError(
            f"Path must be under one of: {', '.join('/' + s for s in SAVED_VIEW_SECTIONS)}."
        )
    return path


def _clean_query(value: str) -> str:
    """Normalise a query string to the form stored: no leading '?'."""
    return value.lstrip("?").strip()


class UserOut(BaseModel):
    """The signed-in user, mirrored from their verified token."""

    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    email: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None
    created_at: datetime


class LeagueProfileOut(BaseModel):
    """A saved league profile."""

    model_config = ConfigDict(from_attributes=True)

    profile_id: UUID
    name: str
    scoring_spec: str
    league_spec: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class LeagueProfileCreate(BaseModel):
    """Create a league profile. Both specs are parsed before the row is written."""

    name: str = Field(min_length=1, max_length=60)
    scoring_spec: str = Field(min_length=1, max_length=500)
    league_spec: str = Field(min_length=1, max_length=200)
    # Whether to make this the active profile. Defaults true: someone creating a
    # profile is almost always about to use it.
    activate: bool = True

    _name = field_validator("name")(_clean_name)
    _scoring = field_validator("scoring_spec")(_check_scoring_spec)
    _league = field_validator("league_spec")(_check_league_spec)


class LeagueProfileUpdate(BaseModel):
    """Patch a league profile. Every field is optional; omitted fields are unchanged."""

    name: str | None = Field(default=None, min_length=1, max_length=60)
    scoring_spec: str | None = Field(default=None, min_length=1, max_length=500)
    league_spec: str | None = Field(default=None, min_length=1, max_length=200)
    activate: bool | None = None

    _name = field_validator("name")(_clean_name)
    _scoring = field_validator("scoring_spec")(_check_scoring_spec)
    _league = field_validator("league_spec")(_check_league_spec)


class FavoriteOut(BaseModel):
    """A watchlisted player, hydrated with enough to render a row or a tile."""

    player: PlayerOut
    created_at: datetime


class SavedViewOut(BaseModel):
    """A saved board/scatter/compare view."""

    model_config = ConfigDict(from_attributes=True)

    view_id: UUID
    name: str
    path: str
    query: str
    created_at: datetime
    updated_at: datetime


class SavedViewCreate(BaseModel):
    """Save the current view under a name."""

    name: str = Field(min_length=1, max_length=60)
    path: str = Field(min_length=1, max_length=120)
    # The query string without its leading "?". Empty means the board's defaults.
    query: str = Field(default="", max_length=2000)

    _name = field_validator("name")(_clean_name)
    _path = field_validator("path")(_check_path)
    _query = field_validator("query")(_clean_query)


class SavedViewUpdate(BaseModel):
    """Patch a saved view — rename, or re-point it at the current filters."""

    name: str | None = Field(default=None, min_length=1, max_length=60)
    path: str | None = Field(default=None, min_length=1, max_length=120)
    query: str | None = Field(default=None, max_length=2000)

    _name = field_validator("name")(_clean_name)
    _path = field_validator("path")(_check_path)
    _query = field_validator("query")(_clean_query)


class AccountSummary(BaseModel):
    """`GET /me` — the user plus what they have saved, for the header menu."""

    user: UserOut
    league_profile_count: int
    favorite_count: int
    saved_view_count: int
