// Leaderboard "boards" — the config that drives every leaderboard page and the
// two nav dropdowns. Each board is one route rendered by pages/LeaderboardView.
//
// A board declares which columns to show (metric ids from the backend registry,
// see backend/app/metrics.py), the default sort + position, and whether it is a
// FANTASY board (shows the league-scoring editor and scoring-aware columns) or an
// NFL board (raw stats, no scoring — just the filters).
//
// Only metrics that are actually populated in the data are used here; several
// advanced columns (snap share, routes run, TPRR/YPRR, slot snaps, unrealized air
// yards) are intentionally omitted because the pipeline leaves them NULL for now.

/**
 * @typedef {Object} Board
 * @property {string} id
 * @property {string} label        short label (dropdown item + tab)
 * @property {string} path         route path
 * @property {string} menuDesc     one-liner shown in the nav dropdown
 * @property {string} title        page H1
 * @property {string} description  page subtitle
 * @property {string[]} columns    metric ids, in display order
 * @property {string} defaultSort  metric id to sort by initially
 * @property {string} defaultPosition  '' | 'QB' | 'RB' | 'WR' | 'TE'
 * @property {boolean} scoring     true = fantasy board (league scoring editor + scoring-aware cols)
 */

/** @type {Board[]} */
export const FANTASY_BOARDS = [
  {
    id: "fantasy-leaders",
    label: "Leaders",
    path: "/fantasy/leaders",
    menuDesc: "Total points & PPG in your scoring",
    title: "Fantasy Leaders",
    description: "Total fantasy points and per-game average, scored in your league settings.",
    columns: ["fantasy_points", "fantasy_ppg"],
    defaultSort: "fantasy_points",
    defaultPosition: "",
    scoring: true,
  },
  {
    id: "fantasy-passing",
    label: "Passing",
    path: "/fantasy/passing",
    menuDesc: "QB fantasy + passing efficiency",
    title: "Fantasy Passing",
    description: "Quarterback fantasy production and passing efficiency, scored in your league.",
    columns: [
      "fantasy_points", "fantasy_ppg", "passing_yards", "passing_tds", "interceptions",
      "rushing_yards", "rushing_tds", "passer_rating", "cpoe", "epa",
    ],
    defaultSort: "fantasy_points",
    defaultPosition: "QB",
    scoring: true,
  },
  {
    id: "fantasy-receiving",
    label: "Receiving",
    path: "/fantasy/receiving",
    menuDesc: "Receiving fantasy + opportunity",
    title: "Fantasy Receiving",
    description: "Receiving fantasy production and the opportunity behind it, scored in your league.",
    columns: [
      "fantasy_points", "fantasy_ppg", "receptions", "targets", "receiving_yards", "receiving_tds",
      "target_share", "air_yards", "yards_after_catch", "red_zone_targets", "wopr",
    ],
    defaultSort: "fantasy_points",
    defaultPosition: "WR",
    scoring: true,
  },
  {
    id: "fantasy-rushing",
    label: "Rushing",
    path: "/fantasy/rushing",
    menuDesc: "Rushing fantasy + opportunity",
    title: "Fantasy Rushing",
    description: "Rushing fantasy production and the opportunity behind it, scored in your league.",
    columns: [
      "fantasy_points", "fantasy_ppg", "carries", "rushing_yards", "rushing_tds",
      "red_zone_rush_attempts", "red_zone_rush_share", "rushing_epa", "receptions", "receiving_yards",
    ],
    defaultSort: "fantasy_points",
    defaultPosition: "RB",
    scoring: true,
  },
];

/** @type {Board[]} */
export const NFL_BOARDS = [
  {
    id: "nfl-all-general",
    label: "All General",
    path: "/nfl/all-general",
    menuDesc: "Box-score stats, all positions",
    title: "NFL — All General",
    description: "Core box-score production across every position.",
    columns: [
      "passing_yards", "passing_tds", "interceptions", "rushing_yards", "rushing_tds",
      "receptions", "targets", "receiving_yards", "receiving_tds", "fumbles_lost", "epa",
    ],
    defaultSort: "epa",
    defaultPosition: "",
    scoring: false,
  },
  {
    id: "nfl-all-advanced",
    label: "All Advanced",
    path: "/nfl/all-advanced",
    menuDesc: "Efficiency & opportunity, all positions",
    title: "NFL — All Advanced",
    description: "Advanced efficiency, value, and opportunity metrics across positions.",
    columns: [
      "epa", "cpoe", "target_share", "air_yards", "yards_after_catch", "adot",
      "wopr", "red_zone_targets", "rushing_epa", "receiving_epa",
    ],
    defaultSort: "epa",
    defaultPosition: "",
    scoring: false,
  },
  {
    id: "nfl-passing-general",
    label: "Passing General",
    path: "/nfl/passing-general",
    menuDesc: "Yards, TDs, INT, rating",
    title: "NFL Passing — General",
    description: "Passing box-score stats.",
    columns: ["completions", "attempts", "passing_yards", "passing_tds", "interceptions", "passer_rating"],
    defaultSort: "passing_yards",
    defaultPosition: "QB",
    scoring: false,
  },
  {
    id: "nfl-passing-advanced",
    label: "Passing Advanced",
    path: "/nfl/passing-advanced",
    menuDesc: "CPOE, EPA, efficiency",
    title: "NFL Passing — Advanced",
    description: "Passing efficiency and value beyond the box score.",
    columns: ["attempts", "passing_yards", "passer_rating", "cpoe", "epa"],
    defaultSort: "epa",
    defaultPosition: "QB",
    scoring: false,
  },
  {
    id: "nfl-receiving-general",
    label: "Receiving General",
    path: "/nfl/receiving-general",
    menuDesc: "Rec, targets, yards, TDs",
    title: "NFL Receiving — General",
    description: "Receiving box-score stats.",
    columns: ["receptions", "targets", "receiving_yards", "receiving_tds", "yards_after_catch", "yards_per_reception"],
    defaultSort: "receiving_yards",
    defaultPosition: "",
    scoring: false,
  },
  {
    id: "nfl-receiving-advanced",
    label: "Receiving Advanced",
    path: "/nfl/receiving-advanced",
    menuDesc: "Target share, air yards, WOPR",
    title: "NFL Receiving — Advanced",
    description: "Receiving opportunity and efficiency metrics.",
    columns: [
      "target_share", "air_yards", "air_yards_share", "adot", "yards_after_catch",
      "wopr", "racr", "yards_per_target", "red_zone_targets", "receiving_epa",
    ],
    defaultSort: "target_share",
    defaultPosition: "",
    scoring: false,
  },
  {
    id: "nfl-rushing-general",
    label: "Rushing General",
    path: "/nfl/rushing-general",
    menuDesc: "Carries, yards, TDs",
    title: "NFL Rushing — General",
    description: "Rushing box-score stats.",
    columns: ["carries", "rushing_yards", "rushing_tds", "red_zone_rush_attempts"],
    defaultSort: "rushing_yards",
    defaultPosition: "",
    scoring: false,
  },
  {
    id: "nfl-rushing-advanced",
    label: "Rushing Advanced",
    path: "/nfl/rushing-advanced",
    menuDesc: "Rushing EPA, red-zone share",
    title: "NFL Rushing — Advanced",
    description: "Rushing efficiency and red-zone opportunity.",
    columns: ["carries", "rushing_yards", "rushing_epa", "red_zone_rush_attempts", "red_zone_rush_share"],
    defaultSort: "rushing_epa",
    defaultPosition: "",
    scoring: false,
  },
];

export const ALL_BOARDS = [...FANTASY_BOARDS, ...NFL_BOARDS];

// Nav dropdown groups.
export const NAV_GROUPS = [
  { label: "Fantasy Leaderboards", items: FANTASY_BOARDS, match: "/fantasy" },
  { label: "NFL Leaderboards", items: NFL_BOARDS, match: "/nfl" },
];
