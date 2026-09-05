// Player Leaderboards — the config behind all twelve boards and the three nav groups.
//
// GENERATED SHAPE, hand-maintained content: each board is one route rendered by
// pages/LeaderboardView (or pages/InsightView when it carries a query-time Insight
// column). A board's columns are grouped into **sections** that render as a spanning
// header row above the column headers — the sub-groups from the stat taxonomy, so a
// 35-column receiving board reads as five short tables rather than one wide one.
//
// Section order is fixed across every board (SECTION_ORDER below) so a reader learns
// one layout: what happened, what the model expected, how efficiently, what the
// tracking cameras add, the odds and ends, and the usage underneath. Within a section
// the columns follow the metric registry's own order.
//
// `percentileColumns` is what the board asks the API to rank. Percentiles are always
// within that player's own position for that season — see backend/app/percentiles.py.

/**
 * @typedef {Object} Section
 * @property {string} name      section heading, spanning its columns
 * @property {string[]} columns metric ids in display order
 */

/**
 * @typedef {Object} Board
 * @property {string} id
 * @property {string} label           short label (nav item + tab)
 * @property {string} path            route path
 * @property {string} menuDesc        one-liner in the nav dropdown
 * @property {string} title           page H1
 * @property {string} description     page subtitle
 * @property {Section[]} sections     column groups, in display order
 * @property {string[]} columns       every column flattened, in display order
 * @property {string} defaultSort     metric id to sort by initially
 * @property {string} defaultPosition '' | 'QB' | 'RB' | 'WR' | 'TE'
 * @property {string} phase           'passing' | 'rushing' | 'receiving' | 'all' —
 *                                    which column of the Leaderboards menu it sits in
 * @property {string} [fixedPosition]  the board is about exactly this position: the
 *                                     Position filter is hidden and every request
 *                                     sends it. Not the same as defaultPosition,
 *                                     which is a starting point the user may change
 * @property {boolean} scoring        true = league-scoring editor + scoring-aware columns
 * @property {boolean} [insight]      true = served by /stats/intelligence rather than
 *                                    /stats/leaderboard, because it carries a column
 *                                    that only exists at query time (VORP, the buy/sell
 *                                    indices, usage trend)
 * @property {string[]} [signed]      columns tinted positive/negative. Empty on every
 *                                    player board: only percentiles carry colour here,
 *                                    and a tinted value competes with the percentile
 *                                    beneath it for the same meaning — then loses, since
 *                                    the percentile is the one calibrated to the
 *                                    position. The Insight boards still use it, because
 *                                    there the sign IS the finding
 */

/** @type {Board[]} */
export const FANTASY_BOARDS = [
  {
    "id": "fantasy-all",
    "label": "Fantasy",
    "path": "/fantasy/all",
    "menuDesc": "Points, value and the buy/sell signals",
    "title": "Fantasy Leaders",
    "description": "Every fantasy-relevant number in one place, scored in your league settings, with each phase in its own block.",
    "sections": [
      {
        "name": "General",
        "columns": [
          "fantasy_points",
          "fantasy_ppg",
          "expected_fantasy_points",
          "expected_fantasy_ppg",
          "fantasy_points_over_expected"
        ]
      },
      {
        "name": "Receiving",
        "columns": [
          "targets",
          "receptions",
          "receiving_yards",
          "receiving_tds"
        ]
      },
      {
        "name": "Rushing",
        "columns": [
          "carries",
          "rushing_yards",
          "yards_per_carry",
          "rushing_tds"
        ]
      },
      {
        "name": "Passing",
        "columns": [
          "passing_yards",
          "passing_tds",
          "interceptions"
        ]
      }
    ],
    "columns": [
      "fantasy_points",
      "fantasy_ppg",
      "expected_fantasy_points",
      "expected_fantasy_ppg",
      "fantasy_points_over_expected",
      "targets",
      "receptions",
      "receiving_yards",
      "receiving_tds",
      "carries",
      "rushing_yards",
      "yards_per_carry",
      "rushing_tds",
      "passing_yards",
      "passing_tds",
      "interceptions"
    ],
    "defaultSort": "fantasy_points",
    "defaultPosition": "",
    "scoring": true,
    "signed": [],
    "percentileColumns": [
      "fantasy_points",
      "fantasy_ppg",
      "expected_fantasy_points",
      "expected_fantasy_ppg",
      "fantasy_points_over_expected",
      "targets",
      "receptions",
      "receiving_yards",
      "receiving_tds",
      "carries",
      "rushing_yards",
      "yards_per_carry",
      "rushing_tds",
      "passing_yards",
      "passing_tds",
      "interceptions"
    ],
    "phase": "all"
  },
  {
    "id": "fantasy-passing",
    "label": "Fantasy",
    "path": "/fantasy/passing",
    "menuDesc": "Points, value and expected",
    "title": "Fantasy — Passing",
    "description": "Quarterback fantasy production and the opportunity behind it.",
    "sections": [
      {
        "name": "General",
        "columns": [
          "fantasy_points",
          "fantasy_ppg",
          "passing_yards",
          "passing_tds",
          "interceptions",
          "completions",
          "attempts",
          "dropbacks",
          "snap_share"
        ]
      },
      {
        "name": "Advanced",
        "columns": [
          "expected_fantasy_points",
          "expected_fantasy_ppg",
          "fantasy_points_over_expected",
          "vorp",
          "vorp_ppg",
          "expected_vorp",
          "expected_vorp_ppg"
        ]
      }
    ],
    "columns": [
      "fantasy_points",
      "fantasy_ppg",
      "passing_yards",
      "passing_tds",
      "interceptions",
      "completions",
      "attempts",
      "dropbacks",
      "snap_share",
      "expected_fantasy_points",
      "expected_fantasy_ppg",
      "fantasy_points_over_expected",
      "vorp",
      "vorp_ppg",
      "expected_vorp",
      "expected_vorp_ppg"
    ],
    "defaultSort": "fantasy_points",
    "scoring": true,
    "signed": [],
    "percentileColumns": [
      "fantasy_points",
      "fantasy_ppg",
      "passing_yards",
      "passing_tds",
      "interceptions",
      "completions",
      "attempts",
      "dropbacks",
      "snap_share",
      "expected_fantasy_points",
      "expected_fantasy_ppg",
      "fantasy_points_over_expected",
      "vorp",
      "vorp_ppg",
      "expected_vorp",
      "expected_vorp_ppg"
    ],
    "insight": true,
    "fixedPosition": "QB",
    "defaultPosition": "QB",
    "phase": "passing"
  },
  {
    "id": "fantasy-rushing",
    "label": "Fantasy",
    "path": "/fantasy/rushing",
    "menuDesc": "Points, value and expected",
    "title": "Fantasy — Rushing",
    "description": "Rushing fantasy production and the value behind it, in your league scoring.",
    "sections": [
      {
        "name": "General",
        "columns": [
          "fantasy_points",
          "fantasy_ppg",
          "carries",
          "rushing_yards",
          "yards_per_carry",
          "rushing_tds",
          "snap_share"
        ]
      },
      {
        "name": "Advanced",
        "columns": [
          "expected_fantasy_points",
          "expected_fantasy_ppg",
          "fantasy_points_over_expected",
          "vorp",
          "vorp_ppg",
          "expected_vorp",
          "expected_vorp_ppg"
        ]
      }
    ],
    "columns": [
      "fantasy_points",
      "fantasy_ppg",
      "carries",
      "rushing_yards",
      "yards_per_carry",
      "rushing_tds",
      "snap_share",
      "expected_fantasy_points",
      "expected_fantasy_ppg",
      "fantasy_points_over_expected",
      "vorp",
      "vorp_ppg",
      "expected_vorp",
      "expected_vorp_ppg"
    ],
    "defaultSort": "fantasy_points",
    "defaultPosition": "RB",
    "scoring": true,
    "signed": [],
    "percentileColumns": [
      "fantasy_points",
      "fantasy_ppg",
      "carries",
      "rushing_yards",
      "yards_per_carry",
      "rushing_tds",
      "snap_share",
      "expected_fantasy_points",
      "expected_fantasy_ppg",
      "fantasy_points_over_expected",
      "vorp",
      "vorp_ppg",
      "expected_vorp",
      "expected_vorp_ppg"
    ],
    "phase": "rushing",
    "insight": true
  },
  {
    "id": "fantasy-receiving",
    "label": "Fantasy",
    "path": "/fantasy/receiving",
    "menuDesc": "Points, value and expected",
    "title": "Fantasy — Receiving",
    "description": "Receiving fantasy production and the value behind it, in your league scoring.",
    "sections": [
      {
        "name": "General",
        "columns": [
          "fantasy_points",
          "fantasy_ppg",
          "targets",
          "receptions",
          "receiving_yards",
          "yards_per_reception",
          "receiving_tds",
          "snap_share"
        ]
      },
      {
        "name": "Advanced",
        "columns": [
          "expected_fantasy_points",
          "expected_fantasy_ppg",
          "fantasy_points_over_expected",
          "vorp",
          "vorp_ppg",
          "expected_vorp",
          "expected_vorp_ppg"
        ]
      }
    ],
    "columns": [
      "fantasy_points",
      "fantasy_ppg",
      "targets",
      "receptions",
      "receiving_yards",
      "yards_per_reception",
      "receiving_tds",
      "snap_share",
      "expected_fantasy_points",
      "expected_fantasy_ppg",
      "fantasy_points_over_expected",
      "vorp",
      "vorp_ppg",
      "expected_vorp",
      "expected_vorp_ppg"
    ],
    "defaultSort": "fantasy_points",
    "defaultPosition": "WR",
    "scoring": true,
    "signed": [],
    "percentileColumns": [
      "fantasy_points",
      "fantasy_ppg",
      "targets",
      "receptions",
      "receiving_yards",
      "yards_per_reception",
      "receiving_tds",
      "snap_share",
      "expected_fantasy_points",
      "expected_fantasy_ppg",
      "fantasy_points_over_expected",
      "vorp",
      "vorp_ppg",
      "expected_vorp",
      "expected_vorp_ppg"
    ],
    "phase": "receiving",
    "insight": true
  }
];

/** @type {Board[]} */
export const NFL_BOARDS = [
  {
    "id": "nfl-all",
    "label": "Production",
    "path": "/nfl/all",
    "menuDesc": "Raw production, every phase",
    "title": "NFL Production",
    "description": "Raw on-field production across every phase, with no fantasy scoring applied.",
    "sections": [
      {
        "name": "General",
        "columns": [
          "snap_share",
          "market_share",
          "tds_over_expected",
          "total_first_downs"
        ]
      },
      {
        "name": "Receiving",
        "columns": [
          "targets",
          "receptions",
          "receiving_yards",
          "receiving_tds",
          "yards_per_reception",
          "yards_per_target",
          "yards_per_route_run",
          "targets_per_route_run",
          "receiving_first_downs",
          "yards_after_catch",
          "catch_rate",
          "receiving_epa"
        ]
      },
      {
        "name": "Rushing",
        "columns": [
          "carries",
          "rushing_yards",
          "yards_per_carry",
          "rushing_tds",
          "rushing_first_downs",
          "rushing_epa"
        ]
      },
      {
        "name": "Passing",
        "columns": [
          "passing_yards",
          "passing_tds",
          "interceptions",
          "completions",
          "attempts",
          "completion_pct",
          "dropbacks",
          "yards_per_attempt",
          "yards_per_completion",
          "passing_first_downs",
          "passer_rating",
          "epa",
          "epa_per_play"
        ]
      }
    ],
    "columns": [
      "snap_share",
      "market_share",
      "tds_over_expected",
      "total_first_downs",
      "targets",
      "receptions",
      "receiving_yards",
      "receiving_tds",
      "yards_per_reception",
      "yards_per_target",
      "yards_per_route_run",
      "targets_per_route_run",
      "receiving_first_downs",
      "yards_after_catch",
      "catch_rate",
      "receiving_epa",
      "carries",
      "rushing_yards",
      "yards_per_carry",
      "rushing_tds",
      "rushing_first_downs",
      "rushing_epa",
      "passing_yards",
      "passing_tds",
      "interceptions",
      "completions",
      "attempts",
      "completion_pct",
      "dropbacks",
      "yards_per_attempt",
      "yards_per_completion",
      "passing_first_downs",
      "passer_rating",
      "epa",
      "epa_per_play"
    ],
    "defaultSort": "total_first_downs",
    "defaultPosition": "",
    "scoring": false,
    "insight": true,
    "signed": [],
    "percentileColumns": [
      "snap_share",
      "market_share",
      "tds_over_expected",
      "total_first_downs",
      "targets",
      "receptions",
      "receiving_yards",
      "receiving_tds",
      "yards_per_reception",
      "yards_per_target",
      "yards_per_route_run",
      "targets_per_route_run",
      "receiving_first_downs",
      "yards_after_catch",
      "catch_rate",
      "receiving_epa",
      "carries",
      "rushing_yards",
      "yards_per_carry",
      "rushing_tds",
      "rushing_first_downs",
      "rushing_epa",
      "passing_yards",
      "passing_tds",
      "interceptions",
      "completions",
      "attempts",
      "completion_pct",
      "dropbacks",
      "yards_per_attempt",
      "yards_per_completion",
      "passing_first_downs",
      "passer_rating",
      "epa",
      "epa_per_play"
    ],
    "phase": "all"
  },
  {
    "id": "nfl-all-advanced",
    "label": "Advanced",
    "path": "/nfl/all-advanced",
    "menuDesc": "Tracking and charting, every phase",
    "title": "All Advanced",
    "description": "Tracking and charting data across every phase. Next Gen Stats start in 2016 and Pro Football Reference charting in 2018, so this board is a modern-era one by construction.",
    "sections": [
      {
        "name": "Receiving",
        "columns": [
          "receiving_epa",
          "yards_per_route_run",
          "targets_per_route_run",
          "ngs_rec_separation",
          "ngs_rec_cushion",
          "ngs_rec_yac",
          "ngs_rec_expected_yac",
          "ngs_rec_yac_above_expectation",
          "rec_broken_tackles",
          "air_yards",
          "air_yards_share",
          "adot",
          "unrealized_air_yards"
        ]
      },
      {
        "name": "Rushing",
        "columns": [
          "rushing_epa",
          "rush_yards_before_contact",
          "rush_ybc_per_att",
          "rush_yards_after_contact",
          "rush_yac_per_att",
          "rush_broken_tackles",
          "ngs_rush_pct_attempts_eight_defenders",
          "ngs_rush_yards_over_expected",
          "ngs_rush_yards_over_expected_per_att",
          "ngs_rush_expected_yards",
          "ngs_rush_pct_over_expected",
          "ngs_rush_efficiency",
          "ngs_rush_time_to_los"
        ]
      },
      {
        "name": "Passing",
        "columns": [
          "epa",
          "epa_per_play",
          "cpoe",
          "ngs_pass_intended_air_yards",
          "bad_throw_rate",
          "drops_by_receivers",
          "ngs_pass_completed_air_yards",
          "ngs_pass_air_yards_differential",
          "ngs_pass_air_yards_to_sticks",
          "ngs_pass_aggressiveness"
        ]
      }
    ],
    "columns": [
      "receiving_epa",
      "yards_per_route_run",
      "targets_per_route_run",
      "ngs_rec_separation",
      "ngs_rec_cushion",
      "ngs_rec_yac",
      "ngs_rec_expected_yac",
      "ngs_rec_yac_above_expectation",
      "rec_broken_tackles",
      "air_yards",
      "air_yards_share",
      "adot",
      "unrealized_air_yards",
      "rushing_epa",
      "rush_yards_before_contact",
      "rush_ybc_per_att",
      "rush_yards_after_contact",
      "rush_yac_per_att",
      "rush_broken_tackles",
      "ngs_rush_pct_attempts_eight_defenders",
      "ngs_rush_yards_over_expected",
      "ngs_rush_yards_over_expected_per_att",
      "ngs_rush_expected_yards",
      "ngs_rush_pct_over_expected",
      "ngs_rush_efficiency",
      "ngs_rush_time_to_los",
      "epa",
      "epa_per_play",
      "cpoe",
      "ngs_pass_intended_air_yards",
      "bad_throw_rate",
      "drops_by_receivers",
      "ngs_pass_completed_air_yards",
      "ngs_pass_air_yards_differential",
      "ngs_pass_air_yards_to_sticks",
      "ngs_pass_aggressiveness"
    ],
    "defaultSort": "epa",
    "defaultPosition": "",
    "scoring": false,
    "signed": [],
    "percentileColumns": [
      "receiving_epa",
      "yards_per_route_run",
      "targets_per_route_run",
      "ngs_rec_separation",
      "ngs_rec_cushion",
      "ngs_rec_yac",
      "ngs_rec_expected_yac",
      "ngs_rec_yac_above_expectation",
      "rec_broken_tackles",
      "air_yards",
      "air_yards_share",
      "adot",
      "unrealized_air_yards",
      "rushing_epa",
      "rush_yards_before_contact",
      "rush_ybc_per_att",
      "rush_yards_after_contact",
      "rush_yac_per_att",
      "rush_broken_tackles",
      "ngs_rush_pct_attempts_eight_defenders",
      "ngs_rush_yards_over_expected",
      "ngs_rush_yards_over_expected_per_att",
      "ngs_rush_expected_yards",
      "ngs_rush_pct_over_expected",
      "ngs_rush_efficiency",
      "ngs_rush_time_to_los",
      "epa",
      "epa_per_play",
      "cpoe",
      "ngs_pass_intended_air_yards",
      "bad_throw_rate",
      "drops_by_receivers",
      "ngs_pass_completed_air_yards",
      "ngs_pass_air_yards_differential",
      "ngs_pass_air_yards_to_sticks",
      "ngs_pass_aggressiveness"
    ],
    "phase": "all"
  },
  {
    "id": "nfl-passing",
    "label": "Production",
    "path": "/nfl/passing",
    "menuDesc": "Box score, rate stats and expected",
    "title": "Passing Production",
    "description": "Everything a quarterback produced — volume, efficiency, and what the model expected from the same opportunity. Answers back to 1999.",
    "sections": [
      {
        "name": "General",
        "columns": [
          "passing_yards",
          "passing_tds",
          "interceptions",
          "completions",
          "attempts",
          "completion_pct",
          "dropbacks",
          "passing_first_downs"
        ]
      },
      {
        "name": "Efficiency",
        "columns": [
          "epa",
          "epa_per_play",
          "cpoe",
          "yards_per_attempt",
          "yards_per_completion",
          "passer_rating"
        ]
      },
      {
        "name": "Expected",
        "columns": [
          "passing_yards_exp",
          "passing_tds_exp",
          "interceptions_exp",
          "completions_exp",
          "ngs_pass_expected_completion_pct",
          "passing_first_downs_exp"
        ]
      }
    ],
    "columns": [
      "passing_yards",
      "passing_tds",
      "interceptions",
      "completions",
      "attempts",
      "completion_pct",
      "dropbacks",
      "passing_first_downs",
      "epa",
      "epa_per_play",
      "cpoe",
      "yards_per_attempt",
      "yards_per_completion",
      "passer_rating",
      "passing_yards_exp",
      "passing_tds_exp",
      "interceptions_exp",
      "completions_exp",
      "ngs_pass_expected_completion_pct",
      "passing_first_downs_exp"
    ],
    "defaultSort": "passing_yards",
    "scoring": false,
    "signed": [],
    "percentileColumns": [
      "passing_yards",
      "passing_tds",
      "interceptions",
      "completions",
      "attempts",
      "completion_pct",
      "dropbacks",
      "passing_first_downs",
      "epa",
      "epa_per_play",
      "cpoe",
      "yards_per_attempt",
      "yards_per_completion",
      "passer_rating",
      "passing_yards_exp",
      "passing_tds_exp",
      "interceptions_exp",
      "completions_exp",
      "ngs_pass_expected_completion_pct",
      "passing_first_downs_exp"
    ],
    "fixedPosition": "QB",
    "defaultPosition": "QB",
    "phase": "passing"
  },
  {
    "id": "nfl-passing-advanced",
    "label": "Advanced",
    "path": "/nfl/passing-advanced",
    "menuDesc": "Air yards, release, pressure",
    "title": "Passing Advanced",
    "description": "How the throw happened and what the quarterback was up against — tracking and charting data. Starts in 2016; the pressure columns in 2018.",
    "sections": [
      {
        "name": "Efficiency",
        "columns": [
          "epa",
          "epa_per_play",
          "cpoe",
          "yards_per_attempt",
          "yards_per_completion",
          "passer_rating"
        ]
      },
      {
        "name": "Ball Placement",
        "columns": [
          "ngs_pass_intended_air_yards",
          "bad_throw_rate",
          "drops_by_receivers",
          "ngs_pass_completed_air_yards",
          "ngs_pass_air_yards_differential",
          "ngs_pass_air_yards_to_sticks",
          "ngs_pass_aggressiveness"
        ]
      },
      {
        "name": "Pressure",
        "columns": [
          "sacks_suffered",
          "pressure_rate",
          "ngs_pass_time_to_throw",
          "times_blitzed",
          "sack_fumbles_lost"
        ]
      }
    ],
    "columns": [
      "epa",
      "epa_per_play",
      "cpoe",
      "yards_per_attempt",
      "yards_per_completion",
      "passer_rating",
      "ngs_pass_intended_air_yards",
      "bad_throw_rate",
      "drops_by_receivers",
      "ngs_pass_completed_air_yards",
      "ngs_pass_air_yards_differential",
      "ngs_pass_air_yards_to_sticks",
      "ngs_pass_aggressiveness",
      "sacks_suffered",
      "pressure_rate",
      "ngs_pass_time_to_throw",
      "times_blitzed",
      "sack_fumbles_lost"
    ],
    "defaultSort": "epa",
    "defaultPosition": "QB",
    "fixedPosition": "QB",
    "scoring": false,
    "signed": [],
    "percentileColumns": [
      "epa",
      "epa_per_play",
      "cpoe",
      "yards_per_attempt",
      "yards_per_completion",
      "passer_rating",
      "ngs_pass_intended_air_yards",
      "bad_throw_rate",
      "drops_by_receivers",
      "ngs_pass_completed_air_yards",
      "ngs_pass_air_yards_differential",
      "ngs_pass_air_yards_to_sticks",
      "ngs_pass_aggressiveness",
      "sacks_suffered",
      "pressure_rate",
      "ngs_pass_time_to_throw",
      "times_blitzed",
      "sack_fumbles_lost"
    ],
    "phase": "passing"
  },
  {
    "id": "nfl-rushing",
    "label": "Production",
    "path": "/nfl/rushing",
    "menuDesc": "Yards before and after contact",
    "title": "Rushing Production",
    "description": "Everything a back produced — volume, efficiency, and what the model expected from the same carries. Answers back to 1999.",
    "sections": [
      {
        "name": "General",
        "columns": [
          "carries",
          "rushing_yards",
          "rushing_tds",
          "rushing_first_downs",
          "market_share",
          "snap_share"
        ]
      },
      {
        "name": "Efficiency",
        "columns": [
          "epa",
          "epa_per_play",
          "rushing_epa",
          "yards_per_carry"
        ]
      },
      {
        "name": "Expected",
        "columns": [
          "rushing_yards_exp",
          "rushing_tds_exp",
          "rushing_first_downs_exp"
        ]
      }
    ],
    "columns": [
      "carries",
      "rushing_yards",
      "rushing_tds",
      "rushing_first_downs",
      "market_share",
      "snap_share",
      "epa",
      "epa_per_play",
      "rushing_epa",
      "yards_per_carry",
      "rushing_yards_exp",
      "rushing_tds_exp",
      "rushing_first_downs_exp"
    ],
    "defaultSort": "rushing_yards",
    "defaultPosition": "RB",
    "scoring": false,
    "signed": [],
    "percentileColumns": [
      "carries",
      "rushing_yards",
      "rushing_tds",
      "rushing_first_downs",
      "market_share",
      "snap_share",
      "epa",
      "epa_per_play",
      "rushing_epa",
      "yards_per_carry",
      "rushing_yards_exp",
      "rushing_tds_exp",
      "rushing_first_downs_exp"
    ],
    "phase": "rushing"
  },
  {
    "id": "nfl-rushing-advanced",
    "label": "Advanced",
    "path": "/nfl/rushing-advanced",
    "menuDesc": "Contact, broken tackles, RYOE",
    "title": "Rushing Advanced",
    "description": "What the line gave and what the back created. Yards before contact measures the blocking; yards after contact measures the runner. Charting starts in 2018, tracking in 2016.",
    "sections": [
      {
        "name": "Efficiency",
        "columns": [
          "epa",
          "epa_per_play",
          "rushing_epa"
        ]
      },
      {
        "name": "Contact",
        "columns": [
          "rush_yards_before_contact",
          "rush_ybc_per_att",
          "rush_yards_after_contact",
          "rush_yac_per_att",
          "rush_broken_tackles",
          "ngs_rush_pct_attempts_eight_defenders"
        ]
      },
      {
        "name": "Next Gen Stats",
        "columns": [
          "ngs_rush_yards_over_expected",
          "ngs_rush_yards_over_expected_per_att",
          "ngs_rush_expected_yards",
          "ngs_rush_pct_over_expected",
          "ngs_rush_efficiency",
          "ngs_rush_time_to_los"
        ]
      }
    ],
    "columns": [
      "epa",
      "epa_per_play",
      "rushing_epa",
      "rush_yards_before_contact",
      "rush_ybc_per_att",
      "rush_yards_after_contact",
      "rush_yac_per_att",
      "rush_broken_tackles",
      "ngs_rush_pct_attempts_eight_defenders",
      "ngs_rush_yards_over_expected",
      "ngs_rush_yards_over_expected_per_att",
      "ngs_rush_expected_yards",
      "ngs_rush_pct_over_expected",
      "ngs_rush_efficiency",
      "ngs_rush_time_to_los"
    ],
    "defaultSort": "epa",
    "defaultPosition": "RB",
    "scoring": false,
    "signed": [],
    "percentileColumns": [
      "epa",
      "epa_per_play",
      "rushing_epa",
      "rush_yards_before_contact",
      "rush_ybc_per_att",
      "rush_yards_after_contact",
      "rush_yac_per_att",
      "rush_broken_tackles",
      "ngs_rush_pct_attempts_eight_defenders",
      "ngs_rush_yards_over_expected",
      "ngs_rush_yards_over_expected_per_att",
      "ngs_rush_expected_yards",
      "ngs_rush_pct_over_expected",
      "ngs_rush_efficiency",
      "ngs_rush_time_to_los"
    ],
    "phase": "rushing"
  },
  {
    "id": "nfl-receiving",
    "label": "Production",
    "path": "/nfl/receiving",
    "menuDesc": "Separation, YAC and efficiency",
    "title": "Receiving Production",
    "description": "Everything a receiver produced — volume, efficiency, and what the model expected from the same targets.",
    "sections": [
      {
        "name": "General",
        "columns": [
          "targets",
          "receptions",
          "receiving_yards",
          "receiving_tds",
          "receiving_first_downs",
          "yards_after_catch",
          "snap_share"
        ]
      },
      {
        "name": "Efficiency",
        "columns": [
          "epa",
          "epa_per_play",
          "receiving_epa",
          "yards_per_reception",
          "yards_per_target",
          "yards_per_route_run",
          "targets_per_route_run",
          "catch_rate",
          "racr"
        ]
      },
      {
        "name": "Expected",
        "columns": [
          "receiving_yards_exp",
          "receiving_tds_exp",
          "receptions_exp",
          "receiving_first_downs_exp"
        ]
      }
    ],
    "columns": [
      "targets",
      "receptions",
      "receiving_yards",
      "receiving_tds",
      "receiving_first_downs",
      "yards_after_catch",
      "snap_share",
      "epa",
      "epa_per_play",
      "receiving_epa",
      "yards_per_reception",
      "yards_per_target",
      "yards_per_route_run",
      "targets_per_route_run",
      "catch_rate",
      "racr",
      "receiving_yards_exp",
      "receiving_tds_exp",
      "receptions_exp",
      "receiving_first_downs_exp"
    ],
    "defaultSort": "receiving_yards",
    "defaultPosition": "WR",
    "scoring": false,
    "signed": [],
    "percentileColumns": [
      "targets",
      "receptions",
      "receiving_yards",
      "receiving_tds",
      "receiving_first_downs",
      "yards_after_catch",
      "snap_share",
      "epa",
      "epa_per_play",
      "receiving_epa",
      "yards_per_reception",
      "yards_per_target",
      "yards_per_route_run",
      "targets_per_route_run",
      "catch_rate",
      "racr",
      "receiving_yards_exp",
      "receiving_tds_exp",
      "receptions_exp",
      "receiving_first_downs_exp"
    ],
    "phase": "receiving"
  },
  {
    "id": "nfl-receiving-advanced",
    "label": "Advanced",
    "path": "/nfl/receiving-advanced",
    "menuDesc": "Usage, air yards and tracking",
    "title": "Receiving Advanced",
    "description": "How the offense used a receiver and what he did with it — routes, air yards, separation and yards after catch. Folds in the opportunity columns, because for a receiver those are the same question.",
    "sections": [
      {
        "name": "Efficiency",
        "columns": [
          "epa",
          "epa_per_play",
          "receiving_epa",
          "yards_per_reception",
          "yards_per_target",
          "yards_per_route_run",
          "targets_per_route_run"
        ]
      },
      {
        "name": "Volume",
        "columns": [
          "targets",
          "target_share",
          "routes_run",
          "routes_run_per_game",
          "route_participation",
          "red_zone_targets",
          "snap_count",
          "snap_share"
        ]
      },
      {
        "name": "Air Yards",
        "columns": [
          "air_yards",
          "air_yards_share",
          "adot",
          "unrealized_air_yards",
          "wopr"
        ]
      },
      {
        "name": "Next Gen Stats",
        "columns": [
          "ngs_rec_separation",
          "ngs_rec_cushion",
          "ngs_rec_yac",
          "ngs_rec_expected_yac",
          "ngs_rec_yac_above_expectation",
          "rec_broken_tackles"
        ]
      }
    ],
    "columns": [
      "epa",
      "epa_per_play",
      "receiving_epa",
      "yards_per_reception",
      "yards_per_target",
      "yards_per_route_run",
      "targets_per_route_run",
      "targets",
      "target_share",
      "routes_run",
      "routes_run_per_game",
      "route_participation",
      "red_zone_targets",
      "snap_count",
      "snap_share",
      "air_yards",
      "air_yards_share",
      "adot",
      "unrealized_air_yards",
      "wopr",
      "ngs_rec_separation",
      "ngs_rec_cushion",
      "ngs_rec_yac",
      "ngs_rec_expected_yac",
      "ngs_rec_yac_above_expectation",
      "rec_broken_tackles"
    ],
    "defaultSort": "targets",
    "defaultPosition": "WR",
    "scoring": false,
    "signed": [],
    "percentileColumns": [
      "epa",
      "epa_per_play",
      "receiving_epa",
      "yards_per_reception",
      "yards_per_target",
      "yards_per_route_run",
      "targets_per_route_run",
      "targets",
      "target_share",
      "routes_run",
      "routes_run_per_game",
      "route_participation",
      "red_zone_targets",
      "snap_count",
      "snap_share",
      "air_yards",
      "air_yards_share",
      "adot",
      "unrealized_air_yards",
      "wopr",
      "ngs_rec_separation",
      "ngs_rec_cushion",
      "ngs_rec_yac",
      "ngs_rec_expected_yac",
      "ngs_rec_yac_above_expectation",
      "rec_broken_tackles"
    ],
    "phase": "receiving"
  }
];

/** @type {Board[]} */
export const OPPORTUNITY_BOARDS = [
  {
    "id": "opportunity-all",
    "label": "Opportunity",
    "path": "/opportunity/all",
    "menuDesc": "Share of the offense",
    "title": "Opportunity",
    "description": "Who the offense is running through, before any of it turns into points — every phase.",
    "sections": [
      {
        "name": "General",
        "columns": [
          "snap_share",
          "snap_count"
        ]
      },
      {
        "name": "Receiving",
        "columns": [
          "targets",
          "target_share",
          "routes_run",
          "routes_run_per_game",
          "route_participation",
          "targets_per_route_run",
          "red_zone_targets"
        ]
      },
      {
        "name": "Receiving Air Yards",
        "columns": [
          "air_yards",
          "air_yards_share",
          "adot",
          "unrealized_air_yards",
          "wopr"
        ]
      },
      {
        "name": "Rushing",
        "columns": [
          "carries",
          "rush_attempt_share",
          "touches_per_snap",
          "opportunity_share"
        ]
      },
      {
        "name": "Rushing RZ",
        "columns": [
          "red_zone_rush_attempts",
          "red_zone_rush_share",
          "rush_att_inside_2",
          "rush_att_inside_5",
          "rush_att_inside_10",
          "high_value_touches_per_game"
        ]
      },
      {
        "name": "Passing",
        "columns": [
          "attempts",
          "dropbacks",
          "sacks_suffered",
          "pressure_rate",
          "ngs_pass_time_to_throw",
          "times_blitzed"
        ]
      }
    ],
    "columns": [
      "snap_share",
      "snap_count",
      "targets",
      "target_share",
      "routes_run",
      "routes_run_per_game",
      "route_participation",
      "targets_per_route_run",
      "red_zone_targets",
      "air_yards",
      "air_yards_share",
      "adot",
      "unrealized_air_yards",
      "wopr",
      "carries",
      "rush_attempt_share",
      "touches_per_snap",
      "opportunity_share",
      "red_zone_rush_attempts",
      "red_zone_rush_share",
      "rush_att_inside_2",
      "rush_att_inside_5",
      "rush_att_inside_10",
      "high_value_touches_per_game",
      "attempts",
      "dropbacks",
      "sacks_suffered",
      "pressure_rate",
      "ngs_pass_time_to_throw",
      "times_blitzed"
    ],
    "defaultSort": "opportunity_share",
    "defaultPosition": "",
    "scoring": false,
    "signed": [],
    "percentileColumns": [
      "snap_share",
      "snap_count",
      "targets",
      "target_share",
      "routes_run",
      "routes_run_per_game",
      "route_participation",
      "targets_per_route_run",
      "red_zone_targets",
      "air_yards",
      "air_yards_share",
      "adot",
      "unrealized_air_yards",
      "wopr",
      "carries",
      "rush_attempt_share",
      "touches_per_snap",
      "opportunity_share",
      "red_zone_rush_attempts",
      "red_zone_rush_share",
      "rush_att_inside_2",
      "rush_att_inside_5",
      "rush_att_inside_10",
      "high_value_touches_per_game",
      "attempts",
      "dropbacks",
      "sacks_suffered",
      "pressure_rate",
      "ngs_pass_time_to_throw",
      "times_blitzed"
    ],
    "phase": "all"
  }
,
  {
    "id": "opportunity-rushing",
    "label": "Opportunity",
    "path": "/opportunity/rushing",
    "menuDesc": "Carries and goal-line work",
    "title": "Rushing Opportunity",
    "description": "The carries a back is given, and where he is given them.",
    "sections": [
      {
        "name": "Volume",
        "columns": [
          "carries",
          "rush_attempt_share",
          "snap_count",
          "snap_share",
          "touches_per_snap",
          "opportunity_share"
        ]
      },
      {
        "name": "Red Zone",
        "columns": [
          "red_zone_rush_attempts",
          "red_zone_rush_share",
          "rush_att_inside_2",
          "rush_att_inside_5",
          "rush_att_inside_10",
          "high_value_touches_per_game"
        ]
      }
    ],
    "columns": [
      "carries",
      "rush_attempt_share",
      "snap_count",
      "snap_share",
      "touches_per_snap",
      "opportunity_share",
      "red_zone_rush_attempts",
      "red_zone_rush_share",
      "rush_att_inside_2",
      "rush_att_inside_5",
      "rush_att_inside_10",
      "high_value_touches_per_game"
    ],
    "defaultSort": "carries",
    "defaultPosition": "RB",
    "scoring": false,
    "signed": [],
    "percentileColumns": [
      "carries",
      "rush_attempt_share",
      "snap_count",
      "snap_share",
      "touches_per_snap",
      "opportunity_share",
      "red_zone_rush_attempts",
      "red_zone_rush_share",
      "rush_att_inside_2",
      "rush_att_inside_5",
      "rush_att_inside_10",
      "high_value_touches_per_game"
    ],
    "phase": "rushing"
  }
];

// One "Leaderboards" tab, opening a Baseball-Savant-style mega menu: a column per
// PHASE, listing the board types inside it. Phase-first because that is how someone
// arrives — they want receivers, then decide whether they want the fantasy view, the
// production view, or the usage behind both.
//
// ⚠️ The routes are unchanged and stay grouped by *type* (`/fantasy/receiving`,
// `/nfl/receiving`). That mismatch is deliberate: a route is what a saved view (M5)
// and a shared link store, and re-grouping the menu is a presentation change. Breaking
// every saved board link to make the URL echo the menu would be a poor trade.
export const LEADERBOARD_MENU = [
  {
    label: "Passing",
    items: [
      FANTASY_BOARDS.find((board) => board.phase === "passing"),
      NFL_BOARDS.find((board) => board.id === "nfl-passing"),
      NFL_BOARDS.find((board) => board.id === "nfl-passing-advanced"),
    ],
  },
  {
    label: "Rushing",
    items: [
      FANTASY_BOARDS.find((board) => board.phase === "rushing"),
      NFL_BOARDS.find((board) => board.id === "nfl-rushing"),
      NFL_BOARDS.find((board) => board.id === "nfl-rushing-advanced"),
      OPPORTUNITY_BOARDS.find((board) => board.phase === "rushing"),
    ],
  },
  {
    label: "Receiving",
    items: [
      FANTASY_BOARDS.find((board) => board.phase === "receiving"),
      NFL_BOARDS.find((board) => board.id === "nfl-receiving"),
      NFL_BOARDS.find((board) => board.id === "nfl-receiving-advanced"),
    ],
  },
  {
    label: "All",
    items: [
      FANTASY_BOARDS.find((board) => board.phase === "all"),
      NFL_BOARDS.find((board) => board.id === "nfl-all"),
      NFL_BOARDS.find((board) => board.id === "nfl-all-advanced"),
      OPPORTUNITY_BOARDS.find((board) => board.phase === "all"),
    ],
  },
];

/** Every player board, flattened — routing, and resolving a path back to a board. */
export const ALL_PLAYER_BOARDS = LEADERBOARD_MENU.flatMap((group) => group.items);

export const INSIGHT_BOARDS = [
  {
    id: "insight-vorp",
    label: "VORP",
    path: "/insight/vorp",
    menuDesc: "Value over a startable replacement",
    title: "Value Over Replacement",
    description:
      "What each player was worth above the last startable player at their position — " +
      "in your scoring and your league size. The honest way to compare a tight end " +
      "with a running back.",
    lede:
      "Replacement level moves with your league: deeper lineups push the baseline down " +
      "and make stars worth more. Set your lineup below to see it change.",
    columns: ["vorp", "vorp_ppg", "replacement_ppg", "fantasy_points", "fantasy_ppg", "expected_fantasy_ppg", "fantasy_opportunity_rating"],
    defaultSort: "vorp",
    defaultPosition: "",
    scoring: true,
    insight: true,
          sections: [
      {
        "name": "Value",
        "columns": [
          "vorp",
          "vorp_ppg",
          "replacement_ppg"
        ]
      },
      {
        "name": "Production",
        "columns": [
          "fantasy_points",
          "fantasy_ppg",
          "expected_fantasy_ppg"
        ]
      },
      {
        "name": "Opportunity",
        "columns": [
          "fantasy_opportunity_rating"
        ]
      }
    ],
    percentileColumns: ["vorp", "vorp_ppg", "fantasy_points", "fantasy_ppg", "expected_fantasy_ppg", "fantasy_opportunity_rating"],
  },
  {
    id: "insight-opportunity",
    label: "Opportunity Rating",
    path: "/insight/opportunity",
    menuDesc: "Who the offense actually runs through",
    title: "Fantasy Opportunity Rating",
    description:
      "0–100 on how much of an offense runs through a player, regardless of what it " +
      "produced. Half expected fantasy points in your scoring, half the usage shares " +
      "that matter at their position.",
    lede:
      "Opportunity is the most repeatable thing in fantasy — it predicts next week far " +
      "better than last week's points do.",
    columns: ["fantasy_opportunity_rating", "expected_fantasy_ppg", "fantasy_ppg", "opportunity_share", "target_share", "route_participation", "air_yards_share", "rush_attempt_share", "rush_att_inside_10", "red_zone_targets", "snap_share"],
    defaultSort: "fantasy_opportunity_rating",
    defaultPosition: "",
    scoring: true,
    insight: true,
      sections: [
      {
        "name": "Score",
        "columns": [
          "fantasy_opportunity_rating"
        ]
      },
      {
        "name": "Production",
        "columns": [
          "expected_fantasy_ppg",
          "fantasy_ppg"
        ]
      },
      {
        "name": "Usage",
        "columns": [
          "opportunity_share",
          "target_share",
          "route_participation",
          "air_yards_share",
          "rush_attempt_share",
          "rush_att_inside_10",
          "red_zone_targets",
          "snap_share"
        ]
      }
    ],
    percentileColumns: ["fantasy_opportunity_rating", "expected_fantasy_ppg", "fantasy_ppg", "opportunity_share", "target_share", "route_participation", "air_yards_share", "rush_attempt_share", "rush_att_inside_10", "red_zone_targets", "snap_share"],
  },
  {
    id: "insight-buy-low",
    label: "Buy Low",
    path: "/insight/buy-low",
    menuDesc: "Real usage, points haven't caught up",
    title: "Buy Low — Positive Regression",
    description:
      "0–100 on players earning more than they're scoring: real opportunity, output " +
      "below what that opportunity is worth, touchdown-starved, and still cheap to " +
      "acquire.",
    lede:
      "A points-under-expected gap only matters when the usage behind it is real — " +
      "which is why opportunity rating carries 30% of this score.",
    columns: ["positive_regression_index", "fantasy_opportunity_rating", "fantasy_ppg", "expected_fantasy_ppg", "fantasy_points_over_expected", "tds_over_expected", "opportunity_share", "target_share", "vorp_ppg"],
    defaultSort: "positive_regression_index",
    defaultPosition: "",
    scoring: true,
    insight: true,
          sections: [
      {
        "name": "Signal",
        "columns": [
          "positive_regression_index",
          "fantasy_opportunity_rating"
        ]
      },
      {
        "name": "Production",
        "columns": [
          "fantasy_ppg",
          "expected_fantasy_ppg",
          "fantasy_points_over_expected",
          "tds_over_expected"
        ]
      },
      {
        "name": "Usage",
        "columns": [
          "opportunity_share",
          "target_share"
        ]
      },
      {
        "name": "Value",
        "columns": [
          "vorp_ppg"
        ]
      }
    ],
    percentileColumns: ["positive_regression_index", "fantasy_opportunity_rating", "fantasy_ppg", "expected_fantasy_ppg", "fantasy_points_over_expected", "tds_over_expected", "opportunity_share", "target_share", "vorp_ppg"],
  },
  {
    id: "insight-sell-high",
    label: "Sell High",
    path: "/insight/sell-high",
    menuDesc: "Scoring above what the usage supports",
    title: "Sell High",
    description:
      "0–100 on players whose production is running ahead of their opportunity — " +
      "touchdown luck and above-baseline efficiency, with a role that's already " +
      "shrinking. Trade while the name is hot.",
    lede:
      "Touchdown rate and per-touch efficiency regress hardest. Usage trend is the " +
      "tiebreak: outproducing your opportunity while losing snaps is the clearest sell.",
    columns: ["sell_high_index", "fantasy_opportunity_rating", "fantasy_ppg", "expected_fantasy_ppg", "fantasy_points_over_expected", "tds_over_expected", "efficiency_over_baseline", "opportunity_trend", "vorp_ppg"],
    defaultSort: "sell_high_index",
    defaultPosition: "",
    scoring: true,
    insight: true,
          sections: [
      {
        "name": "Signal",
        "columns": [
          "sell_high_index",
          "fantasy_opportunity_rating"
        ]
      },
      {
        "name": "Production",
        "columns": [
          "fantasy_ppg",
          "expected_fantasy_ppg",
          "fantasy_points_over_expected",
          "tds_over_expected"
        ]
      },
      {
        "name": "Efficiency",
        "columns": [
          "efficiency_over_baseline",
          "opportunity_trend"
        ]
      },
      {
        "name": "Value",
        "columns": [
          "vorp_ppg"
        ]
      }
    ],
    percentileColumns: ["sell_high_index", "fantasy_opportunity_rating", "fantasy_ppg", "expected_fantasy_ppg", "fantasy_points_over_expected", "tds_over_expected", "efficiency_over_baseline", "opportunity_trend", "vorp_ppg"],
  },
];

/** @type {Board[]} */
export const INSIGHT_TOOLS = [
  {
    id: "insight-sos",
    label: "Strength of Schedule",
    path: "/insight/sos",
    menuDesc: "Whose fixtures open up, by position",
    title: "Strength of Schedule",
    description:
      "How hard every team's fixtures are for one position, in your scoring — the " +
      "whole season as a grid, so the run of weeks is visible rather than just a rank.",
    lede:
      "Difficulty is fantasy points allowed to this position, on a 0-100 scale where " +
      "higher is harder. Position matters more than most sites admit: a defense that " +
      "smothers receivers is often the one running backs feast on.",
  },
];

// --- Schedule (M10) ---
// A fixture list, a season grid, and the betting board. Vegas moved here from
// Insight ▾ because it is a *schedule* surface: it answers "what happens this week",
// not "who should I start" — the same reasoning that moved the Value Board into
// Draft ▾ in M9. Its old URL redirects, so shared links and saved views survive.
export const SCHEDULE_ITEMS = [
  {
    id: "schedule-games",
    label: "Games",
    path: "/schedule/games",
    menuDesc: "Every fixture and result, back to 1999",
    title: "Games",
    description:
      "The whole schedule, filterable by season, week and team — results where they " +
      "have been played, and the betting market's view where they have not.",
  },
  {
    id: "schedule-by-team",
    label: "By Team",
    path: "/schedule/by-team",
    menuDesc: "One season as a team × week grid",
    title: "Schedule by Team",
    description:
      "Every team's season in one grid. Reading across a row shows the run of fixtures " +
      "a player has to get through, which a week-by-week list hides.",
  },
  {
    id: "schedule-vegas",
    label: "Vegas Board",
    path: "/schedule/vegas",
    menuDesc: "Who's in the best scoring environment",
    title: "Vegas Board",
    description:
      "What the betting market expects each offense to score this week, and the players " +
      "who are in those games. A back in a 27-point offense has a different job from " +
      "the same back in a 17-point one.",
    lede:
      "Implied total is the game total split by the spread - the points the market " +
      "expects one offense to put up. It is the sharpest forward-looking read we have " +
      "on how many fantasy points there are to go around, and it needs no projection " +
      "of our own to say so.",
  },
];


// --- Draft (M9) ---
// The fourth product surface. Rankings is the board you read; Mock Draft is the room
// you practise in; the Value Board is the M6.1 comparison, moved here from Insight ▾
// because a draft tool belongs in the draft menu (the old /insight/draft redirects, so
// saved views and shared links survive).
export const DRAFT_ITEMS = [
  {
    id: "draft-rankings",
    label: "Rankings",
    path: "/draft/rankings",
    menuDesc: "The consensus board, or one of your own",
    title: "Rankings",
    description:
      "Expert consensus by default, with our valuation of every player beside it — " +
      "and your own boards, uploaded or built here, in the same table.",
    lede:
      "The consensus is a blend of every expert board we hold, each re-ranked over " +
      "the players it lists before averaging, so a deep board does not outvote a " +
      "short one. Where the experts disagree, the range says so.",
  },
  {
    id: "draft-mock",
    label: "Mock Draft",
    path: "/draft/mock",
    menuDesc: "Practise against bots, from any board",
    title: "Mock Draft",
    description:
      "A snake draft against bots, in your scoring and league settings, from whichever " +
      "board you want to practise against — then graded on what your roster was " +
      "actually worth.",
  },
  {
    id: "draft-value",
    label: "Value Board",
    path: "/draft/value",
    menuDesc: "Where the consensus and our valuation disagree",
    title: "Draft Value Board",
    description:
      "Expert consensus rank next to what each player's usage was actually worth, in " +
      "your scoring and league size — and the gap between the two. A positive gap is " +
      "a player we rate above the market.",
    lede:
      "Our side is built on expected points, not actual ones: a player who scored " +
      "twelve touchdowns on six touchdowns' worth of usage is valued at six here. " +
      "That is the point — it prices the opportunity, which tends to repeat, rather " +
      "than the finish, which often does not.",
  },
];

// --- Explore (M4) ---
// Not boards: these are tools, not ranked tables, so they have no `columns` and are
// routed to their own pages. They share the nav-item shape so the dropdown can render
// them alongside the boards.
export const EXPLORE_ITEMS = [
  {
    id: "explore-scatter",
    label: "Scatter",
    path: "/explore/scatter",
    menuDesc: "Plot any two metrics against each other",
    title: "Scatter Builder",
    description:
      "Pick a question and see the whole player pool answer it at once. The dashed " +
      "lines are the medians, so the corners are the story — and every dot is a player " +
      "you can click.",
  },
  {
    id: "explore-compare",
    label: "Compare",
    path: "/explore/compare",
    menuDesc: "Up to five players, side by side",
    title: "Comparison Builder",
    description:
      "Line up to five players side by side. Every stat shows who leads it and by how " +
      "much, and only stats that apply to all of them are shown — so a quarterback and " +
      "a receiver get compared on common ground.",
  },
];


// Nav dropdown groups. Insight leads — it is the reason to come back — and Draft sits
// next to it, because from July to September it is the reason to come back. The three
// player leaderboards are no longer here: they are one "Leaderboards" tab rendered
// from LEADERBOARD_MENU above.
export const NAV_GROUPS = [
  { label: "Insight", items: [...INSIGHT_TOOLS, ...INSIGHT_BOARDS], match: "/insight" },
  { label: "Draft", items: DRAFT_ITEMS, match: "/draft" },
  { label: "Explore", items: EXPLORE_ITEMS, match: "/explore" },
  { label: "Schedule", items: SCHEDULE_ITEMS, match: "/schedule" },
];

/** Every ranked board, for routing and for saved-view path validation. */
export const ALL_BOARDS = [...INSIGHT_BOARDS, ...ALL_PLAYER_BOARDS];
