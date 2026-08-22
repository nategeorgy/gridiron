// React Query hook for the Draft Value Board (M6.1).
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getDraftBoard, getSos, getVegas } from "../services/stats";

export function useDraftBoard(params, options = {}) {
  return useQuery({
    queryKey: ["draft-board", params],
    queryFn: () => getDraftBoard(params),
    placeholderData: keepPreviousData,
    ...options,
  });
}

/** Strength of schedule (M6.3). */
export function useSos(params, options = {}) {
  return useQuery({
    queryKey: ["sos", params],
    queryFn: () => getSos(params),
    placeholderData: keepPreviousData,
    ...options,
  });
}

/** The Vegas board (M6.4). */
export function useVegas(params, options = {}) {
  return useQuery({
    queryKey: ["vegas", params],
    queryFn: () => getVegas(params),
    placeholderData: keepPreviousData,
    ...options,
  });
}
