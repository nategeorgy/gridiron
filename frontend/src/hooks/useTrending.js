// Trending usage — who is gaining work and who is losing it (M10).
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getTrending } from "../services/stats";

export function useTrending(params, options = {}) {
  return useQuery({
    queryKey: ["trending", params],
    queryFn: () => getTrending(params),
    placeholderData: keepPreviousData,
    ...options,
  });
}
