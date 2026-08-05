// Player API calls.
import { api } from "./api";

/** Fetch a single player's profile. */
export async function getPlayer(playerId) {
  const { data } = await api.get(`/players/${playerId}`);
  return data;
}

/** Fetch a player's full game log (all seasons unless filtered). */
export async function getPlayerGameLog(playerId, params = {}) {
  const { data } = await api.get(`/players/${playerId}/stats`, { params });
  return data;
}

/** Search/list players. */
export async function getPlayers(params) {
  const { data } = await api.get("/players", { params });
  return data;
}

/** Fetch a player's targets bucketed by pass depth (M4). */
export async function getPlayerTargetDepth(playerId, params) {
  const { data } = await api.get(`/players/${playerId}/target-depth`, { params });
  return data;
}
