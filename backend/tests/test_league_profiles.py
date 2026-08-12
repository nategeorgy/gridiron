"""League profiles: CRUD, spec validation, and the one-active-profile invariant.

The invariant is the interesting part. "At most one active profile per user" is
maintained by the router on every activation *and* held by a partial unique index
(``uq_profile_one_active``), so the tests check both: that the endpoints keep it, and
that the database would refuse to break it if they ever stopped.
"""

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.models import LeagueProfile

PROFILES = "/api/v1/me/league-profiles"


def make_profile(client, name: str, **overrides) -> dict:
    """POST a valid profile and return the created body."""
    payload = {"name": name, "scoring_spec": "ppr", "league_spec": "12", **overrides}
    response = client.post(PROFILES, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def active_names(client) -> list[str]:
    """The names of the user's active profiles — should never be longer than one."""
    return [row["name"] for row in client.get(PROFILES).json() if row["is_active"]]


# --- Creating ----------------------------------------------------------------


def test_create_returns_the_profile(client_a):
    body = make_profile(client_a, "Home League", scoring_spec="ppr:pass_td=6", league_spec="10:rb=2")

    assert body["name"] == "Home League"
    assert body["scoring_spec"] == "ppr:pass_td=6"
    assert body["league_spec"] == "10:rb=2"
    assert uuid.UUID(body["profile_id"])


def test_the_first_profile_is_always_active(client_a):
    """Even when the client asks for it not to be.

    A user with profiles but none active would leave the header with nothing to show.
    """
    body = make_profile(client_a, "Only One", activate=False)

    assert body["is_active"] is True


def test_second_profile_can_be_created_without_stealing_activation(client_a):
    make_profile(client_a, "First")
    make_profile(client_a, "Second", activate=False)

    assert active_names(client_a) == ["First"]


def test_duplicate_names_are_rejected(client_a):
    make_profile(client_a, "Dynasty")

    response = client_a.post(
        PROFILES, json={"name": "Dynasty", "scoring_spec": "ppr", "league_spec": "12"}
    )

    assert response.status_code == 409


def test_two_users_may_use_the_same_profile_name(client_a, client_b):
    """The uniqueness constraint is per user, not global."""
    make_profile(client_a, "Dynasty")
    make_profile(client_b, "Dynasty")


@pytest.mark.parametrize(
    "field, value",
    [
        ("scoring_spec", "not-a-preset"),
        ("scoring_spec", "ppr:nonsense=3"),
        ("scoring_spec", "ppr:pass_td=banana"),
        ("league_spec", "not-a-number"),
        ("league_spec", "1"),
        ("league_spec", "12:nonsense=2"),
        ("name", "   "),
    ],
)
def test_invalid_specs_are_rejected_on_write(client_a, field, value):
    """A profile that saves cleanly must be a profile that renders.

    The schema validates by parsing through the very functions that serve a request, so
    an unparseable spec can never reach the database and 500 a board later.
    """
    payload = {"name": "Bad", "scoring_spec": "ppr", "league_spec": "12", field: value}

    assert client_a.post(PROFILES, json=payload).status_code == 422


# --- Listing and updating ----------------------------------------------------


def test_list_puts_the_active_profile_first(client_a):
    make_profile(client_a, "First")
    make_profile(client_a, "Second", activate=False)
    make_profile(client_a, "Third", activate=False)

    names = [row["name"] for row in client_a.get(PROFILES).json()]

    assert names[0] == "First"


def test_patch_updates_only_the_fields_sent(client_a):
    created = make_profile(client_a, "Original", scoring_spec="ppr")

    response = client_a.patch(f"{PROFILES}/{created['profile_id']}", json={"name": "Renamed"})

    assert response.status_code == 200
    assert response.json()["name"] == "Renamed"
    assert response.json()["scoring_spec"] == "ppr"


def test_patch_can_change_both_specs(client_a):
    created = make_profile(client_a, "Original")

    response = client_a.patch(
        f"{PROFILES}/{created['profile_id']}",
        json={"scoring_spec": "half:te_rec=1.5", "league_spec": "14:flex=2"},
    )

    assert response.status_code == 200
    assert response.json()["scoring_spec"] == "half:te_rec=1.5"
    assert response.json()["league_spec"] == "14:flex=2"


def test_patch_rejects_an_invalid_spec(client_a):
    created = make_profile(client_a, "Original")

    response = client_a.patch(
        f"{PROFILES}/{created['profile_id']}", json={"scoring_spec": "not-a-preset"}
    )

    assert response.status_code == 422


def test_patch_to_a_duplicate_name_is_rejected(client_a):
    make_profile(client_a, "Taken")
    other = make_profile(client_a, "Free", activate=False)

    response = client_a.patch(f"{PROFILES}/{other['profile_id']}", json={"name": "Taken"})

    assert response.status_code == 409


# --- The one-active-profile invariant ----------------------------------------


def test_activating_one_profile_deactivates_the_others(client_a):
    make_profile(client_a, "First")
    second = make_profile(client_a, "Second", activate=False)

    client_a.patch(f"{PROFILES}/{second['profile_id']}", json={"activate": True})

    assert active_names(client_a) == ["Second"]


def test_creating_an_active_profile_deactivates_the_others(client_a):
    make_profile(client_a, "First")
    make_profile(client_a, "Second")

    assert active_names(client_a) == ["Second"]


def test_deactivating_the_only_active_profile_is_a_no_op(client_a):
    """Activation is a radio button, not a toggle.

    Honouring `activate: false` here would leave the user with profiles and no active
    one — the state the first-profile rule exists to prevent.
    """
    only = make_profile(client_a, "Only")

    response = client_a.patch(f"{PROFILES}/{only['profile_id']}", json={"activate": False})

    assert response.status_code == 200
    assert active_names(client_a) == ["Only"]


def test_activation_survives_a_long_chain_of_switches(client_a):
    profiles = [make_profile(client_a, f"League {index}", activate=False) for index in range(5)]

    for profile in profiles:
        client_a.patch(f"{PROFILES}/{profile['profile_id']}", json={"activate": True})
        assert active_names(client_a) == [profile["name"]]


def test_the_database_refuses_a_second_active_profile(client_a, user_a, db):
    """The partial unique index, checked directly.

    The endpoints are supposed to make this unreachable; the index is what turns a
    future bug in that logic into a failed transaction rather than a user whose header
    silently shows the wrong league.
    """
    make_profile(client_a, "First")

    db.add(
        LeagueProfile(
            user_id=user_a.user_id,
            name="Smuggled",
            scoring_spec="ppr",
            league_spec="12",
            is_active=True,
        )
    )
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()


# --- Deleting ----------------------------------------------------------------


def test_delete_removes_the_profile(client_a):
    created = make_profile(client_a, "Doomed")

    assert client_a.delete(f"{PROFILES}/{created['profile_id']}").status_code == 204
    assert client_a.get(PROFILES).json() == []


def test_deleting_the_active_profile_promotes_a_successor(client_a):
    """Never leave a user holding profiles with none active."""
    make_profile(client_a, "Older", activate=False)
    active = make_profile(client_a, "Active")

    client_a.delete(f"{PROFILES}/{active['profile_id']}")

    assert active_names(client_a) == ["Older"]


def test_the_successor_is_the_most_recently_updated_profile(client_a, db):
    """Which one gets promoted, when there is more than one candidate.

    ``updated_at`` defaults to Postgres ``now()``, which is *transaction* time and so is
    identical for every row a single test writes. Without stamping the rows by hand the
    successor would be whichever the planner happened to return first, and this
    assertion would be a coin flip rather than a test of the ORDER BY.
    """
    stale = make_profile(client_a, "Stale", activate=False)
    recent = make_profile(client_a, "Recent", activate=False)
    active = make_profile(client_a, "Active")

    for profile, moment in (
        (stale, datetime(2026, 1, 1, tzinfo=timezone.utc)),
        (recent, datetime(2026, 6, 1, tzinfo=timezone.utc)),
    ):
        db.execute(
            update(LeagueProfile)
            .where(LeagueProfile.profile_id == uuid.UUID(profile["profile_id"]))
            .values(updated_at=moment)
        )
    db.flush()

    client_a.delete(f"{PROFILES}/{active['profile_id']}")

    assert active_names(client_a) == ["Recent"]


def test_deleting_an_inactive_profile_does_not_move_activation(client_a):
    active = make_profile(client_a, "Active")
    spare = make_profile(client_a, "Spare", activate=False)

    client_a.delete(f"{PROFILES}/{spare['profile_id']}")

    assert active_names(client_a) == [active["name"]]


def test_deleting_the_last_profile_leaves_nothing_to_promote(client_a, user_a, db):
    created = make_profile(client_a, "Only")

    assert client_a.delete(f"{PROFILES}/{created['profile_id']}").status_code == 204
    assert db.scalars(select(LeagueProfile).where(LeagueProfile.user_id == user_a.user_id)).all() == []


def test_deleting_an_unknown_profile_is_404(client_a):
    assert client_a.delete(f"{PROFILES}/{uuid.uuid4()}").status_code == 404
