import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getWeeklyFinishes } from "../services/stats";

/** A position's weekly finishes for the home page grid. */
export function useWeeklyFinishes(params, options = {}) {
  return useQuery({
    queryKey: ["weekly-finishes", params],
    queryFn: () => getWeeklyFinishes(params),
    placeholderData: keepPreviousData,
    ...options,
  });
}
