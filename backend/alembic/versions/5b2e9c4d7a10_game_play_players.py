"""Who threw, ran, caught and fumbled on each play

The recap's box score prices every play in the page's scoring to show when each
player's points came (points by quarter). That needs the play's players, which
game_plays did not store: ``play_targets`` names the passer and receiver on targeted
passes only, and nothing named the rusher.

These are play-by-play's own fields, stored as the feed states them:

- ``passer_id``, ``rusher_id``, ``receiver_id``, ``fumble_lost_id``: no foreign keys,
  like ``play_targets``, because a fullback's carry or a defender's fumble is still a play
- ``passing_yards``, ``rushing_yards``, ``receiving_yards``: NULL where the role is absent
  (a sack has no passing yards; it is not a zero-yard completion)
- ``complete``, ``interception``, ``pass_touchdown``, ``rush_touchdown``, ``two_point``
  (a successful conversion, credited to the players on that play)

Filled by ``ingest_plays.py`` for 2025 on, which replaces each game's plays whole, so a
re-run of ``--seasons 2025 2026`` backfills them. RLS is unchanged: game_plays has had
it since 7922d74faa17, and adding columns does not alter a table's row-level security.

Revision ID: 5b2e9c4d7a10
Revises: 7922d74faa17
Create Date: 2026-10-16 01:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5b2e9c4d7a10'
down_revision: Union[str, None] = '7922d74faa17'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PLAYER_COLUMNS = ("passer_id", "rusher_id", "receiver_id", "fumble_lost_id")
YARD_COLUMNS = ("passing_yards", "rushing_yards", "receiving_yards")
FLAG_COLUMNS = ("complete", "interception", "pass_touchdown", "rush_touchdown", "two_point")


def upgrade() -> None:
    for name in PLAYER_COLUMNS:
        op.add_column('game_plays', sa.Column(name, sa.String(length=50), nullable=True))
    for name in YARD_COLUMNS:
        op.add_column('game_plays', sa.Column(name, sa.SmallInteger(), nullable=True))
    for name in FLAG_COLUMNS:
        op.add_column('game_plays', sa.Column(name, sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    for name in (*PLAYER_COLUMNS, *YARD_COLUMNS, *FLAG_COLUMNS):
        op.drop_column('game_plays', name)
