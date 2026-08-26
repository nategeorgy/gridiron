"""security: lock every remaining public table away from PostgREST

Closes the gap that `8f73b5b2b1a1` left open on purpose, and that turned out not to be
safe to leave open.

That migration locked the four **account** tables and deliberately exempted the NFL
tables, on the reasoning that they are "public read-only reference data". The first
half of that is true. The second half is not: nothing about a table in Supabase's
`public` schema is read-only. Supabase's bootstrap runs

    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES
        TO postgres, anon, authenticated, service_role;

so every table an Alembic migration creates is granted **ALL** — SELECT, INSERT,
UPDATE, DELETE — to `anon`, the role behind the publishable key that ships inside our
JavaScript bundle. "Public read-only data" was a description of our intent, never of
the privileges actually in force. The data is free to read; it is not free to *destroy*,
and rebuilding `player_stats` means a full 1999-2025 backfill.

What was actually deployed when this was written (probed through PostgREST with the
bundle's own anon key, read-only):

  * `players`, `teams`, `games`, `player_stats`, `alembic_version` — RLS **on**, but
    applied out of band in the Supabase dashboard rather than by a migration, so it
    existed in production and in no other environment.
  * `player_target_depth` (214,889 rows), `player_rankings` (4,390),
    `depth_chart_entries` (904) — **fully exposed**. Added by later migrations
    (`7852e5b550b0`, `319f1f54a7f0`, `a6763fb36779`), after the dashboard pass, and so
    never covered by it.

That is the failure mode a dashboard fix always has: it protects the tables that exist
on the day it is clicked, and silently exempts every table added afterwards. This
migration puts the same protection in the migration history, where it applies to every
environment and can be tested — `tests/test_rls.py` now asserts it for every table
rather than pinning the reference tables as exempt.

Three layers, the first two exactly as in `8f73b5b2b1a1`:

1. **Enable RLS with no policies.** A role with no matching policy sees zero rows and
   can write nothing. The table *owner* bypasses RLS unless FORCE is set, and both the
   backend and the pipeline connect as the owner — which is already proven in
   production, where `player_stats` has carried RLS through several ingests.
2. **Revoke the grants outright**, so the tables are not merely empty through PostgREST
   but absent from its schema cache. This is the layer the dashboard pass never did.
3. **Revoke the default privileges** that hand ALL to `anon` on tables created later,
   so the next migration does not reopen this by existing. RLS still has to be enabled
   per table — that is what the test is for — but a missed table is no longer
   world-writable in the interval.

Still deliberately **no policies.** A policy is the first step toward the browser
talking to the database directly, which this architecture rejects: `services/supabase.js`
is a token issuer and never reads application data.

Revision ID: 69b660509e58
Revises: 8530feb2c2ff
Create Date: 2026-08-26

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '69b660509e58'
down_revision: Union[str, None] = '8530feb2c2ff'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Every table in `public` that 8f73b5b2b1a1 did not already lock. A user-data table
# added later must lock itself in its own migration, as 0fd5c30c9287 (M9) does.
# The NFL reference tables: public to *read* through our API, which is not the same
# thing as writable by anyone holding the publishable key.
REFERENCE_TABLES = (
    "teams",
    "players",
    "games",
    "player_stats",
    "player_target_depth",
    "player_rankings",
    "depth_chart_entries",
)

# Alembic's own bookkeeping table. It holds no user data, but it is in `public` like
# everything else, which means `anon` could rewrite the migration head and strand the
# database. Locked for the same reason and at no cost: Alembic connects as the owner.
BOOKKEEPING_TABLES = ("alembic_version",)

LOCKED_TABLES = REFERENCE_TABLES + BOOKKEEPING_TABLES

# Roles PostgREST connects as on Supabase. They do not exist on a plain local Postgres,
# so every grant/revoke is guarded — this migration must run identically against local
# Docker, the test harness, and Supabase.
EXPOSED_ROLES = ("anon", "authenticated")


def _for_role_if_exists(role: str, statement: str) -> str:
    """Wrap a grant/revoke so it is skipped where the role does not exist."""
    return f"""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role}') THEN
                {statement};
            END IF;
        END
        $$;
    """


def upgrade() -> None:
    for table in LOCKED_TABLES:
        # Idempotent: a no-op where the dashboard pass already enabled it.
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        for role in EXPOSED_ROLES:
            op.execute(_for_role_if_exists(role, f"REVOKE ALL ON TABLE {table} FROM {role}"))

    # Layer 3. Applies to tables created *afterwards* by the role running this
    # migration, which is the role every migration runs as. Existing tables are
    # unaffected, which is what the loop above is for.
    for role in EXPOSED_ROLES:
        op.execute(
            _for_role_if_exists(
                role,
                f"ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM {role}",
            )
        )


def downgrade() -> None:
    # Restores the *insecure* default. Present so the revision is reversible; there is
    # no good reason to run it against a deployed database.
    for role in EXPOSED_ROLES:
        op.execute(
            _for_role_if_exists(
                role,
                f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO {role}",
            )
        )

    for table in LOCKED_TABLES:
        for role in EXPOSED_ROLES:
            op.execute(_for_role_if_exists(role, f"GRANT ALL ON TABLE {table} TO {role}"))
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
