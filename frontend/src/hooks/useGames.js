// React Query hooks for the schedule (M10).
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getGames, getGameWeeks, getScoreboard } from "../services/games";

export function useGames(params, options = {}) {
  return useQuery({
    queryKey: ["games", params],
    queryFn: () => getGames(params),
    placeholderData: keepPreviousData,
    ...options,
  });
}

export function useGameWeeks(params, options = {}) {
  return useQuery({
    queryKey: ["game-weeks", params],
    queryFn: () => getGameWeeks(params),
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

// The two-week home scoreboard. Which weeks those are only changes when a game is
// played, so this is cheap to hold for a few minutes.
export function useScoreboard(options = {}) {
  return useQuery({
    queryKey: ["scoreboard"],
    queryFn: getScoreboard,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}
