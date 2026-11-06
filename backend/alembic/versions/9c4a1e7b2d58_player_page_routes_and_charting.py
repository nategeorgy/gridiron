"""Player page: play_routes and play_charting

Two play-grain tables for the tabbed player page (November 2026).

``play_routes`` holds the route the targeted receiver ran on each targeted pass, from
nflverse's participation feed (2016 on, a season behind), for the route tree.
``play_charting`` holds FTN's charting of each play (play action, screen, RPO, motion,
no huddle, the quarterback's alignment, players in the backfield), 2025 on, for the
situation splits' play type and formation groups.

Both are RLS-locked in this migration, like every table in ``public`` (CLAUDE.md), and
``anon`` / ``authenticated`` lose their default grants on them.

Revision ID: 9c4a1e7b2d58
Revises: 5b2e9c4d7a10
Create Date: 2026-11-04 23:10:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9c4a1e7b2d58'
down_revision: Union[str, None] = '5b2e9c4d7a10'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NEW_TABLES = ("play_routes", "play_charting")


def upgrade() -> None:
    op.create_table('play_routes',
    sa.Column('game_id', sa.String(length=50), nullable=False),
    sa.Column('play_id', sa.Integer(), nullable=False),
    sa.Column('season', sa.Integer(), nullable=False),
    sa.Column('week', sa.Integer(), nullable=False),
    sa.Column('season_type', sa.String(length=20), nullable=False),
    sa.Column('route', sa.String(length=20), nullable=False),
    sa.ForeignKeyConstraint(['game_id'], ['games.game_id'], ),
    sa.PrimaryKeyConstraint('game_id', 'play_id')
    )
    op.create_index('ix_play_routes_season', 'play_routes', ['season'], unique=False)
    op.create_table('play_charting',
    sa.Column('game_id', sa.String(length=50), nullable=False),
    sa.Column('play_id', sa.Integer(), nullable=False),
    sa.Column('season', sa.Integer(), nullable=False),
    sa.Column('week', sa.Integer(), nullable=False),
    sa.Column('season_type', sa.String(length=20), nullable=False),
    sa.Column('play_action', sa.Boolean(), nullable=True),
    sa.Column('screen', sa.Boolean(), nullable=True),
    sa.Column('rpo', sa.Boolean(), nullable=True),
    sa.Column('motion', sa.Boolean(), nullable=True),
    sa.Column('no_huddle', sa.Boolean(), nullable=True),
    sa.Column('qb_location', sa.String(length=2), nullable=True),
    sa.Column('backfield', sa.SmallInteger(), nullable=True),
    sa.ForeignKeyConstraint(['game_id'], ['games.game_id'], ),
    sa.PrimaryKeyConstraint('game_id', 'play_id')
    )
    op.create_index('ix_play_charting_season', 'play_charting', ['season'], unique=False)

    for table in NEW_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        for role in ("anon", "authenticated"):
            op.execute(
                f"DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role}') "
                f"THEN REVOKE ALL ON TABLE {table} FROM {role}; END IF; END $$;"
            )


def downgrade() -> None:
    op.drop_index('ix_play_charting_season', table_name='play_charting')
    op.drop_table('play_charting')
    op.drop_index('ix_play_routes_season', table_name='play_routes')
    op.drop_table('play_routes')
