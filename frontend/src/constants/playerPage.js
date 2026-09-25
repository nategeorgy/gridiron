// Player page layout config (M13) — one place that decides what a position's page
// shows, so every surface on the page is a different *view* of the same list rather
// than seven components each hardcoding their own idea of what a running back is.
//
// Every export here is keyed by position and read through `forPosition`, which falls
// back to WR. That fallback is a display choice, not a claim: an unknown position is
// far likelier to be a pass-catcher than a quarterback, and the page still renders.
//
// ⚠️ **Column ids must exist in the metric registry** (`GET /api/v1/metrics`) or they
// render as their raw id. A column entry is an id or `{ id, label }` (see `columnEntry`),
// and the game log derives the handful of per-game values no stored column holds — see
// `gameValue` below.

import { LEADERBOARD_TABS, presetSections } from "./leaderboards";

/** Pick a position's config, falling back to the receiver layout. */
export function forPosition(map, position) {
  return map[position] ?? map.WR;
}

// ---------------------------------------------------------------------------
// Season headline — ten stats, each with its positional rank
// ---------------------------------------------------------------------------
// Exactly ten per position, because the headline is laid out as one row of ten on a
// desktop screen and must never scroll sideways (the board rows beneath it do). The
// `label` here is the headline's own, shorter than the registry's where the registry's
// would not fit a tenth of the row — the tooltip still carries the full name.
//
// The QB aDOT is `ngs_pass_intended_air_yards`, NOT `adot`: `adot` is the receiving
// column and is null for quarterbacks. Intended air yards is the quarterback's aDOT as
// NGS measures it, so it exists from 2016.
export const HEADLINE_STATS = {
  QB: [
    { id: "fantasy_points", label: "Fantasy Points" },
    { id: "fantasy_ppg", label: "Fantasy PPG" },
    { id: "passing_yards", label: "Passing Yards" },
    { id: "passing_tds", label: "Passing TDs" },
    { id: "interceptions", label: "Interceptions" },
    { id: "yards_per_attempt", label: "Yards / Attempt" },
    { id: "ngs_pass_intended_air_yards", label: "aDOT" },
    { id: "completion_pct", label: "Completion %" },
    { id: "rushing_yards", label: "Rushing Yards" },
    { id: "rushing_tds", label: "Rushing TDs" },
  ],
  RB: [
    { id: "fantasy_points", label: "Fantasy Points" },
    { id: "fantasy_ppg", label: "Fantasy PPG" },
    { id: "carries", label: "Carries" },
    { id: "rushing_yards", label: "Rushing Yards" },
    { id: "yards_per_carry", label: "Yards / Carry" },
    { id: "rushing_tds", label: "Rushing TDs" },
    { id: "targets", label: "Targets" },
    { id: "receptions", label: "Receptions" },
    { id: "receiving_yards", label: "Receiving Yards" },
    { id: "receiving_tds", label: "Receiving TDs" },
  ],
  WR: [
    { id: "fantasy_points", label: "Fantasy Points" },
    { id: "fantasy_ppg", label: "Fantasy PPG" },
    { id: "targets", label: "Targets" },
    { id: "target_share", label: "Target Share" },
    { id: "receptions", label: "Receptions" },
    { id: "receiving_yards", label: "Receiving Yards" },
    { id: "receiving_tds", label: "Receiving TDs" },
    { id: "yards_per_route_run", label: "YPRR" },
    { id: "targets_per_route_run", label: "TPRR" },
    // In the league's scoring, like every fantasy number on the page — PPR by default.
    { id: "fantasy_points_per_route_run", label: "Pts / Route Run" },
  ],
};
HEADLINE_STATS.TE = HEADLINE_STATS.WR;

/** The ids the headline asks the API to rank. */
export function headlineColumns(position) {
  return forPosition(HEADLINE_STATS, position).map((stat) => stat.id);
}

// ---------------------------------------------------------------------------
// Season stats, career and game log: the leaderboard's five tabs (September 2026)
// ---------------------------------------------------------------------------
// The player page reads the same presets as the leaderboards
// (`constants/leaderboards.js`), so a stat sits under the same tab in both places.
// Season Stats shows all five tabs at once as rows; the career table and the game log
// each pick their own tab, with a Custom tab and Edit Columns, so the career can show
// Fantasy while the game log shows Usage.
//
// Each table has a fixed lead block (the career's season, team, games, points, PPG,
// finish and snap share; the game log's week, opponent, points, finish and snap share). A
// stat that block already shows is left out of that table's tabs and editor rather than
// printed twice. The game log also drops the per-game twins of season rates: on one game,
// routes per game is routes, and expected PPG is expected points.
//
// The **Fantasy** tab is the player page's own, not the leaderboard's: a player's season
// or week reads as the box score of his position plus the rate that explains it (yards
// per carry for a back, per target and per reception for a pass-catcher), where the
// leaderboard's Fantasy tab also shows every phase so positions can sit side by side.
const PLAYER_FANTASY = {
  QB: [
    { name: "Passing", columns: ["completions", "attempts", "passing_yards", "passing_tds", "interceptions"] },
    { name: "Rushing", columns: ["carries", "rushing_yards", "yards_per_carry", "rushing_tds"] },
  ],
  RB: [
    { name: "Rushing", columns: ["carries", "rushing_yards", "yards_per_carry", "rushing_tds"] },
    { name: "Receiving", columns: ["targets", "receptions", "receiving_yards", "receiving_tds"] },
  ],
  WR: [
    {
      name: "Receiving",
      columns: ["targets", "receptions", "receiving_yards", "yards_per_target", "yards_per_reception", "receiving_tds"],
    },
  ],
};
PLAYER_FANTASY.TE = PLAYER_FANTASY.WR;

export const TABLE_VIEWS = {
  career: {
    key: "career",
    defaultTab: "fantasy",
    exclude: ["fantasy_points", "fantasy_ppg", "snap_share"],
    presets: { fantasy: PLAYER_FANTASY },
  },
  gamelog: {
    key: "log",
    defaultTab: "usage",
    exclude: ["fantasy_points", "fantasy_ppg", "snap_share", "routes_run_per_game", "expected_fantasy_ppg"],
    presets: { fantasy: PLAYER_FANTASY },
  },
};

/** The leaderboard preset a position reads, with the same WR fallback as `forPosition`. */
export const presetPosition = (position) => (["QB", "RB", "WR", "TE"].includes(position) ? position : "WR");

/** The game log's own labels, where the registry's short name reads wrong on one game. */
export const GAMELOG_LABELS = { high_value_touches_per_game: "HVT" };

/**
 * Season Stats' five rows: each tab's preset for the position. FPPG leads every preset
 * on the leaderboard, but five stacked rows would print it five times, so it stays on
 * the Fantasy row only.
 */
export function seasonBoards(position) {
  const group = presetPosition(position);
  return LEADERBOARD_TABS.map((tab) => ({
    id: tab.id,
    label: tab.label,
    sections: (presetSections(group, tab.id) ?? [])
      .map((section) => ({
        name: section.name,
        columns: tab.id === "fantasy" ? section.columns : section.columns.filter((id) => id !== "fantasy_ppg"),
      }))
      .filter((section) => section.columns.length),
  }));
}

/** Columns whose sign is the whole point, so they carry an explicit "+". */
export const SIGNED_COLUMNS = new Set([
  "fantasy_points_over_expected",
  "tds_over_expected",
  "epa",
  "receiving_epa",
  "rushing_epa",
  "cpoe",
  "ngs_rec_yac_above_expectation",
  "ngs_rush_yards_over_expected",
  "ngs_rush_yards_over_expected_per_att",
  "ngs_pass_completion_pct_above_expectation",
  "ngs_pass_air_yards_differential",
]);

/** A column entry — a metric id, or `{ id, label }` — normalised to `{ id, label? }`. */
export function columnEntry(entry) {
  return typeof entry === "string" ? { id: entry } : entry;
}

// Per-game values no stored column holds. ⚠️ Y/REC, Y/TGT and YPRR are NOT here: they
// are stored per game and match their own division exactly, so the stored value is used.
// These are the registry's `derived` rates and composites, stored only as their inputs.
// A season's rate is `Σnumerator / Σdenominator` and keeps coming from the API; a single
// game's has to divide that game's own numbers, which is all this does. A side listed as
// several columns is their sum, and all-missing stays missing rather than becoming 0.
const GAME_RATES = {
  yards_per_carry: ["rushing_yards", "carries"],
  completion_pct: ["completions", "attempts"],
  yards_per_attempt: ["passing_yards", "attempts"],
  yards_per_completion: ["passing_yards", "completions"],
  catch_rate: ["receptions", "targets"],
  receiving_drop_rate: ["receiving_drops", "targets"],
  rush_ybc_per_att: ["rush_yards_before_contact", "carries"],
  rush_yac_per_att: ["rush_yards_after_contact", "carries"],
  touches_per_snap: [["targets", "carries"], "snap_count"],
  epa_per_play: ["epa", ["attempts", "carries", "targets"]],
  // Use the line's `fantasy_points`, which the API fills in the request's scoring.
  fantasy_points_per_route_run: ["fantasy_points", "routes_run"],
  fantasy_points_per_carry: ["fantasy_points", "carries"],
};

// Composites that are a plain sum on one game (the season versions divide by games).
const GAME_SUMS = {
  high_value_touches_per_game: ["red_zone_targets", "rush_att_inside_5"],
  dropbacks: ["attempts", "sacks_suffered"],
  total_first_downs: ["passing_first_downs", "rushing_first_downs", "receiving_first_downs"],
};

// Actual minus expected, on one game. The same definitions the Insight engine uses.
const GAME_DIFFS = {
  fantasy_points_over_expected: ["fantasy_points", "expected_fantasy_points"],
  tds_over_expected: [
    ["passing_tds", "rushing_tds", "receiving_tds"],
    ["passing_tds_exp", "rushing_tds_exp", "receiving_tds_exp"],
  ],
};

function gameSum(game, side) {
  const names = Array.isArray(side) ? side : [side];
  const parts = names.map((name) => game[name]);
  if (parts.every((part) => part === null || part === undefined)) return null;
  return parts.reduce((total, part) => total + (part ?? 0), 0);
}

/** One game's value for a column, deriving what no stored column holds. */
export function gameValue(game, column) {
  if (GAME_SUMS[column]) return gameSum(game, GAME_SUMS[column]);
  if (GAME_DIFFS[column]) {
    const [actual, expected] = GAME_DIFFS[column].map((side) => gameSum(game, side));
    return actual === null || expected === null ? null : actual - expected;
  }
  const rate = GAME_RATES[column];
  if (!rate) return game[column];
  const [numerator, denominator] = rate.map((side) => gameSum(game, side));
  if (numerator === null || !denominator) return null;
  return numerator / denominator;
}

// ---------------------------------------------------------------------------
// Season profile radar — slices grouped by what they measure
// ---------------------------------------------------------------------------
// Grouped so the shape reads as an argument rather than a list. A group's colour follows
// the GROUP, never its position in the list — Production is the same green on a back's
// chart (where it comes first) as on a receiver's (where it comes second), and a
// quarterback's chart simply has no Opportunity group. Colours are `--series-*` tokens,
// never `--accent`/`--pos`/`--neg`, which carry meanings a category must not borrow.
//
// Entries are a metric id or `{ id, label }`: a slice label has a twelfth of a circle to
// live in, so most take a shorter label than the registry's. The tooltip-length name is
// still the registry's.
const OPPORTUNITY = { name: "Opportunity", color: "var(--series-1)" };
const PRODUCTION = { name: "Production", color: "var(--series-3)" };
const ADVANCED = { name: "Advanced", color: "var(--series-5)" };

export const RADAR_GROUPS = {
  QB: [
    {
      ...PRODUCTION,
      columns: [
        { id: "fantasy_points", label: "Fantasy Pts" },
        { id: "fantasy_ppg", label: "Fantasy PPG" },
        { id: "yards_per_attempt", label: "Yards / Att" },
        { id: "completion_pct", label: "Comp %" },
        { id: "rushing_yards", label: "Rush Yds" },
        { id: "rushing_tds", label: "Rush TDs" },
      ],
    },
    {
      ...ADVANCED,
      columns: [
        { id: "epa", label: "EPA" },
        { id: "epa_per_play", label: "EPA / Play" },
        // `adot` is the receiving column and is null for quarterbacks.
        { id: "ngs_pass_intended_air_yards", label: "aDOT" },
        { id: "cpoe", label: "CPOE" },
      ],
    },
  ],
  RB: [
    {
      ...PRODUCTION,
      columns: [
        { id: "fantasy_points", label: "Fantasy Pts" },
        { id: "fantasy_ppg", label: "Fantasy PPG" },
        { id: "fantasy_points_per_carry", label: "Pts / Carry" },
      ],
    },
    {
      ...OPPORTUNITY,
      columns: [
        { id: "carries", label: "Carries" },
        { id: "rush_attempt_share", label: "Rush %" },
        { id: "rush_att_inside_5", label: "Carries In 5" },
        { id: "targets", label: "Targets" },
        { id: "opportunity_share", label: "Opp %" },
      ],
    },
    {
      ...ADVANCED,
      columns: [
        { id: "rush_yac_per_att", label: "YAC / Carry" },
        { id: "ngs_rush_yards_over_expected_per_att", label: "RYOE / Carry" },
        { id: "rushing_epa", label: "Rush EPA" },
      ],
    },
  ],
  WR: [
    {
      ...OPPORTUNITY,
      columns: [
        { id: "targets", label: "Targets" },
        { id: "target_share", label: "Target Share" },
        { id: "red_zone_targets", label: "RZ Targets" },
        { id: "route_participation", label: "Route %" },
      ],
    },
    {
      ...PRODUCTION,
      columns: [
        { id: "fantasy_points", label: "Fantasy Pts" },
        { id: "fantasy_ppg", label: "Fantasy PPG" },
        { id: "fantasy_points_per_route_run", label: "Pts / Route" },
        { id: "yards_per_route_run", label: "YPRR" },
      ],
    },
    {
      ...ADVANCED,
      columns: [
        { id: "ngs_rec_separation", label: "Separation" },
        { id: "adot", label: "aDOT" },
        { id: "targets_per_route_run", label: "TPRR" },
        { id: "receiving_epa", label: "Rec EPA" },
      ],
    },
  ],
};
RADAR_GROUPS.TE = RADAR_GROUPS.WR;

// ---------------------------------------------------------------------------
// Percentile panel — every headline metric, grouped
// ---------------------------------------------------------------------------
export const PERCENTILE_GROUPS = {
  QB: [
    { name: "Value", columns: ["fantasy_ppg", "expected_fantasy_ppg", "fantasy_points_over_expected"] },
    { name: "Volume", columns: ["attempts", "dropbacks", "completions", "carries"] },
    { name: "Production", columns: ["passing_yards", "passing_tds", "passing_first_downs", "rushing_yards", "rushing_tds"] },
    { name: "Efficiency", columns: ["passer_rating", "cpoe", "epa_per_play", "yards_per_attempt", "completion_pct", "interceptions", "sacks_suffered"] },
    { name: "Next Gen Stats", columns: ["ngs_pass_time_to_throw", "ngs_pass_aggressiveness", "ngs_pass_air_yards_to_sticks", "ngs_pass_completion_pct_above_expectation", "pressure_rate"] },
  ],
  RB: [
    { name: "Value", columns: ["fantasy_ppg", "expected_fantasy_ppg", "fantasy_points_over_expected"] },
    { name: "Opportunity", columns: ["carries", "rush_attempt_share", "opportunity_share", "target_share", "snap_share", "red_zone_rush_share", "rush_att_inside_5"] },
    { name: "Production", columns: ["rushing_yards", "rushing_tds", "rushing_first_downs", "receptions", "receiving_yards"] },
    { name: "Efficiency", columns: ["yards_per_carry", "rushing_epa", "epa_per_play", "market_share"] },
    { name: "Next Gen Stats", columns: ["ngs_rush_efficiency", "ngs_rush_yards_over_expected_per_att", "ngs_rush_pct_attempts_eight_defenders", "rush_yards_after_contact", "rush_broken_tackles"] },
  ],
  WR: [
    { name: "Value", columns: ["fantasy_ppg", "expected_fantasy_ppg", "fantasy_points_over_expected"] },
    { name: "Opportunity", columns: ["target_share", "targets", "air_yards_share", "red_zone_targets", "routes_run", "route_participation", "wopr", "snap_share"] },
    { name: "Production", columns: ["receiving_yards", "receptions", "receiving_tds", "receiving_first_downs", "yards_after_catch"] },
    { name: "Efficiency", columns: ["yards_per_route_run", "targets_per_route_run", "yards_per_target", "catch_rate", "racr", "adot", "receiving_drops"] },
    { name: "Next Gen Stats", columns: ["ngs_rec_separation", "ngs_rec_cushion", "ngs_rec_yac_above_expectation", "rec_broken_tackles"] },
  ],
};
PERCENTILE_GROUPS.TE = PERCENTILE_GROUPS.WR;

// ---------------------------------------------------------------------------
// Compare — the head-to-head table and the radar beside it
// ---------------------------------------------------------------------------
// `perGame: true` divides the season total by games played, so two players with
// different games missed are compared on rate rather than availability. Everything
// else is the season value as the API reports it.
export const H2H_ROWS = {
  QB: [
    { id: "fantasy_ppg", label: "Points / Game" },
    { id: "attempts", label: "Attempts / Game", perGame: true },
    { id: "passing_yards", label: "Pass Yards / Game", perGame: true },
    { id: "passing_tds", label: "Passing TDs" },
    { id: "interceptions", label: "Interceptions" },
    { id: "passer_rating", label: "Passer Rating" },
    { id: "cpoe", label: "CPOE" },
    { id: "epa_per_play", label: "EPA / Play" },
    { id: "rushing_yards", label: "Rush Yards / Game", perGame: true },
    { id: "sacks_suffered", label: "Sacks Taken" },
  ],
  RB: [
    { id: "fantasy_ppg", label: "Points / Game" },
    { id: "carries", label: "Carries / Game", perGame: true },
    { id: "rushing_yards", label: "Rush Yards / Game", perGame: true },
    { id: "rushing_tds", label: "Rushing TDs" },
    { id: "yards_per_carry", label: "Yards / Carry" },
    { id: "targets", label: "Targets / Game", perGame: true },
    { id: "receiving_yards", label: "Rec Yards / Game", perGame: true },
    { id: "opportunity_share", label: "Opportunity Share" },
    { id: "snap_share", label: "Snap Share" },
    { id: "rush_att_inside_5", label: "Carries Inside 5" },
  ],
  WR: [
    { id: "fantasy_ppg", label: "Points / Game" },
    { id: "targets", label: "Targets / Game", perGame: true },
    { id: "receptions", label: "Receptions / Game", perGame: true },
    { id: "receiving_yards", label: "Rec Yards / Game", perGame: true },
    { id: "receiving_tds", label: "Receiving TDs" },
    { id: "target_share", label: "Target Share" },
    { id: "adot", label: "aDOT" },
    { id: "yards_per_route_run", label: "Yards / Route Run" },
    { id: "ngs_rec_separation", label: "Separation" },
    { id: "ngs_rec_yac_above_expectation", label: "YAC Over Expected" },
    { id: "receiving_drops", label: "Drops" },
  ],
};
H2H_ROWS.TE = H2H_ROWS.WR;

// The radar beside the table. Eight axes, in the Command Center card's own order —
// volume, then share, then output — because this is that card, on a player page.
export const COMPARE_AXES = {
  QB: [
    { id: "fantasy_ppg", label: "PPG" },
    { id: "expected_fantasy_ppg", label: "Expected" },
    { id: "attempts", label: "Attempts" },
    { id: "passing_yards", label: "Pass Yd" },
    { id: "passing_tds", label: "Pass TD" },
    { id: "rushing_yards", label: "Rush Yd" },
    { id: "cpoe", label: "CPOE" },
    { id: "epa_per_play", label: "EPA/Play" },
  ],
  RB: [
    { id: "fantasy_ppg", label: "PPG" },
    { id: "expected_fantasy_ppg", label: "Expected" },
    { id: "carries", label: "Carries" },
    { id: "targets", label: "Targets" },
    { id: "rushing_yards", label: "Rush Yd" },
    { id: "opportunity_share", label: "Opp%" },
    { id: "snap_share", label: "Snap%" },
    { id: "rush_att_inside_5", label: "In5" },
  ],
  WR: [
    { id: "fantasy_ppg", label: "PPG" },
    { id: "expected_fantasy_ppg", label: "Expected" },
    { id: "targets", label: "Targets" },
    { id: "receiving_yards", label: "Rec Yd" },
    { id: "receiving_tds", label: "Rec TD" },
    { id: "target_share", label: "Tgt Share" },
    { id: "air_yards_share", label: "Air%" },
    { id: "snap_share", label: "Snap%" },
  ],
};
COMPARE_AXES.TE = COMPARE_AXES.WR;

/** Every metric the page asks the API to rank, for one position. */
export function percentileColumns(position) {
  // The headline shows ranks, but tints each by its percentile — same pool, so the
  // colour and the number can never disagree about how good a stat is.
  const wanted = new Set(headlineColumns(position));
  for (const board of seasonBoards(position)) {
    for (const section of board.sections) section.columns.forEach((id) => wanted.add(id));
  }
  for (const group of forPosition(RADAR_GROUPS, position)) {
    group.columns.forEach((entry) => wanted.add(columnEntry(entry).id));
  }
  for (const group of forPosition(PERCENTILE_GROUPS, position)) {
    group.columns.forEach((id) => wanted.add(id));
  }
  for (const axis of forPosition(COMPARE_AXES, position)) wanted.add(axis.id);
  return [...wanted];
}
