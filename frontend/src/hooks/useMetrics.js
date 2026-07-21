// Returns a complete metric-metadata map keyed by id. Sourced from the backend
// registry (/metrics), seeded with the bundled constants so the first render is
// never blank and other pages keep working before the fetch resolves.
import { useQuery } from "@tanstack/react-query";
import { getMetrics } from "../services/metrics";
import { METRICS as STATIC_METRICS } from "../constants";

export function useMetrics() {
  const { data } = useQuery({
    queryKey: ["metrics"],
    queryFn: getMetrics,
    staleTime: Infinity,
  });

  if (!data) return STATIC_METRICS;

  const map = { ...STATIC_METRICS };
  for (const metric of data) {
    map[metric.id] = {
      label: metric.label,
      short: metric.short,
      format: metric.format,
      description: metric.description,
      category: metric.category,
    };
  }
  return map;
}
