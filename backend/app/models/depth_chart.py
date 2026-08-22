"""Depth-chart ORM model (M6.2)."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class DepthChartEntry(Base):
    """Where one player currently sits on their team's depth chart.

    **The latest snapshot only — one row per player.** The upstream feed is a stream of
    timestamped snapshots (152 of them for 2026 by mid-August), and storing every one
    would be the largest table in the database by an order of magnitude to answer a
    question nothing asks yet. This is deliberately reversible: nflverse retains every
    snapshot per season, so a change-log ("promoted to WR2 on Aug 12") can be backfilled
    from the same feed whenever it earns its place.

    Because it holds *current* state rather than accumulated history, the ingest cannot
    be a plain upsert — see `pipeline/ingest_depth_charts.py`. A cut player simply stops
    appearing in the feed, so his row would otherwise survive forever.

    Scope is QB/RB/WR/TE, matching the rest of the project: the feed carries the full
    53-man roster, but a fantasy product has nothing to say about a left guard and
    storing him would mean ~600 players whose profile pages are empty.
    """

    __tablename__ = "depth_chart_entries"

    season: Mapped[int] = mapped_column(Integer, primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.team_id"), primary_key=True)
    player_id: Mapped[str] = mapped_column(
        String(50), ForeignKey("players.player_id"), primary_key=True
    )
    # A player can be listed at more than one position, so it is part of the key.
    pos_abb: Mapped[str] = mapped_column(String(5), primary_key=True)

    # Depth at that position: 1 is the starter. This is the fantasy-relevant number —
    # "WR2" is a claim about targets.
    pos_rank: Mapped[int | None] = mapped_column(Integer)
    # The alignment slot the chart lists them in (for receivers, roughly which side or
    # the slot). Stored because it comes free; nothing reads it yet, and it is *not*
    # a substitute for the slot-snap counts no free source provides.
    pos_slot: Mapped[int | None] = mapped_column(Integer)
    pos_grp: Mapped[str | None] = mapped_column(String(30))
    pos_name: Mapped[str | None] = mapped_column(String(50))

    # When the upstream chart was published — the "as of" every surface shows, because
    # perishable data that does not say when it was picked is worse than no data.
    snapshot_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index("ix_depth_chart_team", "team_id", "season", "pos_abb", "pos_rank"),
    )
