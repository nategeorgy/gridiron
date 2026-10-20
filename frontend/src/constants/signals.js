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
  "00-0038543", // Jaxon Smith-Njigba
  "00-0037248", // James Cook
  "00-0030506", // Travis Kelce
  "00-0040129", // Emeka Egbuka
  "00-0036158", // J.K. Dobbins
  "00-0040126", // Colston Loveland
];

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
      // A record by two: Cam Newton (2011), Robert Griffin III (2012), Kyler Murray (2020)
      // and Jalen Hurts (2022) had 6.
      kind: "leaders",
      playerId: "00-0034857", // Josh Allen
      title: "Most rushing touchdowns by a quarterback through Week 6",
      stat: "rushing_tds",
      format: "int",
      query: { grain: "seasons", positions: "QB", last_week: 6, where: "rushing_tds::", sort: "rushing_tds", order: "desc", limit: 3 },
    },
    {
      // The others are Justin Fields (Week 9, 2022) and Jon Kitna (Week 11, 2010).
      kind: "count",
      playerId: "00-0040743", // Tyler Shough
      title: "Three touchdown passes and a rushing touchdown on 150 passing yards or fewer",
      seasonCount: false,
      query: { grain: "games", positions: "QB", where: "passing_yards::150,passing_tds:3:,rushing_tds:1:", sort: "fantasy_points", order: "desc", limit: 50 },
      line: (row) => `${row.passing_yards} pass yds, ${row.passing_tds} pass TDs, ${row.rushing_tds} rush TD`,
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
