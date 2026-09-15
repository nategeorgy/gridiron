// The hand-picked players on the Command Center (M10): the Week standouts, the two signal
// cards, and the featured head-to-head.
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
// `note` exists for a pick the points-versus-expected metric cannot see. The 2025 set
// carried Matthew Stafford on one: +1.5 over a full season is dead even, because the
// expected-points model priced his touchdowns in, but 46 passing touchdowns on a 7.71%
// rate against a 4.62% league average was the loudest regression case in the league.
// That is the standing evidence that **rate over baseline** is the signal a computed
// version of this card still needs.
//
// **The cards read the season the picks were chosen from.** Every number is live, but
// pointing a 2025 pick at 2026 showed Stafford's Week 1 beside a note about his 46
// touchdowns. The picks below are from 2026 Week 1, and every one of them sits on its
// card's side of expected there (measured before they went in).
export const SIGNALS_SEASON = 2026;

/**
 * The standouts card at the top of the page: one week, a handful of players, and how much
 * they were on the field and used. Every number is scoped to `week` alone (the
 * intelligence endpoint's `weeks=`), so the card still describes that week once later
 * ones have been played. It replaced the 2026 preseason outlook, whose hand-picked on/off
 * splits had nothing left to say once real snaps existed.
 */
export const WEEKLY_STANDOUTS = {
  season: 2026,
  week: 1,
  players: [
    "00-0038124", // Christian Watson
    "00-0039491", // Jalen Coker
    "00-0037838", // Isaiah Likely
    "00-0041523", // Caleb Douglas
    "00-0041037", // Denzel Boston
  ],
};

/** Scoring below what the opportunity was worth — the usage is already there. */
export const UNDERPERFORMERS = [
  { playerId: "00-0037240", name: "Jameson Williams" },
  { playerId: "00-0040126", name: "Colston Loveland" },
  { playerId: "00-0033280", name: "Christian McCaffrey" },
];

/** Scoring above what the opportunity was worth, on luck that rarely repeats. */
export const REGRESSION_CANDIDATES = [
  { playerId: "00-0040236", name: "Kyle Monangai" },
  { playerId: "00-0036555", name: "Chuba Hubbard" },
  { playerId: "00-0034351", name: "Dallas Goedert" },
];

/** The featured head-to-head. A committee, so the two profiles actually differ. */
export const FEATURED_MATCHUP = {
  players: ["00-0036275", "00-0040236"], // D'Andre Swift, Kyle Monangai
  caption: String(SIGNALS_SEASON),
};

/** The eight axes the radar draws. Volume, share and output, in that order. */
export const MATCHUP_METRICS = [
  { id: "fantasy_ppg", label: "PPG", format: 1 },
  { id: "expected_fantasy_ppg", label: "Expected", format: 1 },
  { id: "carries", label: "Carries", format: "int" },
  { id: "targets", label: "Targets", format: "int" },
  { id: "opportunity_share", label: "Opp%", format: "pct" },
  { id: "snap_share", label: "Snap%", format: "pct" },
  { id: "target_share", label: "Tgt share", format: "pct" },
  { id: "rush_att_inside_10", label: "In10", format: "int" },
];
