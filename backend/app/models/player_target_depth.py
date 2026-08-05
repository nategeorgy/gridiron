"""PlayerTargetDepth ORM model — targets broken out by pass depth and direction.

The one stored addition in M4. It exists because `player_stats.air_yards` is a
per-game *total*, and a total cannot be un-summed into buckets: the distribution has
to be aggregated from play-by-play at ingestion time.

Grain is (player, game, depth bucket, direction). Direction is stored even though the
depth-of-target chart sums it away, because it is one extra GROUP BY key on a pbp pass
that is being made anyway, and adding it later would mean a second migration and a
second full backfill. Same reasoning as M2 storing expected *components* rather than
expected points: keep the finer grain, aggregate on the way out.

See docs/design/M4-exploration-viz.md §5.
"""

from sqlalchemy import ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

# Air-yard buckets, in field order. The conventional nflverse split, and the one
# fantasy analysis already speaks in.
DEPTH_BUCKETS: tuple[str, ...] = (
    "behind_los",          # air yards < 0
    "short_0_9",           # 0-9
    "intermediate_10_19",  # 10-19
    "deep_20_plus",        # 20+
)

# Pass directions as nflfastR records them.
DIRECTIONS: tuple[str, ...] = ("left", "middle", "right")


class PlayerTargetDepth(Base):
    """One player's targets and production in one depth/direction cell of one game."""

    __tablename__ = "player_target_depth"
    __table_args__ = (
        Index("ix_target_depth_season_week", "season", "week"),
        Index("ix_target_depth_player_season", "player_id", "season"),
    )

    player_id: Mapped[str] = mapped_column(
        ForeignKey("players.player_id"), primary_key=True
    )
    game_id: Mapped[str] = mapped_column(ForeignKey("games.game_id"), primary_key=True)
    depth_bucket: Mapped[str] = mapped_column(String(20), primary_key=True)
    direction: Mapped[str] = mapped_column(String(10), primary_key=True)

    season: Mapped[int | None] = mapped_column(Integer)
    week: Mapped[int | None] = mapped_column(Integer)
    season_type: Mapped[str | None] = mapped_column(String(20))

    targets: Mapped[int | None] = mapped_column(Integer)
    receptions: Mapped[int | None] = mapped_column(Integer)
    receiving_yards: Mapped[int | None] = mapped_column(Integer)
    receiving_tds: Mapped[int | None] = mapped_column(Integer)
    air_yards: Mapped[int | None] = mapped_column(Integer)
