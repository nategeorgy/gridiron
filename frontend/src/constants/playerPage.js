// Player page layout config (M13) — one place that decides what a position's page
// shows, so every surface on the page is a different *view* of the same list rather
// than seven components each hardcoding their own idea of what a running back is.
//
// Every export here is keyed by position and read through `forPosition`, which falls
// back to WR. That fallback is a display choice, not a claim: an unknown position is
// far likelier to be a pass-catcher than a quarterback, and the page still renders.
//
// ⚠️ **Column ids must exist in the metric registry** (`GET /api/v1/metrics`) or they
// render as their raw id. A column entry is an id or `{ id, label }` (see `columnEntry`),
// and the game log derives the handful of per-game values no stored column holds — see
// `gameValue` below.

/** Pick a position's config, falling back to the receiver layout. */
export function forPosition(map, position) {
  return map[position] ?? map.WR;
}

// ---------------------------------------------------------------------------
// Season headline — ten stats, each with its positional rank
// ---------------------------------------------------------------------------
// Exactly ten per position, because the headline is laid out as one row of ten on a
// desktop screen and must never scroll sideways (the board rows beneath it do). The
// `label` here is the headline's own, shorter than the registry's where the registry's
// would not fit a tenth of the row — the tooltip still carries the full name.
//
// The QB aDOT is `ngs_pass_intended_air_yards`, NOT `adot`: `adot` is the receiving
// column and is null for quarterbacks. Intended air yards is the quarterback's aDOT as
// NGS measures it, so it exists from 2016.
export const HEADLINE_STATS = {
  QB: [
    { id: "fantasy_points", label: "Fantasy Points" },
    { id: "fantasy_ppg", label: "Fantasy PPG" },
    { id: "passing_yards", label: "Passing Yards" },
    { id: "passing_tds", label: "Passing TDs" },
    { id: "interceptions", label: "Interceptions" },
    { id: "yards_per_attempt", label: "Yards / Attempt" },
    { id: "ngs_pass_intended_air_yards", label: "aDOT" },
    { id: "completion_pct", label: "Completion %" },
    { id: "rushing_yards", label: "Rushing Yards" },
    { id: "rushing_tds", label: "Rushing TDs" },
  ],
  RB: [
    { id: "fantasy_points", label: "Fantasy Points" },
    { id: "fantasy_ppg", label: "Fantasy PPG" },
    { id: "carries", label: "Carries" },
    { id: "rushing_yards", label: "Rushing Yards" },
    { id: "yards_per_carry", label: "Yards / Carry" },
    { id: "rushing_tds", label: "Rushing TDs" },
    { id: "targets", label: "Targets" },
    { id: "receptions", label: "Receptions" },
    { id: "receiving_yards", label: "Receiving Yards" },
    { id: "receiving_tds", label: "Receiving TDs" },
  ],
  WR: [
    { id: "fantasy_points", label: "Fantasy Points" },
    { id: "fantasy_ppg", label: "Fantasy PPG" },
    { id: "targets", label: "Targets" },
    { id: "target_share", label: "Target Share" },
    { id: "receptions", label: "Receptions" },
    { id: "receiving_yards", label: "Receiving Yards" },
    { id: "receiving_tds", label: "Receiving TDs" },
    { id: "yards_per_route_run", label: "YPRR" },
    { id: "targets_per_route_run", label: "TPRR" },
    // In the league's scoring, like every fantasy number on the page — PPR by default.
    { id: "fantasy_points_per_route_run", label: "Pts / Route Run" },
  ],
};
HEADLINE_STATS.TE = HEADLINE_STATS.WR;

/** The ids the headline asks the API to rank. */
export function headlineColumns(position) {
  return forPosition(HEADLINE_STATS, position).map((stat) => stat.id);
}

// ---------------------------------------------------------------------------
// Career table — one row per season, grouped by phase
// ---------------------------------------------------------------------------
// The Fantasy group (season, team, games, points, PPG, finish) is rendered by the
// component itself because those columns are not all metrics; what follows is
// position-specific and comes from here.
export const CAREER_GROUPS = {
  QB: [
    { name: "Passing", columns: ["attempts", "completions", "passing_yards", "passing_tds", "interceptions"] },
    { name: "Rushing", columns: ["carries", "rushing_yards", "yards_per_carry", "rushing_tds"] },
  ],
  RB: [
    { name: "Rushing", columns: ["carries", "rushing_yards", "yards_per_carry", "rushing_tds"] },
    { name: "Receiving", columns: ["targets", "receptions", "receiving_yards", "receiving_tds"] },
  ],
  WR: [
    { name: "Receiving", columns: ["targets", "receptions", "receiving_yards", "receiving_tds"] },
    {
      name: "Efficiency",
      columns: [
        "yards_per_reception",
        "yards_per_target",
        "yards_per_route_run",
        "targets_per_route_run",
        "target_share",
      ],
    },
  ],
};
CAREER_GROUPS.TE = CAREER_GROUPS.WR;

// ---------------------------------------------------------------------------
// Game log — one row per game, its own column lists
// ---------------------------------------------------------------------------
// Deliberately NOT the career table's lists any more. A season row and a game row answer
// different questions — a career wants volume, a week wants the usage detail that
// explains one result — so the two were split when the game log grew an Advanced group.
//
// The lead group (week, opponent, points, snap share, weekly finish) is the same for every
// position and is rendered by the component. An entry is a metric id, or
// `{ id, label }` where the registry's short name reads wrong on a single game.
export const GAMELOG_GROUPS = {
  QB: [
    { name: "Passing", columns: ["attempts", "completions", "completion_pct", "passing_yards", "passing_tds", "interceptions"] },
    { name: "Rushing", columns: ["carries", "rushing_yards", "yards_per_carry", "rushing_tds"] },
    {
      name: "Advanced",
      columns: [
        "passer_rating",
        "yards_per_attempt",
        "yards_per_completion",
        // `adot` is the receiving column and is null for quarterbacks.
        { id: "ngs_pass_intended_air_yards", label: "ADOT" },
        "bad_throw_rate",
        "drops_by_receivers",
      ],
    },
  ],
  RB: [
    { name: "Rushing", columns: ["carries", "rushing_yards", "yards_per_carry", "rushing_tds"] },
    { name: "Receiving", columns: ["targets", "receptions", "receiving_yards", "receiving_tds"] },
    {
      name: "Advanced",
      columns: [
        "rush_attempt_share",
        "red_zone_rush_attempts",
        "rush_att_inside_5",
        "rush_yards_before_contact",
        "rush_yards_after_contact",
        "ngs_rush_yards_over_expected",
        "target_share",
        "routes_run",
        // The registry's short is "HVT/G"; on one game it is simply the count.
        { id: "high_value_touches_per_game", label: "HVT" },
        "opportunity_share",
      ],
    },
  ],
  WR: [
    { name: "Receiving", columns: ["targets", "receptions", "receiving_yards", "receiving_tds"] },
    {
      name: "Advanced",
      columns: [
        "target_share",
        "red_zone_targets",
        "routes_run",
        "route_participation",
        "yards_per_route_run",
        "targets_per_route_run",
        { id: "fantasy_points_per_route_run", label: "PTS/RR" },
        "adot",
        "yards_per_reception",
        "yards_per_target",
      ],
    },
  ],
};
GAMELOG_GROUPS.TE = GAMELOG_GROUPS.WR;

/** A column entry — a metric id, or `{ id, label }` — normalised to `{ id, label? }`. */
export function columnEntry(entry) {
  return typeof entry === "string" ? { id: entry } : entry;
}

// Per-game values no stored column holds. ⚠️ Y/REC, Y/TGT and YPRR are NOT here: they
// are stored per game and match their own division exactly, so the stored value is used.
// These are the registry's `derived` rates (stored only as their inputs) and two
// composites. A season's rate is `Σnumerator / Σdenominator` and keeps coming from the
// API; a single game's has to divide that game's own numbers, which is all this does.
const GAME_RATES = {
  yards_per_carry: ["rushing_yards", "carries"],
  completion_pct: ["completions", "attempts"],
  yards_per_attempt: ["passing_yards", "attempts"],
  yards_per_completion: ["passing_yards", "completions"],
  // Uses the line's `fantasy_points`, which the API fills in the request's scoring.
  fantasy_points_per_route_run: ["fantasy_points", "routes_run"],
};

// Composites that are a plain sum on one game (the season version divides by games).
// Terms coalesce to 0 like the composite engine's, but all-missing stays missing.
const GAME_SUMS = {
  high_value_touches_per_game: ["red_zone_targets", "rush_att_inside_5"],
};

/** One game's value for a column, deriving what no stored column holds. */
export function gameValue(game, column) {
  const sum = GAME_SUMS[column];
  if (sum) {
    const parts = sum.map((name) => game[name]);
    if (parts.every((part) => part === null || part === undefined)) return null;
    return parts.reduce((total, part) => total + (part ?? 0), 0);
  }
  const rate = GAME_RATES[column];
  if (!rate) return game[column];
  const [numerator, denominator] = rate.map((name) => game[name]);
  if (numerator === null || numerator === undefined || !denominator) return null;
  return numerator / denominator;
}

// ---------------------------------------------------------------------------
// Season stat grid — the leaderboard boards, as one player's row
// ---------------------------------------------------------------------------
// Built from the M12 boards' column sets (Fantasy / Production / Advanced). The
// leaderboards have since become five preset tabs per position group
// (`constants/leaderboards.js`), and this grid has not followed yet, so a stat can sit
// under a different heading here than on the board.
const FANTASY_SECTIONS = {
  general: {
    QB: ["fantasy_points", "fantasy_ppg", "passing_yards", "passing_tds", "interceptions", "rushing_yards", "rushing_tds"],
    RB: ["fantasy_points", "fantasy_ppg", "carries", "rushing_yards", "rushing_tds", "targets", "receptions", "receiving_yards"],
    WR: ["fantasy_points", "fantasy_ppg", "targets", "receptions", "receiving_yards", "yards_per_reception", "receiving_tds", "snap_share"],
  },
  advanced: [
    "expected_fantasy_points",
    "expected_fantasy_ppg",
    "fantasy_points_over_expected",
  ],
};
FANTASY_SECTIONS.general.TE = FANTASY_SECTIONS.general.WR;

const fantasyBoard = (position) => ({
  id: "fantasy",
  label: "Fantasy",
  // The page is served by /stats/intelligence rather than the leaderboard: it is the
  // endpoint that also returns percentiles, so the stat grid, the radar and the
  // percentile panel all come out of one request ranked against one pool.
  sections: [
    { name: "General", columns: FANTASY_SECTIONS.general[position] },
    { name: "Advanced", columns: FANTASY_SECTIONS.advanced },
  ],
});

export const SEASON_BOARDS = {
  QB: [
    fantasyBoard("QB"),
    {
      id: "production",
      label: "Production",
      sections: [
        { name: "General", columns: ["completions", "attempts", "dropbacks", "passing_yards", "passing_tds", "interceptions", "passing_first_downs", "sacks_suffered"] },
        { name: "Efficiency", columns: ["passer_rating", "cpoe", "epa", "epa_per_play", "yards_per_attempt", "completion_pct"] },
        { name: "Rushing", columns: ["carries", "rushing_yards", "yards_per_carry", "rushing_tds", "rushing_epa"] },
      ],
    },
    {
      id: "advanced",
      label: "Advanced",
      sections: [
        { name: "Expected", columns: ["passing_yards_exp", "passing_tds_exp", "interceptions_exp", "completions_exp"] },
        { name: "Pressure", columns: ["pressure_rate", "times_blitzed", "bad_throw_rate", "drops_by_receivers"] },
        { name: "Next Gen Stats", columns: ["ngs_pass_time_to_throw", "ngs_pass_aggressiveness", "ngs_pass_intended_air_yards", "ngs_pass_air_yards_to_sticks", "ngs_pass_expected_completion_pct", "ngs_pass_completion_pct_above_expectation"] },
      ],
    },
  ],
  RB: [
    fantasyBoard("RB"),
    {
      id: "production",
      label: "Production",
      sections: [
        { name: "Rushing", columns: ["carries", "rushing_yards", "yards_per_carry", "rushing_tds", "rushing_first_downs", "rushing_epa"] },
        { name: "Receiving", columns: ["targets", "receptions", "receiving_yards", "receiving_tds", "yards_per_reception"] },
        { name: "Expected", columns: ["rushing_yards_exp", "rushing_tds_exp", "receiving_yards_exp", "receptions_exp"] },
      ],
    },
    {
      id: "advanced",
      label: "Advanced",
      sections: [
        { name: "Opportunity", columns: ["rush_attempt_share", "opportunity_share", "market_share", "target_share", "snap_count", "snap_share", "high_value_touches_per_game", "touches_per_snap"] },
        { name: "Red Zone", columns: ["red_zone_rush_attempts", "red_zone_rush_share", "red_zone_targets", "rush_att_inside_10", "rush_att_inside_5", "rush_att_inside_2"] },
        { name: "Next Gen Stats", columns: ["ngs_rush_efficiency", "ngs_rush_time_to_los", "ngs_rush_pct_attempts_eight_defenders", "ngs_rush_yards_over_expected", "ngs_rush_yards_over_expected_per_att", "rush_yards_after_contact", "rush_broken_tackles"] },
      ],
    },
  ],
  WR: [
    fantasyBoard("WR"),
    {
      id: "production",
      label: "Production",
      sections: [
        { name: "General", columns: ["targets", "receptions", "receiving_yards", "receiving_tds", "receiving_first_downs", "yards_after_catch", "snap_share"] },
        { name: "Efficiency", columns: ["epa", "epa_per_play", "receiving_epa", "yards_per_reception", "yards_per_target", "yards_per_route_run", "targets_per_route_run", "catch_rate", "racr"] },
        { name: "Expected", columns: ["receiving_yards_exp", "receiving_tds_exp", "receptions_exp", "receiving_first_downs_exp"] },
      ],
    },
    {
      id: "advanced",
      label: "Advanced",
      sections: [
        { name: "Volume", columns: ["targets", "target_share", "routes_run", "routes_run_per_game", "route_participation", "red_zone_targets", "snap_count", "snap_share"] },
        { name: "Air Yards", columns: ["air_yards", "air_yards_share", "adot", "unrealized_air_yards", "wopr"] },
        { name: "Next Gen Stats", columns: ["ngs_rec_separation", "ngs_rec_cushion", "ngs_rec_yac", "ngs_rec_expected_yac", "ngs_rec_yac_above_expectation", "rec_broken_tackles", "receiving_drops"] },
      ],
    },
  ],
};
SEASON_BOARDS.TE = SEASON_BOARDS.WR;

// ---------------------------------------------------------------------------
// Season profile radar — slices grouped by what they measure
// ---------------------------------------------------------------------------
// Grouped so the shape reads as an argument rather than a list. A group's colour follows
// the GROUP, never its position in the list — Production is the same green on a back's
// chart (where it comes first) as on a receiver's (where it comes second), and a
// quarterback's chart simply has no Opportunity group. Colours are `--series-*` tokens,
// never `--accent`/`--pos`/`--neg`, which carry meanings a category must not borrow.
//
// Entries are a metric id or `{ id, label }`: a slice label has a twelfth of a circle to
// live in, so most take a shorter label than the registry's. The tooltip-length name is
// still the registry's.
const OPPORTUNITY = { name: "Opportunity", color: "var(--series-1)" };
const PRODUCTION = { name: "Production", color: "var(--series-3)" };
const ADVANCED = { name: "Advanced", color: "var(--series-5)" };

export const RADAR_GROUPS = {
  QB: [
    {
      ...PRODUCTION,
      columns: [
        { id: "fantasy_points", label: "Fantasy Pts" },
        { id: "fantasy_ppg", label: "Fantasy PPG" },
        { id: "yards_per_attempt", label: "Yards / Att" },
        { id: "completion_pct", label: "Comp %" },
        { id: "rushing_yards", label: "Rush Yds" },
        { id: "rushing_tds", label: "Rush TDs" },
      ],
    },
    {
      ...ADVANCED,
      columns: [
        { id: "epa", label: "EPA" },
        { id: "epa_per_play", label: "EPA / Play" },
        // `adot` is the receiving column and is null for quarterbacks.
        { id: "ngs_pass_intended_air_yards", label: "aDOT" },
        { id: "cpoe", label: "CPOE" },
      ],
    },
  ],
  RB: [
    {
      ...PRODUCTION,
      columns: [
        { id: "fantasy_points", label: "Fantasy Pts" },
        { id: "fantasy_ppg", label: "Fantasy PPG" },
        { id: "fantasy_points_per_carry", label: "Pts / Carry" },
      ],
    },
    {
      ...OPPORTUNITY,
      columns: [
        { id: "carries", label: "Carries" },
        { id: "rush_attempt_share", label: "Rush %" },
        { id: "rush_att_inside_5", label: "Carries In 5" },
        { id: "targets", label: "Targets" },
        { id: "opportunity_share", label: "Opp %" },
      ],
    },
    {
      ...ADVANCED,
      columns: [
        { id: "rush_yac_per_att", label: "YAC / Carry" },
        { id: "ngs_rush_yards_over_expected_per_att", label: "RYOE / Carry" },
        { id: "rushing_epa", label: "Rush EPA" },
      ],
    },
  ],
  WR: [
    {
      ...OPPORTUNITY,
      columns: [
        { id: "targets", label: "Targets" },
        { id: "target_share", label: "Target Share" },
        { id: "red_zone_targets", label: "RZ Targets" },
        { id: "route_participation", label: "Route %" },
      ],
    },
    {
      ...PRODUCTION,
      columns: [
        { id: "fantasy_points", label: "Fantasy Pts" },
        { id: "fantasy_ppg", label: "Fantasy PPG" },
        { id: "fantasy_points_per_route_run", label: "Pts / Route" },
        { id: "yards_per_route_run", label: "YPRR" },
      ],
    },
    {
      ...ADVANCED,
      columns: [
        { id: "ngs_rec_separation", label: "Separation" },
        { id: "adot", label: "aDOT" },
        { id: "targets_per_route_run", label: "TPRR" },
        { id: "receiving_epa", label: "Rec EPA" },
      ],
    },
  ],
};
RADAR_GROUPS.TE = RADAR_GROUPS.WR;

// ---------------------------------------------------------------------------
// Percentile panel — every headline metric, grouped
// ---------------------------------------------------------------------------
export const PERCENTILE_GROUPS = {
  QB: [
    { name: "Value", columns: ["fantasy_ppg", "expected_fantasy_ppg", "fantasy_points_over_expected"] },
    { name: "Volume", columns: ["attempts", "dropbacks", "completions", "carries"] },
    { name: "Production", columns: ["passing_yards", "passing_tds", "passing_first_downs", "rushing_yards", "rushing_tds"] },
    { name: "Efficiency", columns: ["passer_rating", "cpoe", "epa_per_play", "yards_per_attempt", "completion_pct", "interceptions", "sacks_suffered"] },
    { name: "Next Gen Stats", columns: ["ngs_pass_time_to_throw", "ngs_pass_aggressiveness", "ngs_pass_air_yards_to_sticks", "ngs_pass_completion_pct_above_expectation", "pressure_rate"] },
  ],
  RB: [
    { name: "Value", columns: ["fantasy_ppg", "expected_fantasy_ppg", "fantasy_points_over_expected"] },
    { name: "Opportunity", columns: ["carries", "rush_attempt_share", "opportunity_share", "target_share", "snap_share", "red_zone_rush_share", "rush_att_inside_5"] },
    { name: "Production", columns: ["rushing_yards", "rushing_tds", "rushing_first_downs", "receptions", "receiving_yards"] },
    { name: "Efficiency", columns: ["yards_per_carry", "rushing_epa", "epa_per_play", "market_share"] },
    { name: "Next Gen Stats", columns: ["ngs_rush_efficiency", "ngs_rush_yards_over_expected_per_att", "ngs_rush_pct_attempts_eight_defenders", "rush_yards_after_contact", "rush_broken_tackles"] },
  ],
  WR: [
    { name: "Value", columns: ["fantasy_ppg", "expected_fantasy_ppg", "fantasy_points_over_expected"] },
    { name: "Opportunity", columns: ["target_share", "targets", "air_yards_share", "red_zone_targets", "routes_run", "route_participation", "wopr", "snap_share"] },
    { name: "Production", columns: ["receiving_yards", "receptions", "receiving_tds", "receiving_first_downs", "yards_after_catch"] },
    { name: "Efficiency", columns: ["yards_per_route_run", "targets_per_route_run", "yards_per_target", "catch_rate", "racr", "adot", "receiving_drops"] },
    { name: "Next Gen Stats", columns: ["ngs_rec_separation", "ngs_rec_cushion", "ngs_rec_yac_above_expectation", "rec_broken_tackles"] },
  ],
};
PERCENTILE_GROUPS.TE = PERCENTILE_GROUPS.WR;

// ---------------------------------------------------------------------------
// Compare — the head-to-head table and the radar beside it
// ---------------------------------------------------------------------------
// `perGame: true` divides the season total by games played, so two players with
// different games missed are compared on rate rather than availability. Everything
// else is the season value as the API reports it.
export const H2H_ROWS = {
  QB: [
    { id: "fantasy_ppg", label: "Points / Game" },
    { id: "attempts", label: "Attempts / Game", perGame: true },
    { id: "passing_yards", label: "Pass Yards / Game", perGame: true },
    { id: "passing_tds", label: "Passing TDs" },
    { id: "interceptions", label: "Interceptions" },
    { id: "passer_rating", label: "Passer Rating" },
    { id: "cpoe", label: "CPOE" },
    { id: "epa_per_play", label: "EPA / Play" },
    { id: "rushing_yards", label: "Rush Yards / Game", perGame: true },
    { id: "sacks_suffered", label: "Sacks Taken" },
  ],
  RB: [
    { id: "fantasy_ppg", label: "Points / Game" },
    { id: "carries", label: "Carries / Game", perGame: true },
    { id: "rushing_yards", label: "Rush Yards / Game", perGame: true },
    { id: "rushing_tds", label: "Rushing TDs" },
    { id: "yards_per_carry", label: "Yards / Carry" },
    { id: "targets", label: "Targets / Game", perGame: true },
    { id: "receiving_yards", label: "Rec Yards / Game", perGame: true },
    { id: "opportunity_share", label: "Opportunity Share" },
    { id: "snap_share", label: "Snap Share" },
    { id: "rush_att_inside_5", label: "Carries Inside 5" },
  ],
  WR: [
    { id: "fantasy_ppg", label: "Points / Game" },
    { id: "targets", label: "Targets / Game", perGame: true },
    { id: "receptions", label: "Receptions / Game", perGame: true },
    { id: "receiving_yards", label: "Rec Yards / Game", perGame: true },
    { id: "receiving_tds", label: "Receiving TDs" },
    { id: "target_share", label: "Target Share" },
    { id: "adot", label: "aDOT" },
    { id: "yards_per_route_run", label: "Yards / Route Run" },
    { id: "ngs_rec_separation", label: "Separation" },
    { id: "ngs_rec_yac_above_expectation", label: "YAC Over Expected" },
    { id: "receiving_drops", label: "Drops" },
  ],
};
H2H_ROWS.TE = H2H_ROWS.WR;

// The radar beside the table. Eight axes, in the Command Center card's own order —
// volume, then share, then output — because this is that card, on a player page.
export const COMPARE_AXES = {
  QB: [
    { id: "fantasy_ppg", label: "PPG" },
    { id: "expected_fantasy_ppg", label: "Expected" },
    { id: "attempts", label: "Attempts" },
    { id: "passing_yards", label: "Pass Yd" },
    { id: "passing_tds", label: "Pass TD" },
    { id: "rushing_yards", label: "Rush Yd" },
    { id: "cpoe", label: "CPOE" },
    { id: "epa_per_play", label: "EPA/Play" },
  ],
  RB: [
    { id: "fantasy_ppg", label: "PPG" },
    { id: "expected_fantasy_ppg", label: "Expected" },
    { id: "carries", label: "Carries" },
    { id: "targets", label: "Targets" },
    { id: "rushing_yards", label: "Rush Yd" },
    { id: "opportunity_share", label: "Opp%" },
    { id: "snap_share", label: "Snap%" },
    { id: "rush_att_inside_5", label: "In5" },
  ],
  WR: [
    { id: "fantasy_ppg", label: "PPG" },
    { id: "expected_fantasy_ppg", label: "Expected" },
    { id: "targets", label: "Targets" },
    { id: "receiving_yards", label: "Rec Yd" },
    { id: "receiving_tds", label: "Rec TD" },
    { id: "target_share", label: "Tgt Share" },
    { id: "air_yards_share", label: "Air%" },
    { id: "snap_share", label: "Snap%" },
  ],
};
COMPARE_AXES.TE = COMPARE_AXES.WR;

/** Every metric the page asks the API to rank, for one position. */
export function percentileColumns(position) {
  // The headline shows ranks, but tints each by its percentile — same pool, so the
  // colour and the number can never disagree about how good a stat is.
  const wanted = new Set(headlineColumns(position));
  for (const board of forPosition(SEASON_BOARDS, position)) {
    for (const section of board.sections) section.columns.forEach((id) => wanted.add(id));
  }
  for (const group of forPosition(RADAR_GROUPS, position)) {
    group.columns.forEach((entry) => wanted.add(columnEntry(entry).id));
  }
  for (const group of forPosition(PERCENTILE_GROUPS, position)) {
    group.columns.forEach((id) => wanted.add(id));
  }
  for (const axis of forPosition(COMPARE_AXES, position)) wanted.add(axis.id);
  return [...wanted];
}
