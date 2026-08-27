"""Shared test fixtures: a throwaway database, a rolled-back session, and identities.

Three decisions shape everything in this file.

**A throwaway database, built by the real migrations.** The suite creates and drops its
own ``gridiron_test`` database rather than borrowing the development one, so a test can
never damage ingested data and never depends on it either — the fixtures seed the two
players they need. The schema comes from ``alembic upgrade head``, not
``Base.metadata.create_all``: the properties under test include the partial unique index
``uq_profile_one_active`` and the ``ON DELETE CASCADE`` foreign keys, and those should be
the ones production actually runs, not a second definition that could silently drift.

**One transaction per test, rolled back.** Each test runs inside an outer transaction on
a single connection; the session joins it in ``create_savepoint`` mode, so the
``db.commit()`` calls inside the route handlers are real commits *to a savepoint* and the
outer rollback still wipes them. Tests therefore see committed-transaction semantics
without a truncate step between them.

**Two ways to authenticate, each with a job.** ``tests.helpers.token_for`` mints genuine
HS256 tokens and exercises the real ``get_current_user`` — that is the point of
``test_auth.py``, and nothing there is overridden. Everything else uses ``client_a`` /
``client_b``, which override ``get_current_user`` so that a test about *router* behaviour
(does user B get a 404?) does not restate token plumbing, and so the endpoint suite keeps
working if the project ever drops symmetric signing. See ``tests/README.md``.
"""

import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from tests.helpers import (
    TEST_DATABASE_URL,
    TEST_DB_NAME,
    TEST_JWT_SECRET,
    TEST_SUPABASE_URL,
    auth_header,
)

# --- Environment, before anything imports the app ----------------------------
# `app.config.settings` is a module-level singleton built at import time, and
# `app.database.engine` is created from it at import time too. Both read the process
# environment, so the test values have to be in place before the first `import app`
# below. Environment variables outrank backend/.env in pydantic-settings' precedence
# order, so a developer's real Supabase credentials cannot leak into a test run — and,
# more to the point, DATABASE_URL here is what keeps the suite off the development
# database.

os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["SUPABASE_URL"] = TEST_SUPABASE_URL
os.environ["SUPABASE_JWT_SECRET"] = TEST_JWT_SECRET
os.environ["ENVIRONMENT"] = "test"

import pytest  # noqa: E402
from fastapi import Depends, HTTPException  # noqa: E402
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from jwt.exceptions import PyJWKClientError  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402

from app.auth import get_current_user, get_optional_user  # noqa: E402
from app.config import settings  # noqa: E402
from app.database import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Player, Team, User  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parent.parent


# --- Database ----------------------------------------------------------------


@pytest.fixture(scope="session")
def _test_database() -> None:
    """Create ``gridiron_test`` fresh, migrate it, and drop it when the run ends.

    Dropping first as well as last means a suite killed mid-run (Ctrl-C, a crash) does
    not poison the next one with a half-migrated database.
    """
    admin_url = TEST_DATABASE_URL.rsplit("/", 1)[0] + "/postgres"
    admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")

    def drop_database() -> None:
        with admin_engine.connect() as connection:
            # Sessions left over from a previous run would block the DROP.
            connection.execute(
                text(
                    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                    "WHERE datname = :name AND pid <> pg_backend_pid()"
                ),
                {"name": TEST_DB_NAME},
            )
            connection.execute(text(f'DROP DATABASE IF EXISTS "{TEST_DB_NAME}"'))

    try:
        drop_database()
        with admin_engine.connect() as connection:
            connection.execute(text(f'CREATE DATABASE "{TEST_DB_NAME}"'))
    except Exception as exc:  # pragma: no cover - environment problem, not a test failure
        pytest.exit(
            f"Could not create the {TEST_DB_NAME} database at {admin_url}: {exc}\n"
            "Is the local Postgres running? `docker compose up -d` from the repo root.",
            returncode=1,
        )

    # Run the real migration chain. alembic/env.py reads app.config.settings, which is
    # already pointed at the test database by the environment set at the top of this file.
    from alembic import command
    from alembic.config import Config

    alembic_config = Config(str(BACKEND_DIR / "alembic.ini"))
    alembic_config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    command.upgrade(alembic_config, "head")

    yield

    from app.database import engine as app_engine

    app_engine.dispose()
    drop_database()
    admin_engine.dispose()


@pytest.fixture(scope="session")
def _engine(_test_database: None):
    """A session-scoped engine bound to the migrated test database."""
    engine = create_engine(TEST_DATABASE_URL)
    yield engine
    engine.dispose()


@pytest.fixture
def db(_engine) -> Session:
    """A session whose writes are discarded when the test ends.

    The outer transaction on ``connection`` is never committed. ``join_transaction_mode
    ="create_savepoint"`` means a ``commit()`` inside a route handler releases a
    savepoint instead of ending that outer transaction, so handlers behave exactly as
    they do in production while the test still leaves no trace.
    """
    connection = _engine.connect()
    transaction = connection.begin()
    TestSession = sessionmaker(
        bind=connection,
        join_transaction_mode="create_savepoint",
        autocommit=False,
        autoflush=False,
    )
    session = TestSession()

    yield session

    session.close()
    transaction.rollback()
    connection.close()


# --- Seed data ---------------------------------------------------------------


@pytest.fixture
def team(db: Session) -> Team:
    """One team, so a favorited player has an abbreviation to render."""
    team = Team(name="Kansas City Chiefs", abbreviation="KC", conference="AFC", division="AFC West")
    db.add(team)
    db.flush()
    return team


@pytest.fixture
def player(db: Session, team: Team) -> Player:
    """A player who can be favorited (favorites.player_id is a real foreign key)."""
    player = Player(
        player_id="00-0033873",
        name="Patrick Mahomes",
        position="QB",
        team_id=team.team_id,
        jersey_number=15,
        status="ACT",
    )
    db.add(player)
    db.flush()
    return player


@pytest.fixture
def other_player(db: Session, team: Team) -> Player:
    """A second player, for tests that need two watchlist entries."""
    player = Player(
        player_id="00-0036322",
        name="Justin Jefferson",
        position="WR",
        team_id=team.team_id,
        jersey_number=18,
        status="ACT",
    )
    db.add(player)
    db.flush()
    return player


# --- Identities --------------------------------------------------------------


def _make_user(db: Session, email: str, display_name: str) -> User:
    """Insert a user row directly, standing in for a prior authenticated request."""
    user = User(
        user_id=uuid.uuid4(),
        email=email,
        display_name=display_name,
        avatar_url=None,
        created_at=datetime.now(timezone.utc),
        last_seen_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.flush()
    return user


@pytest.fixture
def user_a(db: Session) -> User:
    """The user whose data every isolation test tries to reach."""
    return _make_user(db, "a@example.com", "User A")


@pytest.fixture
def user_b(db: Session) -> User:
    """The attacker's seat: a second, unrelated signed-in user."""
    return _make_user(db, "b@example.com", "User B")


# --- Clients -----------------------------------------------------------------


@pytest.fixture
def client(db: Session) -> TestClient:
    """An unauthenticated client wired to the rolled-back session.

    Only ``get_db`` is overridden, so requests here hit the real ``get_current_user``
    and the real token verification.
    """

    def override_get_db():
        # Deliberately no close(): the session outlives the request and belongs to the
        # `db` fixture, which closes it and rolls back the outer transaction.
        yield db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


# The stand-in for a verified token: each client sends its user id as the bearer
# credential, and the override below trades it for that user's row. Identity therefore
# travels with the *request*, which is what lets client_a and client_b be used in the
# same test — an override that closed over a single User would be overwritten by
# whichever client was constructed second, and both clients would silently become the
# same person, quietly turning every isolation test green.
_fake_bearer = HTTPBearer(auto_error=False)


def _override_get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_fake_bearer),
    session: Session = Depends(get_db),
) -> User:
    """Resolve the signed-in user from a test credential, skipping token verification.

    ``session`` comes from ``Depends(get_db)`` rather than from a session held by the
    fixture. The handler's session must be the one that owns the instance it is handed,
    or ``db.delete(user)`` in ``DELETE /me`` raises ``InvalidRequestError`` — the
    instance "is not persisted in this Session". Going through the dependency keeps that
    true however the session fixtures are rearranged later.
    """
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = session.get(User, uuid.UUID(credentials.credentials))
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    return user


def _override_get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_fake_bearer),
    session: Session = Depends(get_db),
) -> User | None:
    """The same trade for endpoints that are public but richer when signed in.

    Signed out is a valid answer here rather than a 401 — which is the whole point of
    `get_optional_user`, and why it needs its own override: a board listing must work
    for an anonymous caller and additionally show that caller's own boards when there
    is one.
    """
    if credentials is None or not credentials.credentials:
        return None
    return session.get(User, uuid.UUID(credentials.credentials))


def _client_as(db: Session, user: User) -> TestClient:
    """A client that authenticates as ``user`` on every request."""

    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = _override_get_current_user
    app.dependency_overrides[get_optional_user] = _override_get_optional_user
    return TestClient(app, headers=auth_header(str(user.user_id)))


@pytest.fixture
def client_a(db: Session, user_a: User) -> TestClient:
    """Signed in as user A — the owner of the data in the isolation tests."""
    with _client_as(db, user_a) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def client_b(db: Session, user_b: User) -> TestClient:
    """Signed in as user B — the one who must never see user A's rows."""
    with _client_as(db, user_b) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def _offline_jwks(monkeypatch):
    """Keep the suite off the network, by construction rather than by convention.

    ``https://testproj.supabase.co`` does not exist, so any code path reaching the JWKS
    client makes a real DNS lookup and HTTP attempt. Today that fails in milliseconds and
    produces the right answer for the wrong reason; on a slow resolver, a captive portal,
    or a machine whose DNS returns a wildcard, it is a hang or a flake.

    This installs a client that fails the way an unreachable endpoint would. Tests that
    need a *working* JWKS (the ES256 path in ``test_auth.py``) monkeypatch their own stub
    over this one.
    """

    class _OfflineJWKSClient:
        def get_signing_key_from_jwt(self, token):  # noqa: ARG002
            raise PyJWKClientError("JWKS unavailable (tests never reach the network)")

        def get_jwk_set(self):
            raise PyJWKClientError("JWKS unavailable (tests never reach the network)")

    monkeypatch.setattr("app.auth._jwks_client", _OfflineJWKSClient())


@pytest.fixture(autouse=True)
def _reset_settings():
    """Restore the auth settings after any test that monkeypatches them.

    ``settings`` is a process-wide singleton, so a test that blanks ``supabase_url`` to
    check the accounts-disabled path would otherwise disable auth for every test that
    follows it in the same run.
    """
    saved = (settings.supabase_url, settings.supabase_jwt_secret)
    yield
    settings.supabase_url, settings.supabase_jwt_secret = saved
