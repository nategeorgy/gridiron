// The Query Builder's starting points and its URL grammar.
//
// A search lives entirely in the URL: grain, mode, positions, seasons, season type,
// team, rookies, the stat ranges, the columns, how many rows and the sort. The ranges
// are `where=field:min:max`, comma-separated, either bound optional, shares as fractions
// (0.25, not 25), which is exactly what GET /api/v1/explore/query takes, so the page
// passes it through. `cols=` is the columns after the filtered stats (absent for the
// defaults, empty for none) and `top=` cuts the result to its first N rows.
import { formatStat } from "../utils/format";

export const QUERY_POSITIONS = ["QB", "RB", "WR", "TE"];

/** How many rows a result shows. "all" pages through every match, 100 at a time. */
export const TOP_OPTIONS = [
  { value: "5", label: "5" },
  { value: "10", label: "10" },
  { value: "25", label: "25" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
  { value: "all", label: "All" },
];

/** The most rows an exported image holds: past this a table is a scroll, not a picture. */
export const IMAGE_MAX_ROWS = 100;

/** The Edit Columns library: the field catalogue's own groups, in this order. */
export const FIELD_GROUPS = ["Fantasy", "Passing", "Rushing", "Receiving", "Usage"];

export const SEASON_TYPE_OPTIONS = [
  { value: "REG", label: "Regular season" },
  { value: "POST", label: "Playoffs" },
  { value: "ALL", label: "Regular season and playoffs" },
];

export const ROOKIE_OPTIONS = [
  { value: "any", label: "Anyone" },
  { value: "only", label: "Rookies only" },
  { value: "exclude", label: "No rookies" },
];

/** Each example is a complete search: every parameter it does not name is the default. */
export const QUERY_EXAMPLES = [
  { id: "rec100", label: "100-yard receiving games", search: { pos: "WR,TE", where: "receiving_yards:100:" } },
  { id: "te20", label: "Most 20-point weeks by a TE", search: { pos: "TE", where: "fantasy_points:20:", mode: "count" } },
  { id: "workhorse", label: "Workhorse games", search: { pos: "RB", where: "carries:20:,targets:4:", sort: "fantasy_points" } },
  { id: "qbrush", label: "QBs running for 50+", search: { pos: "QB", where: "rushing_yards:50:", sort: "fantasy_points" } },
  { id: "rookies", label: "Rookie top-12 weeks", search: { pos: "RB,WR,TE", where: "weekly_finish::12", mode: "count", rookies: "only" } },
  { id: "boom30", label: "30-point weeks", search: { pos: "QB,RB,WR,TE", where: "fantasy_points:30:" } },
  { id: "k1000", label: "1,000-yard receiving seasons", search: { pos: "WR,TE", grain: "seasons", where: "receiving_yards:1000:" } },
  { id: "share25", label: "25% target share seasons", search: { pos: "WR,TE", grain: "seasons", where: "target_share:0.25:,games:8:" } },
];

export const DEFAULT_EXAMPLE = QUERY_EXAMPLES[0];

/** `where` text as [{ field, min, max }] (numbers or null). */
export function parseWhere(text) {
  return (text ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [field, min = "", max = ""] = part.split(":");
      const number = (value) => (value === "" || value === undefined ? null : Number(value));
      return { field, min: number(min), max: number(max) };
    })
    .filter((condition) => condition.field);
}

/** [{ field, min, max }] back to `where` text. */
export function formatWhere(conditions) {
  const bound = (value) => (value === null || value === undefined || Number.isNaN(value) ? "" : String(+Number(value).toFixed(6)));
  return conditions.map((condition) => `${condition.field}:${bound(condition.min)}:${bound(condition.max)}`).join(",");
}

/** A filter's range as the chips print it: "≥ 20%", "≤ 12", "100–150", "any". */
export function rangeText(condition, field) {
  const show = (value) => (field?.format === "pct" ? `${+(value * 100).toFixed(1)}%` : formatStat(value, field?.format === "int" ? "int" : 1).replace(/\.0$/, ""));
  if (condition.min !== null && condition.max !== null) return `${show(condition.min)}–${show(condition.max)}`;
  if (condition.min !== null) return `≥ ${show(condition.min)}`;
  if (condition.max !== null) return `≤ ${show(condition.max)}`;
  return "any";
}

const SEASON_TYPE_WORDS = { REG: "regular season", POST: "playoffs", ALL: "regular season and playoffs" };

/**
 * An exported image's subtitle: the search itself, so a shared image cannot misstate it.
 * "Rookies · WR, TE · 2009–2025 regular season · Target Share ≥ 20% · PPR"
 */
export function searchSubtitle({ search, positions, conditions, fields, scoring }) {
  const parts = [];
  if (search.rookies === "only") parts.push("Rookies");
  if (search.rookies === "exclude") parts.push("No rookies");
  parts.push(positions.length === QUERY_POSITIONS.length ? "All positions" : positions.join(", "));
  if (search.team) parts.push(search.team);
  const years = search.from === search.to ? `${search.from}` : `${search.from}–${search.to}`;
  parts.push(`${years} ${SEASON_TYPE_WORDS[search.type] ?? ""}`.trim());
  for (const condition of conditions) {
    if (condition.min === null && condition.max === null) continue;
    parts.push(`${fields[condition.field]?.label ?? condition.field} ${rangeText(condition, fields[condition.field])}`);
  }
  if (scoring) parts.push(scoring);
  return parts.join(" · ");
}

/**
 * An exported image's default title, which the dialog lets the reader rewrite: the
 * example's own name when the search is one, otherwise what the rows are and what they
 * are sorted by ("Rookie seasons by Target Share").
 */
export function searchTitle({ search, data, conditions, fields, example }) {
  if (example) return example.label;
  const sorted = data.columns.find((column) => column.key === data.sort);
  if (data.mode === "count") {
    const first = conditions.find((condition) => condition.min !== null || condition.max !== null);
    if (data.sort !== "matches") return `Players by ${sorted?.label ?? "matching games"}`;
    return first
      ? `Most games with ${fields[first.field]?.label ?? first.field} ${rangeText(first, fields[first.field])}`
      : "Most games played";
  }
  const noun = data.grain === "seasons" ? "seasons" : "games";
  const rows = search.rookies === "only" ? `Rookie ${noun}` : `${noun[0].toUpperCase()}${noun.slice(1)}`;
  return sorted ? `${rows} by ${sorted.label}` : rows;
}
