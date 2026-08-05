// Pre-canned scatters (M4), grouped by position.
//
// The scatter builder deliberately does *not* let a user pick arbitrary axes. Two
// metrics chosen at random usually produce a meaningless cloud, and the value of this
// tool is the curation: each preset below answers a specific fantasy question, and the
// axis pair is chosen so the *shape* of the plot is the answer.
//
// Every preset is scoped to a position group, because almost no interesting pair works
// across positions — target share means nothing for a QB, rushing share means nothing
// for a receiver. The "All Positions" group is restricted to metrics that genuinely
// apply to QB/RB/WR/TE alike (fantasy points, expected points, and the M3 scores).
//
// Metric ids must exist in the backend registry (backend/app/metrics.py).

/**
 * @typedef {Object} ScatterPreset
 * @property {string} id
 * @property {string} label       shown in the preset picker
 * @property {string} question    the question this chart answers (page subtitle)
 * @property {string} x           metric id for the x axis
 * @property {string} y           metric id for the y axis
 * @property {string} [size]      optional metric id driving bubble size
 * @property {string} [rankBy]    metric deciding which players survive the cap
 * @property {number} [minGames]  games needed to appear
 * @property {boolean} [identity] draw an x=y diagonal (only when both axes share units)
 * @property {Object} [corners]   quadrant labels: { topLeft, topRight, bottomLeft, bottomRight }
 */

// Used by several groups — the signature GridironIQ chart.
const expectedVsActual = (id) => ({
  id,
  label: "Expected vs Actual PPG",
  question: "Who is scoring what their opportunity was actually worth?",
  x: "expected_fantasy_ppg",
  y: "fantasy_ppg",
  identity: true,
  corners: {
    topLeft: "Outscoring the opportunity",
    bottomRight: "Opportunity says more is coming",
  },
});

/** @type {{id: string, label: string, position: string, blurb: string, presets: ScatterPreset[]}[]} */
export const SCATTER_GROUPS = [
  {
    id: "all",
    label: "All Positions",
    position: "",
    blurb:
      "Cross-position views. Only metrics that mean the same thing for a quarterback " +
      "and a tight end appear here — fantasy points, expected points, and the Insight scores.",
    presets: [
      expectedVsActual("all-expected"),
      {
        id: "all-buy-low",
        label: "Buy-Low Map",
        question: "Who has the usage but not yet the points?",
        x: "fantasy_opportunity_rating",
        y: "fantasy_points_over_expected",
        corners: {
          topLeft: "Low usage, overproducing",
          topRight: "Elite usage, cashing in",
          bottomLeft: "Little usage, little to buy",
          bottomRight: "Real usage, points lagging — buy",
        },
      },
      {
        id: "all-value",
        label: "Opportunity vs Value",
        question: "Whose role is actually producing startable value?",
        x: "fantasy_opportunity_rating",
        y: "vorp_ppg",
      },
      {
        id: "all-td-luck",
        label: "Touchdown Luck",
        question: "How much of this production is touchdown variance?",
        x: "tds_over_expected",
        y: "fantasy_ppg",
        corners: {
          topLeft: "Producing without the scores",
          topRight: "Riding hot touchdown luck",
        },
      },
    ],
  },
  {
    id: "qb",
    label: "QB",
    position: "QB",
    blurb: "Quarterback play — efficiency, volume, and the rushing floor that decides QB1 status.",
    presets: [
      {
        id: "qb-rushing",
        label: "The Rushing Floor",
        question: "Which quarterbacks have the legs that raise a fantasy floor?",
        x: "passing_yards",
        y: "rushing_yards",
        size: "fantasy_ppg",
        corners: {
          topLeft: "Legs carry the value",
          topRight: "Dual-threat — the QB1 tier",
          bottomRight: "Pocket passer, volume-dependent",
        },
      },
      {
        id: "qb-efficiency",
        label: "Accuracy vs Value",
        question: "Who is genuinely playing well, not just throwing a lot?",
        x: "cpoe",
        y: "epa",
        size: "attempts",
      },
      {
        id: "qb-volume",
        label: "Volume vs Points",
        question: "How much of a quarterback's scoring is just pass attempts?",
        x: "attempts",
        y: "fantasy_ppg",
        size: "passing_tds",
      },
      expectedVsActual("qb-expected"),
    ],
  },
  {
    id: "rb",
    label: "RB",
    position: "RB",
    blurb: "Running back roles — carries, receiving work, and goal-line equity.",
    presets: [
      {
        id: "rb-workhorse",
        label: "Three-Down Workload",
        question: "Who carries the ball *and* stays on the field for passing downs?",
        x: "rush_attempt_share",
        y: "route_participation",
        size: "fantasy_ppg",
        corners: {
          topLeft: "Passing-down back",
          topRight: "True three-down workhorse",
          bottomLeft: "Committee piece",
          bottomRight: "Early-down grinder",
        },
      },
      {
        id: "rb-goal-line",
        label: "Goal-Line Equity",
        question: "Who gets the touches where points are actually scored?",
        x: "high_value_touches_per_game",
        y: "fantasy_ppg",
      },
      {
        id: "rb-opportunity",
        label: "Opportunity vs Points",
        question: "How much of the offense runs through each back?",
        x: "opportunity_share",
        y: "fantasy_ppg",
        size: "touches_per_snap",
      },
      expectedVsActual("rb-expected"),
    ],
  },
  {
    id: "wr",
    label: "WR",
    position: "WR",
    blurb: "Receiver roles — target volume, route efficiency, and how they're used downfield.",
    presets: [
      {
        id: "wr-volume-efficiency",
        label: "Volume vs Efficiency",
        question: "Who earns targets, and who does the most with them?",
        x: "target_share",
        y: "yards_per_route_run",
        size: "fantasy_ppg",
        corners: {
          topLeft: "Efficient on a small role",
          topRight: "Alpha — volume and efficiency",
          bottomRight: "High volume, low return",
        },
      },
      {
        id: "wr-role",
        label: "Depth of Role",
        question: "Deep threat or high-volume underneath receiver?",
        x: "adot",
        y: "target_share",
        size: "fantasy_ppg",
        corners: {
          topLeft: "Volume underneath",
          topRight: "Downfield alpha",
        },
      },
      {
        id: "wr-earning",
        label: "Getting Open",
        question: "Who wins their routes — and turns that into yards?",
        x: "targets_per_route_run",
        y: "yards_per_route_run",
      },
      expectedVsActual("wr-expected"),
    ],
  },
  {
    id: "te",
    label: "TE",
    position: "TE",
    blurb:
      "Tight end value is a usage story before it is a talent story — a tight end who " +
      "blocks cannot score, however good he is.",
    presets: [
      {
        id: "te-route-rate",
        label: "Routes vs Production",
        question: "Which tight ends are actually running routes instead of blocking?",
        x: "route_participation",
        y: "yards_per_route_run",
        size: "fantasy_ppg",
        corners: {
          topRight: "Full-time receiving weapon",
          bottomLeft: "Blocker — no fantasy path",
        },
      },
      {
        id: "te-volume-efficiency",
        label: "Volume vs Efficiency",
        question: "Who earns targets, and who does the most with them?",
        x: "target_share",
        y: "yards_per_route_run",
        size: "fantasy_ppg",
      },
      {
        id: "te-red-zone",
        label: "Red-Zone Role",
        question: "Whose scoring is backed by real red-zone usage?",
        x: "red_zone_targets",
        y: "fantasy_ppg",
      },
      expectedVsActual("te-expected"),
    ],
  },
  {
    id: "flex",
    label: "Flex",
    position: "FLEX",
    blurb:
      "RB, WR, and TE on one chart — the actual flex decision. Only metrics defined " +
      "for all three appear here.",
    presets: [
      {
        id: "flex-value",
        label: "Flex Value",
        question: "Which flex option is genuinely worth the start?",
        x: "fantasy_opportunity_rating",
        y: "vorp_ppg",
      },
      {
        id: "flex-opportunity",
        label: "Opportunity vs Points",
        question: "Who touches the ball most, regardless of position?",
        x: "opportunity_share",
        y: "fantasy_ppg",
        size: "snap_share",
      },
      {
        id: "flex-high-value",
        label: "High-Value Touches",
        question: "Who gets the touches nearest the end zone?",
        x: "high_value_touches_per_game",
        y: "fantasy_ppg",
      },
      expectedVsActual("flex-expected"),
    ],
  },
];

export const DEFAULT_GROUP = "all";

/** How many players to plot. Headshot bubbles stop being readable much past ~60. */
export const DENSITY_OPTIONS = [
  { value: "25", label: "Top 25" },
  { value: "50", label: "Top 50" },
  { value: "100", label: "Top 100" },
];

export function findGroup(groupId) {
  return SCATTER_GROUPS.find((group) => group.id === groupId) ?? SCATTER_GROUPS[0];
}
