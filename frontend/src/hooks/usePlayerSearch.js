// React Query hook for header player search. Only fires once the (debounced)
// term is at least 2 characters.
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getPlayers } from "../services/players";

export function usePlayerSearch(term) {
  const trimmed = term.trim();
  return useQuery({
    queryKey: ["player-search", trimmed],
    queryFn: () => getPlayers({ search: trimmed, limit: 8 }),
    enabled: trimmed.length >= 2,
    placeholderData: keepPreviousData,
  });
}
