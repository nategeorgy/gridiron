// The hand-picked players on the Command Center (M10).
//
// ⚠️ **The player selection is hand-picked, not computed.** The M3 engine has
// positive-regression and sell-high indices, and a later pass will decide whether
// these cards should be driven by them or by something new — so the lists below are a
// deliberate placeholder with a known expiry, not a shortcut that got left in.
//
// Only the *selection* is hardcoded. Every number the cards show is fetched live in
// the reader's own scoring, so nothing here goes stale in the way a pasted stat line
// would; when the picks are replaced by a query, the cards do not change.
//
// **The cards read the season the picks were chosen from.** Every number is live, but
// pointing a 2025 pick at 2026 showed a Week 1 line beside a note about the previous
// season. The picks below are from 2026.
export const SIGNALS_SEASON = 2026;

/**
 * Expected vs Actual (September 2026). One plot replaced the two rail cards
 * (Underperformers and Regression Candidates), which drew the same gap twice on two
 * scales and never said what caused it.
 *
 * The list is not split by side: which side a player is on is read from his own points
 * over expected, so a pick that moves across par between weeks reclassifies itself
 * instead of appearing under a heading that has stopped being true.
 */
export const EXPECTED_VS_ACTUAL = [
  "00-0037834", // Brock Purdy
  "00-0036355", // Justin Herbert
  "00-0037228", // Jaylen Warren
  "00-0038597", // Chase Brown
  "00-0039064", // Zay Flowers
  "00-0034348", // Courtland Sutton
  "00-0033288", // George Kittle
  "00-0034753", // Mark Andrews
];

/**
 * The head-to-head's opening pair. A reader can swap either player from the card, and
 * the pick rides in the URL (`?h2h=`), so this is only what the card shows first.
 */
export const FEATURED_MATCHUP = {
  players: ["00-0037247", "00-0036358"], // George Pickens, CeeDee Lamb
  caption: String(SIGNALS_SEASON),
};

/**
 * Highlighted Viz of the Week (October 2026): one Explore chart, large, at the top of the
 * page. `kind` names the chart so a later week can feature something other than a
 * passing network; today "network" is the only kind the card draws. As with the picks
 * above, only the selection is written here: every number in the headline is read live.
 */
export const HIGHLIGHTED_VIZ = {
  kind: "network",
  season: 2026,
  // One week: Malik Nabers's 20 targets and Isaiah Likely's 13, 33 of Winston's 52.
  weeks: "5",
  passerId: "00-0031503", // Jameis Winston
  team: "NYG",
};

/**
 * Record Book entries: a week's standout line set against every season since 2009,
 * answered live by the Query Builder (`/explore/query`).
 *
 * - `leaders`: a seasons search cut at `lastWeek`, drawn as a top-five list with the
 *   featured player's season highlighted.
 * - `count`: how many games since 2009 match `where`, and how many of them this season;
 *   `playerId`/`week` pick the featured game out of the same search for its line.
 *   `seasonCount: false` leaves the "this season" clause off.
 */
export const RECORD_BOOK = {
  season: 2026,
  week: 5,
  entries: [
    {
      // Second only to Christian McCaffrey's 2019.
      kind: "leaders",
      playerId: "00-0039139", // Jahmyr Gibbs
      title: "Most fantasy points by a running back through Week 5",
      query: { grain: "seasons", positions: "RB", last_week: 5, where: "fantasy_points::", sort: "fantasy_points", order: "desc", limit: 5 },
    },
    {
      kind: "count",
      playerId: "00-0039851", // Drake Maye
      title: "370+ passing yards, 4+ passing TDs and a rushing TD",
      seasonCount: false,
      query: { grain: "games", where: "passing_yards:370:,passing_tds:4:,rushing_tds:1:", sort: "passing_yards", order: "desc", limit: 200 },
      line: (row) => `${row.passing_yards} yards, ${row.passing_tds} TDs, ${row.rushing_tds} rushing TD`,
    },
    {
      // The other 2026 game is CeeDee Lamb's 21 in Week 4.
      kind: "count",
      playerId: "00-0039337", // Malik Nabers
      title: "20+ targets in a game",
      query: { grain: "games", where: "targets:20:,receptions::,receiving_yards::", sort: "targets", order: "desc", limit: 200 },
      line: (row) => `${row.targets} targets, ${row.receptions} catches, ${row.receiving_yards} yards`,
    },
  ],
};

/**
 * The eight axes the radar draws: output, then the opportunity behind it, then what was
 * done with it. The set follows the matchup — a pair of receivers is a *route* argument,
 * so the rushing axes the old committee pairing needed are gone.
 */
export const MATCHUP_METRICS = [
  { id: "fantasy_ppg", label: "PPG", format: 1 },
  { id: "expected_fantasy_ppg", label: "Expected", format: 1 },
  { id: "targets", label: "Targets", format: "int" },
  { id: "route_participation", label: "RTE%", format: "pct" },
  { id: "red_zone_targets", label: "RZ Targets", format: "int" },
  { id: "adot", label: "ADOT", format: 1 },
  { id: "yards_per_route_run", label: "YPRR", format: 2 },
  { id: "targets_per_route_run", label: "TPRR", format: "pct" },
];

/**
 * The radar's axes by position, now that a reader picks the pair. Receivers keep the
 * card's original eight; a back is a carries-and-goal-line argument and a quarterback a
 * volume-and-efficiency one, the same axes the player page's head-to-head radar uses
 * (`COMPARE_AXES` in constants/playerPage.js), with formats for the value badges.
 */
export const MATCHUP_METRICS_BY_POSITION = {
  WR: MATCHUP_METRICS,
  TE: MATCHUP_METRICS,
  RB: [
    { id: "fantasy_ppg", label: "PPG", format: 1 },
    { id: "expected_fantasy_ppg", label: "Expected", format: 1 },
    { id: "carries", label: "Carries", format: "int" },
    { id: "targets", label: "Targets", format: "int" },
    { id: "rushing_yards", label: "Rush Yd", format: "int" },
    { id: "opportunity_share", label: "OPP%", format: "pct" },
    { id: "snap_share", label: "SNAP%", format: "pct" },
    { id: "rush_att_inside_5", label: "In 5", format: "int" },
  ],
  QB: [
    { id: "fantasy_ppg", label: "PPG", format: 1 },
    { id: "expected_fantasy_ppg", label: "Expected", format: 1 },
    { id: "attempts", label: "Attempts", format: "int" },
    { id: "passing_yards", label: "Pass Yd", format: "int" },
    { id: "passing_tds", label: "Pass TD", format: "int" },
    { id: "rushing_yards", label: "Rush Yd", format: "int" },
    { id: "cpoe", label: "CPOE", format: 1 },
    { id: "epa_per_play", label: "EPA/Play", format: 2 },
  ],
};
