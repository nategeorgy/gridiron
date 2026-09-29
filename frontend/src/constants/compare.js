// Player Comparison: its examples, the weekly chart's stats, and the URL grammar.
//
// The comparison is the URL: `players=id:season,id:season`, up to five, so a player can
// sit beside himself in another season. Ids are nflverse's gsis ids, which do not change.

export const MAX_COMPARED = 5;

export const COMPARE_EXAMPLES = [
  { id: "receivers", label: "Receivers", players: ["00-0039075", "00-0038543", "00-0036900", "00-0036963"] },
  { id: "backs", label: "Backs", players: ["00-0038542", "00-0039139", "00-0033280", "00-0039040"] },
  { id: "quarterbacks", label: "Quarterbacks", players: ["00-0034857", "00-0026498", "00-0036389", "00-0039851"] },
  { id: "mixed", label: "Mixed positions", players: ["00-0037744", "00-0039075", "00-0033280"] },
];

/** The week-by-week chart's choices: a stat line field from the game log. */
export const WEEKLY_STATS = [
  { value: "fantasy_points", label: "Fantasy points", format: 1 },
  { value: "expected_fantasy_points", label: "Expected points", format: 1 },
  { value: "targets", label: "Targets", format: "int" },
  { value: "carries", label: "Carries", format: "int" },
  { value: "snap_share", label: "Snap share", format: "pct" },
  { value: "target_share", label: "Target share", format: "pct" },
  { value: "receiving_yards", label: "Receiving yards", format: "int" },
  { value: "rushing_yards", label: "Rushing yards", format: "int" },
  { value: "passing_yards", label: "Passing yards", format: "int" },
];

/** `id:season,id:season` as [{ id, season }], deduplicated and capped. */
export function parseCompared(text, fallbackSeason) {
  const seen = new Set();
  const out = [];
  for (const part of (text ?? "").split(",")) {
    const [id, season] = part.trim().split(":");
    if (!id) continue;
    const entry = { id, season: Number(season) || Number(fallbackSeason) };
    const key = `${entry.id}:${entry.season}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out.slice(0, MAX_COMPARED);
}

export const formatCompared = (slots) => slots.map((slot) => `${slot.id}:${slot.season}`).join(",");

/** The leaderboard position group whose presets fit these positions. */
export function compareGroup(positions) {
  const set = [...new Set(positions.filter(Boolean))];
  if (set.length === 1) return set[0];
  if (set.every((position) => position === "WR" || position === "TE")) return "WR,TE";
  if (!set.includes("QB")) return "RB,WR,TE";
  return "all";
}

/** Which set of charts a comparison gets. */
export function compareKind(positions) {
  const set = [...new Set(positions.filter(Boolean))];
  if (!set.length) return "none";
  if (set.every((position) => position === "WR" || position === "TE")) return "receivers";
  if (set.every((position) => position === "RB")) return "backs";
  if (set.every((position) => position === "QB")) return "quarterbacks";
  return "mixed";
}
