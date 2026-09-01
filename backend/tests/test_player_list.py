"""The players list endpoint (M10 added ``player_ids``).

A caller that already knows who it wants should not make one request per player, and
should not go through the leaderboard to get identities — that endpoint aggregates stat
lines, so a player with none in the window disappears entirely. The trap worth pinning
is the empty list: an explicitly empty ``player_ids`` must mean *none*, never "no
filter", which is the same rule the M5 watchlist follows on the leaderboard.
"""

from fastapi.testclient import TestClient

from app.models import Player, Team

PLAYERS = "/api/v1/players"


def test_player_ids_returns_only_the_named_players(
    client: TestClient, player: Player, other_player: Player
):
    body = client.get(PLAYERS, params={"player_ids": player.player_id}).json()

    assert body["total"] == 1
    assert body["data"][0]["player_id"] == player.player_id


def test_player_ids_accepts_several(client: TestClient, player: Player, other_player: Player):
    ids = f"{player.player_id},{other_player.player_id}"
    body = client.get(PLAYERS, params={"player_ids": ids}).json()

    assert {row["player_id"] for row in body["data"]} == {player.player_id, other_player.player_id}


def test_an_empty_player_ids_matches_nobody(client: TestClient, player: Player):
    """Not "no filter" — the distinction the watchlist depends on."""
    assert client.get(PLAYERS, params={"player_ids": " , "}).json()["total"] == 0


def test_omitting_player_ids_still_lists_everyone(client: TestClient, player: Player):
    assert client.get(PLAYERS).json()["total"] >= 1


def test_player_ids_carries_the_identity_columns(client: TestClient, player: Player, team: Team):
    """The reason this filter exists: name, position, team and headshot in one call."""
    row = client.get(PLAYERS, params={"player_ids": player.player_id}).json()["data"][0]

    assert row["name"] == player.name
    assert row["position"] == player.position
    assert row["team_abbreviation"] == team.abbreviation
