"""Consensus-ranking ORM model (M6.1)."""

from datetime import date

from sqlalchemy import Date, Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PlayerRanking(Base):
    """One player's consensus rank, from one source, on one day.

    **This holds rankings, not projections**, and the difference is the reason the
    table is named this way. A projection is stat components, which the M1 scoring
    engine could rescore into any league. A rank is an opinion already frozen in
    somebody else's scoring — it cannot be recomputed at all. `load_ff_rankings`
    publishes only the latter (ECR plus its dispersion; no projected points, no ADP),
    so the roadmap's `projections` table has nothing to put in it and stays unbuilt
    until there is a real projection source.

    Multi-source from day one (`source` + `ranking_type`), per the projection spine in
    docs/ROADMAP.md, so a second provider — or our own board — is additive.

    **`scraped_at` is part of the key**, because the upstream file is a *snapshot*, not
    a time series: it carries one scrape date and is overwritten in place. History
    therefore only accrues from our first ingest, which is what makes "his ECR has
    moved 20 spots in two weeks" answerable later.

    **`week` is 0 for a draft ranking** rather than NULL — a primary-key column cannot
    be NULL, and preseason is a natural week 0. In-season weekly rankings use the real
    week number.
    """

    __tablename__ = "player_rankings"

    player_id: Mapped[str] = mapped_column(
        String(50), ForeignKey("players.player_id"), primary_key=True
    )
    source: Mapped[str] = mapped_column(String(30), primary_key=True)
    # The upstream page: redraft-overall, redraft-op (superflex), dynasty-overall,
    # best-overall, redraft-rb, … Kept verbatim so a variant we do not use yet still
    # lands in the table rather than being silently dropped.
    ranking_type: Mapped[str] = mapped_column(String(40), primary_key=True)
    season: Mapped[int] = mapped_column(Integer, primary_key=True)
    week: Mapped[int] = mapped_column(Integer, primary_key=True)
    scraped_at: Mapped[date] = mapped_column(Date, primary_key=True)

    # Expert consensus rank, and how much the experts disagree about it. A wide
    # best/worst spread is a genuinely different signal from a high rank.
    ecr: Mapped[float | None] = mapped_column(Float)
    sd: Mapped[float | None] = mapped_column(Float)
    best: Mapped[int | None] = mapped_column(Integer)
    worst: Mapped[int | None] = mapped_column(Integer)
    rank_delta: Mapped[float | None] = mapped_column(Float)
    player_owned_avg: Mapped[float | None] = mapped_column(Float)

    __table_args__ = (
        # The board's access pattern: newest snapshot of one variant for one season.
        Index(
            "ix_rankings_lookup",
            "source", "ranking_type", "season", "week", "scraped_at",
        ),
    )
