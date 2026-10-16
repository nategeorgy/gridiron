// React Query hooks for the schedule (M10).
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getGame, getGamePlays, getGamePreview, getGameRecap, getGames, getGameWeeks, getScoreboard } from "../services/games";

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

// One game's page (October 2026). A finished game only changes when a stat correction
// lands, so the header and recap are held for a few minutes like the scoreboard.
export function useGame(gameId) {
  return useQuery({
    queryKey: ["game", gameId],
    queryFn: () => getGame(gameId),
    enabled: Boolean(gameId),
    staleTime: 5 * 60 * 1000,
    retry: (count, error) => error?.response?.status !== 404 && count < 2,
  });
}

export function useGameRecap(gameId, scoring, { enabled = true } = {}) {
  return useQuery({
    queryKey: ["game-recap", gameId, scoring],
    queryFn: () => getGameRecap(gameId, { scoring }),
    enabled: Boolean(gameId) && enabled,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  });
}

/** The play list is the heaviest part of a recap, so it loads when its tab opens. */
export function useGamePlays(gameId, { enabled = true } = {}) {
  return useQuery({
    queryKey: ["game-plays", gameId],
    queryFn: () => getGamePlays(gameId),
    enabled: Boolean(gameId) && enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useGamePreview(gameId, scoring, { enabled = true } = {}) {
  return useQuery({
    queryKey: ["game-preview", gameId, scoring],
    queryFn: () => getGamePreview(gameId, { scoring }),
    enabled: Boolean(gameId) && enabled,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  });
}
