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
  week: 2,
  players: [
    {
      playerId: "00-0040737", // Terrance Ferguson
      stats: ["targets", "target_share", "routes_run", "snap_share"],
    },
    {
      // Bryce Young is not a usage story: he has been the QB2 in points all season, so
      // a week-over-week delta would say less than the ranks do.
      playerId: "00-0039150",
      basis: TRENDING_BASIS.SEASON_RANK,
      stats: [
        "fantasy_points",
        "yards_per_attempt",
        "ngs_pass_completed_air_yards",
        "ngs_pass_intended_air_yards",
      ],
    },
    {
      // Henderson did not play in Week 1, so there is no previous week to compare to.
      // The split against the back he took the work from says more than a blank row.
      playerId: "00-0040734",
      basis: TRENDING_BASIS.TEAMMATE,
      against: "00-0036875", // Rhamondre Stevenson
      stats: ["snap_share", "carries", "market_share", "opportunity_share"],
    },
    {
      playerId: "00-0036613", // Jaylen Waddle
      stats: ["targets", "target_share", "fantasy_points_per_route_run", "air_yards"],
    },
    {
      playerId: "00-0039890", // Adonai Mitchell
      stats: ["targets", "target_share", "targets_per_route_run", "air_yards"],
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
  "00-0035640", // DK Metcalf
  "00-0040124", // Tetairoa McMillan
  "00-0039040", // De'Von Achane
  "00-0033873", // Patrick Mahomes
  "00-0032764", // Derrick Henry
];

/** The featured head-to-head. Two receivers on one offence, so the shares are a split. */
export const FEATURED_MATCHUP = {
  players: ["00-0039491", "00-0040124"], // Jalen Coker, Tetairoa McMillan
  caption: String(SIGNALS_SEASON),
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
