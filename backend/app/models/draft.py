"""Draft ORM models (M9) — user ranking boards and saved mock drafts.

Four tables, all user-owned, all hanging off ``users.user_id`` exactly like the M5
account island. They reference `players`; nothing references them; the pipeline never
touches them. ⚠️ Because they hold user data they are RLS-locked in their migration —
see the rule in CLAUDE.md and the reasoning in `8f73b5b2b1a1`.

The distinction that shapes this file: **a global ranking source is not a row here.**
FantasyPros ECR and the dropped expert boards live in `player_rankings`, which was
built multi-source from day one. These tables hold only the boards a *user* made — an
uploaded cheat sheet or one built in the editor — and the mocks they drafted.

See docs/design/M9-draft.md §4.3 and §4.4.
"""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class RankingBoard(Base):
    """One user's own ranking board — uploaded from a CSV or built in the editor."""

    __tablename__ = "ranking_boards"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_board_user_name"),)

    board_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(60))

    # Which kind of board this is a version of — the same vocabulary as
    # `player_rankings.ranking_type`, so a user board and a global source can be
    # compared without a translation layer.
    ranking_type: Mapped[str] = mapped_column(String(40), default="redraft-overall")

    # 'upload' (a CSV) or 'custom' (built in the editor). Kept because the two fail
    # differently and the UI says so: an upload can have unmatched names, an edited
    # board cannot.
    origin: Mapped[str] = mapped_column(String(20), default="custom")

    # The source or board this was cloned from, for provenance in the UI ("started
    # from GridironIQ Consensus"). Free text rather than a FK: it may name a global
    # source id, and a board whose parent was later deleted should keep its history.
    seeded_from: Mapped[str | None] = mapped_column(String(60))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    entries: Mapped[list["RankingBoardEntry"]] = relationship(
        back_populates="board", cascade="all, delete-orphan", passive_deletes=True
    )


class RankingBoardEntry(Base):
    """One player's place on one user board.

    ``rank`` is stored **densely and rewritten wholesale** on every save. A board is
    edited by dragging a player from 40th to 12th, which renumbers everything between —
    so the unit of change is the board, not the row, and a partial update has no
    meaning here.
    """

    __tablename__ = "ranking_board_entries"
    __table_args__ = (
        # The only access pattern: one board, in order.
        Index("ix_board_entries_rank", "board_id", "rank"),
    )

    board_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("ranking_boards.board_id", ondelete="CASCADE"),
        primary_key=True,
    )
    player_id: Mapped[str] = mapped_column(
        String(50), ForeignKey("players.player_id", ondelete="CASCADE"), primary_key=True
    )
    rank: Mapped[int] = mapped_column(Integer)
    # Optional grouping the user drew themselves ("these four are the same to me").
    tier: Mapped[int | None] = mapped_column(Integer)
    note: Mapped[str | None] = mapped_column(String(200))

    board: Mapped["RankingBoard"] = relationship(back_populates="entries")


class MockDraft(Base):
    """A finished mock draft, kept so a signed-in user can look back at it.

    **In-progress mocks are not here.** The draft engine runs in the browser and
    mirrors itself to `localStorage` after every pick, so a mock never requires an
    account (M9 §2). This table is the history, written when a draft completes.

    The scoring and league specs are stored as the same strings that go in a URL, for
    the M5 reason: `app/scoring.py` and `app/league.py` are already the canonical
    grammar, and a normalised second representation would be a place for it to drift.
    """

    __tablename__ = "mock_drafts"

    mock_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), index=True
    )

    scoring_spec: Mapped[str] = mapped_column(String(500))
    league_spec: Mapped[str] = mapped_column(String(200))

    teams: Mapped[int] = mapped_column(Integer)
    rounds: Mapped[int] = mapped_column(Integer)
    # 1-based, so slot 1 picks first. The user's seat at the table.
    draft_slot: Mapped[int] = mapped_column(Integer)
    # What the bots drafted from: a global source id, or "board:<uuid>" for a user
    # board. Not a FK — a deleted board should leave the mock's history readable.
    bot_source: Mapped[str] = mapped_column(String(60))
    # 0 = strict board order, 1 = maximum chaos. See M9 §4.4.
    bot_randomness: Mapped[float] = mapped_column(Float, default=0.5)

    # The user team's expected VORP, in the scoring and league above. Stored rather
    # than recomputed because it is the grade *as it was given*: replacement level
    # moves with the data, and a history that silently re-grades itself is not one.
    grade_vorp: Mapped[float | None] = mapped_column(Float)
    grade_rank: Mapped[int | None] = mapped_column(Integer)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    picks: Mapped[list["MockDraftPick"]] = relationship(
        back_populates="mock", cascade="all, delete-orphan", passive_deletes=True
    )


class MockDraftPick(Base):
    """One pick in a saved mock draft."""

    __tablename__ = "mock_draft_picks"

    mock_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("mock_drafts.mock_id", ondelete="CASCADE"),
        primary_key=True,
    )
    # 1-based overall pick number — the natural ordering of a draft.
    pick_number: Mapped[int] = mapped_column(Integer, primary_key=True)
    round: Mapped[int] = mapped_column(Integer)
    # 1-based draft slot that made the pick.
    team_slot: Mapped[int] = mapped_column(Integer)
    player_id: Mapped[str] = mapped_column(
        String(50), ForeignKey("players.player_id", ondelete="CASCADE")
    )
    is_user: Mapped[bool] = mapped_column(Boolean, default=False)
    # True when the clock ran out or the user asked for autopick — worth keeping, so
    # a bad grade can be read as "I let it autopick four times" rather than as advice.
    auto: Mapped[bool] = mapped_column(Boolean, default=False)

    mock: Mapped["MockDraft"] = relationship(back_populates="picks")
