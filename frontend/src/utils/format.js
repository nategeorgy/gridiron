// Formatting helpers for stat values in tables.

/**
 * Format a metric value according to its format spec (see constants METRICS).
 * Returns an em dash for null/undefined so columns stay aligned.
 */
export function formatStat(value, format) {
  if (value === null || value === undefined) return "—";
  if (format === "int") return Math.round(value).toLocaleString();
  if (format === "pct") return `${(value * 100).toFixed(1)}%`;
  if (typeof format === "number") return Number(value).toFixed(format);
  return String(value);
}
