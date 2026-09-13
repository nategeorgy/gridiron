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

/**
 * Fetch a player's season-by-season career with each season's position finish (M13).
 * Params: scoring, season_type. The finishes are re-ranked in the requested scoring.
 */
export async function getPlayerCareer(playerId, params = {}) {
  const { data } = await api.get(`/players/${playerId}/career`, { params });
  return data;
}

/** Fetch a player's targets bucketed by pass depth (M4). */
export async function getPlayerTargetDepth(playerId, params) {
  const { data } = await api.get(`/players/${playerId}/target-depth`, { params });
  return data;
}
