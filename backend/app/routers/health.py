"""Health-check endpoints used to verify the API, database, and auth wiring."""

import logging

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth import jwks_status
from app.config import settings
from app.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check(db: Session = Depends(get_db)) -> dict[str, str]:
    """Return API status and confirm the database connection is live."""
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "connected"}


@router.get("/health/auth")
def auth_health() -> dict:
    """Report whether token verification is correctly wired, without verifying one.

    Exists because three quite different failures — an unreachable JWKS document, a
    wrong issuer, and a genuinely bad signature — all surface to a client as the same
    401 ("Invalid or expired token"), which is right for security and useless for
    diagnosis. Misconfiguring `SUPABASE_URL` (for instance to the project's REST
    endpoint rather than the project itself) is therefore indistinguishable from a
    forged token until you can see this.

    Everything reported here is already public: the issuer and JWKS URL are derivable
    from the anon key that ships in the frontend bundle. The HS256 secret is reported
    only as a boolean — never its value.
    """
    reachable, detail, key_count = jwks_status()
    return {
        "accounts_configured": settings.auth_enabled,
        "expected_issuer": settings.supabase_issuer if settings.auth_enabled else None,
        "jwks_url": settings.supabase_jwks_url if settings.auth_enabled else None,
        "jwks_reachable": reachable,
        "jwks_keys": key_count,
        "jwks_detail": detail,
        "hs256_secret_configured": bool(settings.supabase_jwt_secret),
    }
