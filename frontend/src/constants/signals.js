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
 * The head-to-head's opening pair. A reader can swap either player from the card, and
 * the pick rides in the URL (`?h2h=`), so this is only what the card shows first.
 *
 * `weeks` narrows the featured pair to the games they shared, percentile pools
 * included; a pair the reader picks gets the whole season again.
 */
export const FEATURED_MATCHUP = {
  players: ["00-0039491", "00-0040124"], // Jalen Coker, Tetairoa McMillan
  // Week 3 is left out: Coker played 36% of the snaps. Carolina's bye was Week 5.
  weeks: "1,2,6",
  caption: `${SIGNALS_SEASON} · Weeks 1, 2 and 6`,
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
  // The season so far. Name `weeks` (e.g. "4") to feature a single week instead.
  passerId: "00-0039918", // Caleb Williams
  team: "CHI",
};

/**
 * Record Book entries: a week's standout line set against every season since 2009,
 * answered live by the Query Builder (`/explore/query`).
 *
 * - `leaders`: a seasons search cut at `lastWeek`, drawn as a ranked list (the query's
 *   `limit`) with the featured player's season highlighted. It ranks by fantasy points
 *   unless the entry names a `stat` (and its `format`).
 * - `count`: how many games since 2009 match `where`, and how many of them this season;
 *   `playerId`/`week` pick the featured game out of the same search for its line.
 *   `seasonCount: false` leaves the "this season" clause off.
 */
export const RECORD_BOOK = {
  season: 2026,
  week: 6,
  entries: [
    {
      // Second only to Wes Welker's 2011 in PPR and half-PPR; third in standard, where
      // Tyreek Hill's 2023 passes both.
      kind: "leaders",
      playerId: "00-0038543", // Jaxon Smith-Njigba
      title: "Most fantasy points by a wide receiver through Week 6",
      query: { grain: "seasons", positions: "WR", last_week: 6, where: "fantasy_points::", sort: "fantasy_points", order: "desc", limit: 3 },
    },
    {
      // A record in PPR and half-PPR, ahead of Christian McCaffrey's 2019 (30.2); third in
      // standard, behind Todd Gurley (2018) and Derrick Henry (2021). The four-game floor
      // keeps a two-game start off the list.
      kind: "leaders",
      playerId: "00-0039139", // Jahmyr Gibbs
      title: "Most fantasy points per game by a running back through Week 6",
      stat: "fantasy_ppg",
      format: 1,
      query: { grain: "seasons", positions: "RB", last_week: 6, where: "fantasy_ppg::,games:4:", sort: "fantasy_ppg", order: "desc", limit: 3 },
    },
    {
      // The others are Michael Crabtree (Week 15, 2017) and Austin Ekeler (Week 6, 2022).
      kind: "count",
      playerId: "00-0040129", // Emeka Egbuka
      title: "16+ targets and fewer than 50 receiving yards",
      seasonCount: false,
      query: { grain: "games", positions: "RB,WR,TE", where: "targets:16:,receiving_yards::49,receptions::", sort: "targets", order: "desc", limit: 50 },
      line: (row) => `${row.targets} targets, ${row.receptions} catches, ${row.receiving_yards} yds`,
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
