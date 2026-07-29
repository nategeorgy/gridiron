// Shared UI constants: seasons, positions, metric definitions, and the
// position-aware column sets shown in the leaderboard.

export const SEASONS = [2025, 2024, 2023, 2022, 2021, 2020];

export const SEASON_TYPES = [
  { value: "REG", label: "Regular Season" },
  { value: "POST", label: "Playoffs" },
];

export const POSITIONS = [
  { value: "", label: "All Positions" },
  { value: "QB", label: "QB" },
  { value: "RB", label: "RB" },
  { value: "WR", label: "WR" },
  { value: "TE", label: "TE" },
];

// Weeks 1-18 regular season; "" = full season aggregate.
export const WEEKS = [
  { value: "", label: "Full Season" },
  ...Array.from({ length: 18 }, (_, i) => ({
    value: String(i + 1),
    label: `Week ${i + 1}`,
  })),
];

// number = decimal places; "int" = integer; "pct" = fraction shown as %.
const FORMATS = { int: "int", one: 1, two: 2, three: 3, pct: "pct" };

// Every rankable/displayable metric: key -> { label, short, format }.
// This is a seed for the leaderboard; the backend /metrics registry is the
// authoritative source at runtime (see useMetrics).
export const METRICS = {
  fantasy_points: { label: "Fantasy Points", short: "FPTS", format: FORMATS.one },
  fantasy_ppg: { label: "Fantasy PPG", short: "FPPG", format: FORMATS.two },
  fantasy_points_ppr: { label: "Fantasy Points (PPR)", short: "PPR", format: FORMATS.one },
  fantasy_ppg_ppr: { label: "Fantasy PPG (PPR)", short: "PPG", format: FORMATS.two },
  fantasy_points_half: { label: "Fantasy Points (Half)", short: "HALF", format: FORMATS.one },
  fantasy_points_std: { label: "Fantasy Points (Std)", short: "STD", format: FORMATS.one },
  passing_yards: { label: "Passing Yards", short: "PASS YD", format: FORMATS.int },
  passing_tds: { label: "Passing TDs", short: "PASS TD", format: FORMATS.int },
  interceptions: { label: "Interceptions", short: "INT", format: FORMATS.int },
  completions: { label: "Completions", short: "CMP", format: FORMATS.int },
  attempts: { label: "Attempts", short: "ATT", format: FORMATS.int },
  passer_rating: { label: "Passer Rating", short: "RATE", format: FORMATS.one },
  cpoe: { label: "CPOE", short: "CPOE", format: FORMATS.one },
  epa: { label: "EPA", short: "EPA", format: FORMATS.one },
  rushing_yards: { label: "Rushing Yards", short: "RUSH YD", format: FORMATS.int },
  rushing_tds: { label: "Rushing TDs", short: "RUSH TD", format: FORMATS.int },
  carries: { label: "Carries", short: "CAR", format: FORMATS.int },
  red_zone_rush_attempts: { label: "Red Zone Carries", short: "RZ CAR", format: FORMATS.int },
  receiving_yards: { label: "Receiving Yards", short: "REC YD", format: FORMATS.int },
  receiving_tds: { label: "Receiving TDs", short: "REC TD", format: FORMATS.int },
  receptions: { label: "Receptions", short: "REC", format: FORMATS.int },
  targets: { label: "Targets", short: "TGT", format: FORMATS.int },
  target_share: { label: "Target Share", short: "TGT%", format: FORMATS.pct },
  air_yards: { label: "Air Yards", short: "AIR YD", format: FORMATS.int },
  adot: { label: "ADOT", short: "ADOT", format: FORMATS.one },
  yards_after_catch: { label: "Yards After Catch", short: "YAC", format: FORMATS.int },
  wopr: { label: "WOPR", short: "WOPR", format: FORMATS.two },
  racr: { label: "RACR", short: "RACR", format: FORMATS.two },
  red_zone_targets: { label: "Red Zone Targets", short: "RZ TGT", format: FORMATS.int },
  red_zone_rush_share: { label: "Red Zone Rush Share", short: "RZ RUN%", format: FORMATS.pct },
  air_yards_share: { label: "Air Yards Share", short: "AY%", format: FORMATS.pct },
  yards_per_target: { label: "Yards Per Target", short: "Y/TGT", format: FORMATS.two },
  yards_per_reception: { label: "Yards Per Reception", short: "Y/REC", format: FORMATS.two },
  rushing_epa: { label: "Rushing EPA", short: "RU EPA", format: FORMATS.one },
  receiving_epa: { label: "Receiving EPA", short: "RE EPA", format: FORMATS.one },
  fumbles_lost: { label: "Fumbles Lost", short: "FUM L", format: FORMATS.int },
};

// Metrics offered in the "sort by" dropdown, grouped for scannability.
export const SORT_METRICS = [
  "fantasy_points", "fantasy_ppg",
  "passing_yards", "passing_tds", "passer_rating", "epa", "cpoe",
  "rushing_yards", "rushing_tds", "carries", "red_zone_rush_attempts",
  "receiving_yards", "receiving_tds", "receptions", "targets", "target_share",
];

// Columns displayed per position filter (after the fixed identity columns).
// Fantasy columns are scoring-aware (recomputed from the active league scoring).
const FANTASY_COLS = ["fantasy_points", "fantasy_ppg"];
export const COLUMN_SETS = {
  "": [...FANTASY_COLS, "passing_yards", "rushing_yards", "receiving_yards", "targets"],
  QB: ["passing_yards", "passing_tds", "interceptions", "passer_rating", "cpoe", "epa", "rushing_yards", ...FANTASY_COLS],
  RB: ["carries", "rushing_yards", "rushing_tds", "red_zone_rush_attempts", "targets", "receiving_yards", ...FANTASY_COLS],
  WR: ["targets", "receptions", "receiving_yards", "receiving_tds", "target_share", "adot", ...FANTASY_COLS],
  TE: ["targets", "receptions", "receiving_yards", "receiving_tds", "target_share", ...FANTASY_COLS],
};

// Team leaderboard metric definitions (offensive production).
export const TEAM_METRICS = {
  total_yards: { label: "Total Yards", short: "TOT YD", format: "int" },
  yards_per_game: { label: "Yards / Game", short: "YPG", format: 1 },
  passing_yards: { label: "Passing Yards", short: "PASS YD", format: "int" },
  passing_tds: { label: "Passing TDs", short: "PASS TD", format: "int" },
  rushing_yards: { label: "Rushing Yards", short: "RUSH YD", format: "int" },
  rushing_tds: { label: "Rushing TDs", short: "RUSH TD", format: "int" },
  total_tds: { label: "Total TDs", short: "TOT TD", format: "int" },
  interceptions: { label: "Interceptions", short: "INT", format: "int" },
  epa: { label: "EPA", short: "EPA", format: 1 },
};

// Columns shown in the team leaderboard (all are also sortable).
export const TEAM_COLUMNS = [
  "total_yards", "yards_per_game", "passing_yards", "passing_tds",
  "rushing_yards", "rushing_tds", "total_tds", "interceptions", "epa",
];

// Per-game columns for the profile game log (only per-game metrics — no PPG).
export const GAMELOG_COLUMN_SETS = {
  QB: ["completions", "attempts", "passing_yards", "passing_tds", "interceptions", "passer_rating", "rushing_yards", "fantasy_points_ppr"],
  RB: ["carries", "rushing_yards", "rushing_tds", "red_zone_rush_attempts", "targets", "receptions", "receiving_yards", "fantasy_points_ppr"],
  WR: ["targets", "receptions", "receiving_yards", "receiving_tds", "air_yards", "target_share", "fantasy_points_ppr"],
  TE: ["targets", "receptions", "receiving_yards", "receiving_tds", "target_share", "fantasy_points_ppr"],
};

// Headline totals shown as summary cards on the profile, per position.
// agg: "sum" totals the column; "ppg" divides the summed column by games.
export const SUMMARY_STATS = {
  QB: [
    { key: "passing_yards", agg: "sum" }, { key: "passing_tds", agg: "sum" },
    { key: "interceptions", agg: "sum" }, { key: "rushing_yards", agg: "sum" },
    { key: "fantasy_points_ppr", agg: "sum" }, { key: "fantasy_ppg_ppr", agg: "ppg", base: "fantasy_points_ppr" },
  ],
  RB: [
    { key: "rushing_yards", agg: "sum" }, { key: "rushing_tds", agg: "sum" },
    { key: "receptions", agg: "sum" }, { key: "receiving_yards", agg: "sum" },
    { key: "fantasy_points_ppr", agg: "sum" }, { key: "fantasy_ppg_ppr", agg: "ppg", base: "fantasy_points_ppr" },
  ],
  WR: [
    { key: "receptions", agg: "sum" }, { key: "targets", agg: "sum" },
    { key: "receiving_yards", agg: "sum" }, { key: "receiving_tds", agg: "sum" },
    { key: "fantasy_points_ppr", agg: "sum" }, { key: "fantasy_ppg_ppr", agg: "ppg", base: "fantasy_points_ppr" },
  ],
  TE: [
    { key: "receptions", agg: "sum" }, { key: "targets", agg: "sum" },
    { key: "receiving_yards", agg: "sum" }, { key: "receiving_tds", agg: "sum" },
    { key: "fantasy_points_ppr", agg: "sum" }, { key: "fantasy_ppg_ppr", agg: "ppg", base: "fantasy_points_ppr" },
  ],
};
