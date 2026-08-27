"""A user's own ranking boards (M9) — CRUD, wholesale edits, and CSV import.

Two things here are easy to get wrong in ways that do not raise.

**A board is current state, not an accumulation.** Editing means dragging a player from
40th to 12th, which renumbers everything between, and removing one means he is simply
not on the board any more. An upsert-shaped edit leaves the removed player sitting
there forever — the same failure mode the depth-chart ingest has, and the reason both
replace their whole scope in one transaction.

**An import must not quietly lose players.** A cheat sheet with a hole in it is worse
than a rejected file, so unmatched names come back with their ranks rather than being
dropped, and a name that matches several current players is reported as ambiguous
rather than resolved by coin toss.
"""

import pytest

BOARDS = "/api/v1/me/ranking-boards"
RANKINGS = "/api/v1/draft/rankings"

TEMPLATE_HEADER = "rank,player,position,team,tier"


def _csv(*rows: str) -> str:
    return "\n".join((TEMPLATE_HEADER, *rows)) + "\n"


@pytest.fixture
def board_of_a(client_a, player, other_player) -> str:
    """A two-player board owned by user A. Returns its id."""
    response = client_a.post(
        BOARDS,
        json={
            "name": "My Board",
            "entries": [
                {"player_id": player.player_id},
                {"player_id": other_player.player_id},
            ],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["board_id"]


# --- Creating and editing ----------------------------------------------------


def test_entries_are_ranked_by_their_order_in_the_request(client_a, board_of_a, player):
    """Position in the list is the rank — there is no rank field to disagree with."""
    board = client_a.get(f"{BOARDS}/{board_of_a}").json()

    assert [entry["rank"] for entry in board["entries"]] == [1, 2]
    assert board["entries"][0]["player_id"] == player.player_id


def test_entries_are_hydrated_enough_to_render(client_a, board_of_a):
    entry = client_a.get(f"{BOARDS}/{board_of_a}").json()["entries"][0]

    assert entry["name"] == "Patrick Mahomes"
    assert entry["position"] == "QB"
    assert entry["team_abbreviation"] == "KC"


def test_replacing_entries_removes_players_left_off(client_a, board_of_a, other_player):
    """The failure an upsert would hide: a dropped player must actually be gone."""
    response = client_a.put(
        f"{BOARDS}/{board_of_a}/entries",
        json={"entries": [{"player_id": other_player.player_id}]},
    )

    assert response.status_code == 200, response.text
    entries = response.json()["entries"]
    assert [entry["player_id"] for entry in entries] == [other_player.player_id]
    assert entries[0]["rank"] == 1


def test_reordering_renumbers_every_row(client_a, board_of_a, player, other_player):
    response = client_a.put(
        f"{BOARDS}/{board_of_a}/entries",
        json={
            "entries": [
                {"player_id": other_player.player_id},
                {"player_id": player.player_id},
            ]
        },
    )

    entries = response.json()["entries"]
    assert [(entry["player_id"], entry["rank"]) for entry in entries] == [
        (other_player.player_id, 1),
        (player.player_id, 2),
    ]


def test_a_player_cannot_be_ranked_twice_on_one_board(client_a, player):
    """A duplicate in the payload collapses rather than violating the key."""
    response = client_a.post(
        BOARDS,
        json={
            "name": "Doubled",
            "entries": [{"player_id": player.player_id}, {"player_id": player.player_id}],
        },
    )

    assert response.status_code == 201, response.text
    assert len(response.json()["entries"]) == 1


def test_duplicate_board_names_are_rejected(client_a, board_of_a):
    response = client_a.post(BOARDS, json={"name": "My Board", "entries": []})

    assert response.status_code == 409


def test_tiers_survive_a_round_trip(client_a, player, other_player):
    response = client_a.post(
        BOARDS,
        json={
            "name": "Tiered",
            "entries": [
                {"player_id": player.player_id, "tier": 1},
                {"player_id": other_player.player_id, "tier": 2},
            ],
        },
    )

    assert [entry["tier"] for entry in response.json()["entries"]] == [1, 2]


# --- The board as a source ---------------------------------------------------


def test_a_user_board_can_be_drafted_from(client_a, board_of_a, player):
    """`board:<uuid>` is a first-class source, so a mock can draft from your own list."""
    response = client_a.get(
        RANKINGS, params={"source": f"board:{board_of_a}", "limit": 10}
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["board_kind"] == "user"
    assert body["board_label"] == "My Board"
    assert body["data"][0]["player_id"] == player.player_id


def test_a_user_board_is_listed_alongside_the_globals(client_a, board_of_a):
    listed = client_a.get("/api/v1/draft/sources").json()["data"]

    assert f"board:{board_of_a}" in {row["id"] for row in listed}


def test_signed_out_callers_see_no_user_boards(client, board_of_a):
    """A board is personal. Signed out, the global boards are all there is."""
    listed = client.get("/api/v1/draft/sources").json()["data"]

    assert all(row["kind"] == "global" for row in listed)


# --- CSV import --------------------------------------------------------------


def test_import_builds_a_board_from_matched_names(client_a, player, other_player):
    response = client_a.post(
        f"{BOARDS}/import",
        json={
            "name": "Imported",
            "content": _csv(
                "1,Justin Jefferson,WR,MIN,1",
                "2,Patrick Mahomes,QB,KC,1",
            ),
        },
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["matched"] == 2
    assert [entry["player_id"] for entry in body["board"]["entries"]] == [
        other_player.player_id,
        player.player_id,
    ]


def test_import_normalises_punctuation_and_suffixes(client_a, player):
    """`P.J.` and `PJ`, `Jr.` and no `Jr.` — differences that must not lose a player."""
    response = client_a.post(
        f"{BOARDS}/import",
        json={"name": "Punctuated", "content": _csv("1,patrick mahomes Jr.,QB,KC,")},
    )

    assert response.json()["matched"] == 1


def test_import_reports_names_it_could_not_match(client_a, player):
    """A hole in a cheat sheet must be visible, with the rank that is missing."""
    response = client_a.post(
        f"{BOARDS}/import",
        json={
            "name": "Partly Known",
            "content": _csv("1,Patrick Mahomes,QB,KC,", "2,Nobody At All,WR,KC,"),
        },
    )

    body = response.json()
    assert body["matched"] == 1
    assert len(body["unmatched"]) == 1
    assert body["unmatched"][0]["rank"] == 2
    assert body["unmatched"][0]["reason"] == "unknown"


def test_import_densifies_around_the_gaps(client_a, player, other_player):
    """A missing name must not leave a hole in the numbering of what did match."""
    response = client_a.post(
        f"{BOARDS}/import",
        json={
            "name": "Gapped",
            "content": _csv(
                "1,Patrick Mahomes,QB,KC,",
                "2,Nobody At All,WR,KC,",
                "3,Justin Jefferson,WR,MIN,",
            ),
        },
    )

    entries = response.json()["board"]["entries"]
    assert [entry["rank"] for entry in entries] == [1, 2]


def test_import_counts_out_of_scope_positions_without_failing(client_a, player):
    """Kickers are not a mistake — the product simply holds no data for them."""
    response = client_a.post(
        f"{BOARDS}/import",
        json={
            "name": "With Kickers",
            "content": _csv("1,Patrick Mahomes,QB,KC,", "2,Justin Tucker,K,BAL,"),
        },
    )

    body = response.json()
    assert body["matched"] == 1
    assert body["out_of_scope"] == 1
    assert body["unmatched"] == []


def test_import_rejects_a_file_with_the_wrong_columns(client_a):
    """Strict on purpose: a guessed column produces a board subtly not what was uploaded."""
    response = client_a.post(
        f"{BOARDS}/import",
        json={"name": "Wrong", "content": "position,player\nQB,Patrick Mahomes\n"},
    )

    assert response.status_code == 400
    assert "rank" in response.json()["detail"]


def test_import_rejects_a_rank_column_that_is_not_numbers(client_a):
    response = client_a.post(
        f"{BOARDS}/import",
        json={"name": "Lettered", "content": _csv("first,Patrick Mahomes,QB,KC,")},
    )

    assert response.status_code == 400


def test_import_rejects_a_file_where_nothing_matched(client_a):
    """No board is better than an empty one that looks like it worked."""
    response = client_a.post(
        f"{BOARDS}/import",
        json={"name": "Nobody", "content": _csv("1,Nobody At All,WR,KC,")},
    )

    assert response.status_code == 400
