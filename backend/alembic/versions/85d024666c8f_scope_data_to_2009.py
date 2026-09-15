"""Scope the data to 2009, the first season every fantasy feature can be answered in

M8 took scope back to 1999 because that is where nflverse play-by-play begins. Running
it for a year showed what that actually bought: **1999-2008 carries a box score and
little else.** Play-by-play names a receiver only on completions from 2003 to 2008, so
targets are unrecoverable; expected points (ffopportunity) has no usable receiving side
until 2009. Everything the product is *for* — target share, WOPR, depth of target,
expected points, and the four Insight scores built on them — is blank in those seasons.
They were a tenth of the database's rows and a third of its stat lines, answering the
questions this app does not ask.

The trigger was Supabase's Disk IO budget warning (September 2026). Caching the engine
(`app/cache.py`) fixed the cause; this is the other half — the seam is moved to where
the data actually supports the product rather than to where a feed happens to start.

**What goes:** 52,146 stat lines and 2,646 games before 2009. `player_target_depth`
holds nothing before 2009 already (it needs the same attributable targets), and the
delete is written anyway so the order is right on any database that does.

**What stays:** `players` and `teams`. `load_players()` publishes every player nflverse
knows and `ingest_players.py` upserts all of them, so retired players deleted here would
be back the next morning — a delete that undoes itself is worse than no delete. No team
is affected: every franchise in `teams` has played since 2009.

⚠️ **This frees space; it does not return it.** Postgres keeps the freed pages for
reuse, so `player_stats` stays the size it was until the table is rewritten:

    VACUUM FULL player_stats;

That cannot run inside a migration (it takes an ACCESS EXCLUSIVE lock and refuses a
transaction block), so run it by hand afterwards, at a quiet moment.

Not reversible by `downgrade()`: it cannot restore rows it never recorded. The rows are
recoverable the same way they arrived — `ingest_stats.py --seasons ...` and
`ingest_schedules.py` — but only after `FIRST_SEASON` is moved back, since every ingest
clamps to it.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '85d024666c8f'
down_revision: Union[str, None] = 'd4c8e1f07a3b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# The floor is duplicated here on purpose. A migration is a historical record of what
# ran, so it must not import a constant that a later scope change would silently
# rewrite — `pipeline.seasons.FIRST_SEASON` is the live value, this is what this
# migration did.
FIRST_SEASON = 2009

# Children before parents: player_stats and player_target_depth both carry a game_id
# foreign key into games.
DELETES = (
    "DELETE FROM player_target_depth WHERE season < %(season)d",
    "DELETE FROM player_stats WHERE season < %(season)d",
    "DELETE FROM games WHERE season < %(season)d",
)


def upgrade() -> None:
    for statement in DELETES:
        op.execute(statement % {"season": FIRST_SEASON})


def downgrade() -> None:
    """A no-op, deliberately.

    The rows are not recorded anywhere this migration could read them back from. Moving
    `FIRST_SEASON` back and re-running the pipeline is the real downgrade, and raising
    here would block an unrelated rollback of a later migration for no benefit.
    """
