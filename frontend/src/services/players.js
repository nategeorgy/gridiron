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

// --- The tabbed player page (November 2026) ---

/** Each game's number for these stats, ranked among the position that week. */
export async function getPlayerWeeklyRanks(playerId, params) {
  const { data } = await api.get(`/players/${playerId}/weekly-ranks`, { params });
  return data;
}

/** His numbers in the games each quarterback started, season by season. */
export async function getPlayerByQuarterback(playerId, params) {
  const { data } = await api.get(`/players/${playerId}/by-quarterback`, { params });
  return data;
}

/** Game splits and situation splits for one season. */
export async function getPlayerSplits(playerId, params) {
  const { data } = await api.get(`/players/${playerId}/splits`, { params });
  return data;
}

/** His team's next game and what that defense allows to his position. */
export async function getPlayerNextGame(playerId, params) {
  const { data } = await api.get(`/players/${playerId}/next-game`, { params });
  return data;
}

/** Every designed run by yards gained, his and every back's. */
export async function getPlayerCarries(playerId, params) {
  const { data } = await api.get(`/players/${playerId}/carries`, { params });
  return data;
}

/** Targets by the route run (receiver) or thrown to (passer). */
export async function getPlayerRoutes(playerId, params) {
  const { data } = await api.get(`/players/${playerId}/routes`, { params });
  return data;
}

/** Every QB, RB, WR and TE since the first season, for the dashboard's typeahead. */
export async function getPlayerIndex(params) {
  const { data } = await api.get("/players/index", { params });
  return data;
}
