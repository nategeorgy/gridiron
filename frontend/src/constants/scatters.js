// The Scatter page's questions, per position (September 2026).
//
// Curated, not open-ended: two metrics chosen at random usually make a meaningless
// cloud, and the curation is the feature. Each preset is one question with its two
// axes, an optional bubble size, and names for the corners that answer it. Every id
// must exist in the metric registry (GET /api/v1/metrics) and be served by
// /stats/intelligence, which is what the page reads.
//
// Adding a chart is one entry here. "Show where each player was last season" (trails)
// was mocked and parked in September 2026, not rejected: the plot can take it back.

const expectedVsActual = (id) => ({
  id,
  label: "Expected vs Actual PPG",
  question: "Who is scoring what his opportunity was worth?",
  x: "expected_fantasy_ppg",
  y: "fantasy_ppg",
  identity: true,
  corners: { topLeft: "Scoring above his opportunity", bottomRight: "Opportunity says more is coming" },
});

const receiver = (position) => [
  {
    id: `${position}-adot`,
    label: "ADOT vs TGT%",
    question: "Deep threat or high-volume underneath target?",
    x: "adot",
    y: "target_share",
    size: "fantasy_ppg",
    corners: { topLeft: "Volume underneath", topRight: "Volume downfield" },
  },
  expectedVsActual(`${position}-expected`),
  {
    id: `${position}-yprr`,
    label: "TGT% vs YPRR",
    question: "Who earns targets, and who does the most with them?",
    x: "target_share",
    y: "yards_per_route_run",
    size: "fantasy_ppg",
    corners: { topRight: "Volume and efficiency", bottomRight: "Volume, less efficient", topLeft: "Efficient in a smaller role" },
  },
  {
    id: `${position}-tprr`,
    label: "TPRR vs YPRR",
    question: "Who wins his routes, and turns that into yards?",
    x: "targets_per_route_run",
    y: "yards_per_route_run",
    corners: { topRight: "Open often, productive", bottomLeft: "Rarely the read" },
  },
  {
    id: `${position}-red-zone`,
    label: "RZ TGT vs REC TD",
    question: "Are his touchdowns backed by red-zone targets?",
    x: "red_zone_targets",
    y: "receiving_tds",
    corners: { topLeft: "Touchdowns without the red-zone work", bottomRight: "Red-zone work, touchdowns still to come" },
  },
  {
    id: `${position}-part-time`,
    label: "Route % vs TPRR",
    question: "Who earns targets when he is out there, even in a part-time role?",
    x: "route_participation",
    y: "targets_per_route_run",
    corners: { topLeft: "Part-time, earning targets", topRight: "Full-time and earning targets" },
  },
];

export const SCATTER_PRESETS = {
  QB: [
    {
      id: "qb-cpoe",
      label: "CPOE vs EPA",
      question: "Who completes more than expected, and who adds value per play?",
      x: "cpoe",
      y: "epa_per_play",
      size: "attempts",
      corners: { topRight: "Accurate and efficient", bottomRight: "Accurate, less efficient", topLeft: "Efficient, less accurate", bottomLeft: "Neither" },
    },
    expectedVsActual("qb-expected"),
    {
      id: "qb-depth",
      label: "Depth vs CPOE",
      question: "Who throws deep without giving up accuracy?",
      x: "ngs_pass_intended_air_yards",
      y: "cpoe",
      size: "attempts",
      corners: { topRight: "Deep and accurate", bottomLeft: "Short and inaccurate" },
    },
  ],
  RB: [
    {
      id: "rb-role",
      label: "Rush share vs Route %",
      question: "Who gets the carries and stays on the field on passing downs?",
      x: "rush_attempt_share",
      y: "route_participation",
      size: "fantasy_ppg",
      corners: { topRight: "Three-down back", bottomRight: "Early-down back", topLeft: "Passing-down back" },
    },
    expectedVsActual("rb-expected"),
    {
      id: "rb-goal-line",
      label: "IN5 carries vs Rush TD",
      question: "Are his touchdowns coming from goal-line work?",
      x: "rush_att_inside_5",
      y: "rushing_tds",
      corners: { topLeft: "Scoring without goal-line carries", bottomRight: "Goal-line carries, touchdowns still to come" },
    },
    {
      id: "rb-contact",
      label: "YAC per carry vs RYOE",
      question: "Who creates yards on his own?",
      x: "rush_yac_per_att",
      y: "ngs_rush_yards_over_expected_per_att",
      corners: { topRight: "Creates his own yards", bottomLeft: "Needs the blocking" },
    },
    {
      id: "rb-receiving",
      label: "TGT% vs YPRR",
      question: "Which backs earn targets and do something with them?",
      x: "target_share",
      y: "yards_per_route_run",
      size: "fantasy_ppg",
      corners: { topRight: "Real receiving role" },
    },
  ],
  WR: receiver("wr"),
  TE: receiver("te"),
};

export const SCATTER_POSITIONS = ["QB", "RB", "WR", "TE"];

/** Every preset id, for the URL whitelist. */
export const SCATTER_PRESET_IDS = Object.values(SCATTER_PRESETS).flat().map((preset) => preset.id);

/** The preset for an id, or the position's first. */
export function scatterPreset(position, id) {
  const list = SCATTER_PRESETS[position] ?? SCATTER_PRESETS.WR;
  return list.find((preset) => preset.id === id) ?? list[0];
}
