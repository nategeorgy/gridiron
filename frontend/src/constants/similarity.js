// "Most similar this season" (Compare tab): who plays the most like him.
//
// ⚠️ **This is a placeholder formula, kept in one place on purpose.** Nate is working on
// his own algorithm (November 2026); when it lands, it replaces `closeness` and the
// lists below, and nothing else on the page has to change.
//
// Today: every stat counts the same. For each stat, take both players' percentiles
// among the qualified players at the position, square the gap, average the squares and
// take the root; closeness is 100 minus that. Squaring means one big difference costs
// more than several small ones. A player missing more than `MAX_MISSING` of the stats
// (a back with no routes charted, say) is left out rather than matched on what is left.

export const SIMILARITY_STATS = {
  WR: [
    { id: "fantasy_ppg", label: "PPG", weight: 1 },
    { id: "target_share", label: "TGT%", weight: 1 },
    { id: "air_yards_share", label: "AY%", weight: 1 },
    { id: "adot", label: "aDOT", weight: 1 },
    { id: "route_participation", label: "Route%", weight: 1 },
    { id: "targets_per_route_run", label: "TPRR", weight: 1 },
    { id: "yards_per_route_run", label: "YPRR", weight: 1 },
    { id: "catch_rate", label: "Catch%", weight: 1 },
    { id: "yards_after_catch", label: "YAC", weight: 1 },
    { id: "red_zone_targets", label: "RZ tgts", weight: 1 },
  ],
  RB: [
    { id: "fantasy_ppg", label: "PPG", weight: 1 },
    { id: "rush_attempt_share", label: "Rush%", weight: 1 },
    { id: "target_share", label: "TGT%", weight: 1 },
    { id: "route_participation", label: "Route%", weight: 1 },
    { id: "rush_att_inside_5", label: "Inside 5", weight: 1 },
    { id: "yards_per_carry", label: "YPC", weight: 1 },
    { id: "rush_yac_per_att", label: "YAC/att", weight: 1 },
    { id: "red_zone_targets", label: "RZ tgts", weight: 1 },
    { id: "snap_share", label: "Snap%", weight: 1 },
  ],
  QB: [
    { id: "fantasy_ppg", label: "PPG", weight: 1 },
    { id: "passer_rating", label: "Rating", weight: 1 },
    { id: "cpoe", label: "CPOE", weight: 1 },
    { id: "yards_per_attempt", label: "Y/A", weight: 1 },
    { id: "ngs_pass_intended_air_yards", label: "aDOT", weight: 1 },
    { id: "carries", label: "Carries", weight: 1 },
    { id: "rushing_yards", label: "Rush yds", weight: 1 },
    { id: "epa_per_play", label: "EPA/play", weight: 1 },
    { id: "ngs_pass_aggressiveness", label: "Aggressive%", weight: 1 },
  ],
};
SIMILARITY_STATS.TE = SIMILARITY_STATS.WR;

export const MAX_MISSING = 2;

/**
 * 0-100: how close two percentile profiles are. `mine` and `theirs` are
 * `{ metricId: percentile }`; returns null when they share too few stats.
 */
export function closeness(mine, theirs, stats) {
  let total = 0;
  let weight = 0;
  let missing = 0;
  for (const stat of stats) {
    const a = mine?.[stat.id];
    const b = theirs?.[stat.id];
    if (a == null || b == null) {
      missing += 1;
      continue;
    }
    total += stat.weight * (a - b) ** 2;
    weight += stat.weight;
  }
  if (missing > MAX_MISSING || !weight) return null;
  return Math.round(100 - Math.sqrt(total / weight));
}
