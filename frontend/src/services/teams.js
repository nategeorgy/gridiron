// Team API calls.
import { api } from "./api";

/** Fetch all teams. */
export async function getTeams() {
  const { data } = await api.get("/teams");
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

/**
 * Every team metric for every team, on both sides of the ball, with ranks (1 = best).
 * Params: season?, season_type?, weeks? ("3,7,12"), scoring?.
 */
export async function getTeamStats(params) {
  const { data } = await api.get("/teams/stats", { params });
  return data;
}

/** One team's panels: EPA trend, pass depth, run lanes, personnel and coaching staff. */
export async function getTeamBreakdown(teamId, params) {
  const { data } = await api.get(`/teams/${teamId}/breakdown`, { params });
  return data;
}

/** Today's 32 teams (no historical franchise codes), for the Teams menu. */
export async function getActiveTeams() {
  const { data } = await api.get("/teams", { params: { active: true } });
  return data;
}
