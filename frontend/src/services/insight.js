// Fantasy-intelligence API calls (M3). Both endpoints take a `scoring` spec and a
// `league` spec, so every score comes back in the user's own league.
import { api } from "./api";

/**
 * Fetch the intelligence board. Params: season, last_weeks?, season_type, position?,
 * metric, scoring, league, order, min_games?, include_unqualified?, limit, offset.
 */
export async function getIntelligence(params) {
  const { data } = await api.get("/stats/intelligence", { params });
  return data;
}

/**
 * Fetch one player's scores plus the component breakdown behind each.
 * Params: season, last_weeks?, season_type, scoring, league.
 */
export async function getPlayerIntelligence(playerId, params) {
  const { data } = await api.get(`/players/${playerId}/intelligence`, { params });
  return data;
}
