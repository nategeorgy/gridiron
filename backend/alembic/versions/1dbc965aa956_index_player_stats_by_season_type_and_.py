"""Index player_stats by (season, season_type, week)

The fix for the most expensive cheap-looking query in the app:

    SELECT MIN(week), MAX(week) FROM player_stats WHERE season = 2026 AND season_type = 'REG'

Two numbers, and with accurate table statistics Postgres answers it by walking the
existing single-column `week` index from each end and discarding rows from other
seasons. That is fine mid-season and pathological at the start of one: the season in
progress holds only low week numbers, so the MAX scan walks nearly the whole table
before it finds a row. Measured in September 2026, with 2026 one week old: **14,108
buffers (~110 MB of random reads)** for that one query, against 6 pages once an index
led by `season` exists.

`app/seasons.py`'s `week_bounds()` caches the answer per data version, which fixes the
repeat. This fixes the cold read, and removes the trap itself: the bad plan is not a
constant. Production was still choosing the season-index plan because its statistics
were stale enough to think 2026 was empty — it would have flipped the next time
autovacuum analysed the table.

Leading with `season` is what matters; `season_type` and `week` make it answer this
query from the index alone. B-tree deduplication makes it cheap — about 1 MB, because
the leading columns repeat thousands of times.

`ix_player_stats_season` is deliberately left in place. This index can serve a
season-only lookup as a prefix, but dropping the narrower one is a separate judgement
about every plan that uses it, and it is not what this migration is for.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '1dbc965aa956'
down_revision: Union[str, None] = '85d024666c8f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDEX_NAME = "ix_player_stats_season_type_week"


def upgrade() -> None:
    op.create_index(
        INDEX_NAME, "player_stats", ["season", "season_type", "week"], unique=False
    )


def downgrade() -> None:
    op.drop_index(INDEX_NAME, table_name="player_stats")
