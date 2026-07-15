// React Query hook for the team leaderboard.
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getTeamLeaderboard } from "../services/teams";

export function useTeamLeaderboard(params) {
  return useQuery({
    queryKey: ["team-leaderboard", params],
    queryFn: () => getTeamLeaderboard(params),
    placeholderData: keepPreviousData,
  });
}
