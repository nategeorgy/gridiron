// Team API calls.
import { api } from "./api";

/** Fetch all teams. */
export async function getTeams() {
  const { data } = await api.get("/teams");
  return data;
}

/** Fetch the team leaderboard for a season. */
export async function getTeamLeaderboard(params) {
  const { data } = await api.get("/teams/leaderboard", { params });
  return data;
}

/**
 * Fetch one team's page (M6.2): record, fixtures with their betting lines, and the
 * current depth chart with each player's production in the requested scoring.
 * Params: season?, season_type?, scoring.
 */
export async function getTeam(teamId, params) {
  const { data } = await api.get(`/teams/${teamId}`, { params });
  return data;
}
