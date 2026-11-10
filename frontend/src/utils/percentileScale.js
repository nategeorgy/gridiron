// The player leaderboard's percentile colours (November 2026): green at 100, yellow at
// the median, orange at 25, red at 0, as one smooth scale. Every colour is a CSS
// `color-mix` over the --pctl-* tokens in index.css, so a theme switch re-colours the
// table without a re-render.
//
// Two uses of the same scale:
// - a FILL behind a cell (`percentileFill`), mixed with transparent and stronger toward
//   the ends, so a median cell is a faint wash and a 99th a solid tint;
// - an INK for the small number under a value (`percentileInk`), readable on the card.
//
// A rank is coloured by where it sits in its own pool (`rankPercentile`), not by the
// percentile beside it: ties share a rank, so every receiver with no fumbles is #1 while
// his percentile is a mid-rank in the high 60s, and "#1" painted yellow reads as a bug.

const SCALE = {
  fill: ["--pctl-green", "--pctl-yellow", "--pctl-orange", "--pctl-red"],
  ink: ["--pctl-ink-green", "--pctl-ink-yellow", "--pctl-ink-orange", "--pctl-ink-red"],
};

/** The scale's colour at percentile `p` (0-100), as a CSS colour. */
function scaleColor(p, kind) {
  const [green, yellow, orange, red] = SCALE[kind].map((token) => `var(${token})`);
  const value = Math.max(0, Math.min(100, p));
  if (value >= 50) return `color-mix(in srgb, ${green} ${Math.round((value - 50) * 2)}%, ${yellow})`;
  if (value >= 25) return `color-mix(in srgb, ${orange} ${Math.round((50 - value) * 4)}%, ${yellow})`;
  return `color-mix(in srgb, ${red} ${Math.round((25 - value) * 4)}%, ${orange})`;
}

/** Text colour for a percentile, or undefined when there is none. */
export function percentileInk(p) {
  return p === null || p === undefined ? undefined : scaleColor(p, "ink");
}

/** Cell background for a percentile, or undefined when there is none. */
export function percentileFill(p) {
  if (p === null || p === undefined) return undefined;
  const distance = (Math.abs(Math.max(0, Math.min(100, p)) - 50) / 50).toFixed(2);
  const strength = `calc(var(--pctl-fill-lo) + (var(--pctl-fill-hi) - var(--pctl-fill-lo)) * ${distance})`;
  return `color-mix(in srgb, ${scaleColor(p, "fill")} ${strength}, transparent)`;
}

/** Where rank `rank` of `poolSize` sits, as a percentile: #1 is 100, last is 0. */
export function rankPercentile(rank, poolSize) {
  if (!rank || !poolSize) return null;
  return poolSize > 1 ? (100 * (poolSize - Math.min(rank, poolSize))) / (poolSize - 1) : 50;
}

/** Eleven stops for a legend bar, 0 to 100. */
export const LEGEND_STOPS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
