// The one place a percentile becomes a colour on the player page.
//
// Diverging around the median rather than ramping in one direction, for the same
// reason `StatTable` does it: on a page carrying forty ranked numbers a single-direction
// ramp paints everything green and distinguishes nothing, while neutral-at-50 makes an
// unusual number visible without being read.
//
// Direction is already applied by the API — `higher_is_better` is inverted before a
// percentile is reported — so 95 always means good here, drops and interceptions
// included. Nothing on this page needs to know which way a metric points.

/** Tint for a percentile, neutral at the median and saturating toward both extremes. */
export function percentileColor(percentile) {
  if (percentile === null || percentile === undefined) return undefined;
  const distance = Math.abs(percentile - 50) / 50;
  const strength = Math.round(distance * 100);
  const hue = percentile >= 50 ? "var(--pos)" : "var(--neg)";
  return `color-mix(in srgb, ${hue} ${strength}%, var(--faint))`;
}
