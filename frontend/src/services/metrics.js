// Metric registry API call. The backend (/metrics) is the single source of
// truth for metric metadata (labels, formats, aggregation).
import { api } from "./api";

export async function getMetrics() {
  const { data } = await api.get("/metrics");
  return data.data;
}
