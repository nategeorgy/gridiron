// Player Leaderboards: one page, five preset tabs, a Custom tab and seven position
// groups (September 2026, replacing M12's fourteen boards).
//
// The page asks a question first and a position second. The five presets are the
// questions (Fantasy, Usage, Efficiency, Expected, Tracking); the position group is a
// control on the page and stays put when the tab changes, so flipping from Usage to
// Efficiency keeps the same receivers on screen.
//
// Every stat has ONE home tab. The only exceptions are the opportunity counts
// (targets, carries, attempts), which are box score on Fantasy and volume on Usage.
// FPPG leads every preset, so a usage or tracking table always says what the player
// is worth in fantasy.
//
// A preset is chosen per position, not per tab: a receiver's Usage tab has routes and
// air yards, a back's has carries and goal-line work. The two multi-position groups
// have their own presets: WR/TE is the tight-end layout (the receiver one minus WR
// rushing), and RB/WR/TE is curated for flex, where a stat only some of the three have
// renders as a dash on the others. Percentiles stay within each player's own position
// whatever the group (backend/app/percentiles.py).
//
// ⚠️ Every column id must exist in the metric registry (`GET /api/v1/metrics`), or it
// renders as its raw id.

/** @typedef {{ name: string, columns: string[] }} Section */

export const LEADERBOARD_TABS = [
  {
    id: "fantasy",
    label: "Fantasy",
    menuDesc: "General fantasy + box score stats",
    description: "Fantasy points and the box score behind them.",
  },
  {
    id: "usage",
    label: "Usage",
    menuDesc: "Opportunity stats: shares, snaps, routes, red-zone work",
    description: "Snaps, routes, target and carry shares, and red-zone work.",
  },
  {
    id: "efficiency",
    label: "Efficiency",
    menuDesc: "EPA, per-play rates and metrics",
    description: "What players do with their chances: per-play rates, EPA and ball security.",
  },
  {
    id: "expected",
    label: "Expected",
    menuDesc: "Expected fantasy points and stats against expected",
    description: "Expected fantasy points and stats from each player's opportunity, against what they produced.",
  },
  {
    id: "tracking",
    label: "Tracking",
    menuDesc: "Advanced metrics via NGS + PFR",
    description: "Next Gen Stats and Pro Football Reference charting.",
  },
].map((tab) => ({ ...tab, path: `/leaderboards/${tab.id}` }));

export const CUSTOM_TAB = {
  id: "custom",
  label: "Custom",
  path: "/leaderboards/custom",
  description: "Your columns, in your order.",
};

export const TAB_IDS = [...LEADERBOARD_TABS.map((tab) => tab.id), CUSTOM_TAB.id];

/** The nav menu lists the five presets. Custom is a tab on the page only. */
export const LEADERBOARD_ITEMS = LEADERBOARD_TABS.map(({ id, label, path, menuDesc }) => ({
  id: `leaderboard-${id}`,
  label,
  path,
  menuDesc,
}));

// The `positions` query param holds a group's value. Singles and pairs use the
// comma-separated form the API already takes; All is an explicit "all" because the
// default group (RB/WR/TE) is the one kept out of the URL.
export const POSITION_GROUPS = [
  { value: "QB", label: "QB", positions: ["QB"] },
  { value: "RB", label: "RB", positions: ["RB"] },
  { value: "WR", label: "WR", positions: ["WR"] },
  { value: "TE", label: "TE", positions: ["TE"] },
  { value: "WR,TE", label: "WR/TE", positions: ["WR", "TE"], divider: true },
  { value: "RB,WR,TE", label: "RB/WR/TE", positions: ["RB", "WR", "TE"] },
  { value: "all", label: "All", positions: ["QB", "RB", "WR", "TE"], divider: true },
];
export const DEFAULT_GROUP = "RB,WR,TE";
export const GROUP_VALUES = POSITION_GROUPS.map((group) => group.value);
export const groupFor = (value) =>
  POSITION_GROUPS.find((group) => group.value === value) ??
  POSITION_GROUPS.find((group) => group.value === DEFAULT_GROUP);

// --- Presets -----------------------------------------------------------------------

const section = (name, columns) => ({ name, columns });
const EXPECTED_FANTASY = [
  "expected_fantasy_points",
  "expected_fantasy_ppg",
  "fantasy_points_over_expected",
  "tds_over_expected",
];

const QB = {
  fantasy: [
    section("Fantasy", ["fantasy_points", "fantasy_ppg"]),
    section("Passing", ["completions", "attempts", "passing_yards", "passing_tds", "interceptions"]),
    section("Rushing", ["carries", "rushing_yards", "rushing_tds"]),
  ],
  usage: [
    section("Snaps", ["snap_share", "snap_count"]),
    section("Passing", ["dropbacks", "attempts"]),
    section("Rushing", ["carries", "rush_attempt_share"]),
    section("Red zone", [
      "red_zone_rush_attempts", "red_zone_rush_share", "rush_att_inside_10", "rush_att_inside_5",
      "rush_att_inside_2",
    ]),
  ],
  efficiency: [
    section("Passing", [
      "completion_pct", "yards_per_attempt", "yards_per_completion", "passer_rating", "cpoe",
      "passing_first_downs",
    ]),
    section("EPA", ["epa", "epa_per_play"]),
    section("Sacks", ["sacks_suffered", "sack_fumbles_lost"]),
    section("Rushing", ["yards_per_carry", "rushing_epa", "rushing_first_downs"]),
    section("Ball security", ["fumbles", "fumbles_lost"]),
  ],
  expected: [
    section("Fantasy", EXPECTED_FANTASY),
    section("Passing", [
      "passing_yards_exp", "passing_tds_exp", "interceptions_exp", "completions_exp",
      "passing_first_downs_exp",
    ]),
    section("Rushing", ["rushing_yards_exp", "rushing_tds_exp", "rushing_first_downs_exp"]),
  ],
  tracking: [
    // NGS publishes its own CPOE; it is deliberately not here beside ours (see CLAUDE.md).
    section("Next Gen Stats", [
      "ngs_pass_time_to_throw", "ngs_pass_intended_air_yards", "ngs_pass_completed_air_yards",
      "ngs_pass_air_yards_differential", "ngs_pass_air_yards_to_sticks", "ngs_pass_aggressiveness",
      "ngs_pass_expected_completion_pct",
    ]),
    section("Pressure", ["pressure_rate", "times_blitzed", "bad_throw_rate", "drops_by_receivers"]),
  ],
};

const RB = {
  fantasy: [
    section("Fantasy", ["fantasy_points", "fantasy_ppg"]),
    section("Rushing", ["carries", "rushing_yards", "rushing_tds"]),
    section("Receiving", ["targets", "receptions", "receiving_yards", "receiving_tds"]),
  ],
  usage: [
    section("Snaps", ["snap_share", "snap_count", "touches_per_snap"]),
    section("Volume", [
      "carries", "targets", "opportunity_share", "rush_attempt_share", "target_share", "market_share",
    ]),
    section("Routes", ["routes_run", "route_participation", "targets_per_route_run"]),
    section("Red zone", [
      "red_zone_rush_attempts", "red_zone_rush_share", "rush_att_inside_10", "rush_att_inside_5",
      "rush_att_inside_2", "red_zone_targets", "high_value_touches_per_game",
    ]),
  ],
  efficiency: [
    section("Rushing", ["yards_per_carry", "fantasy_points_per_carry", "rushing_epa", "rushing_first_downs"]),
    section("Receiving", [
      "yards_per_reception", "yards_per_target", "yards_per_route_run", "catch_rate", "receiving_epa",
      "receiving_first_downs",
    ]),
    section("EPA", ["epa", "epa_per_play", "total_first_downs"]),
    section("Ball security", ["fumbles", "fumbles_lost"]),
  ],
  expected: [
    section("Fantasy", EXPECTED_FANTASY),
    section("Rushing", ["rushing_yards_exp", "rushing_tds_exp", "rushing_first_downs_exp"]),
    section("Receiving", [
      "receptions_exp", "receiving_yards_exp", "receiving_tds_exp", "receiving_first_downs_exp",
    ]),
  ],
  tracking: [
    section("Contact", [
      "rush_yards_before_contact", "rush_ybc_per_att", "rush_yards_after_contact", "rush_yac_per_att",
      "rush_broken_tackles",
    ]),
    section("Next Gen Stats", [
      "ngs_rush_yards_over_expected", "ngs_rush_yards_over_expected_per_att", "ngs_rush_expected_yards",
      "ngs_rush_pct_over_expected", "ngs_rush_efficiency", "ngs_rush_time_to_los",
      "ngs_rush_pct_attempts_eight_defenders",
    ]),
    section("Receiving", ["rec_broken_tackles", "receiving_drops"]),
  ],
};

const WR = {
  fantasy: [
    section("Fantasy", ["fantasy_points", "fantasy_ppg"]),
    section("Receiving", ["targets", "receptions", "receiving_yards", "receiving_tds"]),
    section("Rushing", ["carries", "rushing_yards", "rushing_tds"]),
  ],
  usage: [
    section("Snaps", ["snap_share", "snap_count", "touches_per_snap"]),
    section("Routes", ["routes_run", "routes_run_per_game", "route_participation", "targets_per_route_run"]),
    section("Volume", [
      "targets", "target_share", "air_yards_share", "wopr", "opportunity_share", "market_share",
    ]),
    section("Air yards", ["air_yards", "adot", "unrealized_air_yards"]),
    section("Red zone", ["red_zone_targets", "high_value_touches_per_game"]),
  ],
  efficiency: [
    section("Receiving", [
      "yards_per_reception", "yards_per_target", "yards_per_route_run", "fantasy_points_per_route_run",
      "catch_rate", "racr", "yards_after_catch", "receiving_first_downs",
    ]),
    section("EPA", ["receiving_epa", "epa", "epa_per_play", "total_first_downs"]),
    section("Ball security", ["fumbles", "fumbles_lost"]),
  ],
  expected: [
    section("Fantasy", EXPECTED_FANTASY),
    section("Receiving", [
      "receptions_exp", "receiving_yards_exp", "receiving_tds_exp", "receiving_first_downs_exp",
    ]),
  ],
  tracking: [
    // NGS's own catch rate and intended air yards are deliberately absent: they are a
    // second model's version of CATCH% and ADOT, which the boards already show.
    section("Next Gen Stats", [
      "ngs_rec_separation", "ngs_rec_cushion", "ngs_rec_yac", "ngs_rec_expected_yac",
      "ngs_rec_yac_above_expectation",
    ]),
    section("Charting", [
      "rec_broken_tackles", "receiving_drops", "receiving_drop_rate", "passer_rating_when_targeted",
    ]),
  ],
};

// Tight ends read the receiver layout, minus the rushing columns that do not apply.
const TE = { ...WR, fantasy: WR.fantasy.filter((entry) => entry.name !== "Rushing") };

const FLEX = {
  fantasy: [
    section("Fantasy", ["fantasy_points", "fantasy_ppg"]),
    section("Rushing", ["carries", "rushing_yards", "rushing_tds"]),
    section("Receiving", ["targets", "receptions", "receiving_yards", "receiving_tds"]),
  ],
  usage: [
    section("Snaps", ["snap_share", "snap_count", "touches_per_snap"]),
    section("Volume", [
      "carries", "targets", "opportunity_share", "market_share", "rush_attempt_share", "target_share",
    ]),
    section("Routes", ["routes_run", "route_participation", "targets_per_route_run"]),
    section("Red zone", ["red_zone_targets", "red_zone_rush_attempts", "high_value_touches_per_game"]),
  ],
  efficiency: [
    section("Receiving", [
      "yards_per_reception", "yards_per_target", "yards_per_route_run", "fantasy_points_per_route_run",
      "catch_rate", "receiving_first_downs",
    ]),
    section("Rushing", ["yards_per_carry", "rushing_first_downs"]),
    section("EPA", ["receiving_epa", "rushing_epa", "epa", "epa_per_play", "total_first_downs"]),
    section("Ball security", ["fumbles", "fumbles_lost"]),
  ],
  expected: [
    section("Fantasy", EXPECTED_FANTASY),
    section("Rushing", ["rushing_yards_exp", "rushing_tds_exp"]),
    section("Receiving", ["receptions_exp", "receiving_yards_exp", "receiving_tds_exp"]),
  ],
  tracking: [
    section("Receiving (PFR)", [
      "rec_broken_tackles", "receiving_drops", "receiving_drop_rate", "passer_rating_when_targeted",
    ]),
    section("Rushing (PFR)", ["rush_yards_after_contact", "rush_yac_per_att", "rush_broken_tackles"]),
    section("Next Gen", [
      "ngs_rec_separation", "ngs_rec_yac_above_expectation", "ngs_rush_yards_over_expected_per_att",
    ]),
  ],
};

// All has no Tracking preset: no tracking stat applies to quarterbacks and receivers
// alike, so the tab is disabled for it rather than offering a table of dashes.
const ALL = {
  fantasy: [
    section("Fantasy", ["fantasy_points", "fantasy_ppg"]),
    section("Passing", ["passing_yards", "passing_tds", "interceptions"]),
    section("Rushing", ["carries", "rushing_yards", "rushing_tds"]),
    section("Receiving", ["targets", "receptions", "receiving_yards", "receiving_tds"]),
  ],
  usage: [
    section("Snaps", ["snap_share", "snap_count"]),
    section("Volume", ["dropbacks", "carries", "targets"]),
    section("Red zone", ["red_zone_rush_attempts", "red_zone_targets"]),
  ],
  efficiency: [
    section("EPA", ["epa", "epa_per_play", "total_first_downs"]),
    section("Ball security", ["fumbles", "fumbles_lost"]),
  ],
  expected: [section("Fantasy", EXPECTED_FANTASY)],
};

const PRESETS = {
  QB, RB, WR, TE, "WR,TE": TE, "RB,WR,TE": FLEX, all: ALL,
};

const DEFAULT_SORT = {
  QB: { usage: "dropbacks", efficiency: "epa_per_play", tracking: "ngs_pass_intended_air_yards" },
  RB: { usage: "opportunity_share", efficiency: "rushing_epa", tracking: "ngs_rush_yards_over_expected" },
  WR: { usage: "target_share", efficiency: "yards_per_route_run", tracking: "ngs_rec_separation" },
  TE: { usage: "target_share", efficiency: "yards_per_route_run", tracking: "ngs_rec_separation" },
  "WR,TE": { usage: "target_share", efficiency: "yards_per_route_run", tracking: "ngs_rec_separation" },
  "RB,WR,TE": { usage: "opportunity_share", efficiency: "epa_per_play", tracking: "rec_broken_tackles" },
  all: { usage: "snap_share", efficiency: "epa" },
};
const DEFAULT_SORT_ANY = { fantasy: "fantasy_points", expected: "expected_fantasy_points" };

/** Does this group have a preset for this tab? (All has no Tracking.) */
export const hasPreset = (group, tab) => Boolean(PRESETS[group]?.[tab]);

/** A preset's sections, with FPPG leading under an unnamed header. */
export function presetSections(group, tab) {
  const sections = PRESETS[group]?.[tab];
  if (!sections) return null;
  if (sections.some((entry) => entry.columns.includes("fantasy_ppg"))) return sections;
  return [{ name: "", columns: ["fantasy_ppg"] }, ...sections];
}

export const presetColumns = (group, tab) =>
  (presetSections(group, tab) ?? []).flatMap((entry) => entry.columns);

export const defaultSort = (group, tab) =>
  DEFAULT_SORT[group]?.[tab] ?? DEFAULT_SORT_ANY[tab] ?? "fantasy_points";

// --- The column pool: every stat a group's positions have, per tab -------------------
// What the Edit Columns panel offers, and the whitelist a custom `cols=` is read
// against. Built from the single-position presets so a group can never offer a stat
// none of its positions has a home for; same-named sections merge.

const POOLS = Object.fromEntries(
  POSITION_GROUPS.map((group) => {
    const byTab = {};
    for (const tab of LEADERBOARD_TABS) {
      const merged = [];
      for (const position of group.positions) {
        for (const entry of PRESETS[position][tab.id] ?? []) {
          let target = merged.find((candidate) => candidate.name === entry.name);
          if (!target) merged.push((target = { name: entry.name, columns: [] }));
          for (const column of entry.columns) {
            if (!target.columns.includes(column)) target.columns.push(column);
          }
        }
      }
      if (merged.length) byTab[tab.id] = merged;
    }
    return [group.value, byTab];
  }),
);

/** `{ [tab]: Section[] }` for the group. */
export const groupPool = (group) => POOLS[group] ?? POOLS[DEFAULT_GROUP];

/** Every stat the group has, deduplicated, in tab order. */
export function poolColumns(group) {
  const pool = groupPool(group);
  return [...new Set(LEADERBOARD_TABS.flatMap((tab) => (pool[tab.id] ?? []).flatMap((entry) => entry.columns)))];
}

/** The tab a stat lives on for this group, preferring `prefer` when it is on both. */
export function tabOfColumn(group, column, prefer) {
  const pool = groupPool(group);
  const has = (tab) => (pool[tab] ?? []).some((entry) => entry.columns.includes(column));
  if (prefer && has(prefer)) return prefer;
  return LEADERBOARD_TABS.find((tab) => has(tab.id))?.id ?? null;
}

/**
 * A custom board's sections. The user's order is kept, and neighbouring columns from
 * the same tab share a header, so dragging a stat between two sections splits them
 * rather than the headers forcing an order.
 */
export function customSections(group, columns, prefer) {
  const out = [];
  for (const column of columns) {
    const tab = tabOfColumn(group, column, prefer);
    const label = LEADERBOARD_TABS.find((entry) => entry.id === tab)?.label ?? "";
    const last = out[out.length - 1];
    if (last && last.tab === tab) last.columns.push(column);
    else out.push({ tab, name: label, columns: [column] });
  }
  return out;
}

/** `cols=` from the URL: known ids in the user's order, deduplicated. */
export function parseColumns(value) {
  return [...new Set((value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean))];
}

// --- Old board paths ---------------------------------------------------------------
// The fourteen M12 boards, and the paths they had already absorbed, each redirected to
// the tab and group that now answer the same question. A saved view (M5) and a shared
// link both store a route, and with no route matching the app renders nothing at all.
export const LEGACY_BOARD_REDIRECTS = {
  "fantasy/all": { tab: "fantasy", group: "all" },
  "fantasy/passing": { tab: "fantasy", group: "QB" },
  "fantasy/rushing": { tab: "fantasy", group: "RB" },
  "fantasy/receiving": { tab: "fantasy", group: "WR,TE" },
  "nfl/all": { tab: "efficiency", group: "all" },
  "nfl/passing": { tab: "efficiency", group: "QB" },
  "nfl/rushing": { tab: "efficiency", group: "RB" },
  "nfl/receiving": { tab: "efficiency", group: "WR,TE" },
  "nfl/all-advanced": { tab: "tracking", group: DEFAULT_GROUP },
  "nfl/passing-advanced": { tab: "tracking", group: "QB" },
  "nfl/rushing-advanced": { tab: "tracking", group: "RB" },
  "nfl/receiving-advanced": { tab: "usage", group: "WR,TE" },
  "opportunity/all": { tab: "usage", group: "all" },
  "opportunity/rushing": { tab: "usage", group: "RB" },
  // Retired before M12's boards were, and pointed at them until now.
  "fantasy/leaders": { tab: "fantasy", group: "all" },
  "fantasy/expected": { tab: "expected", group: "all" },
  "nfl/all-general": { tab: "efficiency", group: "all" },
  "nfl/passing-general": { tab: "efficiency", group: "QB" },
  "nfl/receiving-general": { tab: "efficiency", group: "WR,TE" },
  "nfl/rushing-general": { tab: "efficiency", group: "RB" },
  leaderboard: { tab: "fantasy", group: "all" },
};
