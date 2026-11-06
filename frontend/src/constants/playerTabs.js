// The tabbed player page (November 2026): what each position's tabs show.
//
// Picked over ten rounds of mockups (October to November 2026). Six tabs, in the order a
// manager asks the questions: how is he doing (Dashboard), the numbers (Stats), the work
// behind them (Opportunity), when he scores (Splits), the whole career (Career), and who
// he is like (Compare). Every list here is keyed by position and read through
// `forPosition` (constants/playerPage.js), which falls back to the receiver layout.
//
// Ids must exist in the metric registry or be a per-game value `gameValue` can derive.

export const PLAYER_TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "stats", label: "Stats" },
  { id: "opportunity", label: "Opportunity" },
  { id: "splits", label: "Splits" },
  { id: "career", label: "Career" },
  { id: "compare", label: "Compare" },
];
export const TAB_IDS = PLAYER_TABS.map((tab) => tab.id);

// ---------------------------------------------------------------------------------------
// The banner's season strip: the card's old stat tiles, moved into the header
// ---------------------------------------------------------------------------------------
export const BANNER_STATS = {
  WR: [
    { id: "fantasy_ppg", label: "PPG", format: 1 },
    { id: "fantasy_points", label: "Points", format: 1 },
    { id: "receptions", label: "Rec", format: "int" },
    { id: "receiving_yards", label: "Rec yds", format: "int" },
    { id: "receiving_tds", label: "Rec TD", format: "int" },
  ],
  RB: [
    { id: "fantasy_ppg", label: "PPG", format: 1 },
    { id: "fantasy_points", label: "Points", format: 1 },
    { id: "rushing_yards", label: "Rush yds", format: "int" },
    { id: "rushing_tds", label: "Rush TD", format: "int" },
    { id: "receptions", label: "Rec", format: "int" },
    { id: "receiving_yards", label: "Rec yds", format: "int" },
  ],
  QB: [
    { id: "fantasy_ppg", label: "PPG", format: 1 },
    { id: "fantasy_points", label: "Points", format: 1 },
    { id: "passing_yards", label: "Pass yds", format: "int" },
    { id: "passing_tds", label: "Pass TD", format: "int" },
    { id: "interceptions", label: "INT", format: "int" },
    { id: "rushing_yards", label: "Rush yds", format: "int" },
  ],
};
BANNER_STATS.TE = BANNER_STATS.WR;

// ---------------------------------------------------------------------------------------
// The Dashboard's percentile radar (his lists, round six)
// ---------------------------------------------------------------------------------------
export const RADAR_STATS = {
  WR: [
    { id: "fantasy_ppg", label: "PPG" },
    { id: "receiving_epa", label: "Rec EPA" },
    { id: "target_share", label: "Target share" },
    { id: "red_zone_targets", label: "RZ targets" },
    { id: "yards_per_route_run", label: "YPRR" },
    { id: "targets_per_route_run", label: "TPRR" },
    { id: "fantasy_points_per_route_run", label: "FP / route" },
    { id: "adot", label: "aDOT" },
    { id: "air_yards_share", label: "Air yard share" },
  ],
  RB: [
    { id: "fantasy_ppg", label: "PPG" },
    { id: "rushing_epa", label: "Rush EPA" },
    { id: "ngs_rush_yards_over_expected_per_att", label: "RYOE / att" },
    { id: "rush_yac_per_att", label: "YAC / att" },
    { id: "rush_attempt_share", label: "Rush share" },
    { id: "target_share", label: "Target share" },
    { id: "opportunity_share", label: "Opp share" },
    { id: "rush_att_inside_5", label: "Carries inside 5" },
    { id: "targets_per_route_run", label: "TPRR" },
    { id: "route_participation", label: "Route share" },
  ],
  QB: [
    { id: "fantasy_ppg", label: "PPG" },
    { id: "epa_per_play", label: "EPA / play" },
    { id: "epa", label: "EPA" },
    { id: "cpoe", label: "CPOE" },
    { id: "yards_per_attempt", label: "Y/A" },
    { id: "yards_per_completion", label: "Y/C" },
    { id: "pass_td_rate", label: "TD%" },
    { id: "interception_rate", label: "INT%" },
    { id: "ngs_pass_intended_air_yards", label: "aDOT" },
  ],
};
RADAR_STATS.TE = RADAR_STATS.WR;

// ---------------------------------------------------------------------------------------
// Role: what his job is, from his share of the team's work
// ---------------------------------------------------------------------------------------
// Proposed in round five so the labels follow the same lines as the scatter's corners
// (a back's "Three-down" quadrant is the same idea): a quarterback is a dual threat when
// a fifth of his points come from running, not from a carries-per-game count that a
// scrambler and a goal-line sneak both clear.
export const ROLE_RULES = {
  WR: "Alpha: 25%+ of the targets on 80%+ of the routes. Every-down: 80%+ of the routes. Rotational: 55%+.",
  RB: "Three-down: 40%+ of the carries and 50%+ of the routes. Early-down: 40%+ of the carries. Passing-down: 45%+ of the routes.",
  QB: "Dual threat: 20%+ of points from running.",
};
ROLE_RULES.TE = ROLE_RULES.WR;

const pct = (value) => `${Math.round((value ?? 0) * 100)}%`;

/** [name, why] for a season row. Rushing points use the presets' shared weights. */
export function roleLabel(position, row) {
  if (!row) return null;
  if (position === "QB") {
    const rushing = 0.1 * (row.rushing_yards ?? 0) + 6 * (row.rushing_tds ?? 0);
    const share = row.fantasy_points ? rushing / row.fantasy_points : 0;
    return share >= 0.2
      ? ["Dual threat", `${pct(share)} of points from running`]
      : ["Pocket passer", `${pct(share)} of points from running`];
  }
  if (position === "RB") {
    const rush = row.rush_attempt_share ?? 0;
    const routes = row.route_participation;
    if (rush >= 0.4 && (routes ?? 0) >= 0.5) return ["Three-down back", `${pct(rush)} of the carries, on ${pct(routes)} of the routes`];
    if (rush >= 0.4) return ["Early-down back", `${pct(rush)} of the carries, on ${pct(routes)} of the routes`];
    if ((routes ?? 0) >= 0.45) return ["Passing-down back", `on ${pct(routes)} of the routes, ${pct(rush)} of the carries`];
    return ["Committee back", `${pct(rush)} of the carries`];
  }
  const share = row.target_share ?? 0;
  const routes = row.route_participation ?? 0;
  if (share >= 0.25 && routes >= 0.8) return ["Alpha", `${pct(share)} of the targets on ${pct(routes)} of the routes`];
  if (routes >= 0.8) return ["Every-down starter", `on ${pct(routes)} of the routes`];
  if (routes >= 0.55) return ["Rotational", `on ${pct(routes)} of the routes`];
  return ["Part-time", `on ${pct(routes)} of the routes`];
}

// ---------------------------------------------------------------------------------------
// The game chart (Dashboard) and the career arc (Career): one stat at a time, fixed axes
// ---------------------------------------------------------------------------------------
// Each stat is one game's parts, summed before they are divided, so a window's line is
// Σyards / Σroutes rather than the mean of game rates. `line` is the dashed line each game
// hangs from: the Nth best qualified season at the position (`rank`) or the position's
// pooled rate (`avg`), both from the career endpoint. Axes are fixed per stat, so two
// players' charts read alike; a game past the axis runs off its edge as an arrow.

const ratio = (num, den) => (game) => {
  const a = num(game);
  const b = den(game);
  return a == null || b == null || !(b > 0) ? null : [a, b];
};
const sumOf = (...names) => (game) => names.reduce((total, name) => total + (game[name] ?? 0), 0);

function passerRating([completions, attempts, yards, tds, ints]) {
  if (!(attempts > 0)) return null;
  const clamp = (value) => Math.max(0, Math.min(2.375, value));
  return ((clamp((completions / attempts - 0.3) * 5) + clamp((yards / attempts - 3) * 0.25)
    + clamp((tds / attempts) * 20) + clamp(2.375 - (ints / attempts) * 25)) / 6) * 100;
}

export const GAME_STATS = {
  ppg: {
    label: "Points per game", pill: "PPG", metric: "fantasy_ppg", format: 1,
    parts: (game) => (game.fantasy_points == null ? null : [game.fantasy_points, 1]),
    axis: [0, 40], ticks: [0, 10, 20, 30, 40],
  },
  epa: {
    label: "EPA per play", pill: "EPA / play", metric: "epa_per_play", format: 2, signed: true,
    parts: ratio((g) => g.epa, sumOf("attempts", "carries", "targets")),
  },
  yprr: {
    label: "Yards per route run", pill: "YPRR", metric: "yards_per_route_run", format: 2,
    parts: ratio((g) => (g.routes_run ? g.receiving_yards ?? 0 : null), (g) => g.routes_run),
    axis: [0, 6], ticks: [0, 1, 2, 3, 4, 5, 6],
  },
  tprr: {
    label: "Targets per route run", pill: "TPRR", metric: "targets_per_route_run", format: "pct0",
    parts: ratio((g) => (g.routes_run ? g.targets ?? 0 : null), (g) => g.routes_run),
    axis: [0.05, 0.5], ticks: [0.05, 0.2, 0.35, 0.5],
  },
  rush: {
    label: "Rush share", pill: "Rush share", metric: "rush_attempt_share", format: "pct0",
    parts: (game) => (game.rush_attempt_share == null ? null : [game.rush_attempt_share, 1]),
    axis: [0, 1], ticks: [0, 0.25, 0.5, 0.75, 1],
  },
  yac: {
    label: "Yards after contact per carry", pill: "YAC / att", metric: "rush_yac_per_att", format: 2,
    parts: ratio((g) => (g.rush_yards_after_contact == null ? null : g.rush_yards_after_contact), (g) => (g.rush_yards_after_contact == null ? null : g.carries)),
    axis: [0, 5], ticks: [0, 1, 2, 3, 4, 5],
  },
  cpoe: {
    label: "CPOE", pill: "CPOE", metric: "cpoe", format: 1, signed: true,
    parts: (game) => (game.cpoe == null || !game.attempts ? null : [game.cpoe * game.attempts, game.attempts]),
    axis: [-20, 20], ticks: [-20, -10, 0, 10, 20],
  },
  adot: {
    label: "Average depth of target", pill: "aDOT", metric: "pass_adot", format: 1,
    parts: (game) => (game.pass_adot == null || !game.attempts ? null : [game.pass_adot * game.attempts, game.attempts]),
    axis: [4, 15], ticks: [4, 6, 8, 10, 12, 14],
  },
  rate: {
    label: "Passer rating", pill: "Passer rating", metric: "passer_rating", format: 1,
    parts: (game) => (game.attempts > 0
      ? [game.completions ?? 0, game.attempts, game.passing_yards ?? 0, game.passing_tds ?? 0, game.interceptions ?? 0]
      : null),
    combine: passerRating,
    axis: [0, 160], ticks: [0, 40, 80, 120, 160],
  },
};

// EPA per play is sized by position from the spread of single games since 2022: a
// receiver's runs about -1.3 to +1.6, a back's and a quarterback's about +/-0.7.
const EPA_AXIS = {
  WR: { axis: [-1, 1.5], ticks: [-1, -0.5, 0, 0.5, 1, 1.5] },
  RB: { axis: [-0.8, 0.8], ticks: [-0.8, -0.4, 0, 0.4, 0.8] },
  QB: { axis: [-0.8, 0.8], ticks: [-0.8, -0.4, 0, 0.4, 0.8] },
};
EPA_AXIS.TE = EPA_AXIS.WR;

/** One stat's definition for a position, with that position's axis where it differs. */
export function gameStat(position, key) {
  const stat = GAME_STATS[key] ?? GAME_STATS.ppg;
  return key === "epa" ? { ...stat, ...(EPA_AXIS[position] ?? EPA_AXIS.WR) } : stat;
}

/** The stats each position's game chart offers, and which dashed line each hangs from. */
export const GAME_CHART = {
  WR: { stats: ["ppg", "epa", "yprr", "tprr"], rank: 24, lines: { ppg: "rank", epa: "avg", yprr: "rank", tprr: "rank" } },
  TE: { stats: ["ppg", "epa", "yprr", "tprr"], rank: 12, lines: { ppg: "rank", epa: "avg", yprr: "rank", tprr: "rank" } },
  RB: { stats: ["ppg", "epa", "tprr", "rush", "yac"], rank: 18, lines: { ppg: "rank", epa: "avg", tprr: "rank", rush: "rank", yac: "avg" } },
  QB: { stats: ["ppg", "epa", "cpoe", "adot", "rate"], rank: 12, lines: { ppg: "rank", epa: "avg", cpoe: "avg", adot: "avg", rate: "avg" } },
};

/** "WR24" or "WR average", the dashed line's name. */
export function lineName(position, kind, rank, short = false) {
  if (kind === "rank") return `${position}${rank}`;
  return short ? `${position} avg` : `${position} average`;
}

/** One game's value of a stat, or null. */
export function gameStatValue(stat, game) {
  const parts = stat.parts(game);
  if (!parts) return null;
  return stat.combine ? stat.combine(parts) : parts[0] / parts[1];
}

/** A window of games combined: sums first, then the stat's own combine. */
export function combineGames(stat, games, weights) {
  let acc = null;
  games.forEach((game, index) => {
    const parts = stat.parts(game);
    if (!parts) return;
    const weight = weights ? weights[index] : 1;
    acc = acc ? acc.map((value, i) => value + weight * parts[i]) : parts.map((value) => weight * value);
  });
  if (!acc) return null;
  return stat.combine ? stat.combine(acc) : acc[1] ? acc[0] / acc[1] : null;
}

/** Formats a game stat's value: "28.0", "33%", "+0.54". */
export function formatGameStat(stat, value) {
  if (value == null || Number.isNaN(value)) return "-";
  if (stat.format === "pct0") return `${Math.round(value * 100)}%`;
  const text = value.toFixed(stat.format);
  return stat.signed && value > 0 ? `+${text}` : text;
}

/** Every metric whose lines the career endpoint must return for a position. */
export function lineMetrics(position) {
  const config = GAME_CHART[position] ?? GAME_CHART.WR;
  return config.stats.map((key) => GAME_STATS[key].metric);
}

// ---------------------------------------------------------------------------------------
// Weekly grids: Usage by week (Opportunity) and Every week, ranked (Stats)
// ---------------------------------------------------------------------------------------
// Each cell is ranked among every player at the position with a stat line that week
// (`/players/{id}/weekly-ranks`). `perGame` stats show the season column as an average a
// game; the rest show the season rate.
export const USAGE_ROWS = {
  WR: [
    { id: "snap_share", label: "Snap %", format: "pct0" },
    { id: "route_participation", label: "Route %", format: "pct0" },
    { id: "target_share", label: "Target share", format: "pct0" },
    { id: "air_yards_share", label: "Air yard share", format: "pct0" },
    { id: "targets", label: "Targets", format: "int", perGame: true },
    { id: "air_yards", label: "Air yards", format: "int", perGame: true },
    { id: "adot", label: "aDOT", format: 1 },
    { id: "red_zone_targets", label: "RZ targets", format: "int", perGame: true },
    { id: "wopr", label: "WOPR", format: 2 },
  ],
  RB: [
    { id: "snap_share", label: "Snap %", format: "pct0" },
    { id: "rush_attempt_share", label: "Rush share", format: "pct0" },
    { id: "target_share", label: "Target share", format: "pct0" },
    { id: "route_participation", label: "Route %", format: "pct0" },
    { id: "opportunity_share", label: "Opp share", format: "pct0" },
    { id: "carries", label: "Carries", format: "int", perGame: true },
    { id: "targets", label: "Targets", format: "int", perGame: true },
    { id: "rush_att_inside_10", label: "Inside 10", format: "int", perGame: true },
    { id: "red_zone_targets", label: "RZ targets", format: "int", perGame: true },
  ],
  QB: [
    { id: "attempts", label: "Attempts", format: "int", perGame: true },
    { id: "dropbacks", label: "Dropbacks", format: "int", perGame: true },
    { id: "sacks_suffered", label: "Sacks", format: "int", perGame: true },
    { id: "carries", label: "Carries", format: "int", perGame: true },
    { id: "rush_attempt_share", label: "Rush share", format: "pct0" },
    { id: "passing_first_downs", label: "Pass 1D", format: "int", perGame: true },
    { id: "ngs_pass_time_to_throw", label: "Time to throw", format: 2 },
    { id: "ngs_pass_intended_air_yards", label: "aDOT", format: 1 },
  ],
};
USAGE_ROWS.TE = USAGE_ROWS.WR;

export const RANKED_ROWS = {
  WR: [
    { id: "fantasy_points", label: "Points", format: 1, perGame: true, season: "fantasy_ppg" },
    { id: "targets", label: "Targets", format: "int", perGame: true },
    { id: "target_share", label: "Target share", format: "pct0" },
    { id: "receptions", label: "Catches", format: "int", perGame: true },
    { id: "receiving_yards", label: "Rec yards", format: "int", perGame: true },
    { id: "air_yards", label: "Air yards", format: "int", perGame: true },
    { id: "yards_per_route_run", label: "Yards / route", format: 2 },
    { id: "route_participation", label: "Route share", format: "pct0" },
    { id: "receiving_epa", label: "Rec EPA", format: 1, signed: true },
  ],
  RB: [
    { id: "fantasy_points", label: "Points", format: 1, perGame: true, season: "fantasy_ppg" },
    { id: "carries", label: "Carries", format: "int", perGame: true },
    { id: "rush_attempt_share", label: "Rush share", format: "pct0" },
    { id: "rushing_yards", label: "Rush yards", format: "int", perGame: true },
    { id: "yards_per_carry", label: "Yards / carry", format: 1 },
    { id: "targets", label: "Targets", format: "int", perGame: true },
    { id: "opportunity_share", label: "Opp share", format: "pct0" },
    { id: "snap_share", label: "Snap share", format: "pct0" },
    { id: "rushing_epa", label: "Rush EPA", format: 1, signed: true },
  ],
  QB: [
    { id: "fantasy_points", label: "Points", format: 1, perGame: true, season: "fantasy_ppg" },
    { id: "passing_yards", label: "Pass yards", format: "int", perGame: true },
    { id: "passing_tds", label: "Pass TDs", format: "int", perGame: true },
    { id: "yards_per_attempt", label: "Yards / att", format: 1 },
    { id: "cpoe", label: "CPOE", format: 1, signed: true },
    { id: "epa", label: "EPA", format: 1, signed: true, perGame: true },
    { id: "rushing_yards", label: "Rush yards", format: "int", perGame: true },
    { id: "interceptions", label: "INT", format: "int", perGame: true },
  ],
};
RANKED_ROWS.TE = RANKED_ROWS.WR;

// ---------------------------------------------------------------------------------------
// Routes: the participation feed's names, folded into one tree's branches
// ---------------------------------------------------------------------------------------
export const ROUTE_GROUPS = {
  "GO": "Go", "POST": "Post", "CORNER": "Corner", "IN/DIG": "In", "DEEP OUT": "Out", "QUICK OUT": "Out",
  "OUT": "Out", "HITCH/CURL": "Hitch", "HITCH": "Hitch", "SLANT": "Slant", "SHALLOW CROSS/DRAG": "Cross",
  "CROSS": "Cross", "SCREEN": "Screen", "WHEEL": "Wheel", "TEXAS/ANGLE": "Angle", "ANGLE": "Angle",
  "FLAT": "Flat", "SWING": "Flat",
};
export const routeGroup = (route) => ROUTE_GROUPS[route] ?? (route ? route[0] + route.slice(1).toLowerCase() : "Other");
