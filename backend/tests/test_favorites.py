"""The watchlist: idempotent add and remove, unknown players, and the cap.

Favorites are a star in the UI, so the endpoints are written to be safe to call from a
button that can be clicked twice or double-fired by a retry. "Already starred" and
"already unstarred" are both success, not conflict.
"""

import pytest

from app.models import Favorite

FAVORITES = "/api/v1/me/favorites"


def favorited_ids(client) -> list[str]:
    """The player ids on the client's watchlist."""
    return [row["player"]["player_id"] for row in client.get(FAVORITES).json()]


# --- Adding and removing -----------------------------------------------------


def test_add_puts_the_player_on_the_watchlist(client_a, player):
    assert client_a.put(f"{FAVORITES}/{player.player_id}").status_code == 204

    assert favorited_ids(client_a) == [player.player_id]


def test_adding_twice_is_not_an_error(client_a, player, user_a, db):
    """Starring an already-starred player succeeds and adds no second row."""
    client_a.put(f"{FAVORITES}/{player.player_id}")
    second = client_a.put(f"{FAVORITES}/{player.player_id}")

    assert second.status_code == 204
    assert db.query(Favorite).filter(Favorite.user_id == user_a.user_id).count() == 1


def test_remove_takes_the_player_off_the_watchlist(client_a, player):
    client_a.put(f"{FAVORITES}/{player.player_id}")

    assert client_a.delete(f"{FAVORITES}/{player.player_id}").status_code == 204
    assert favorited_ids(client_a) == []


def test_removing_something_not_favorited_is_not_an_error(client_a, player):
    assert client_a.delete(f"{FAVORITES}/{player.player_id}").status_code == 204


def test_removing_twice_is_not_an_error(client_a, player):
    client_a.put(f"{FAVORITES}/{player.player_id}")
    client_a.delete(f"{FAVORITES}/{player.player_id}")

    assert client_a.delete(f"{FAVORITES}/{player.player_id}").status_code == 204


def test_star_and_unstar_can_be_repeated(client_a, player):
    """The button can be mashed."""
    for _ in range(3):
        client_a.put(f"{FAVORITES}/{player.player_id}")
        client_a.delete(f"{FAVORITES}/{player.player_id}")

    assert favorited_ids(client_a) == []


# --- Unknown players ---------------------------------------------------------


def test_favoriting_an_unknown_player_is_404(client_a):
    """The foreign key would reject it; answering 404 keeps that a client error."""
    assert client_a.put(f"{FAVORITES}/00-9999999").status_code == 404


def test_unfavoriting_an_unknown_player_is_still_a_no_op(client_a):
    """Remove is unconditional: there is nothing to leak and nothing to fail on."""
    assert client_a.delete(f"{FAVORITES}/00-9999999").status_code == 204


# --- Listing -----------------------------------------------------------------


def test_list_hydrates_the_player_and_team(client_a, player, team):
    """The watchlist renders a row without a second request per player."""
    client_a.put(f"{FAVORITES}/{player.player_id}")

    row = client_a.get(FAVORITES).json()[0]

    assert row["player"]["name"] == "Patrick Mahomes"
    assert row["player"]["position"] == "QB"
    assert row["player"]["team_abbreviation"] == team.abbreviation
    assert row["created_at"]


def test_list_is_ordered_by_player_name(client_a, player, other_player):
    client_a.put(f"{FAVORITES}/{player.player_id}")  # Patrick Mahomes
    client_a.put(f"{FAVORITES}/{other_player.player_id}")  # Justin Jefferson

    names = [row["player"]["name"] for row in client_a.get(FAVORITES).json()]

    assert names == ["Justin Jefferson", "Patrick Mahomes"]


def test_an_empty_watchlist_is_an_empty_list(client_a):
    assert client_a.get(FAVORITES).json() == []


# --- The cap -----------------------------------------------------------------


def test_the_cap_rejects_a_new_favorite(client_a, player, other_player, monkeypatch):
    """A soft ceiling so a scripted client cannot grow one user's rows without bound.

    Patched down from 300 rather than seeded up to it — the guard is what is under test,
    not the number.
    """
    monkeypatch.setattr("app.routers.account.MAX_FAVORITES", 1)
    client_a.put(f"{FAVORITES}/{player.player_id}")

    response = client_a.put(f"{FAVORITES}/{other_player.player_id}")

    assert response.status_code == 409


def test_the_cap_does_not_block_re_starring_an_existing_favorite(
    client_a, player, monkeypatch
):
    """Being at the cap must not make an idempotent add start failing."""
    client_a.put(f"{FAVORITES}/{player.player_id}")
    monkeypatch.setattr("app.routers.account.MAX_FAVORITES", 1)

    assert client_a.put(f"{FAVORITES}/{player.player_id}").status_code == 204


# --- Authentication ----------------------------------------------------------


@pytest.mark.parametrize("method", ["get", "put", "delete"])
def test_favorites_require_a_signed_in_user(client, player, method):
    """`client` sends no credentials, so the real dependency rejects it."""
    url = FAVORITES if method == "get" else f"{FAVORITES}/{player.player_id}"

    assert getattr(client, method)(url).status_code == 401
