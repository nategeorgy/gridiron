"""Account ORM models — the four tables M5 adds.

Everything here hangs off ``users.user_id``, which is the Supabase Auth subject
(``sub``) claim verbatim rather than a locally-generated id. Supabase owns
``auth.users`` in a schema Alembic does not manage, so this table is a thin mirror
that exists to give the other three a real foreign key. Rows are provisioned
just-in-time on the first authenticated request (see ``app/auth.py``).

See docs/design/M5-accounts-saved-state.md.
"""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class User(Base):
    """A signed-in user, mirrored from the verified Supabase token's claims."""

    __tablename__ = "users"

    # The Supabase JWT `sub`. Not generated here — presenting a valid token is what
    # brings the row into existence.
    user_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    email: Mapped[str | None] = mapped_column(String(255), index=True)
    display_name: Mapped[str | None] = mapped_column(String(100))
    avatar_url: Mapped[str | None] = mapped_column(String(512))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    league_profiles: Mapped[list["LeagueProfile"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    favorites: Mapped[list["Favorite"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    saved_views: Mapped[list["SavedView"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class LeagueProfile(Base):
    """A named bundle of one scoring spec and one league spec.

    The specs are stored as the same strings that go in the URL and localStorage,
    not decomposed into a column per scoring rule. `app/scoring.py` and
    `app/league.py` are already the canonical grammar; a normalised second
    representation would be a fourth place it lives and a guaranteed drift source.
    Validity is enforced on write by parsing through those same functions.
    """

    __tablename__ = "league_profiles"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_profile_user_name"),
        # "At most one active profile per user" is an invariant the app maintains on
        # every activation, so let the database hold it too: a partial unique index
        # turns a bug in that logic into a failed transaction instead of a user
        # whose header silently shows the wrong league.
        Index(
            "uq_profile_one_active",
            "user_id",
            unique=True,
            postgresql_where=text("is_active"),
        ),
    )

    profile_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(60))
    scoring_spec: Mapped[str] = mapped_column(String(500))
    league_spec: Mapped[str] = mapped_column(String(200))
    # At most one true per user, enforced in the same transaction as any activation.
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="league_profiles")


class Favorite(Base):
    """One player on one user's watchlist."""

    __tablename__ = "favorites"

    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        primary_key=True,
    )
    player_id: Mapped[str] = mapped_column(
        ForeignKey("players.player_id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="favorites")


class SavedView(Base):
    """A named board/scatter/compare view, stored as its route and query string.

    A view is already completely described by its URL — that was the point of the
    stateless-first spine — so storing (path, query) means no per-board save logic
    and makes every board added later saveable the day it ships. `path` is validated
    against the board registry on write so a saved view can never point off-site.
    """

    __tablename__ = "saved_views"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_view_user_name"),)

    view_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(60))
    path: Mapped[str] = mapped_column(String(120))
    # The query string without its leading "?". Empty means the board's defaults.
    query: Mapped[str] = mapped_column(String(2000), default="")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="saved_views")
