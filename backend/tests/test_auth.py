"""Token verification and just-in-time provisioning — the real ``get_current_user``.

Nothing in this module overrides authentication. Requests carry genuine HS256 tokens
signed with the test secret and go through ``app.auth`` exactly as a browser's would,
because the thing being tested *is* ``app.auth``.

The shape of most tests here is the same: take the token that works, make exactly one
thing wrong with it, and assert that one flaw is enough to be turned away. A test that
changed two things at once would still pass if either check were deleted.
"""

import uuid
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from sqlalchemy import select

from app.models import User
from tests.helpers import TEST_ISSUER, auth_header, forge_hs256, token_for

ME = "/api/v1/me"


@pytest.fixture
def user_id() -> uuid.UUID:
    """The subject claim for a user who does not exist in the database yet."""
    return uuid.uuid4()


# --- The token that should work ----------------------------------------------


def test_valid_token_is_accepted(client, user_id):
    response = client.get(ME, headers=auth_header(token_for(user_id)))

    assert response.status_code == 200, response.text
    assert response.json()["user"]["user_id"] == str(user_id)


# --- Tokens that must not work -----------------------------------------------


def test_tampered_signature_is_rejected(client, user_id, db):
    header, payload, signature = token_for(user_id).split(".")
    # Flip one character of the signature, keeping it valid base64url.
    flipped = ("B" if signature[0] != "B" else "C") + signature[1:]

    response = client.get(ME, headers=auth_header(f"{header}.{payload}.{flipped}"))

    assert response.status_code == 401
    # A rejected token must not leave a provisioned user behind.
    assert db.scalar(select(User).where(User.user_id == user_id)) is None


def test_token_signed_with_the_wrong_secret_is_rejected(client, user_id):
    token = token_for(user_id, secret="not-the-projects-secret")

    assert client.get(ME, headers=auth_header(token)).status_code == 401


def test_tampered_payload_is_rejected(client, user_id):
    """Re-signing the claims is the only way to change them; editing them is not.

    The interesting case is not a corrupted token but a *coherent* one whose subject has
    been swapped for someone else's — the whole reason the signature is checked.
    """
    victim = uuid.uuid4()
    header, _, signature = token_for(user_id).split(".")
    forged_payload = token_for(victim).split(".")[1]

    response = client.get(ME, headers=auth_header(f"{header}.{forged_payload}.{signature}"))

    assert response.status_code == 401


def test_expired_token_is_rejected(client, user_id):
    token = token_for(user_id, expires_in=timedelta(minutes=-5))

    assert client.get(ME, headers=auth_header(token)).status_code == 401


def test_token_from_another_supabase_project_is_rejected(client, user_id):
    """A correctly-signed token for a different issuer is still not ours."""
    token = token_for(user_id, issuer="https://someone-elses.supabase.co/auth/v1")

    assert client.get(ME, headers=auth_header(token)).status_code == 401


def test_token_with_the_wrong_audience_is_rejected(client, user_id):
    """Supabase also mints non-`authenticated` tokens; only end-user ones get in."""
    token = token_for(user_id, audience="anon")

    assert client.get(ME, headers=auth_header(token)).status_code == 401


def test_alg_none_is_rejected_even_when_a_key_is_available(client, user_id, monkeypatch):
    """An unsigned token must not authenticate anyone.

    The stub returns an **empty** key, which is what PyJWT requires for ``alg=none`` —
    so if "none" were ever added to the allow-list this token would sail through, and the
    only thing rejecting it is the allow-list itself. (A stub returning a non-empty key
    would make this test pass no matter what the allow-list said: PyJWT refuses
    ``alg=none`` with a non-empty key on its own, which would prove nothing about our
    code.) This is the guarantee behind app.auth's rule that the symmetric and asymmetric
    paths never share an ``algorithms`` list. Stubbing also keeps the suite offline: the
    real path here would fetch the project's JWKS document.
    """

    class _StubJWKSClient:
        def get_signing_key_from_jwt(self, token):  # noqa: ARG002
            return type("_Key", (), {"key": ""})()

    monkeypatch.setattr("app.auth._jwks_client", _StubJWKSClient())

    now = datetime.now(timezone.utc)
    unsigned = jwt.encode(
        {
            "sub": str(user_id),
            "aud": "authenticated",
            "iss": TEST_ISSUER,
            "iat": now,
            "exp": now + timedelta(hours=1),
        },
        key=None,
        algorithm="none",
    )

    assert client.get(ME, headers=auth_header(unsigned)).status_code == 401


# --- The asymmetric path -----------------------------------------------------
# What current Supabase projects actually use: the API holds only public keys, fetched
# from the project's JWKS document, and so cannot mint a token even in principle. The
# JWKS client is stubbed throughout — these tests are about key *handling*, not about
# HTTP.


@pytest.fixture
def signing_keypair():
    """An EC keypair standing in for the project's signing key.

    Returns the private key (what Supabase would sign with) and the public key in the
    PEM form a JWKS document would publish.
    """
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    private_key = ec.generate_private_key(ec.SECP256R1())
    public_pem = (
        private_key.public_key()
        .public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode()
    )
    return private_key, public_pem


@pytest.fixture
def published_public_key(signing_keypair, monkeypatch):
    """Serve the keypair's public key as though it came from the project's JWKS."""
    private_key, _ = signing_keypair

    class _StubJWKSClient:
        def get_signing_key_from_jwt(self, token):  # noqa: ARG002
            return type("_Key", (), {"key": private_key.public_key()})()

    monkeypatch.setattr("app.auth._jwks_client", _StubJWKSClient())


def test_an_es256_token_is_accepted(client, user_id, signing_keypair, published_public_key):
    """The asymmetric branch works — the positive control for the two tests below."""
    private_key, _ = signing_keypair
    token = token_for(user_id, secret=private_key, algorithm="ES256")

    response = client.get(ME, headers=auth_header(token))

    assert response.status_code == 200
    assert response.json()["user"]["user_id"] == str(user_id)


def test_an_es256_token_from_the_wrong_key_is_rejected(client, user_id, published_public_key):
    """Signed with a key the project never published."""
    from cryptography.hazmat.primitives.asymmetric import ec

    attacker_key = ec.generate_private_key(ec.SECP256R1())
    token = token_for(user_id, secret=attacker_key, algorithm="ES256")

    assert client.get(ME, headers=auth_header(token)).status_code == 401


def test_the_public_key_cannot_be_used_as_an_hmac_secret(
    client, user_id, signing_keypair, published_public_key
):
    """The algorithm-confusion attack, which is why the two key sources stay separate.

    A verifier that took its key from the JWKS but allowed HS256 alongside the asymmetric
    algorithms could be handed a token the attacker signed with the *public* key — which
    is, by definition, public — and would happily verify it against that same key.

    Two independent things stop it here, and the test pins the outcome rather than the
    mechanism: app.auth routes on the ``alg`` header so HS256 is only ever checked
    against the project secret, and PyJWT separately refuses to treat a PEM as an HMAC
    secret. The forging is done by hand because PyJWT's refusal also applies to
    ``encode`` — an attacker would not be using it.
    """
    _, public_pem = signing_keypair
    forged = forge_hs256(public_pem, user_id)

    assert client.get(ME, headers=auth_header(forged)).status_code == 401


# --- Missing and malformed credentials ---------------------------------------


def test_missing_authorization_header_is_rejected(client):
    assert client.get(ME).status_code == 401


@pytest.mark.parametrize(
    "credential",
    ["", "not-a-jwt", "a.b.c", "eyJhbGciOiJIUzI1NiJ9"],
    ids=["empty", "garbage", "three-fake-segments", "header-only"],
)
def test_malformed_credentials_are_rejected(client, credential):
    assert client.get(ME, headers=auth_header(credential)).status_code == 401


def test_token_without_a_uuid_subject_is_rejected(client):
    """The subject becomes a primary key, so a non-UUID `sub` is not an identity."""
    token = token_for("definitely-not-a-uuid")

    assert client.get(ME, headers=auth_header(token)).status_code == 401


def test_rejection_does_not_say_why(client, user_id):
    """Expired and forged tokens are indistinguishable to the caller.

    A client only ever needs to know to re-authenticate; telling an attacker *which*
    check failed helps only them.
    """
    expired = client.get(
        ME, headers=auth_header(token_for(user_id, expires_in=timedelta(minutes=-5)))
    )
    forged = client.get(ME, headers=auth_header(token_for(user_id, secret="wrong")))

    assert expired.json() == forged.json()


# --- Deployment states -------------------------------------------------------


def test_accounts_disabled_returns_503_not_401(client, user_id, monkeypatch):
    """An unconfigured deployment must not look like a rejected login."""
    monkeypatch.setattr("app.config.settings.supabase_url", "")

    response = client.get(ME, headers=auth_header(token_for(user_id)))

    assert response.status_code == 503


def test_hs256_token_without_a_configured_secret_returns_503(client, user_id, monkeypatch):
    """A project signing symmetrically with no secret set is a deployment error.

    Answering 401 here would send a user to re-authenticate forever over a missing
    environment variable.
    """
    monkeypatch.setattr("app.config.settings.supabase_jwt_secret", "")

    response = client.get(ME, headers=auth_header(token_for(user_id)))

    assert response.status_code == 503


# --- Just-in-time provisioning -----------------------------------------------


def test_first_request_provisions_the_user(client, user_id, db):
    """There is no signup step: presenting a valid token creates the row."""
    assert db.scalar(select(User).where(User.user_id == user_id)) is None

    response = client.get(
        ME,
        headers=auth_header(
            token_for(user_id, email="new@example.com", display_name="New Fan")
        ),
    )

    assert response.status_code == 200
    user = db.scalar(select(User).where(User.user_id == user_id))
    assert user is not None
    assert user.email == "new@example.com"
    assert user.display_name == "New Fan"


def test_later_requests_refresh_profile_fields(client, user_id, db):
    """A changed Google name or avatar propagates on the next request."""
    client.get(
        ME,
        headers=auth_header(
            token_for(
                user_id,
                email="old@example.com",
                display_name="Old Name",
                avatar_url="https://example.com/old.png",
            )
        ),
    )

    client.get(
        ME,
        headers=auth_header(
            token_for(
                user_id,
                email="new@example.com",
                display_name="New Name",
                avatar_url="https://example.com/new.png",
            )
        ),
    )

    db.expire_all()
    user = db.scalar(select(User).where(User.user_id == user_id))
    assert (user.email, user.display_name) == ("new@example.com", "New Name")
    assert user.avatar_url == "https://example.com/new.png"


def test_provisioning_is_idempotent(client, user_id, db):
    """Repeat sign-ins update one row rather than accumulating rows or resetting it."""
    first = client.get(ME, headers=auth_header(token_for(user_id)))
    created_at = first.json()["user"]["created_at"]

    for _ in range(3):
        client.get(ME, headers=auth_header(token_for(user_id)))

    assert db.scalar(select(User).where(User.user_id == user_id)) is not None
    assert (
        db.query(User).filter(User.user_id == user_id).count() == 1
    )
    # Re-provisioning must not look like a brand-new account.
    latest = client.get(ME, headers=auth_header(token_for(user_id)))
    assert latest.json()["user"]["created_at"] == created_at


def test_display_name_falls_back_to_the_email_local_part(client, user_id, db):
    """Email sign-up makes a name optional, so there is often nothing to mirror.

    The token still carries an email, and its local part is a better last resort than a
    blank row — the account menu has to render *something*.
    """
    token = token_for(user_id, email="marcus@example.com", display_name=None)

    response = client.get(ME, headers=auth_header(token))

    assert response.status_code == 200
    assert response.json()["user"]["display_name"] == "marcus"


def test_a_real_name_still_wins_over_the_email_local_part(client, user_id):
    """The fallback is a fallback, not a replacement."""
    token = token_for(user_id, email="marcus@example.com", display_name="Marcus Allen")

    assert client.get(ME, headers=auth_header(token)).json()["user"]["display_name"] == "Marcus Allen"


def test_a_user_with_no_name_and_no_email_is_still_provisioned(client, user_id, db):
    """An identity is the `sub` claim; everything else is decoration.

    Sign-in must not depend on optional profile fields being present.
    """
    token = token_for(user_id, email=None, display_name=None)

    response = client.get(ME, headers=auth_header(token))

    assert response.status_code == 200
    assert response.json()["user"]["display_name"] is None
    assert db.scalar(select(User).where(User.user_id == user_id)) is not None


def test_two_tokens_provision_two_users(client, db):
    """Nothing about provisioning collapses distinct subjects into one row."""
    first, second = uuid.uuid4(), uuid.uuid4()

    client.get(ME, headers=auth_header(token_for(first, email="one@example.com")))
    client.get(ME, headers=auth_header(token_for(second, email="two@example.com")))

    assert db.query(User).count() == 2
