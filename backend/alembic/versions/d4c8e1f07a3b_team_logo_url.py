"""Team logo URL on teams

The home scoreboard draws each team's logo beside its abbreviation, so a reader finds a
matchup by shape before reading three letters. `load_teams()` has published
`team_logo_espn` all along and `ingest_teams.py` discarded it, so this is one column and
one more key in an ingest that already runs daily — no new feed.

**A URL, not an image.** The app hotlinks it the way it already hotlinks player headshots
(`players.headshot_url`), so a logo nflverse updates arrives with the next teams ingest
rather than needing a re-upload.

Nullable, and a missing logo is a state rather than an error: the scoreboard keeps an
empty box in its place so the abbreviations stay in their columns.

RLS is unchanged. `teams` has had it enabled since 69b660509e58, and adding a column does
not alter a table's row-level security.

Revision ID: d4c8e1f07a3b
Revises: a91f3c5e7d02
Create Date: 2026-09-15 01:12:40.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4c8e1f07a3b'
down_revision: Union[str, None] = 'a91f3c5e7d02'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('teams', sa.Column('logo_url', sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column('teams', 'logo_url')
