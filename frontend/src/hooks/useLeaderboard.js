// React Query hook wrapping the leaderboard service call.
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getLeaderboard } from "../services/stats";

export function useLeaderboard(params) {
  return useQuery({
    queryKey: ["leaderboard", params],
    queryFn: () => getLeaderboard(params),
    placeholderData: keepPreviousData,
  });
}
