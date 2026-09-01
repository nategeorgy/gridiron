// The two signal cards on the Command Center (M10).
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
// A note on Matthew Stafford: by points-versus-expected he is +1.5 over a full season,
// which is dead even — the expected-points model priced his touchdowns in, so the
// metric these cards otherwise draw cannot see him. He is here on a different signal
// entirely: 46 passing touchdowns on a 7.71% rate against a 4.62% league average, the
// highest in the NFL. That is what `note` is for, and his row is the standing evidence
// that **rate over baseline** is the signal a computed version of this card still
// needs.

/** Scoring below what the opportunity was worth — the usage is already there. */
export const UNDERPERFORMERS = [
  { playerId: "00-0036322", name: "Justin Jefferson" },
  { playerId: "00-0040129", name: "Emeka Egbuka" },
  { playerId: "00-0034844", name: "Saquon Barkley" },
];

/** Scoring above what the opportunity was worth, on luck that rarely repeats. */
export const REGRESSION_CANDIDATES = [
  { playerId: "00-0038543", name: "Jaxon Smith-Njigba" },
  { playerId: "00-0034351", name: "Dallas Goedert" },
  {
    playerId: "00-0026498",
    name: "Matthew Stafford",
    note: "46 pass TD on a 7.7% rate — league average is 4.6%",
  },
];

/** The featured head-to-head. A committee, so the two profiles actually differ. */
export const FEATURED_MATCHUP = {
  players: ["00-0037248", "00-0039040"], // James Cook, De'Von Achane
  caption: "2025",
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

// ---------------------------------------------------------------------------
// 2026 opportunity outlook (M10)
// ---------------------------------------------------------------------------
// ⚠️ **Hand-picked, and only until the season starts talking.** The Trending card
// ranks a *change* over a trailing window, and before about Week 5 there is no
// trailing window to rank — so in the preseason it shows this instead: players whose
// opportunity should be larger in 2026 than it was in 2025, each with the measured
// reason. `TrendingCard` switches to the live board on its own (see `useOutlook`);
// nothing here needs editing in September.
//
// **The numbers are hardcoded and that is safe here, unlike everywhere else in this
// app.** They describe the 2025 season, which is closed — these are frozen facts, not
// a snapshot of a moving number. Re-derive them only if the 2025 ingest changes.
//
// Three kinds of evidence, used only where each is actually valid:
//
//   `split`      — the player's own numbers with a teammate on the field vs off it.
//                  Only usable with enough clean games, and only counting games the
//                  *subject* played in full: DeVonta Smith's two games without A.J.
//                  Brown average out to a 52% snap share, because one of them is a
//                  Week 18 in which Smith himself played 14% of the snaps. Averaging
//                  those two produced a picture that was wrong about both.
//   `trajectory` — early season against the closing stretch. Week 18 alone proves
//                  nothing (starters rest); the playoff games are what make it real,
//                  which is why the late window includes them.
//   `vacated`    — target share that has physically left the building. The honest
//                  choice when there is no on/off sample at all: Keenan Allen played
//                  all 17 games across his time with McConkey, so no amount of querying
//                  produces a "without" split there.
//
// A card may set `tone: "warn"` when the movement is a *warning* rather than a
// promotion — Michael Wilson's split is read without→with, because the news is that
// Harrison is back, and green would say the opposite of what the card means.
//
// Deliberately **no projection**. Vacated share is what left, not what this player is
// assumed to inherit — the same reason this project has no `projections` table.

export const OPPORTUNITY_OUTLOOK = [
  {
    playerId: "00-0036912",
    name: "DeVonta Smith",
    position: "WR",
    team: "PHI",
    kind: "split",
    headline: "DeVonta Smith's splits with and without A.J. Brown.",
    labels: { before: "With Brown (58g)", after: "Without (3g)" },
    rows: [
      { label: "Target share", format: "pct", before: 0.254, after: 0.358 },
      { label: "Air yards share", format: "pct", before: 0.291, after: 0.593 },
      { label: "Targets / game", format: 1, before: 7.2, after: 9.7 },
      { label: "Fantasy PPG", format: 1, before: 14.1, after: 16.6 },
    ],
    note:
      "Four seasons as teammates, 2022–25, counting only games Smith played himself — " +
      "three qualify, and all three agree (34.5%, 27.8% and 45.0% of targets). Brown's " +
      "28.7% has now left for New England, and the air-yards jump is the tell: without " +
      "him Smith inherits the downfield role, not just the volume.",
  },
  {
    playerId: "00-0040126",
    name: "Colston Loveland",
    position: "TE",
    team: "CHI",
    kind: "trajectory",
    headline: "Started to demand more and more volume as the season progressed.",
    labels: { before: "Weeks 1–14", after: "Week 15 → playoffs" },
    rows: [
      { label: "Snap share", format: "pct", before: 0.593, after: 0.778 },
      { label: "Route participation", format: "pct", before: 0.611, after: 0.801 },
      { label: "Target share", format: "pct", before: 0.133, after: 0.271 },
      { label: "Fantasy PPG", format: 1, before: 8.5, after: 16.0 },
    ],
    note:
      "D.J. Moore and his 85 targets have left Chicago, on top of a season in which " +
      "Loveland was already becoming more and more involved as it went on.",
  },
  {
    playerId: "00-0038559",
    name: "Michael Wilson",
    position: "WR",
    team: "ARI",
    kind: "split",
    // Amber, and read without → with: the point is not that he was good without
    // Harrison, it is that Harrison is back. The movement is a decline, so the colour
    // is the same warning the Regression Candidates card uses.
    tone: "warn",
    headline: "Michael Wilson's splits with and without Marvin Harrison Jr.",
    labels: { before: "Without Harrison (5g)", after: "With Harrison (10g)" },
    rows: [
      { label: "Target share", format: "pct", before: 0.317, after: 0.127 },
      { label: "Targets / game", format: 1, before: 13.6, after: 4.3 },
      { label: "Fantasy PPG", format: 1, before: 26.0, after: 6.3 },
    ],
    note:
      "Harrison is healthy and back in Arizona, so the right-hand column is the default " +
      "expectation. Wilson's route participation barely moves either way (84.8% → 84.2%) " +
      "— he is on the field regardless, so this is targets being taken, not snaps.",
  },
  {
    playerId: "00-0039491",
    name: "Jalen Coker",
    position: "WR",
    team: "CAR",
    kind: "trajectory",
    headline: "Became Carolina's clear #2 pass catcher.",
    labels: { before: "Weeks 7–14", after: "Week 15 → playoffs" },
    rows: [
      { label: "Snap share", format: "pct", before: 0.643, after: 0.802 },
      { label: "Route participation", format: "pct", before: 0.762, after: 0.895 },
      { label: "Target share", format: "pct", before: 0.143, after: 0.203 },
      { label: "Fantasy PPG", format: 1, before: 6.9, after: 14.1 },
    ],
    note:
      "As he got healthier from his injured quad, Coker started to show up in a big way " +
      "down the stretch.",
  },
  {
    playerId: "00-0039915",
    name: "Ladd McConkey",
    position: "WR",
    team: "LAC",
    kind: "vacated",
    headline: "Keenan Allen's 122 targets left for Indianapolis.",
    facts: [
      { label: "Vacated by Allen", value: "22.1%", strong: true },
      { label: "Total vacated in Los Angeles", value: "36.9%" },
      { label: "McConkey's own 2025 target share", value: "21.1%" },
    ],
    note:
      "After headaches McConkey owners faced last year, Keenan Allen is now out of the " +
      "picture and McConkey becomes the clear go-to target for Justin Herbert.",
  },
];
