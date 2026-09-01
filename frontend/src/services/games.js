// Games API calls (M10) — the schedule and its results.
import { api } from "./api";

/**
 * Fetch games. Params: season?, week?, season_type, team_id?, limit, offset.
 * Season defaults server-side to the newest *scheduled* season, not the newest
 * played one — a fixture list opened in August is about the season coming.
 * Returns { data, total, page, limit, offset }.
 */
export async function getGames(params) {
  const { data } = await api.get("/games", { params });
  return data;
}

/**
 * Fetch a season's weeks with how much of each has been played and priced.
 * Params: season?, season_type. Returns { season, season_type, weeks }.
 */
export async function getGameWeeks(params) {
  const { data } = await api.get("/games/weeks", { params });
  return data;
}

/**
 * Fetch the week just played and the week coming up (the home scoreboard).
 * Takes no params: the rule depends on the season clock and lives on the server so
 * two clients can never disagree about which weeks those are.
 * Returns { last: { season, week, label, games }, next: {...} } — either may be null.
 */
export async function getScoreboard() {
  const { data } = await api.get("/games/scoreboard");
  return data;
}
