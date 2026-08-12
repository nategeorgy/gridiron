"""User B must never reach user A's rows. This is the file that matters most.

M5 is the first code in the project where a bug means one user reading another's data.
The design's answer is that no endpoint accepts a user id — it comes from the verified
token, and every query filters on it — so these tests take the opposite view and try to
get at user A's data anyway, using the only lever an attacker has: a resource id.

The expected answer is always **404, never 403**: another user's row should be
indistinguishable from one that does not exist. A 403 would confirm the id is real,
turning the endpoint into an oracle for enumerating other people's saved views.
"""

import uuid

import pytest

PROFILE = {"name": "A's League", "scoring_spec": "ppr", "league_spec": "12"}
VIEW = {"name": "A's View", "path": "/fantasy/leaders", "query": "season=2024"}


@pytest.fixture
def profile_of_a(client_a) -> str:
    """A league profile owned by user A. Returns its id."""
    response = client_a.post("/api/v1/me/league-profiles", json=PROFILE)
    assert response.status_code == 201, response.text
    return response.json()["profile_id"]


@pytest.fixture
def view_of_a(client_a) -> str:
    """A saved view owned by user A. Returns its id."""
    response = client_a.post("/api/v1/me/saved-views", json=VIEW)
    assert response.status_code == 201, response.text
    return response.json()["view_id"]


@pytest.fixture
def favorite_of_a(client_a, player) -> str:
    """A player on user A's watchlist. Returns the player id."""
    assert client_a.put(f"/api/v1/me/favorites/{player.player_id}").status_code == 204
    return player.player_id


# --- League profiles ---------------------------------------------------------


def test_b_cannot_see_as_profile_in_a_list(client_b, profile_of_a):
    response = client_b.get("/api/v1/me/league-profiles")

    assert response.status_code == 200
    assert response.json() == []


def test_b_cannot_patch_as_profile(client_a, client_b, profile_of_a):
    response = client_b.patch(
        f"/api/v1/me/league-profiles/{profile_of_a}", json={"name": "Stolen"}
    )

    assert response.status_code == 404
    # And the write did not land anyway.
    assert client_a.get("/api/v1/me/league-profiles").json()[0]["name"] == "A's League"


def test_b_cannot_delete_as_profile(client_a, client_b, profile_of_a):
    response = client_b.delete(f"/api/v1/me/league-profiles/{profile_of_a}")

    assert response.status_code == 404
    assert len(client_a.get("/api/v1/me/league-profiles").json()) == 1


# --- Saved views -------------------------------------------------------------


def test_b_cannot_see_as_view_in_a_list(client_b, view_of_a):
    response = client_b.get("/api/v1/me/saved-views")

    assert response.status_code == 200
    assert response.json() == []


def test_b_cannot_patch_as_view(client_a, client_b, view_of_a):
    response = client_b.patch(
        f"/api/v1/me/saved-views/{view_of_a}", json={"query": "season=1999"}
    )

    assert response.status_code == 404
    assert client_a.get("/api/v1/me/saved-views").json()[0]["query"] == "season=2024"


def test_b_cannot_delete_as_view(client_a, client_b, view_of_a):
    response = client_b.delete(f"/api/v1/me/saved-views/{view_of_a}")

    assert response.status_code == 404
    assert len(client_a.get("/api/v1/me/saved-views").json()) == 1


# --- Favorites ---------------------------------------------------------------


def test_b_cannot_see_as_watchlist(client_b, favorite_of_a):
    response = client_b.get("/api/v1/me/favorites")

    assert response.status_code == 200
    assert response.json() == []


def test_b_removing_the_same_player_does_not_touch_as_watchlist(
    client_a, client_b, favorite_of_a
):
    """The one endpoint where the id an attacker supplies is *not* secret.

    Favorites are keyed on (user, player) and player ids are public, so unlike a profile
    id there is nothing to guess. The delete has to be scoped by user rather than by
    obscurity: user B removing the same player is a legitimate no-op for them and must
    leave user A's row alone.
    """
    assert client_b.delete(f"/api/v1/me/favorites/{favorite_of_a}").status_code == 204

    still_there = client_a.get("/api/v1/me/favorites").json()
    assert [row["player"]["player_id"] for row in still_there] == [favorite_of_a]


def test_bs_favorite_does_not_appear_for_a(client_a, client_b, player, other_player):
    client_a.put(f"/api/v1/me/favorites/{player.player_id}")
    client_b.put(f"/api/v1/me/favorites/{other_player.player_id}")

    a_rows = [row["player"]["player_id"] for row in client_a.get("/api/v1/me/favorites").json()]
    b_rows = [row["player"]["player_id"] for row in client_b.get("/api/v1/me/favorites").json()]

    assert a_rows == [player.player_id]
    assert b_rows == [other_player.player_id]


# --- Counts and deletion -----------------------------------------------------


def test_account_summary_counts_only_your_own_rows(
    client_a, client_b, profile_of_a, view_of_a, favorite_of_a
):
    summary = client_b.get("/api/v1/me").json()

    assert summary["league_profile_count"] == 0
    assert summary["favorite_count"] == 0
    assert summary["saved_view_count"] == 0


def test_b_deleting_their_account_leaves_a_intact(
    client_a, client_b, profile_of_a, view_of_a, favorite_of_a
):
    """Account deletion cascades — the test is that it cascades *within one user*."""
    assert client_b.delete("/api/v1/me").status_code == 204

    summary = client_a.get("/api/v1/me").json()
    assert summary["league_profile_count"] == 1
    assert summary["saved_view_count"] == 1
    assert summary["favorite_count"] == 1


# --- Ids that do not exist ---------------------------------------------------


def test_unknown_ids_answer_the_same_as_another_users(client_a, client_b, profile_of_a):
    """The 404 for someone else's profile is the 404 for a made-up one.

    If these differed, the endpoint would tell an attacker which ids are real.
    """
    unknown = uuid.uuid4()

    someone_elses = client_b.patch(
        f"/api/v1/me/league-profiles/{profile_of_a}", json={"name": "x"}
    )
    made_up = client_b.patch(f"/api/v1/me/league-profiles/{unknown}", json={"name": "x"})

    assert someone_elses.status_code == made_up.status_code == 404
    assert someone_elses.json() == made_up.json()
