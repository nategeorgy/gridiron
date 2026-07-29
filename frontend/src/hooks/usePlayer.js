// React Query hooks for player profile + game log.
import { useQuery } from "@tanstack/react-query";
import { getPlayer, getPlayerGameLog } from "../services/players";

export function usePlayer(playerId) {
  return useQuery({
    queryKey: ["player", playerId],
    queryFn: () => getPlayer(playerId),
    enabled: Boolean(playerId),
  });
}

// `scoring` is the active league-scoring spec: the backend uses it to set
// fantasy_points and expected_fantasy_points on every stat line, so the game log is
// in the user's own scoring (M1 spine A). It is part of the query key so switching
// scoring refetches.
export function usePlayerGameLog(playerId, scoring) {
  return useQuery({
    queryKey: ["player-gamelog", playerId, scoring],
    queryFn: () => getPlayerGameLog(playerId, scoring ? { scoring } : {}),
    enabled: Boolean(playerId),
  });
}
