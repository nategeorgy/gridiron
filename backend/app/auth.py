"""Supabase JWT verification and the current-user dependencies.

Supabase Auth runs the Google OAuth dance in the browser and issues a signed access
token; this module is the only place that token becomes an identity. The frontend
uses ``supabase-js`` purely as a token issuer and never reads or writes application
data — every request still goes through FastAPI, which keeps authorization in tested
Python rather than in row-level-security policies that live in a dashboard.

Two signing schemes are supported because Supabase projects use one or the other
depending on their age:

* **Asymmetric** (current default) — ECC/RSA keys published as a JWKS document. The
  API holds only public keys and so can never mint a token.
* **Legacy HS256** — a shared project secret, used when ``SUPABASE_JWT_SECRET`` is
  set. The token header's ``alg`` selects the path, so a project can migrate from one
  to the other without a code change.

See docs/design/M5-accounts-saved-state.md §2.
"""

import logging
from datetime import datetime, timezone
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User

logger = logging.getLogger(__name__)

# Supabase stamps every end-user token with this audience.
TOKEN_AUDIENCE = "authenticated"
# Asymmetric algorithms Supabase may sign with. HS256 is handled separately: it is a
# symmetric algorithm, and accepting it against a *public* key is the classic JWT
# confusion attack, so the two key sources never share an `algorithms` list.
ASYMMETRIC_ALGORITHMS = ["ES256", "RS256"]

# Bearer scheme. auto_error=False so a missing header reaches our own handlers and
# can mean "signed out" rather than an automatic 403 with an unhelpful body.
_bearer = HTTPBearer(auto_error=False)

# PyJWKClient caches fetched keys and refreshes on an unknown `kid`, so the JWKS
# endpoint is hit roughly once per key rotation rather than once per request.
_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    """Return the process-wide JWKS client, creating it on first use."""
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(settings.supabase_jwks_url, cache_keys=True)
    return _jwks_client


def jwks_status() -> tuple[bool, str, int]:
    """Probe the configured JWKS document. Returns (reachable, detail, key_count).

    Used only by the auth health endpoint. A verification failure cannot distinguish
    "this signature is wrong" from "I could not fetch the keys to check it" —
    `PyJWKClientError` is a `PyJWTError`, so both raise into the same handler and
    produce the same 401. This makes the difference visible without weakening what a
    client learns from a rejected token.
    """
    if not settings.auth_enabled:
        return False, "accounts not configured (SUPABASE_URL unset)", 0
    try:
        keys = _get_jwks_client().get_jwk_set().keys
        if not keys:
            return False, "JWKS fetched but contains no keys", 0
        return True, "ok", len(keys)
    except Exception as exc:  # noqa: BLE001 — any failure here is a config problem
        logger.warning("JWKS probe failed for %s: %s", settings.supabase_jwks_url, exc)
        return False, f"{type(exc).__name__}: {exc}", 0


def _unauthorized(detail: str) -> HTTPException:
    """401 with the WWW-Authenticate header the Bearer scheme requires."""
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def verify_token(token: str) -> dict:
    """Verify a Supabase access token and return its claims.

    Checks signature, expiry, audience, and issuer. Raises 401 on any failure, with a
    deliberately vague detail: distinguishing "bad signature" from "expired" for the
    caller helps an attacker more than it helps a client, which only needs to know to
    re-authenticate.
    """
    if not settings.auth_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Accounts are not configured on this deployment.",
        )

    try:
        algorithm = jwt.get_unverified_header(token).get("alg")
    except jwt.PyJWTError as exc:
        raise _unauthorized("Malformed token.") from exc

    try:
        if algorithm == "HS256":
            if not settings.supabase_jwt_secret:
                # The project signs symmetrically but the API was not given the
                # secret — a deployment error, not a client error.
                logger.error("Received an HS256 token but SUPABASE_JWT_SECRET is unset")
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Accounts are misconfigured on this deployment.",
                )
            key = settings.supabase_jwt_secret
            algorithms = ["HS256"]
        else:
            key = _get_jwks_client().get_signing_key_from_jwt(token).key
            algorithms = ASYMMETRIC_ALGORITHMS

        return jwt.decode(
            token,
            key,
            algorithms=algorithms,
            audience=TOKEN_AUDIENCE,
            issuer=settings.supabase_issuer,
        )
    except jwt.PyJWTError as exc:
        raise _unauthorized("Invalid or expired token.") from exc
    except HTTPException:
        raise
    except Exception as exc:  # JWKS fetch failure, etc.
        logger.exception("Token verification failed unexpectedly")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not verify credentials right now.",
        ) from exc


def _upsert_user(db: Session, claims: dict) -> User:
    """Insert or refresh the local mirror of a verified user.

    Provisioned just-in-time: the first authenticated request from an unknown subject
    creates the row, so there is no webhook to keep in sync and no window in which a
    valid token has no row to hang data off. Profile fields are refreshed on every
    request, which is cheap and keeps a changed Google avatar or name from going
    stale.
    """
    subject = claims.get("sub")
    try:
        user_id = UUID(str(subject))
    except (TypeError, ValueError) as exc:
        raise _unauthorized("Token is missing a valid subject.") from exc

    # Supabase puts the profile under user_metadata. Its shape varies by how the
    # account was created, so fall through the plausible keys rather than assuming
    # one — and for an email sign-up, where a name is optional, there may be nothing
    # at all. The email's local part is a better last resort than a blank row.
    metadata = claims.get("user_metadata") or {}
    email = claims.get("email") or metadata.get("email")
    display_name = (
        metadata.get("full_name")
        or metadata.get("name")
        or metadata.get("user_name")
        or (email.split("@")[0] if email else None)
    )
    # Email accounts have no avatar; the UI renders an initial, which is the normal
    # case rather than a fallback.
    avatar_url = metadata.get("avatar_url") or metadata.get("picture")

    now = datetime.now(timezone.utc)
    statement = (
        insert(User)
        .values(
            user_id=user_id,
            email=email,
            display_name=display_name,
            avatar_url=avatar_url,
            created_at=now,
            last_seen_at=now,
        )
        .on_conflict_do_update(
            index_elements=[User.user_id],
            set_={
                "email": email,
                "display_name": display_name,
                "avatar_url": avatar_url,
                "last_seen_at": now,
            },
        )
        .returning(User)
    )
    user = db.scalars(statement).one()
    db.commit()
    return user


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    """Resolve the signed-in user, or raise 401.

    The user id comes from the verified token and nowhere else — no endpoint accepts a
    user id as a parameter, so there is no request shape that can read another user's
    rows.
    """
    if credentials is None or not credentials.credentials:
        raise _unauthorized("Not authenticated.")
    return _upsert_user(db, verify_token(credentials.credentials))


def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User | None:
    """Resolve the signed-in user if there is one, otherwise None.

    For endpoints that are public but richer when signed in. Signed out is a
    first-class state in this product, never an error.
    """
    if credentials is None or not credentials.credentials:
        return None
    if not settings.auth_enabled:
        return None
    return _upsert_user(db, verify_token(credentials.credentials))
