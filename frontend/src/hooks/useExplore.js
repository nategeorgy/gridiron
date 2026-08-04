// React Query hooks for the M4 Explore views (scatter + comparison).
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getCompare, getScatter } from "../services/stats";

export function useScatter(params) {
  return useQuery({
    queryKey: ["scatter", params],
    queryFn: () => getScatter(params),
    placeholderData: keepPreviousData,
  });
}

// `players` is a comma-separated id list; the query is disabled until at least one
// player is picked, so an empty comparison never hits the API.
export function useCompare(params) {
  return useQuery({
    queryKey: ["compare", params],
    queryFn: () => getCompare(params),
    enabled: Boolean(params.players),
    placeholderData: keepPreviousData,
  });
}
