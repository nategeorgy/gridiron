"""Team pages: skill-position snap sums on team_game_stats

Four sums from nflverse snap counts (2013+), per team, game and side: snaps played by
backs, tight ends and receivers, and backs' snaps beyond one per snap (the snaps with a
second back). Summed over a window and divided by the team's snaps, they give the
average number of each on the field, which is exact where the 11/12/13 split is not,
and they update weekly, where participation arrives after the season.

No new table, so no RLS change: team_game_stats is already locked (177a7137df5c).

Revision ID: cc1003cfc34f
Revises: a1470d03b94d
Create Date: 2026-09-30 18:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cc1003cfc34f'
down_revision: Union[str, None] = 'a1470d03b94d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLUMNS = ("back_snaps", "te_snaps", "wr_snaps", "two_back_snaps")


def upgrade() -> None:
    for column in COLUMNS:
        op.add_column("team_game_stats", sa.Column(column, sa.Float(), nullable=True))


def downgrade() -> None:
    for column in COLUMNS:
        op.drop_column("team_game_stats", column)
