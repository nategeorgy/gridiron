"""Guards on the test harness itself.

These assert the things every other test quietly assumes. If one of them fails, the rest
of the suite is not testing what it claims to be — most importantly, that it is running
against a throwaway database rather than the developer's.
"""

from sqlalchemy import inspect, text

from app.models import Favorite, LeagueProfile, SavedView, User
from tests.helpers import TEST_DB_NAME

# The current migration head. Bump this when a later migration lands, which is the
# point: it is a reminder that the test schema is the *migrated* schema and not a second
# definition. It has already earned its keep once — it is what caught `8f73b5b2b1a1`
# (the RLS lockdown) arriving, a migration that adds no tables and no columns and so
# would have been invisible to any other assertion here.
EXPECTED_HEAD = "0fd5c30c9287"


def test_the_suite_runs_against_the_throwaway_database(db):
    """The one that matters. Never the development database."""
    assert db.scalar(text("SELECT current_database()")) == TEST_DB_NAME


def test_the_schema_came_from_the_migrations(db):
    """Not from ``Base.metadata.create_all``.

    The partial unique index and the cascading foreign keys the account tests rely on
    should be the ones production runs, not a parallel definition that can drift.
    """
    assert db.scalar(text("SELECT version_num FROM alembic_version")) == EXPECTED_HEAD

    tables = set(inspect(db.get_bind()).get_table_names())
    assert {"teams", "players", "games", "player_stats", "player_target_depth"} <= tables
    assert {"users", "league_profiles", "favorites", "saved_views"} <= tables

    indexes = db.scalars(
        text("SELECT indexname FROM pg_indexes WHERE tablename = 'league_profiles'")
    ).all()
    assert "uq_profile_one_active" in indexes


def test_each_test_starts_with_an_empty_database(db):
    """Every test is wrapped in a transaction that is rolled back, so nothing carries.

    This runs alphabetically after the account and profile tests, which write plenty of
    rows; seeing zero here is what proves the rollback works.
    """
    for model in (User, LeagueProfile, Favorite, SavedView):
        assert db.query(model).count() == 0


def test_seed_fixtures_are_visible_to_the_app(client_a, player, team):
    """Fixture rows are flushed, not committed — the request still sees them.

    Both the fixture and the request share one session, which is what makes a
    `db.flush()` enough and keeps the rollback total.
    """
    response = client_a.put(f"/api/v1/me/favorites/{player.player_id}")

    assert response.status_code == 204
    assert client_a.get("/api/v1/me/favorites").json()[0]["player"]["team_abbreviation"] == "KC"
