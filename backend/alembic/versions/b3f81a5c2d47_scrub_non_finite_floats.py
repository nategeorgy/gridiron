"""Scrub non-finite floats (NaN / Infinity) from player_stats

**A data fix, not a schema change** — and it is here rather than in a one-off script
because production has the same bad row and a migration is the only thing both
environments are guaranteed to run.

## What was wrong

One row: Steve Bono, 1999 week 9, PHI @ CAR — a quarterback who threw one pass, was
credited with no team, and carried ``target_share = NaN``.

## Why one row mattered

PostgreSQL's ``double precision`` accepts IEEE NaN, and NaN propagates through
aggregates instead of being skipped the way NULL is::

    SELECT AVG(target_share) FROM player_stats;   -- NaN, for all 149,913 rows
    SELECT MAX(target_share) FROM player_stats;   -- NaN, because NaN > everything

So any surface aggregating ``target_share`` over a window containing week 9 of 1999 —
a leaderboard, an Insight percentile pool, a scatter axis — returned NaN rather than a
number, and nothing raised. It stayed invisible only because almost every surface
filters to a recent season.

## Why there was exactly one, and why that was luck

``load_player_stats`` publishes NaN in three columns, and not sparingly: measured over
1999-2025 it carries **102,267** NaN target shares, **76,246** NaN air-yards shares and
**126,913** NaN WOPRs, plus six infinities. All of them fall in 1999-2008.

Almost all were already being discarded — but incidentally, by the M8 availability
masking, which NULLs ``target_share`` across the 2003-2008 receiver blackout and
``air_yards_share``/``wopr`` before 2009 because those stats were not *measured* in
those seasons. That mask exists to describe what the NFL recorded; it is not a data
sanitiser, and it happened to cover 305,000 NaNs for unrelated reasons. The one that
got through sat in a season the mask deliberately leaves open.

The permanent guard therefore does not live here. ``pipeline/db.py`` now coerces every
non-finite float to NULL inside ``upsert`` and ``replace_scoped`` — the two functions
every ingest writes through — so this cannot recur, cannot depend on an availability
window staying where it is, and cannot be forgotten by a new ingest script. See
``scrub_non_finite`` there.

## Scope of this migration

Every ``double precision`` column on ``player_stats``, not just the three known ones:
the sweep is cheap, it runs once, and pinning it to today's column list would leave a
column added later unfixed. The other tables were swept and are clean; they are left
alone rather than rewritten for nothing.

Irreversible by nature — ``downgrade`` is a no-op, because restoring a NaN would mean
recording which NULLs used to be one, and no one wants that back.

Revision ID: b3f81a5c2d47
Revises: e2b7d4a91c60
Create Date: 2026-09-01 12:38:04.552910

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b3f81a5c2d47"
down_revision: Union[str, None] = "e2b7d4a91c60"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE = "player_stats"


def upgrade() -> None:
    connection = op.get_bind()

    # Read the float columns from the live schema rather than listing them, so this
    # stays correct whatever the table looked like when it was written.
    columns = [
        row[0]
        for row in connection.execute(
            sa.text(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = :table
                  AND data_type IN ('double precision', 'real', 'numeric')
                ORDER BY ordinal_position
                """
            ),
            {"table": TABLE},
        )
    ]

    for column in columns:
        # Postgres deliberately departs from IEEE here: `NaN = NaN` is TRUE, so an
        # equality test finds them. (Under IEEE it would be false and this would
        # silently match nothing.) `real` and `numeric` promote to double precision
        # for the comparison, so one predicate covers all three types.
        connection.execute(
            sa.text(
                f"""
                UPDATE {TABLE}
                SET {column} = NULL
                WHERE {column} IS NOT NULL
                  AND ({column} = 'NaN'::double precision
                       OR {column} = 'Infinity'::double precision
                       OR {column} = '-Infinity'::double precision)
                """
            )
        )


def downgrade() -> None:
    """No-op: a NaN is not worth restoring, and we did not record which rows had one."""
