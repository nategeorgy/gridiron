"""Team pages: team_personnel_season

The season in progress has no personnel in any free feed (participation arrives after
the Super Bowl), so it is supplied by hand as season-to-date totals per team and
grouping. Those cannot be split into games, so they get their own table rather than
rows in the per-game ``team_personnel``.

RLS-locked in this migration, like every table in ``public`` (CLAUDE.md), and ``anon``
/ ``authenticated`` lose their default grants on it.

Revision ID: a1470d03b94d
Revises: 311908bb9b96
Create Date: 2026-09-29 22:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1470d03b94d'
down_revision: Union[str, None] = '311908bb9b96'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = "team_personnel_season"


def upgrade() -> None:
    op.create_table(TABLE,
    sa.Column('team_id', sa.Integer(), nullable=False),
    sa.Column('season', sa.Integer(), nullable=False),
    sa.Column('season_type', sa.String(length=20), nullable=False),
    sa.Column('grouping', sa.String(length=4), nullable=False),
    sa.Column('through_week', sa.Integer(), nullable=False),
    sa.Column('plays', sa.Float(), nullable=False),
    sa.Column('share', sa.Float(), nullable=True),
    sa.Column('epa_per_play', sa.Float(), nullable=True),
    sa.Column('success_rate', sa.Float(), nullable=True),
    sa.ForeignKeyConstraint(['team_id'], ['teams.team_id'], ),
    sa.PrimaryKeyConstraint('team_id', 'season', 'season_type', 'grouping')
    )
    op.execute(f"ALTER TABLE {TABLE} ENABLE ROW LEVEL SECURITY")
    for role in ("anon", "authenticated"):
        op.execute(
            f"DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role}') "
            f"THEN REVOKE ALL ON TABLE {TABLE} FROM {role}; END IF; END $$;"
        )


def downgrade() -> None:
    op.drop_table(TABLE)
