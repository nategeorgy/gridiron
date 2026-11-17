import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getRankRace } from "../services/stats";

/** A position's leaders and their rank in season points after every week (the home page's Rank Race). */
export function useRankRace(params, options = {}) {
  return useQuery({
    queryKey: ["rank-race", params],
    queryFn: () => getRankRace(params),
    placeholderData: keepPreviousData,
    ...options,
  });
}
