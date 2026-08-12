"""The health endpoints, including the auth-wiring probe.

``GET /health/auth`` exists because a rejected token is deliberately opaque: an
unreachable JWKS, a wrong issuer, and a genuinely forged signature all return the same
401. That is right for security and useless for diagnosis, so the probe reports the
configuration instead.

Which makes it the one endpoint whose whole job is to *disclose* configuration — so the
tests here are mostly about where that stops. It is unauthenticated, so anything it
returns is public.
"""

from app.config import settings
from tests.helpers import TEST_ISSUER, TEST_JWT_SECRET, TEST_SUPABASE_URL

HEALTH = "/api/v1/health"
AUTH_HEALTH = "/api/v1/health/auth"


def test_health_reports_the_database_is_connected(client):
    response = client.get(HEALTH)

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "connected"}


def test_auth_health_reports_the_configured_issuer(client):
    """The value most likely to be wrong, and the hardest to see from a 401."""
    body = client.get(AUTH_HEALTH).json()

    assert body["accounts_configured"] is True
    assert body["expected_issuer"] == TEST_ISSUER
    assert body["jwks_url"] == f"{TEST_SUPABASE_URL}/auth/v1/.well-known/jwks.json"


def test_auth_health_never_returns_the_hs256_secret(client):
    """The one hard line: the secret is reported as a boolean, never as a value.

    This endpoint needs no credentials, so leaking the signing secret here would hand
    anyone the ability to mint tokens for any user.
    """
    response = client.get(AUTH_HEALTH)

    assert response.json()["hs256_secret_configured"] is True
    assert TEST_JWT_SECRET not in response.text


def test_auth_health_reports_an_unreachable_jwks_rather_than_failing(client, monkeypatch):
    """A broken JWKS is the condition being diagnosed — it must not break the probe.

    The stub raises the way an unreachable endpoint would; the response should still be
    a 200 describing the problem.
    """

    class _BrokenJWKSClient:
        def get_jwk_set(self):
            raise ConnectionError("nope")

    monkeypatch.setattr("app.auth._jwks_client", _BrokenJWKSClient())

    response = client.get(AUTH_HEALTH)

    assert response.status_code == 200
    body = response.json()
    assert body["jwks_reachable"] is False
    assert body["jwks_keys"] == 0
    assert "ConnectionError" in body["jwks_detail"]


def test_auth_health_on_an_unconfigured_deployment(client, monkeypatch):
    """Accounts off is a supported state, not an error — it must not 500."""
    monkeypatch.setattr(settings, "supabase_url", "")

    response = client.get(AUTH_HEALTH)

    assert response.status_code == 200
    body = response.json()
    assert body["accounts_configured"] is False
    assert body["expected_issuer"] is None
    assert body["jwks_url"] is None
    assert body["jwks_reachable"] is False


def test_auth_health_does_not_reach_the_network_when_accounts_are_off(client, monkeypatch):
    """Short-circuits before the probe, so an unconfigured deployment stays fast."""
    called = False

    class _ShouldNotBeCalled:
        def get_jwk_set(self):
            nonlocal called
            called = True
            raise AssertionError("probed the JWKS with accounts disabled")

    monkeypatch.setattr(settings, "supabase_url", "")
    monkeypatch.setattr("app.auth._jwks_client", _ShouldNotBeCalled())

    client.get(AUTH_HEALTH)

    assert called is False
