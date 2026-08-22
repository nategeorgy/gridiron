"""M6.5: drop franchise rows that never play

`load_teams()` publishes 36 rows, not 32 — historical franchise codes sit alongside
current ones (LAR beside LA, OAK beside LV, SD beside LAC, STL beside LA). Ingesting
them all left four teams in the database that have never played a game in scope, and
every surface built from `SELECT * FROM teams` duly showed them: the strength-of-schedule
board ranked 36 teams with four empty schedules at the top of its "easiest" list, and
the M6.2 team page rendered a real 200 with no record, no fixtures and no depth chart.

`pipeline/ingest_teams.py` now filters them out at the source, so this migration is a
one-time cleanup of rows already written.

**Deletes by reference count, not by name.** A migration hardcoding
`WHERE abbreviation IN ('LAR','OAK','SD','STL')` would be correct only against a
database whose scope starts in 2020: extend `FIRST_SEASON` back to 2015 and St. Louis
becomes a team that really did play, whose rows this would then destroy. Deleting only
teams that nothing references is correct at any scope, and is a no-op on a fresh
database — which is what it is when the test suite builds its schema.

Reversible in practice as well as in principle: `down_revision` cannot restore what it
did not record, but a single `ingest_teams.py` run re-creates any team the feed still
considers current, and widening the scope re-admits the historical ones on their own.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '8530feb2c2ff'
down_revision: Union[str, None] = 'a6763fb36779'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Every foreign key that points at teams.team_id. A team referenced by none of them is
# not a team this database knows anything about.
UNREFERENCED_TEAMS = """
    DELETE FROM teams t
    WHERE NOT EXISTS (
              SELECT 1 FROM games g
              WHERE g.home_team_id = t.team_id OR g.away_team_id = t.team_id
          )
      AND NOT EXISTS (SELECT 1 FROM player_stats ps WHERE ps.team_id = t.team_id)
      AND NOT EXISTS (SELECT 1 FROM players p WHERE p.team_id = t.team_id)
      AND NOT EXISTS (
              SELECT 1 FROM depth_chart_entries d WHERE d.team_id = t.team_id
          )
"""


def upgrade() -> None:
    op.execute(UNREFERENCED_TEAMS)


def downgrade() -> None:
    # Nothing to restore: the deleted rows carried no information beyond what
    # `load_teams()` republishes on every pipeline run.
    pass
