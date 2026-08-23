// Returns the metric-metadata map plus a `supportsScoring` capability flag.
// Metadata is sourced from the backend registry (/metrics), seeded with the
// bundled constants so the first render is never blank and other pages keep
// working before the fetch resolves.
//
// `supportsScoring` is true only once /metrics has confirmed the scoring-aware
// metrics exist. During a deploy window (new frontend, old backend that 404s
// /metrics) it stays false, so the leaderboard can fall back to fixed-PPR
// metrics instead of requesting one the old backend would reject with a 400.
import { useQuery } from "@tanstack/react-query";
import { getMetrics } from "../services/metrics";
import { METRICS as STATIC_METRICS } from "../constants";

export function useMetrics() {
  const { data } = useQuery({
    queryKey: ["metrics"],
    queryFn: getMetrics,
    staleTime: Infinity,
    retry: 1,
  });

  const supportsScoring =
    Array.isArray(data) && data.some((metric) => metric.id === "fantasy_points");

  let metrics = STATIC_METRICS;
  if (Array.isArray(data)) {
    metrics = { ...STATIC_METRICS };
    for (const metric of data) {
      metrics[metric.id] = {
        label: metric.label,
        short: metric.short,
        format: metric.format,
        description: metric.description,
        category: metric.category,
        // Which direction counts as "leading" this stat — fewest interceptions wins,
        // most receiving yards wins. Used by the comparison table's lead margins.
        higherIsBetter: metric.higher_is_better !== false,
        appliesTo: metric.applies_to,
        // Which seasons this metric has data in (M8). Absent for the bundled
        // fallbacks, which utils/availability treats as "available" — the right
        // default, since the only time they are used is before /metrics answers.
        availability: metric.availability,
      };
    }
  }

  return { metrics, supportsScoring };
}
