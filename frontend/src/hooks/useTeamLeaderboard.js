// React Query hook for the team leaderboard.
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getTeam, getTeamLeaderboard } from "../services/teams";

export function useTeamLeaderboard(params) {
  return useQuery({
    queryKey: ["team-leaderboard", params],
    queryFn: () => getTeamLeaderboard(params),
    placeholderData: keepPreviousData,
  });
}

/** One team's page (M6.2). */
export function useTeam(teamId, params) {
  return useQuery({
    queryKey: ["team", teamId, params],
    queryFn: () => getTeam(teamId, params),
    enabled: Boolean(teamId),
    placeholderData: keepPreviousData,
  });
}
