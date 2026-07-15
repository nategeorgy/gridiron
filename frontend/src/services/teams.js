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
