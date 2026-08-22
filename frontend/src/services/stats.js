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

/**
 * Fetch the Draft Value Board (M6.1). Params: season? (valuation season),
 * scoring, league, ranking_type?, position?, sort, order, depth?, limit, offset.
 * Returns { data, total, ranking_type, ranking_season, scraped_at, ... }.
 */
export async function getDraftBoard(params) {
  const { data } = await api.get("/stats/draft-board", { params });
  return data;
}

/**
 * Fetch strength of schedule (M6.3). Params: season?, position, window, scoring.
 * Returns { data (teams, easiest first), defense, basis, weeks, ... }.
 */
export async function getSos(params) {
  const { data } = await api.get("/stats/sos", { params });
  return data;
}

/**
 * Fetch the Vegas board (M6.4). Params: season?, week?, view ("players"|"games"),
 * position?, scoring, limit, offset. Returns { data, weeks, week, ... }.
 */
export async function getVegas(params) {
  const { data } = await api.get("/stats/vegas", { params });
  return data;
}
