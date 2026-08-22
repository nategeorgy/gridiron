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

/**
 * Format a 0–1 percentile as an ordinal ("0.92" -> "92nd"). Used by the Insight
 * breakdown, where "92nd among receivers" is the sentence a manager can act on.
 */
/** 1 -> "1st", 21 -> "21st", 13 -> "13th". The teens are the whole reason this exists. */
export function ordinal(value) {
  if (value === null || value === undefined) return "—";
  const lastTwo = Math.abs(value) % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${value}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[Math.abs(value) % 10] ?? "th";
  return `${value}${suffix}`;
}

export function formatPercentile(fraction) {
  if (fraction === null || fraction === undefined) return "—";
  return ordinal(Math.max(1, Math.min(99, Math.round(fraction * 100))));
}

/** Prefix a signed value with an explicit "+" so gaps read as gaps. */
export function formatSigned(value, format) {
  if (value === null || value === undefined) return "—";
  return `${value > 0 ? "+" : ""}${formatStat(value, format)}`;
}
