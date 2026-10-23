// Player page layout config (M13) — one place that decides what a position's page
// shows, so every surface on the page is a different *view* of the same list rather
// than seven components each hardcoding their own idea of what a running back is.
//
// Every export here is keyed by position and read through `forPosition`, which falls
// back to WR. That fallback is a display choice, not a claim: an unknown position is
// far likelier to be a pass-catcher than a quarterback, and the page still renders.
//
// ⚠️ **Column ids must exist in the metric registry** (`GET /api/v1/metrics`) or they
// render as their raw id. The game log derives the handful of per-game values no stored
// column holds: see `gameValue` below.

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
    exclude: ["fantasy_points", "fantasy_ppg", "snap_share", "routes_run_per_game", "rushing_yards_per_game", "expected_fantasy_ppg"],
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
// The player card and the head-to-head (October 2026): the tweet kit's D1 and D6
// ---------------------------------------------------------------------------
// The tweet cards Nate set per position on 2026-10-21, brought onto the page in place of
// the season radar, the percentile panel and the old head-to-head table and radar. These
// mirror `TILE_GROUPS`, `PCT_LIST` and `STAT` in tools/tweetkit/src/player.js, and the
// labels are his words: change one and change the other, or the card on the page and the
// card in a tweet will disagree.
//
// A format is the registry's spec ("int", a number of decimals, "pct") or "pct0", a share
// to the whole percent. `signed` adds an explicit "+". A label holding "{scoring}" takes
// the scoring preset's name ("PPR points per game").

// The top row, in labelled groups. A tile stat's `long` is its name on the head-to-head,
// where it stands alone rather than under its group's heading.
const FANTASY_TILES = {
  name: "Fantasy points",
  stats: [
    { id: "fantasy_ppg", label: "Per game", long: "Points per game", format: 1 },
    { id: "fantasy_points", label: "Total", long: "Total points", format: 1 },
  ],
};
const RECEIVING_TILES = {
  name: "Receiving",
  stats: [
    { id: "receptions", label: "Receptions", long: "Receptions", format: "int" },
    { id: "receiving_yards", label: "Yards", long: "Receiving yards", format: "int" },
    { id: "receiving_tds", label: "TDs", long: "Receiving TDs", format: "int" },
  ],
};
export const CARD_TILES = {
  QB: [
    FANTASY_TILES,
    {
      name: "Passing",
      stats: [
        { id: "passing_yards", label: "Yards", long: "Passing yards", format: "int" },
        { id: "passing_tds", label: "TDs", long: "Passing TDs", format: "int" },
        { id: "interceptions", label: "INTs", long: "Interceptions", format: "int" },
      ],
    },
  ],
  RB: [
    FANTASY_TILES,
    {
      name: "Rushing",
      stats: [
        { id: "rushing_yards", label: "Yards", long: "Rushing yards", format: "int" },
        { id: "rushing_tds", label: "TDs", long: "Rushing TDs", format: "int" },
      ],
    },
    RECEIVING_TILES,
  ],
  WR: [FANTASY_TILES, RECEIVING_TILES],
};
CARD_TILES.TE = CARD_TILES.WR;

// The percentile rows. A back's route participation is his "route share".
const POINTS_PER_GAME = { id: "fantasy_ppg", label: "{scoring} points per game", format: 1 };
export const CARD_PERCENTILES = {
  QB: [
    POINTS_PER_GAME,
    { id: "completion_pct", label: "Completion %", format: "pct" },
    { id: "passer_rating", label: "Passer rating", format: 1 },
    { id: "yards_per_attempt", label: "Yards per attempt", format: 1 },
    { id: "yards_per_completion", label: "Yards per completion", format: 1 },
    // `adot` is the receiving column and is null for quarterbacks.
    { id: "ngs_pass_intended_air_yards", label: "aDOT", format: 1 },
    { id: "rushing_yards_per_game", label: "Rushing yards per game", format: 1 },
    { id: "rushing_tds", label: "Rushing TDs", format: "int" },
    { id: "ngs_pass_aggressiveness", label: "Aggressiveness", format: "pct" },
    { id: "bad_throw_rate", label: "Bad throw %", format: "pct" },
    { id: "cpoe", label: "CPOE", format: 1, signed: true },
    { id: "epa_per_play", label: "EPA per play", format: 2, signed: true },
    { id: "epa", label: "EPA total", format: 1, signed: true },
  ],
  RB: [
    POINTS_PER_GAME,
    { id: "rush_attempt_share", label: "Rush share", format: "pct0" },
    { id: "target_share", label: "Target share", format: "pct0" },
    { id: "route_participation", label: "Route share", format: "pct0" },
    { id: "rush_att_inside_5", label: "Carries inside the 5", format: "int" },
    { id: "red_zone_targets", label: "Red zone targets", format: "int" },
    { id: "yards_per_carry", label: "Yards per carry", format: 1 },
    { id: "fantasy_points_per_carry", label: "Points per carry", format: 2 },
    { id: "targets_per_route_run", label: "Targets per route run", format: "pct0" },
    { id: "ngs_rush_yards_over_expected_per_att", label: "Rushing yards over expected per carry", format: 2, signed: true },
    { id: "rush_ybc_per_att", label: "Yards before contact per carry", format: 1 },
    { id: "rush_yac_per_att", label: "Yards after contact per carry", format: 1 },
    { id: "rushing_epa", label: "Rushing EPA", format: 1, signed: true },
    { id: "receiving_epa", label: "Receiving EPA", format: 1, signed: true },
    { id: "epa", label: "EPA total", format: 1, signed: true },
  ],
  WR: [
    POINTS_PER_GAME,
    { id: "target_share", label: "Target share", format: "pct0" },
    { id: "route_participation", label: "Route participation", format: "pct0" },
    { id: "yards_per_reception", label: "Yards per reception", format: 1 },
    { id: "yards_per_target", label: "Yards per target", format: 1 },
    { id: "targets_per_route_run", label: "Targets per route run", format: "pct0" },
    { id: "yards_per_route_run", label: "Yards per route run", format: 2 },
    { id: "fantasy_points_per_route_run", label: "Points per route run", format: 2 },
    { id: "adot", label: "Average depth of target", format: 1 },
    { id: "air_yards", label: "Air yards", format: "int" },
    { id: "air_yards_share", label: "Air yards share", format: "pct0" },
    { id: "red_zone_targets", label: "Red zone targets", format: "int" },
    { id: "receiving_epa", label: "Receiving EPA", format: 1, signed: true },
  ],
};
CARD_PERCENTILES.TE = CARD_PERCENTILES.WR;

/** The ids the player card and the head-to-head need ranked, for one position. */
export function cardRankColumns(position) {
  return forPosition(CARD_TILES, position).flatMap((group) => group.stats.map((stat) => stat.id));
}

/** The ids the player card and the head-to-head need a percentile for. */
export function cardPercentileColumns(position) {
  return forPosition(CARD_PERCENTILES, position).map((stat) => stat.id);
}

/** Every metric the page asks the API to rank, for one position. */
export function percentileColumns(position) {
  // The headline shows ranks, but tints each by its percentile: same pool, so the
  // colour and the number can never disagree about how good a stat is.
  const wanted = new Set(headlineColumns(position));
  for (const board of seasonBoards(position)) {
    for (const section of board.sections) section.columns.forEach((id) => wanted.add(id));
  }
  cardPercentileColumns(position).forEach((id) => wanted.add(id));
  return [...wanted];
}

/** Every metric the page asks the API for a positional rank in. */
export function rankColumns(position) {
  return [...new Set([...headlineColumns(position), ...cardRankColumns(position)])];
}
