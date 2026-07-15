// Stats API calls.
import { api } from "./api";

/**
 * Fetch the leaderboard. Params: season, week?, season_type, position?,
 * metric, order, min_games, limit, offset.
 */
export async function getLeaderboard(params) {
  const { data } = await api.get("/stats/leaderboard", { params });
  return data;
}
