"""M5 security: lock account tables away from PostgREST (RLS + revoke)

The account tables live in the `public` schema, and on Supabase that schema is
automatically served by **PostgREST** at `/rest/v1/`. Supabase's default privileges
also grant the `anon` and `authenticated` roles access to new tables there. Together
that means a table created by a plain Alembic migration is, by default, readable and
writable by anyone holding the **anon key** — which is public by design and ships
inside our JavaScript bundle.

That would completely bypass the authorization in `app/routers/account.py`. Every
guarantee there ("no endpoint accepts a user id", "a guessed id 404s") is about *our*
API; Supabase quietly runs a second API over the same tables.

The fix is two layers:

1. **Enable row-level security with no policies.** Under RLS a role with no matching
   policy sees zero rows and can write nothing. The table *owner* bypasses RLS unless
   `FORCE ROW LEVEL SECURITY` is set, and the backend connects as the owner — so the
   API is unaffected while PostgREST's roles get nothing.
2. **Revoke privileges from those roles outright**, so the tables are not merely empty
   through PostgREST but absent from its schema cache entirely.

Deliberately **no policies are created.** Adding one would be the first step toward
letting the browser talk to the database directly, which is the architecture this
project explicitly rejected (see docs/design/M5-accounts-saved-state.md §2).

NFL data tables are untouched — they are public read-only reference data.

Revision ID: 8f73b5b2b1a1
Revises: 990003c7c7cf
Create Date: 2026-08-05 21:21:35.725463

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '8f73b5b2b1a1'
down_revision: Union[str, None] = '990003c7c7cf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# The tables holding user data. NFL reference tables are deliberately excluded.
ACCOUNT_TABLES = ("users", "league_profiles", "favorites", "saved_views")

# Roles PostgREST connects as on Supabase. They do not exist on a plain local
# Postgres, so every revoke is guarded — this migration must run identically
# against local Docker and Supabase.
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
    for table in ACCOUNT_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        for role in EXPOSED_ROLES:
            op.execute(_for_role_if_exists(role, f"REVOKE ALL ON TABLE {table} FROM {role}"))


def downgrade() -> None:
    # Restores the *insecure* default. Present so the revision is reversible; there is
    # no good reason to run it against a deployed database.
    for table in ACCOUNT_TABLES:
        for role in EXPOSED_ROLES:
            op.execute(_for_role_if_exists(role, f"GRANT ALL ON TABLE {table} TO {role}"))
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
