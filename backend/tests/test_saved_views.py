"""Saved views: CRUD, and the path validation that keeps a stored URL on-site.

A saved view is a stored URL that the app later navigates to, which makes ``path`` the
one field in M5 where a bad value becomes a redirect rather than a bad render. The
rejection tests below are the point of this module; the CRUD tests are there so a change
to validation cannot be "fixed" by loosening it.
"""

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import update

from app.models import SavedView

VIEWS = "/api/v1/me/saved-views"


def make_view(client, name: str, **overrides) -> dict:
    """POST a valid saved view and return the created body."""
    payload = {"name": name, "path": "/fantasy/leaders", "query": "season=2024", **overrides}
    response = client.post(VIEWS, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


# --- Path rejection ----------------------------------------------------------


@pytest.mark.parametrize(
    "path",
    [
        # Protocol-relative: a browser reads this as https://evil.com/x and leaves.
        "//evil.com/x",
        # The case that actually needs the "//" rule. Everything else here is also
        # caught by the section check, because "evil.com" is not a known section — but
        # here the host *is* spelled like one, so after `strip("/")` the path is
        # indistinguishable from the legitimate "/fantasy/leaders". A browser still
        # reads it as the host `fantasy`, and leaves the site.
        "//fantasy/leaders",
        "//insight/vorp",
        # Absolute, with a scheme.
        "https://evil.com",
        "http://evil.com/fantasy/leaders",
        # A real URL smuggled in after a legitimate-looking start.
        "/fantasy/leaders:https://evil.com",
        # Backslashes, which some clients normalise to forward slashes.
        "\\\\evil.com/x",
        # Not an app route at all.
        "/admin/secrets",
        "/api/v1/me",
        # Relative — no leading slash.
        "players/123",
        # Traversal: the browser resolves ".." before the router sees the path, so
        # this walks straight back out of the section that was checked.
        "/explore/../../etc",
        "/fantasy/..",
    ],
)
def test_off_site_and_out_of_bounds_paths_are_rejected(client_a, path):
    response = client_a.post(VIEWS, json={"name": "Sneaky", "path": path, "query": ""})

    assert response.status_code == 422, f"{path!r} was accepted"


@pytest.mark.parametrize(
    "path",
    ["/fantasy/leaders", "/insight/vorp", "/nfl/passing", "/explore/scatter", "/explore"],
)
def test_real_app_routes_are_accepted(client_a, path):
    """The validator is an envelope around the app's own sections, not a blocklist."""
    body = make_view(client_a, f"View for {path}", path=path)

    assert body["path"] == path


def test_patch_cannot_smuggle_in_an_off_site_path(client_a):
    """The same rule applies on update — validation lives in the schema, not the handler."""
    created = make_view(client_a, "Legit")

    response = client_a.patch(f"{VIEWS}/{created['view_id']}", json={"path": "//evil.com/x"})

    assert response.status_code == 422


# --- Creating and reading ----------------------------------------------------


def test_create_stores_the_route_and_query(client_a):
    body = make_view(client_a, "My Board", path="/insight/vorp", query="season=2024&position=RB")

    assert body["path"] == "/insight/vorp"
    assert body["query"] == "season=2024&position=RB"
    assert uuid.UUID(body["view_id"])


def test_a_leading_question_mark_is_normalised_away(client_a):
    """Stored without it, so the frontend can concatenate without guessing."""
    body = make_view(client_a, "Normalised", query="?season=2024")

    assert body["query"] == "season=2024"


def test_an_empty_query_means_the_boards_defaults(client_a):
    body = make_view(client_a, "Defaults", query="")

    assert body["query"] == ""


def test_duplicate_names_are_rejected(client_a):
    make_view(client_a, "Weekly")

    response = client_a.post(VIEWS, json={"name": "Weekly", "path": "/nfl/passing", "query": ""})

    assert response.status_code == 409


def test_a_blank_name_is_rejected(client_a):
    response = client_a.post(VIEWS, json={"name": "   ", "path": "/nfl/passing", "query": ""})

    assert response.status_code == 422


def test_list_is_most_recently_updated_first(client_a, db):
    """The ORDER BY, with timestamps set explicitly.

    ``updated_at`` defaults to Postgres ``now()``, which is *transaction* time and so is
    identical for every row a test writes — the whole test runs in one transaction. Left
    to the defaults this assertion would be a tie-break coin flip dressed up as a test,
    so the rows are stamped by hand and the endpoint is asked to sort them.
    """
    older = make_view(client_a, "Older")
    newer = make_view(client_a, "Newer")

    db.execute(
        update(SavedView)
        .where(SavedView.view_id == uuid.UUID(older["view_id"]))
        .values(updated_at=datetime(2026, 1, 1, tzinfo=timezone.utc))
    )
    db.execute(
        update(SavedView)
        .where(SavedView.view_id == uuid.UUID(newer["view_id"]))
        .values(updated_at=datetime(2026, 6, 1, tzinfo=timezone.utc))
    )
    db.flush()

    names = [row["name"] for row in client_a.get(VIEWS).json()]

    assert names == ["Newer", "Older"]


# --- Updating and deleting ---------------------------------------------------


def test_patch_renames_without_moving_the_view(client_a):
    created = make_view(client_a, "Old Name")

    response = client_a.patch(f"{VIEWS}/{created['view_id']}", json={"name": "New Name"})

    assert response.status_code == 200
    assert response.json()["name"] == "New Name"
    assert response.json()["path"] == created["path"]
    assert response.json()["query"] == created["query"]


def test_patch_repoints_the_view_at_new_filters(client_a):
    created = make_view(client_a, "Board")

    response = client_a.patch(f"{VIEWS}/{created['view_id']}", json={"query": "season=2025&week=3"})

    assert response.status_code == 200
    assert response.json()["query"] == "season=2025&week=3"


def test_delete_removes_the_view(client_a):
    created = make_view(client_a, "Doomed")

    assert client_a.delete(f"{VIEWS}/{created['view_id']}").status_code == 204
    assert client_a.get(VIEWS).json() == []


@pytest.mark.parametrize("method", ["patch", "delete"])
def test_unknown_view_is_404(client_a, method):
    url = f"{VIEWS}/{uuid.uuid4()}"
    kwargs = {"json": {"name": "x"}} if method == "patch" else {}

    assert getattr(client_a, method)(url, **kwargs).status_code == 404


# --- The cap -----------------------------------------------------------------


def test_the_cap_rejects_a_new_view(client_a, monkeypatch):
    monkeypatch.setattr("app.routers.account.MAX_SAVED_VIEWS", 1)
    make_view(client_a, "First")

    response = client_a.post(VIEWS, json={"name": "Second", "path": "/nfl/passing", "query": ""})

    assert response.status_code == 409
