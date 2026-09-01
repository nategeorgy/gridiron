"""M10: kickoff time on games

`load_schedules` publishes `gametime` alongside `gameday`, and the pipeline has been
discarding it. Every schedule surface wants it: "Sun 9/13" alone does not tell anyone
whether they can watch the game, and a slate sorted by date alone puts the 4:25pm
window in with the 1:00pm one.

**Stored as a naive TIME, and it means Eastern.** nflverse publishes kickoff in ET for
every game, including the London and Munich ones, which is also how every scoreboard in
the sport quotes them. Storing a TIMESTAMPTZ would mean resolving EDT vs EST per row at
ingest and handing clients an instant they would immediately convert back for display;
storing the wall-clock time the league itself publishes keeps the column honest about
what it is. Surfaces render it with an explicit "ET" so it is never ambiguous.

**Deliberately only one column.** The same feed also carries `weekday`, `stadium` and an
`espn` game id, and none of them belong here yet:

  * `weekday` is a pure function of `game_date` — deriving it costs one call and storing
    it would create a second way to be wrong, the same reason implied team totals are
    computed at query time rather than stored (M6.4).
  * `stadium` and `espn` have no surface asking for them. `roof` and `surface` already
    cover the game-environment question a fantasy projection asks.

No RLS here: `games` is an NFL reference table holding public, read-only facts, which is
the documented exemption from the user-data rule (see migration 8f73b5b2b1a1). The table
already had RLS enabled by 69b660509e58 regardless, and adding a column does not change
that.

Revision ID: c4e1a72b9f30
Revises: 0fd5c30c9287
Create Date: 2026-08-30 20:41:12.004311

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4e1a72b9f30'
down_revision: Union[str, None] = '0fd5c30c9287'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('games', sa.Column('kickoff_time', sa.Time(), nullable=True))


def downgrade() -> None:
    op.drop_column('games', 'kickoff_time')
