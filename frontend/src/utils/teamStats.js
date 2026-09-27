// Formatting and rank colours for team stats (team pages and team leaderboards).
//
// Every rank on a team surface uses the player leaderboards' percentile colour: neutral
// at the median, greener toward 1st, redder toward last. The API ranks 1 = best (or,
// for a tendency with no better direction, 1 = most), so rank 1 is always the green end
// and nothing here needs to know which way a stat points.

const MINUS = "−";
const signed = (value, digits) => {
  const rounded = Number(value.toFixed(digits));
  return `${rounded > 0 ? "+" : rounded < 0 ? MINUS : ""}${Math.abs(rounded).toFixed(digits)}`;
};

/** Format a team metric value by the API's format code. */
export function formatTeamStat(value, code) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  switch (code) {
    case "pct0": return `${(value * 100).toFixed(0)}%`;
    case "pct1": return `${(value * 100).toFixed(1)}%`;
    case "sgn2": return signed(value, 2);
    case "sgn1": return signed(value, 1);
    case "pp1": return `${signed(value, 1)}%`;
    case "num0": return value.toFixed(0);
    case "num2": return value.toFixed(2).replace("-", MINUS);
    default: return value.toFixed(1).replace("-", MINUS);
  }
}

/** 0-100, where rank 1 of n is 100 and rank n is 0. */
export function rankPercentile(rank, n = 32) {
  if (!rank) return null;
  return n > 1 ? ((n - rank) / (n - 1)) * 100 : 50;
}

function hueAndDistance(rank, n) {
  const p = rankPercentile(rank, n);
  if (p === null) return null;
  return { hue: p >= 50 ? "var(--pos)" : "var(--neg)", distance: Math.abs(p - 50) / 50 };
}

/** Text colour for a rank, exactly the player boards' percentile colour. */
export function rankInk(rank, n = 32) {
  const h = hueAndDistance(rank, n);
  return h ? `color-mix(in srgb, ${h.hue} ${Math.round(h.distance * 100)}%, var(--faint))` : "var(--faint)";
}

/** Readable text on a card for a value coloured by its rank. */
export function rankText(rank, n = 32) {
  const h = hueAndDistance(rank, n);
  return h ? `color-mix(in srgb, ${h.hue} ${Math.round(h.distance * 60)}%, var(--fg))` : "var(--fg)";
}

/** A translucent fill: rank cells, field bands, lane columns. */
export function rankFill(rank, n = 32, strength = 45) {
  const h = hueAndDistance(rank, n);
  return h ? `color-mix(in srgb, ${h.hue} ${Math.round(h.distance * strength)}%, transparent)` : "transparent";
}

/** An opaque fill for a badge drawn on top of other marks. */
export function rankSolid(rank, n = 32) {
  const h = hueAndDistance(rank, n);
  return h ? `color-mix(in srgb, ${h.hue} ${Math.round(h.distance * 55)}%, var(--surface-solid))` : "color-mix(in srgb, var(--fg) 22%, var(--surface-solid))";
}

export function rankStroke(rank, n = 32) {
  const h = hueAndDistance(rank, n);
  return h ? `color-mix(in srgb, ${h.hue} ${Math.round(h.distance * 100)}%, var(--border-strong))` : "var(--border-strong)";
}

/** Pull one team's [value, rank] for a metric and side out of a /teams/stats response. */
export function teamValue(board, metricId, side, abbreviation) {
  const entry = board?.values?.[metricId]?.[side]?.[abbreviation];
  return entry ? { value: entry[0], rank: entry[1] } : { value: null, rank: null };
}

/** How many teams have a value for a metric and side (the rank's denominator). */
export function rankedCount(board, metricId, side) {
  return Object.keys(board?.values?.[metricId]?.[side] ?? {}).length || 32;
}

const DIVISION_ORDER = ["AFC East", "AFC North", "AFC South", "AFC West", "NFC East", "NFC North", "NFC South", "NFC West"];

/** Teams grouped by division in the league's usual order, each division alphabetical. */
export function teamsByDivision(teams) {
  const groups = Object.fromEntries(DIVISION_ORDER.map((division) => [division, []]));
  for (const team of teams ?? []) (groups[team.division] = groups[team.division] ?? []).push(team);
  return Object.entries(groups)
    .filter(([, list]) => list.length)
    .map(([division, list]) => ({ division, teams: [...list].sort((a, b) => a.name.localeCompare(b.name)) }));
}

/** Division place: wins (ties count half), then point differential per game. */
export function divisionPlace(board, abbreviation) {
  const team = board?.teams?.find((entry) => entry.abbreviation === abbreviation);
  if (!team) return null;
  const score = (entry) => (entry.record?.wins ?? 0) + (entry.record?.ties ?? 0) / 2;
  const diff = (entry) => (board.values?.ppg?.o?.[entry.abbreviation]?.[0] ?? 0) - (board.values?.ppg?.d?.[entry.abbreviation]?.[0] ?? 0);
  const rivals = board.teams.filter((entry) => entry.division === team.division).sort((a, b) => score(b) - score(a) || diff(b) - diff(a));
  return rivals.findIndex((entry) => entry.abbreviation === abbreviation) + 1;
}

export function recordText(record) {
  if (!record) return null;
  return `${record.wins}–${record.losses}${record.ties ? `–${record.ties}` : ""}`;
}
