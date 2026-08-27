"""Row-level security on every table in the `public` schema.

The bug this guards against was not in any Python: the tables live in the `public`
schema, and on Supabase that schema is automatically served by PostgREST at
`/rest/v1/` to anyone holding the **publishable anon key** — which is public by design
and ships inside the JavaScript bundle. Every guarantee in `routers/account.py` is
about *our* API, and Supabase was quietly running a second one over the same tables.

So this is the one part of the boundary that no request-level test can reach. It is a
property of the schema, which is also why the suite migrates its database rather than
building it from model metadata: `Base.metadata.create_all()` would produce tables that
look right to every other test in this suite and are missing this layer entirely.

The tests assert the *mechanism*, not just the flag — a role that is not the owner must
actually come up empty.

**This file used to pin the NFL tables as deliberately exempt**, on the reasoning that
they hold public read-only reference data. Reading is indeed free; Supabase's default
privileges also grant `anon` INSERT, UPDATE and DELETE, so "read-only" described our
intent and not the privileges in force. Three tables added after the original lockdown
(`player_target_depth`, `player_rankings`, `depth_chart_entries`) sat world-writable in
production until Supabase's linter flagged them. `69b660509e58` locks every table, and
`test_no_public_table_is_left_unlocked` below is the assertion that actually keeps it
that way: it enumerates the schema instead of a list somebody has to remember to edit.
"""

import pytest
from sqlalchemy import text

# The tables holding user data, per the migrations.
ACCOUNT_TABLES = (
    "users",
    "league_profiles",
    "favorites",
    "saved_views",
    "ranking_boards",
    "ranking_board_entries",
    "mock_drafts",
    "mock_draft_picks",
)
# NFL reference data. Public to *read through our API*, which is not the same thing as
# writable by anyone holding the publishable key. Locked by `69b660509e58`.
REFERENCE_TABLES = (
    "teams",
    "players",
    "games",
    "player_stats",
    "player_target_depth",
    "player_rankings",
    "depth_chart_entries",
)
# Alembic's own bookkeeping. No user data, but `anon` rewriting the migration head
# would strand the database, and locking it costs nothing.
BOOKKEEPING_TABLES = ("alembic_version",)

LOCKED_TABLES = ACCOUNT_TABLES + REFERENCE_TABLES + BOOKKEEPING_TABLES


def _relation_flags(db, table: str) -> tuple[bool, bool]:
    """Return (row security enabled, forced) for a table in the public schema."""
    return db.execute(
        text(
            "SELECT c.relrowsecurity, c.relforcerowsecurity FROM pg_class c "
            "JOIN pg_namespace n ON n.oid = c.relnamespace "
            "WHERE n.nspname = 'public' AND c.relname = :table"
        ),
        {"table": table},
    ).one()


def _public_tables(db) -> list[str]:
    """Every ordinary table in the schema PostgREST serves."""
    return list(
        db.scalars(
            text(
                "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
                "WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname"
            )
        ).all()
    )


@pytest.mark.parametrize("table", LOCKED_TABLES)
def test_tables_have_row_level_security_enabled(db, table):
    enabled, _ = _relation_flags(db, table)

    assert enabled, f"{table} is exposed: RLS is not enabled"


def test_no_public_table_is_left_unlocked(db):
    """The assertion that survives the next migration.

    Every list in this file is something a person has to remember to update; this one
    asks the database. It is the test that would have caught `player_target_depth`,
    `player_rankings` and `depth_chart_entries` — three tables added *after* the
    original lockdown, each world-writable through PostgREST from the moment it was
    created, and none of them named in any list to be checked against.

    A new table in `public` must be locked in the migration that creates it. If this
    fails, that is the fix — not an addition to the tuples above.
    """
    unlocked = [t for t in _public_tables(db) if not _relation_flags(db, t)[0]]

    assert unlocked == [], (
        f"{unlocked} live in the schema PostgREST serves with RLS disabled, which makes "
        f"them readable and writable by anyone holding the publishable anon key. "
        f"Enable RLS and revoke anon/authenticated in the migration that creates them."
    )


def test_the_locked_list_still_covers_the_schema(db):
    """And the reverse direction, so the tuples above do not rot into fiction."""
    assert sorted(LOCKED_TABLES) == _public_tables(db)


@pytest.mark.parametrize("table", LOCKED_TABLES)
def test_no_policies_exist(db, table):
    """Deliberately none.

    Under RLS a role with no matching policy sees zero rows, which is the whole
    protection. Adding a policy would be the first step toward letting the browser talk
    to the database directly — the architecture this project explicitly rejected.
    """
    policies = db.scalars(
        text("SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = :t"),
        {"t": table},
    ).all()

    assert policies == [], f"{table} has policies: {policies}"


@pytest.mark.parametrize("table", LOCKED_TABLES)
def test_force_row_level_security_is_off(db, table):
    """Which is *why* the API and the pipeline still work.

    Postgres exempts a table's owner from RLS unless FORCE is set, and the backend and
    the pipeline both connect as the owner. Turning FORCE on would lock out the
    application itself — every account endpoint would start returning empty, and every
    ingest would write nothing. Pinned so that a future "tighten the RLS settings"
    change has to notice.
    """
    _, forced = _relation_flags(db, table)

    assert not forced


def test_a_non_owner_role_sees_no_rows(db, user_a, client_a, player):
    """The mechanism, not the flag: RLS must actually bite.

    A role standing in for PostgREST's `anon` is granted SELECT explicitly, so the only
    thing left between it and the data is row-level security. It should still come up
    empty on tables that visibly have rows.
    """
    client_a.put(f"/api/v1/me/favorites/{player.player_id}")
    assert db.scalar(text("SELECT count(*) FROM users")) == 1
    assert db.scalar(text("SELECT count(*) FROM favorites")) == 1
    assert db.scalar(text("SELECT count(*) FROM players")) == 1

    db.execute(text("CREATE ROLE rls_probe NOLOGIN"))
    db.execute(text("GRANT USAGE ON SCHEMA public TO rls_probe"))
    for table in LOCKED_TABLES:
        db.execute(text(f"GRANT SELECT ON TABLE {table} TO rls_probe"))

    db.execute(text("SET LOCAL ROLE rls_probe"))
    try:
        assert db.scalar(text("SELECT count(*) FROM users")) == 0
        assert db.scalar(text("SELECT count(*) FROM favorites")) == 0
        assert db.scalar(text("SELECT count(*) FROM league_profiles")) == 0
        assert db.scalar(text("SELECT count(*) FROM saved_views")) == 0
        # And the NFL tables, which used to be the deliberate exception. The data is
        # still public — through our API, which reads it as the owner.
        assert db.scalar(text("SELECT count(*) FROM players")) == 0
    finally:
        db.execute(text("RESET ROLE"))


def test_a_non_owner_role_cannot_write(db, user_a):
    """Read is empty; write is refused outright.

    An insert with no permissive policy fails rather than silently vanishing, so a
    PostgREST caller cannot create rows either.
    """
    db.execute(text("CREATE ROLE rls_writer NOLOGIN"))
    db.execute(text("GRANT USAGE ON SCHEMA public TO rls_writer"))
    db.execute(text("GRANT SELECT, INSERT ON TABLE saved_views TO rls_writer"))

    db.execute(text("SET LOCAL ROLE rls_writer"))
    try:
        with pytest.raises(Exception) as caught:
            db.execute(
                text(
                    "INSERT INTO saved_views (view_id, user_id, name, path, query) "
                    "VALUES (gen_random_uuid(), :user_id, 'smuggled', '/fantasy/leaders', '')"
                ),
                {"user_id": user_a.user_id},
            )
        assert "row-level security" in str(caught.value).lower()
    finally:
        db.rollback()


def test_a_non_owner_role_cannot_delete_nfl_data(db, player):
    """The half the old exemption missed.

    `anon` was never only a reader: Supabase grants it ALL on new tables in `public`,
    so before `69b660509e58` this delete would have succeeded against production and
    taken the rows with it. Rebuilding `player_stats` is a full 1999-2025 backfill.
    """
    db.execute(text("CREATE ROLE rls_deleter NOLOGIN"))
    db.execute(text("GRANT USAGE ON SCHEMA public TO rls_deleter"))
    db.execute(text("GRANT SELECT, DELETE ON TABLE players TO rls_deleter"))

    db.execute(text("SET LOCAL ROLE rls_deleter"))
    try:
        db.execute(text("DELETE FROM players"))
        db.execute(text("RESET ROLE"))
        # RLS makes the rows invisible to the delete rather than refusing it, so the
        # statement "succeeds" having matched nothing. The row is what matters.
        assert db.scalar(text("SELECT count(*) FROM players")) == 1
    finally:
        db.execute(text("RESET ROLE"))
        db.rollback()
