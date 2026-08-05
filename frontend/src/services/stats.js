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

/**
 * Fetch scatter points (M4). Params: season, x, y, size?, mode ("season"|"game"),
 * last_weeks?, season_type, position?, scoring, league, custom, min_games, limit.
 * Returns { data, total, truncated, axes, medians, ... }.
 */
export async function getScatter(params) {
  const { data } = await api.get("/stats/scatter", { params });
  return data;
}

/**
 * Fetch a side-by-side comparison (M4). Params: players (comma-separated ids),
 * season, last_weeks?, season_type, metrics?, scoring, custom.
 * Returns { data: [{ stats, percentiles, weekly }], metrics, ... }.
 */
export async function getCompare(params) {
  const { data } = await api.get("/stats/compare", { params });
  return data;
}
