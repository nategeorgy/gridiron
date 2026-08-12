"""Test constants and token minting.

Deliberately imports nothing from ``app``. ``conftest.py`` reads the constants here to
build the environment *before* the first ``import app``, and an app import in this
module would defeat that ordering — ``app.config.settings`` and ``app.database.engine``
are both built at import time from the environment as it stands then.
"""

import base64
import hashlib
import hmac
import json
import os
import uuid
from datetime import datetime, timedelta, timezone

import jwt

TEST_DB_NAME = "gridiron_test"

# Matches the credentials in docker-compose.yml. Override to point the suite at a
# different Postgres (e.g. in CI) with TEST_DATABASE_URL.
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    f"postgresql://gridiron:gridiron@localhost:5432/{TEST_DB_NAME}",
)

# A fake project. Nothing in the suite reaches the network: the HS256 path verifies
# against the secret below, and the asymmetric path's JWKS client is stubbed rather
# than fetched.
TEST_SUPABASE_URL = "https://testproj.supabase.co"
TEST_ISSUER = f"{TEST_SUPABASE_URL}/auth/v1"
TEST_JWT_SECRET = "test-jwt-secret-not-a-real-one"

# Supabase stamps end-user tokens with this audience. Spelled out rather than imported
# from app.auth so that changing the constant in the app makes a test fail instead of
# quietly changing what the tests assert.
TEST_AUDIENCE = "authenticated"


def token_for(
    user_id: uuid.UUID | str,
    *,
    email: str | None = "fan@example.com",
    display_name: str | None = "Test Fan",
    avatar_url: str | None = None,
    # A str for HS256, or a private key object for the asymmetric algorithms.
    secret: object = TEST_JWT_SECRET,
    issuer: str = TEST_ISSUER,
    audience: str = TEST_AUDIENCE,
    expires_in: timedelta = timedelta(hours=1),
    algorithm: str = "HS256",
) -> str:
    """Mint a Supabase-shaped access token.

    The defaults produce a token the API should accept; every keyword exists so that a
    test can make exactly one thing wrong and assert that this alone is enough to be
    rejected.
    """
    now = datetime.now(timezone.utc)
    claims: dict = {
        "sub": str(user_id),
        "aud": audience,
        "iss": issuer,
        "iat": now,
        "exp": now + expires_in,
        "role": "authenticated",
        "email": email,
        # Supabase nests the OAuth profile here; app.auth reads name and avatar from it.
        "user_metadata": {
            "full_name": display_name,
            "email": email,
            "avatar_url": avatar_url,
        },
    }
    return jwt.encode(claims, secret, algorithm=algorithm)


def auth_header(token: str) -> dict[str, str]:
    """The Authorization header carrying a bearer token."""
    return {"Authorization": f"Bearer {token}"}


def _b64url(raw: bytes) -> str:
    """base64url without padding, as JWT requires."""
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def forge_hs256(secret: str, user_id: uuid.UUID | str, **claim_overrides) -> str:
    """Hand-roll an HS256 token, bypassing PyJWT's guard rails.

    ``jwt.encode`` refuses to use a PEM public key as an HMAC secret, which is the very
    thing an algorithm-confusion attacker does. An attacker is not calling PyJWT, so
    neither does this: header, payload, and HMAC are assembled directly.
    """
    now = datetime.now(timezone.utc)
    claims = {
        "sub": str(user_id),
        "aud": TEST_AUDIENCE,
        "iss": TEST_ISSUER,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=1)).timestamp()),
        **claim_overrides,
    }
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = _b64url(json.dumps(claims).encode())
    signing_input = f"{header}.{payload}".encode()
    signature = _b64url(hmac.new(secret.encode(), signing_input, hashlib.sha256).digest())
    return f"{header}.{payload}.{signature}"
