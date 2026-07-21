// Stats API calls.
import { api } from "./api";

/**
 * Fetch the leaderboard. Params: season, week?, season_type, position?,
 * metric, scoring, order, min_games, limit, offset.
 * `scoring` is a preset[:overrides] spec, e.g. "ppr" or "ppr:pass_td=6".
 */
export async function getLeaderboard(params) {
  const { data } = await api.get("/stats/leaderboard", { params });
  return data;
}
