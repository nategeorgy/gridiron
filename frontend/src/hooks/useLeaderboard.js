// React Query hook wrapping the leaderboard service call.
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getLeaderboard } from "../services/stats";

// `options.enabled` lets a caller hold the request back until its params are
// meaningful — the Command Center's watchlist card waits for the favorites list, and
// an empty player_ids would otherwise read as "no filter" and return everyone.
export function useLeaderboard(params, options = {}) {
  return useQuery({
    queryKey: ["leaderboard", params],
    queryFn: () => getLeaderboard(params),
    placeholderData: keepPreviousData,
    ...options,
  });
}
