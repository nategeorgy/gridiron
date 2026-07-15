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

export function usePlayerGameLog(playerId) {
  return useQuery({
    queryKey: ["player-gamelog", playerId],
    queryFn: () => getPlayerGameLog(playerId),
    enabled: Boolean(playerId),
  });
}
