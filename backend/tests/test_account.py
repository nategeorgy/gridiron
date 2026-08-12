"""``GET /me`` and ``DELETE /me`` — the account summary and the cascade.

Account deletion is a five-line handler because ``ON DELETE CASCADE`` does the work, so
the test is really of the schema: deleting the user must take every owned row with it
and leave nothing orphaned.
"""

import uuid

import pytest
from sqlalchemy import select

from app.models import Favorite, LeagueProfile, SavedView, User
from tests.helpers import auth_header, token_for

ME = "/api/v1/me"


@pytest.fixture
def user_a_with_everything(client_a, player, other_player) -> None:
    """User A with one of each owned resource."""
    client_a.post(
        f"{ME}/league-profiles",
        json={"name": "Home", "scoring_spec": "ppr", "league_spec": "12"},
    )
    client_a.post(
        f"{ME}/saved-views", json={"name": "Board", "path": "/fantasy/leaders", "query": "season=2024"}
    )
    client_a.put(f"{ME}/favorites/{player.player_id}")
    client_a.put(f"{ME}/favorites/{other_player.player_id}")


# --- The summary -------------------------------------------------------------


def test_summary_returns_the_signed_in_user(client_a, user_a):
    response = client_a.get(ME)

    assert response.status_code == 200
    body = response.json()["user"]
    assert body["user_id"] == str(user_a.user_id)
    assert body["email"] == "a@example.com"
    assert body["display_name"] == "User A"


def test_a_new_account_has_nothing_saved(client_a):
    body = client_a.get(ME).json()

    assert body["league_profile_count"] == 0
    assert body["favorite_count"] == 0
    assert body["saved_view_count"] == 0


def test_summary_counts_what_the_user_has_saved(client_a, user_a_with_everything):
    body = client_a.get(ME).json()

    assert body["league_profile_count"] == 1
    assert body["saved_view_count"] == 1
    assert body["favorite_count"] == 2


def test_summary_requires_a_signed_in_user(client):
    assert client.get(ME).status_code == 401


# --- Deletion ----------------------------------------------------------------


def test_delete_removes_the_user(client_a, user_a, db):
    assert client_a.delete(ME).status_code == 204

    assert db.scalar(select(User).where(User.user_id == user_a.user_id)) is None


def test_delete_cascades_to_everything_owned(client_a, user_a, db, user_a_with_everything):
    """Collecting a Google identity means owing the user a way to revoke it — fully."""
    user_id = user_a.user_id

    assert client_a.delete(ME).status_code == 204

    db.expire_all()
    assert db.scalars(select(LeagueProfile).where(LeagueProfile.user_id == user_id)).all() == []
    assert db.scalars(select(SavedView).where(SavedView.user_id == user_id)).all() == []
    assert db.scalars(select(Favorite).where(Favorite.user_id == user_id)).all() == []


def test_delete_does_not_remove_the_players_themselves(client_a, db, user_a_with_everything, player):
    """The cascade runs from the user, not into the shared reference data."""
    from app.models import Player

    client_a.delete(ME)

    assert db.get(Player, player.player_id) is not None


def test_delete_requires_a_signed_in_user(client):
    assert client.delete(ME).status_code == 401


def test_a_deleted_account_is_provisioned_again_on_the_next_valid_token(client, player):
    """Deletion is not a ban.

    The same Google identity signing in again gets a fresh, empty account — the rows are
    gone, but the token still verifies, and JIT provisioning has no memory of the old one.

    This one uses a real token rather than ``client_a``: re-provisioning happens inside
    ``get_current_user``, which ``client_a`` deliberately replaces, so the overriding
    fixture is structurally unable to show the behaviour.
    """
    headers = auth_header(token_for(uuid.uuid4()))
    client.get(ME, headers=headers)
    client.put(f"{ME}/favorites/{player.player_id}", headers=headers)
    assert client.get(ME, headers=headers).json()["favorite_count"] == 1

    assert client.delete(ME, headers=headers).status_code == 204

    response = client.get(ME, headers=headers)
    assert response.status_code == 200
    assert response.json()["favorite_count"] == 0
