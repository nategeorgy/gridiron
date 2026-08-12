"""Row-level security on the account tables (migration ``8f73b5b2b1a1``).

The bug this guards against was not in any Python: the account tables live in the
`public` schema, and on Supabase that schema is automatically served by PostgREST at
`/rest/v1/` to anyone holding the **anon key** — which is public by design and ships
inside the JavaScript bundle. Every guarantee in `routers/account.py` is about *our*
API, and Supabase was quietly running a second one over the same tables.

So this is the one part of the boundary that no request-level test can reach. It is a
property of the schema, which is also why the suite migrates its database rather than
building it from model metadata: `Base.metadata.create_all()` would produce tables that
look right to every other test in this suite and are missing this layer entirely.

The tests assert the *mechanism*, not just the flag — a role that is not the owner must
actually come up empty.
"""

import pytest
from sqlalchemy import text

# The tables holding user data, per the migration.
ACCOUNT_TABLES = ("users", "league_profiles", "favorites", "saved_views")
# NFL reference data. Public, read-only, and deliberately left alone: locking these
# would be pure cost, and it is worth pinning that the migration is that targeted.
REFERENCE_TABLES = ("players", "teams", "games", "player_stats")


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


@pytest.mark.parametrize("table", ACCOUNT_TABLES)
def test_account_tables_have_row_level_security_enabled(db, table):
    enabled, _ = _relation_flags(db, table)

    assert enabled, f"{table} is exposed: RLS is not enabled"


@pytest.mark.parametrize("table", REFERENCE_TABLES)
def test_reference_tables_are_left_alone(db, table):
    """NFL data is public read-only reference data — locking it would be pure cost."""
    enabled, _ = _relation_flags(db, table)

    assert not enabled, f"{table} is NFL reference data and should not be under RLS"


@pytest.mark.parametrize("table", ACCOUNT_TABLES)
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


@pytest.mark.parametrize("table", ACCOUNT_TABLES)
def test_force_row_level_security_is_off(db, table):
    """Which is *why* the API still works.

    Postgres exempts a table's owner from RLS unless FORCE is set, and the backend
    connects as the owner. Turning FORCE on would lock out the application itself —
    every account endpoint would start returning empty. Pinned so that a future
    "tighten the RLS settings" change has to notice.
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

    db.execute(text("CREATE ROLE rls_probe NOLOGIN"))
    db.execute(text("GRANT USAGE ON SCHEMA public TO rls_probe"))
    for table in ACCOUNT_TABLES:
        db.execute(text(f"GRANT SELECT ON TABLE {table} TO rls_probe"))

    db.execute(text("SET LOCAL ROLE rls_probe"))
    try:
        assert db.scalar(text("SELECT count(*) FROM users")) == 0
        assert db.scalar(text("SELECT count(*) FROM favorites")) == 0
        assert db.scalar(text("SELECT count(*) FROM league_profiles")) == 0
        assert db.scalar(text("SELECT count(*) FROM saved_views")) == 0
    finally:
        db.execute(text("RESET ROLE"))

    # And the same role can still read public NFL data, which is the point of the split.
    assert db.scalar(text("SELECT count(*) FROM players")) == 1


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
