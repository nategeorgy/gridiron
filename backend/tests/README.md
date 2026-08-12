# Backend tests

```bash
cd backend && .venv/bin/python -m pytest
```

Needs the local Postgres running (`docker compose up -d` from the repo root). Nothing
else: no Supabase project, no network, no `.env`.

CI runs the same command on every pull request — `.github/workflows/backend-tests.yml`,
against a PostgreSQL 16 service container with the same credentials as
`docker-compose.yml`, so there is no CI-only configuration to keep in sync. Point the
suite at a different server with `TEST_DATABASE_URL`.

## What is covered

The suite starts at the auth boundary, because M5 is the first code in the project where
a bug means one user reading another user's data.

| File | What it holds |
| --- | --- |
| `test_auth.py` | Token verification: signature, expiry, issuer, audience, `alg=none`, the asymmetric (ES256/JWKS) path, algorithm confusion, and just-in-time user provisioning. |
| `test_cross_user_isolation.py` | **The file that matters most.** User B trying to read, patch, and delete user A's profiles, saved views, and favorites. |
| `test_rls.py` | The row-level-security lockdown that keeps the account tables off Supabase's PostgREST API. |
| `test_league_profiles.py` | CRUD, spec validation, the one-active-profile invariant, and successor promotion. |
| `test_saved_views.py` | CRUD and the path validation that keeps a stored URL on-site. |
| `test_favorites.py` | Idempotent add/remove, unknown players, the cap. |
| `test_account.py` | The account summary and the deletion cascade. |
| `test_health.py` | `/health` and `/health/auth`, including that the auth probe never returns the HS256 secret. |
| `test_harness.py` | Guards on the fixtures themselves — chiefly that the suite is running against the throwaway database, at the expected migration head. |

## How it works

**A throwaway database.** The suite creates `gridiron_test`, migrates it with
`alembic upgrade head`, and drops it at the end. It never touches the development
database, and never reads ingested data — fixtures seed the two players they need.

The schema comes from the real migrations rather than `Base.metadata.create_all`, and
that is not a stylistic preference. Some of what is under test exists **only** in a
migration: `8f73b5b2b1a1` enables row-level security on the account tables and adds no
table and no column, so a metadata-built schema would omit it while every request-level
test in this suite still passed. The partial unique index `uq_profile_one_active` and the
`ON DELETE CASCADE` foreign keys are the same argument in milder form. **Do not swap this
for `create_all()` to make the suite faster.**

**One transaction per test.** Each test runs inside an outer transaction that is rolled
back at the end. The session joins it in `create_savepoint` mode, so the `db.commit()`
calls inside the route handlers behave exactly as in production while still leaving no
trace. There is no truncate step between tests.

**Two ways to authenticate.**

- `tests/helpers.py::token_for` mints genuine HS256 tokens and exercises the real
  `get_current_user`. `test_auth.py` overrides nothing — the thing under test *is*
  `app.auth`.
- `client_a` / `client_b` override `get_current_user` and are used everywhere else, so a
  test about router behaviour ("does user B get a 404?") does not restate token plumbing.

The override resolves the user through `Depends(get_db)`, not from a session held by the
fixture. The handler's session must own the instance it is handed, or `db.delete(user)`
in `DELETE /me` raises `InvalidRequestError`. Identity travels on the request as a fake
bearer credential, which is what lets `client_a` and `client_b` be used in the same test.

**The suite never touches the network**, enforced rather than intended: an autouse
fixture installs a JWKS client that fails the way an unreachable endpoint would. Tests
needing a working JWKS (the ES256 path) stub their own over it. Before that fixture
existed, two health tests were making real DNS lookups for `testproj.supabase.co` and
passing because the lookup failed *fast*.

## Two traps worth knowing

**`now()` is transaction time.** `created_at` / `updated_at` default to Postgres `now()`,
which is constant for a whole transaction — and a test *is* one transaction. Every row a
test writes gets an identical timestamp, so an ordering assertion left to the defaults is
a tie-break coin flip dressed up as a test. Stamp the rows explicitly instead; see
`test_list_is_most_recently_updated_first`.

**Passing is not the same as testing.** Three tests here originally passed for the wrong
reason: a path rejection actually caught by a different rule, an `alg=none` token PyJWT
refused before our allow-list was consulted, and the two network-dependent health tests
above. All were found by breaking the app on purpose — 25 deliberate mutations, checking
each turned the suite red. Do that to any security assertion added here before trusting
it; a green test you have never seen fail is a guess.

## Adding a test

Endpoint behaviour goes in the file for that resource, using `client_a`. Anything about
tokens or provisioning goes in `test_auth.py` with a real token. If a test needs a
player, ask for the `player` or `other_player` fixture rather than querying for one —
the test database is empty by design.
