// React Query hooks for the fantasy-intelligence endpoints (M3).
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getIntelligence, getPlayerIntelligence } from "../services/insight";

export function useIntelligence(params, options = {}) {
  return useQuery({
    queryKey: ["intelligence", params],
    queryFn: () => getIntelligence(params),
    placeholderData: keepPreviousData,
    ...options,
  });
}

/** One player's scores. Disabled until a season is known (the game log resolves it). */
export function usePlayerIntelligence(playerId, params) {
  return useQuery({
    queryKey: ["player-intelligence", playerId, params],
    queryFn: () => getPlayerIntelligence(playerId, params),
    enabled: Boolean(playerId && params?.season),
    // A player with no stats in the window is a 404, not a transient failure.
    retry: false,
  });
}
