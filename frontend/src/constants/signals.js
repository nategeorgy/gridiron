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
 * How a Trending Players row measures its change. "Trending" is not one question, so a
 * pick names the comparison that makes its own case:
 *
 * - `LAST_WEEK` — the same player, the week before. The usual one: a role grew.
 * - `TEAMMATE` — another player, the *same* week (`against` names him). For a job
 *   taken off someone, where the interesting number is the split, not the history.
 * - `SEASON_RANK` — no change at all. The season value with its rank at the position,
 *   for a player who is not trending so much as simply playing well, and whose weekly
 *   deltas would understate that.
 * - `RECENT_WEEKS`: the last few weeks against the same number before them (the card's
 *   `window`, so weeks 3-4 against 1-2). For a role that changed a couple of weeks ago,
 *   where this week against last would compare two weeks of the new role.
 */
export const TRENDING_BASIS = {
  LAST_WEEK: "last-week",
  TEAMMATE: "teammate",
  SEASON_RANK: "season-rank",
  RECENT_WEEKS: "recent-weeks",
};

/**
 * The two windows a `RECENT_WEEKS` pick compares, ending at `week`: with a window of 2
 * and Week 4, `{ recent: [3, 4], earlier: [1, 2] }`. The earlier window is cut at Week 1,
 * so it can be shorter (or empty) early in a season.
 */
export function trendingWindows(week, size) {
  const span = (last) => Array.from({ length: size }, (_, index) => last - size + 1 + index).filter((value) => value >= 1);
  return { recent: span(week), earlier: span(week - size) };
}

/**
 * The card at the top of the page (renamed from Week Standouts, September 2026).
 *
 * Each pick names **its own four stats**, because the reason a player is on the card
 * differs: a receiver's case is targets and air yards, a back's is the share of the
 * backfield he took, a quarterback's is where he ranks. Stats are metric ids from the
 * registry, so labels and formats come from `/metrics` rather than being repeated here.
 *
 * Every number is scoped to `week` (the intelligence endpoint's `weeks=`), so the card
 * keeps describing Week 2 once later weeks have been played.
 */
export const TRENDING_PLAYERS = {
  season: 2026,
  week: 4,
  // Weeks per side for a RECENT_WEEKS pick.
  window: 2,
  players: [
    {
      // Weeks 3-4 against 1-2: target share 25% to 34%, air-yard share 36% to 58%.
      playerId: "00-0041438", // Carnell Tate
      basis: TRENDING_BASIS.RECENT_WEEKS,
      stats: ["target_share", "targets_per_route_run", "fantasy_points_per_route_run", "air_yards_share"],
    },
    {
      // Week 4 against 3. His points fell (17.0 to 11.1) while the role grew.
      playerId: "00-0040719", // Bhayshul Tuten
      stats: ["rush_attempt_share", "snap_share", "opportunity_share", "route_participation"],
    },
    {
      // Weeks 3-4 against 1-2: target share 23% to 36%, air-yard share 38% to 52%.
      playerId: "00-0038559", // Michael Wilson
      basis: TRENDING_BASIS.RECENT_WEEKS,
      stats: ["target_share", "targets_per_route_run", "fantasy_points_per_route_run", "air_yards_share"],
    },
    {
      // Weeks 3-4 against 1-2: snaps 60% to 77%, rush share 40% to 65%.
      playerId: "00-0037840", // Kyren Williams
      basis: TRENDING_BASIS.RECENT_WEEKS,
      stats: ["snap_share", "rush_attempt_share", "opportunity_share", "target_share"],
    },
    {
      // Week 4 against 3. Snap share and route participation fell, so they stay off.
      playerId: "00-0037816", // Romeo Doubs
      stats: ["target_share", "targets_per_route_run", "fantasy_points_per_route_run", "air_yards_share"],
    },
  ],
};

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
  "00-0036555", // Chuba Hubbard
  "00-0038559", // Michael Wilson
  "00-0040126", // Colston Loveland
  "00-0040122", // Ashton Jeanty
  "00-0029604", // Kirk Cousins
  "00-0035719", // Deebo Samuel Sr.
];

/**
 * The head-to-head's opening pair. A reader can swap either player from the card, and
 * the pick rides in the URL (`?h2h=`), so this is only what the card shows first.
 */
export const FEATURED_MATCHUP = {
  players: ["00-0040667", "00-0038124"], // Matthew Golden, Christian Watson
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
  // The season so far. Name `weeks` (e.g. "4") to feature a single week instead.
  passerId: "00-0037834", // Brock Purdy
  team: "SF",
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
  week: 4,
  entries: [
    {
      // Second only to Wes Welker's 2011, with CeeDee Lamb third.
      kind: "leaders",
      playerId: "00-0038543", // Jaxon Smith-Njigba
      title: "Most fantasy points by a receiver through Week 4",
      query: { grain: "seasons", positions: "WR", last_week: 4, where: "fantasy_points::", sort: "fantasy_points", order: "desc", limit: 5 },
    },
    {
      kind: "count",
      playerId: "00-0040124", // Tetairoa McMillan
      title: "14+ catches, 190+ yards and 2+ touchdowns",
      seasonCount: false,
      query: { grain: "games", where: "receptions:14:,receiving_yards:190:,receiving_tds:2:", sort: "receiving_yards", order: "desc", limit: 200 },
      line: (row) => `${row.receptions} catches, ${row.receiving_yards} yards, ${row.receiving_tds} TDs`,
    },
    {
      // Receptions can't pass targets, so 13+ catches on 13 or fewer targets is exactly 13 of 13.
      kind: "count",
      playerId: "00-0035229", // T.J. Hockenson
      title: "13 catches on 13 targets",
      seasonCount: false,
      query: { grain: "games", where: "receptions:13:,targets::13,receiving_yards::", sort: "receiving_yards", order: "desc", limit: 200 },
      line: (row) => `${row.receptions} of ${row.targets} targets for ${row.receiving_yards} yards`,
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
