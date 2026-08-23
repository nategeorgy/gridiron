// Shared UI constants: seasons, positions, metric definitions, and the column sets
// for the team leaderboard and the player-profile game log. Leaderboard columns live
// in constants/boards.js, one set per board.

// The first season in project scope — a scope decision, not a fact about today.
// 1999 is where nflverse's play-by-play begins, so it is the floor of the whole
// ecosystem rather than a preference. Note that the *depth* of coverage varies by
// season: see utils/availability.js and the registry's per-metric windows.
export const FIRST_SEASON = 1999;

/**
 * The season a date falls in, for use *before* /seasons answers.
 *
 * An NFL season labelled Y runs from September Y into February Y+1, so anything
 * before September belongs to the previous season's year. This is deliberately a
 * month-level approximation of the real rollover (the Thursday after Labor Day):
 * it is only ever the seed for the first render, and the served value — which knows
 * which seasons actually have data — replaces it as soon as it arrives.
 */
export function fallbackCurrentSeason(today = new Date()) {
  return today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1;
}

// Newest first, matching the shape of the served list. Only a placeholder: use
// useSeasons() in components so the dropdown reflects the data that actually exists.
export const FALLBACK_SEASONS = Array.from(
  { length: fallbackCurrentSeason() - FIRST_SEASON + 1 },
  (_, index) => fallbackCurrentSeason() - index,
);

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

// The regular season went from 17 games to 18 weeks in 2021, so the week picker has
// to follow the season rather than offering a week that was never played. "" = the
// full-season aggregate.
export const FIRST_18_WEEK_SEASON = 2021;

export function weekOptions(season) {
  const weeks = Number(season) >= FIRST_18_WEEK_SEASON ? 18 : 17;
  return [
    { value: "", label: "Full Season" },
    ...Array.from({ length: weeks }, (_, index) => ({
      value: String(index + 1),
      label: `Week ${index + 1}`,
    })),
  ];
}


// Timeframes for the Insight boards (M3). "" = the full season; a number is a
// trailing window of that many *played* weeks, which is how buy-low and sell-high
// questions are actually asked.
export const INSIGHT_TIMEFRAMES = [
  { value: "", label: "Full Season" },
  { value: "4", label: "Last 4 Weeks" },
  { value: "8", label: "Last 8 Weeks" },
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
  // Expected points (M2) — scoring-aware, computed from modelled opportunity.
  expected_fantasy_points: { label: "Expected Fantasy Points", short: "xFPTS", format: FORMATS.one },
  expected_fantasy_ppg: { label: "Expected Fantasy PPG", short: "xFPPG", format: FORMATS.two },
  fantasy_points_over_expected: { label: "Points Over Expected", short: "FP±", format: FORMATS.one },
  // Expected components (M2) — the modelled estimates xFP is built from.
  passing_yards_exp: { label: "Expected Passing Yards", short: "xPASS YD", format: FORMATS.int },
  passing_tds_exp: { label: "Expected Passing TDs", short: "xPASS TD", format: FORMATS.one },
  interceptions_exp: { label: "Expected Interceptions", short: "xINT", format: FORMATS.one },
  rushing_yards_exp: { label: "Expected Rushing Yards", short: "xRUSH YD", format: FORMATS.int },
  rushing_tds_exp: { label: "Expected Rushing TDs", short: "xRUSH TD", format: FORMATS.one },
  receiving_yards_exp: { label: "Expected Receiving Yards", short: "xREC YD", format: FORMATS.int },
  receiving_tds_exp: { label: "Expected Receiving TDs", short: "xREC TD", format: FORMATS.one },
  receptions_exp: { label: "Expected Receptions", short: "xREC", format: FORMATS.one },
  // Rushing opportunity by field position (M2).
  rush_att_inside_10: { label: "Carries Inside 10", short: "IN10", format: FORMATS.int },
  rush_att_inside_5: { label: "Carries Inside 5", short: "IN5", format: FORMATS.int },
  rush_att_inside_2: { label: "Carries Inside 2", short: "IN2", format: FORMATS.int },
  // Market share (M2).
  rush_attempt_share: { label: "Rush Share", short: "RUSH%", format: FORMATS.pct },
  opportunity_share: { label: "Opportunity Share", short: "OPP%", format: FORMATS.pct },
  market_share: { label: "Market Share", short: "MKT%", format: FORMATS.pct },
  // Composite usage metrics (M4) — registry formulas over the metrics above.
  high_value_touches_per_game: { label: "High-Value Touches / Game", short: "HVT/G", format: FORMATS.two },
  touches_per_snap: { label: "Touches Per Snap", short: "TCH/SNAP", format: FORMATS.three },
  // Snap and route usage (M2 — populated by pipeline/ingest_usage.py).
  snap_count: { label: "Snap Count", short: "SNAP", format: FORMATS.int },
  snap_share: { label: "Snap Share", short: "SNAP%", format: FORMATS.pct },
  routes_run: { label: "Routes Run", short: "RTS", format: FORMATS.int },
  routes_run_per_game: { label: "Routes Run / Game", short: "RTS/G", format: FORMATS.one },
  route_participation: { label: "Route Participation", short: "RTE%", format: FORMATS.pct },
  targets_per_route_run: { label: "Targets Per Route Run", short: "TPRR", format: FORMATS.two },
  yards_per_route_run: { label: "Yards Per Route Run", short: "YPRR", format: FORMATS.two },
  unrealized_air_yards: { label: "Unrealized Air Yards", short: "UAY", format: FORMATS.int },
  // Fantasy intelligence (M3) — scoring-aware *and* league-aware, served by
  // /stats/intelligence rather than the leaderboard.
  vorp: { label: "Value Over Replacement", short: "VORP", format: FORMATS.one },
  vorp_ppg: { label: "VORP Per Game", short: "VORP/G", format: FORMATS.two },
  replacement_ppg: { label: "Replacement Level", short: "REPL", format: FORMATS.two },
  fantasy_opportunity_rating: { label: "Fantasy Opportunity Rating", short: "FOR", format: FORMATS.one },
  positive_regression_index: { label: "Positive-Regression Index", short: "BUY", format: FORMATS.one },
  sell_high_index: { label: "Sell-High Index", short: "SELL", format: FORMATS.one },
  tds_over_expected: { label: "TDs Over Expected", short: "TD±", format: FORMATS.two },
  efficiency_over_baseline: { label: "Efficiency vs Career", short: "EFF±", format: FORMATS.three },
  opportunity_trend: { label: "Usage Trend", short: "TREND", format: FORMATS.pct },
};

// Leaderboard columns and sort options are no longer defined here — each board in
// constants/boards.js declares its own columns, and LeaderboardView builds the "sort
// by" dropdown from them.

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
// fantasy_points and expected_fantasy_points are scoring-aware: the backend computes
// them per request from the active league scoring, so both are in the user's scoring.
const GAMELOG_FANTASY_COLS = ["fantasy_points", "expected_fantasy_points"];
export const GAMELOG_COLUMN_SETS = {
  QB: ["completions", "attempts", "passing_yards", "passing_tds", "interceptions", "passer_rating", "rushing_yards", ...GAMELOG_FANTASY_COLS],
  RB: ["carries", "rushing_yards", "rushing_tds", "rush_att_inside_5", "targets", "receptions", "receiving_yards", "opportunity_share", ...GAMELOG_FANTASY_COLS],
  WR: ["targets", "receptions", "receiving_yards", "receiving_tds", "air_yards", "target_share", "routes_run", ...GAMELOG_FANTASY_COLS],
  TE: ["targets", "receptions", "receiving_yards", "receiving_tds", "target_share", "routes_run", ...GAMELOG_FANTASY_COLS],
};

// Headline totals shown as summary cards on the profile, per position.
// agg: "sum" totals the column; "ppg" divides the summed column by games.
const SUMMARY_FANTASY_STATS = [
  { key: "fantasy_points", agg: "sum" },
  { key: "fantasy_ppg", agg: "ppg", base: "fantasy_points" },
  { key: "expected_fantasy_points", agg: "sum" },
];
export const SUMMARY_STATS = {
  QB: [
    { key: "passing_yards", agg: "sum" }, { key: "passing_tds", agg: "sum" },
    { key: "interceptions", agg: "sum" }, { key: "rushing_yards", agg: "sum" },
    ...SUMMARY_FANTASY_STATS,
  ],
  RB: [
    { key: "rushing_yards", agg: "sum" }, { key: "rushing_tds", agg: "sum" },
    { key: "receptions", agg: "sum" }, { key: "receiving_yards", agg: "sum" },
    ...SUMMARY_FANTASY_STATS,
  ],
  WR: [
    { key: "receptions", agg: "sum" }, { key: "targets", agg: "sum" },
    { key: "receiving_yards", agg: "sum" }, { key: "receiving_tds", agg: "sum" },
    ...SUMMARY_FANTASY_STATS,
  ],
  TE: [
    { key: "receptions", agg: "sum" }, { key: "targets", agg: "sum" },
    { key: "receiving_yards", agg: "sum" }, { key: "receiving_tds", agg: "sum" },
    ...SUMMARY_FANTASY_STATS,
  ],
};
