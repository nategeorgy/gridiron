// Shared helpers for the Explore tab's charts: depth buckets, names, colours for EPA
// and percentiles, axis ticks, and the air-yard densities behind the heatmaps and the
// distribution curves.
//
// Everything here is plain arithmetic on what the API returns, so a chart and its
// exported image draw from the same numbers.

/** The four depth buckets, as the API counts them (app/explore.py). */
export const DEPTHS = [
  { key: "behind", label: "Behind the line", short: "Behind", range: "under 0" },
  { key: "short", label: "Short", short: "Short", range: "0–9 yds" },
  { key: "intermediate", label: "Intermediate", short: "Intermediate", range: "10–19 yds" },
  { key: "deep", label: "Deep", short: "Deep", range: "20+ yds" },
];

/** The ordered ramp for the four depths (index.css). */
export const DEPTH_COLORS = [0, 1, 2, 3].map((index) => `var(--depth${index})`);

/** Sides as play-by-play records them, from the passer's point of view. */
export const SIDES = ["Left", "Middle", "Right"];

/** The API's one-yard air-yard histograms run from -10 to +45, clamped at both ends. */
export const HIST_MIN = -10;
export const HIST_MAX = 45;

/** Which depth bucket an air-yard value falls in. */
export function depthIndex(airYards) {
  if (airYards === null || airYards === undefined) return null;
  if (airYards < 0) return 0;
  if (airYards < 10) return 1;
  if (airYards < 20) return 2;
  return 3;
}

/** Categorical colour for the nth compared player (never cycled past five). */
export const seriesColor = (index) => `var(--series-${index + 1})`;

/** A position's identity colour. */
export const positionColor = (position) =>
  position ? `var(--position-${position.toLowerCase()}, var(--muted))` : "var(--muted)";

const SUFFIX = /^(Jr\.?|Sr\.?|II|III|IV|V)$/;

/** "Amon-Ra St. Brown" -> "St. Brown", "Marvin Harrison Jr." -> "Harrison Jr." */
export function lastName(name) {
  const parts = String(name ?? "").split(" ");
  if (parts.length > 2 && SUFFIX.test(parts[parts.length - 1])) return parts.slice(-2).join(" ");
  return parts.slice(1).join(" ") || String(name ?? "");
}

export function initials(name) {
  return String(name ?? "")
    .split(" ")
    .filter((word) => /^[A-Z]/.test(word))
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
}

/** "+0.24", "−0.10": a real minus sign, so a column of signed numbers lines up. */
export function signed(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}`;
}

/** Share of a total as a whole percent, safe on an empty total. */
export const percentOf = (part, total) => (total ? Math.round((part / total) * 100) : 0);

/**
 * Diverging fill for EPA per target: red below zero, neutral grey at zero, green above,
 * saturating at `span`.
 */
export function epaColor(epa, span = 0.6) {
  if (epa === null || epa === undefined) return "color-mix(in srgb, var(--fg) 30%, transparent)";
  const strength = Math.min(100, Math.round((Math.abs(epa) / span) * 100));
  return `color-mix(in srgb, ${epa >= 0 ? "var(--pos)" : "var(--neg)"} ${strength}%, color-mix(in srgb, var(--fg) 34%, var(--surface-solid)))`;
}

/** The app's percentile tint: neutral at the median, saturating toward both ends. */
export function percentileColor(percentile) {
  if (percentile === null || percentile === undefined) return "var(--faint)";
  const strength = Math.round((Math.abs(percentile - 50) / 50) * 100);
  return `color-mix(in srgb, ${percentile >= 50 ? "var(--pos)" : "var(--neg)"} ${strength}%, var(--faint))`;
}

/** Round axis ticks covering [lo, hi], about `count` of them. */
export function niceTicks(lo, hi, count = 6) {
  const span = hi - lo || 1;
  const rough = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((candidate) => span / candidate <= count) ?? 10 * magnitude;
  const ticks = [];
  for (let tick = Math.ceil(lo / step - 1e-9) * step; tick <= hi + 1e-9; tick += step) ticks.push(+tick.toFixed(10));
  return ticks;
}

export function median(values) {
  const sorted = values.filter((value) => value !== null && value !== undefined).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * A smoothed air-yard distribution from a one-yard histogram, sampled once a yard from
 * -10 to +40 and normalised so the curve's height is a share of targets. The same
 * Gaussian (σ 2.6 yards) for every player, so two curves compare by shape.
 */
export function airYardDensity(hist, sigma = 2.6) {
  const total = hist.reduce((sum, count) => sum + count, 0) || 1;
  const curve = [];
  for (let x = -10; x <= 40; x += 1) {
    let value = 0;
    hist.forEach((count, index) => {
      if (!count) return;
      const yards = Math.min(40, index + HIST_MIN);
      value += count * Math.exp(-0.5 * ((x - yards) / sigma) ** 2);
    });
    curve.push(value / total);
  }
  return curve;
}

/** One-yard air-yard histograms per side, from a list of targets. */
export function sideHistograms(targets) {
  const heat = [0, 1, 2].map(() => new Array(HIST_MAX - HIST_MIN + 1).fill(0));
  for (const target of targets ?? []) {
    const side = ["left", "middle", "right"].indexOf(target.location);
    if (side < 0 || target.air_yards === null || target.air_yards === undefined) continue;
    heat[side][Math.min(HIST_MAX, Math.max(HIST_MIN, target.air_yards)) - HIST_MIN] += 1;
  }
  return heat;
}

/** The depth-and-side zone counts (depth * 3 + side) from a list of targets. */
export function zoneCounts(targets) {
  const zones = new Array(12).fill(0);
  const caught = new Array(12).fill(0);
  for (const target of targets ?? []) {
    const side = ["left", "middle", "right"].indexOf(target.location);
    const depth = depthIndex(target.air_yards);
    if (side < 0 || depth === null) continue;
    zones[depth * 3 + side] += 1;
    if (target.complete) caught[depth * 3 + side] += 1;
  }
  return { zones, caught };
}

/** Deep share and catch rate of a tally the API returned. */
export function tallyRates(tally) {
  const charted = tally?.charted || 0;
  return {
    deep: charted ? tally.depth[3] / charted : 0,
    behind: charted ? tally.depth[0] / charted : 0,
    catchRate: tally?.targets ? tally.receptions / tally.targets : 0,
  };
}

/** A one-yard air-yard histogram (-10 to +45, clamped) from a list of targets. */
export function airYardHistogram(targets) {
  const hist = new Array(HIST_MAX - HIST_MIN + 1).fill(0);
  for (const target of targets ?? []) {
    if (target.air_yards === null || target.air_yards === undefined) continue;
    hist[Math.min(HIST_MAX, Math.max(HIST_MIN, target.air_yards)) - HIST_MIN] += 1;
  }
  return hist;
}
