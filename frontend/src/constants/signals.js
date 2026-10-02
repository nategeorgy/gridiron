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
 */
export const TRENDING_BASIS = {
  LAST_WEEK: "last-week",
  TEAMMATE: "teammate",
  SEASON_RANK: "season-rank",
};

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
  week: 3,
  players: [
    {
      // The Giants' backfield moved his way: snaps 59% to 77%, opportunity share 30% to 44%.
      playerId: "00-0040715", // Cam Skattebo
      stats: ["snap_share", "rush_attempt_share", "opportunity_share", "carries"],
    },
    {
      // Target share dipped (11.5% to 10.0%) even as his targets rose, so targets stand
      // in for it: the card is about the work he gained.
      playerId: "00-0041027", // Jeremiyah Love
      stats: ["snap_share", "rush_attempt_share", "routes_run", "targets"],
    },
    {
      // Yards per route run slipped (2.40 to 2.33); the air yards are the bigger story.
      playerId: "00-0038997", // Josh Downs
      stats: ["target_share", "targets_per_route_run", "air_yards", "targets"],
    },
    {
      playerId: "00-0039067", // Rashee Rice
      stats: ["target_share", "yards_per_route_run", "targets_per_route_run", "air_yards"],
    },
    {
      playerId: "00-0037238", // Drake London
      stats: ["target_share", "yards_per_route_run", "targets_per_route_run", "air_yards"],
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
  "00-0030506", // Travis Kelce
  "00-0040122", // Ashton Jeanty
  "00-0040124", // Tetairoa McMillan
  "00-0037240", // Jameson Williams
  "00-0034960", // Jakobi Meyers
  "00-0035719", // Deebo Samuel Sr.
];

/**
 * The head-to-head's opening pair. A reader can swap either player from the card, and
 * the pick rides in the URL (`?h2h=`), so this is only what the card shows first.
 */
export const FEATURED_MATCHUP = {
  players: ["00-0038124", "00-0040667"], // Christian Watson, Matthew Golden
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
  // Empty for the whole season so far.
  weeks: "",
  passerId: "00-0036264", // Jordan Love
  team: "GB",
};

/**
 * Record Book entries: a week's standout line set against every season since 2009,
 * answered live by the Query Builder (`/explore/query`).
 *
 * - `leaders`: a seasons search cut at `lastWeek`, drawn as a top-five list with the
 *   featured player's season highlighted.
 * - `count`: how many games since 2009 match `where`, and how many of them this season;
 *   `playerId`/`week` pick the featured game out of the same search for its line.
 */
export const RECORD_BOOK = {
  season: 2026,
  week: 3,
  entries: [
    {
      kind: "leaders",
      playerId: "00-0038543", // Jaxon Smith-Njigba
      title: "Most fantasy points by a receiver through Week 3",
      query: { grain: "seasons", positions: "WR", last_week: 3, where: "fantasy_points::", sort: "fantasy_points", order: "desc", limit: 5 },
    },
    {
      kind: "count",
      playerId: "00-0037238", // Drake London
      title: "190+ receiving yards on 10 targets or fewer",
      query: { grain: "games", where: "receiving_yards:190:,targets::10", sort: "receiving_yards", order: "desc", limit: 200 },
      line: (row) => `${row.receiving_yards} yards on ${row.targets} targets`,
    },
    {
      kind: "leaders",
      playerId: "00-0041032", // Kenyon Sadiq
      title: "Most fantasy points by a rookie tight end through Week 3",
      query: { grain: "seasons", positions: "TE", rookies: "only", last_week: 3, where: "fantasy_points::", sort: "fantasy_points", order: "desc", limit: 5 },
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
