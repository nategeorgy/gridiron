// The Query Builder's starting points and its URL grammar.
//
// A search lives entirely in the URL: grain, mode, positions, seasons, season type,
// team, rookies, the stat ranges and the sort. The ranges are `where=field:min:max`,
// comma-separated, either bound optional, shares as fractions (0.25, not 25), which is
// exactly what GET /api/v1/explore/query takes, so the page passes it through.

export const QUERY_POSITIONS = ["QB", "RB", "WR", "TE"];

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
