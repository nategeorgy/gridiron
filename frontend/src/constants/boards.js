// Leaderboard "boards" — the config that drives every leaderboard page and the
// two nav dropdowns. Each board is one route rendered by pages/LeaderboardView.
//
// A board declares which columns to show (metric ids from the backend registry,
// see backend/app/metrics.py), the default sort + position, and whether it is a
// FANTASY board (shows the league-scoring editor and scoring-aware columns) or an
// NFL board (raw stats, no scoring — just the filters).
//
// Only metrics that are actually populated in the data are used here. As of M2 the
// snap, route, expected-points and market-share columns are all populated; the one
// remaining exception is slot_snaps, which no free data source provides.

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
 * @property {boolean} [insight]   true = M3 Insight board (served by /stats/intelligence:
 *                                 adds the league-context editor and the trailing-window
 *                                 timeframe, and is rendered by pages/InsightView)
 * @property {string[]} [signed]   columns tinted positive/negative
 * @property {string} [lede]       a sentence of guidance shown above an Insight board
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
    columns: ["fantasy_points", "fantasy_ppg", "expected_fantasy_points", "fantasy_points_over_expected"],
    defaultSort: "fantasy_points",
    defaultPosition: "",
    scoring: true,
  },
  {
    id: "fantasy-expected",
    label: "Expected Points",
    path: "/fantasy/expected",
    menuDesc: "Who the opportunity says should be scoring",
    title: "Expected Fantasy Points",
    description:
      "What each player's usage was worth in your scoring, next to what they actually " +
      "scored. Big positive gaps are efficiency and touchdown luck that may not hold; " +
      "big negative gaps are players whose opportunity says more points are coming.",
    columns: [
      "expected_fantasy_points", "expected_fantasy_ppg", "fantasy_points", "fantasy_ppg",
      "fantasy_points_over_expected", "receptions_exp", "receiving_yards_exp",
      "receiving_tds_exp", "rushing_yards_exp", "rushing_tds_exp",
    ],
    defaultSort: "expected_fantasy_points",
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
      "fantasy_points", "fantasy_ppg", "expected_fantasy_points", "fantasy_points_over_expected",
      "passing_yards", "passing_tds", "interceptions",
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
      "fantasy_points", "fantasy_ppg", "expected_fantasy_points", "fantasy_points_over_expected",
      "receptions", "targets", "receiving_yards", "receiving_tds",
      "target_share", "routes_run", "route_participation", "targets_per_route_run",
      "yards_per_route_run", "air_yards", "red_zone_targets",
      "high_value_touches_per_game", "wopr",
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
      "fantasy_points", "fantasy_ppg", "expected_fantasy_points", "fantasy_points_over_expected",
      "carries", "rushing_yards", "rushing_tds", "rush_attempt_share", "opportunity_share",
      "high_value_touches_per_game", "rush_att_inside_10", "rush_att_inside_5",
      "rush_att_inside_2", "red_zone_rush_share", "touches_per_snap",
      "receptions", "receiving_yards",
    ],
    defaultSort: "fantasy_points",
    defaultPosition: "RB",
    scoring: true,
  },
];

// --- Insight boards (M3) ---
// These are served by /stats/intelligence, not the leaderboard: their scores rank a
// player against their whole position pool, and they respond to league size and
// starting lineup as well as scoring. Each board answers one question.
/** @type {Board[]} */
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
    columns: [
      "vorp", "vorp_ppg", "replacement_ppg", "fantasy_ppg", "fantasy_points",
      "expected_fantasy_ppg", "fantasy_opportunity_rating",
    ],
    defaultSort: "vorp",
    defaultPosition: "",
    scoring: true,
    insight: true,
    signed: ["vorp", "vorp_ppg"],
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
    columns: [
      "fantasy_opportunity_rating", "expected_fantasy_ppg", "fantasy_ppg",
      "opportunity_share", "target_share", "route_participation", "air_yards_share",
      "rush_attempt_share", "rush_att_inside_10", "red_zone_targets", "snap_share",
    ],
    defaultSort: "fantasy_opportunity_rating",
    defaultPosition: "",
    scoring: true,
    insight: true,
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
    columns: [
      "positive_regression_index", "fantasy_opportunity_rating", "fantasy_ppg",
      "expected_fantasy_ppg", "fantasy_points_over_expected", "tds_over_expected",
      "opportunity_share", "target_share", "vorp_ppg",
    ],
    defaultSort: "positive_regression_index",
    defaultPosition: "",
    scoring: true,
    insight: true,
    signed: ["fantasy_points_over_expected", "tds_over_expected", "vorp_ppg"],
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
    columns: [
      "sell_high_index", "fantasy_ppg", "expected_fantasy_ppg",
      "fantasy_points_over_expected", "tds_over_expected", "efficiency_over_baseline",
      "opportunity_trend", "fantasy_opportunity_rating", "vorp_ppg",
    ],
    defaultSort: "sell_high_index",
    defaultPosition: "",
    scoring: true,
    insight: true,
    signed: [
      "fantasy_points_over_expected", "tds_over_expected", "efficiency_over_baseline",
      "opportunity_trend", "vorp_ppg",
    ],
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
      "epa", "cpoe", "snap_count", "snap_share", "target_share", "air_yards", "adot",
      "wopr", "opportunity_share", "market_share", "touches_per_snap",
      "red_zone_targets", "rushing_epa", "receiving_epa",
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
    menuDesc: "Routes, target share, air yards, WOPR",
    title: "NFL Receiving — Advanced",
    description: "Receiving opportunity and efficiency metrics.",
    columns: [
      "routes_run", "route_participation", "targets_per_route_run", "yards_per_route_run",
      "target_share", "air_yards", "air_yards_share", "unrealized_air_yards", "adot",
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
    columns: ["carries", "rushing_yards", "rushing_tds", "red_zone_rush_attempts", "rush_att_inside_5"],
    defaultSort: "rushing_yards",
    defaultPosition: "",
    scoring: false,
  },
  {
    id: "nfl-rushing-advanced",
    label: "Rushing Advanced",
    path: "/nfl/rushing-advanced",
    menuDesc: "Rushing EPA, market share, goal line",
    title: "NFL Rushing — Advanced",
    description: "Rushing efficiency, market share, and goal-line opportunity.",
    columns: [
      "carries", "rushing_yards", "rushing_epa", "rush_attempt_share", "market_share",
      "red_zone_rush_attempts", "red_zone_rush_share",
      "rush_att_inside_10", "rush_att_inside_5", "rush_att_inside_2",
    ],
    defaultSort: "rushing_epa",
    defaultPosition: "",
    scoring: false,
  },
];

export const ALL_BOARDS = [...INSIGHT_BOARDS, ...FANTASY_BOARDS, ...NFL_BOARDS];

// --- Insight tools (M6) ---
// Same nav-item shape as a board, but routed to its own page: their columns are
// properties of a *comparison* or a schedule rather than registry metrics of a player.
// Listed ahead of the boards because they are the reason to open the site.
//
// The Draft Value Board used to live here and moved to Draft ▾ in M9 — it was always a
// draft tool sitting in an insight menu. /insight/draft redirects.
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
  {
    id: "insight-vegas",
    label: "Vegas Board",
    path: "/insight/vegas",
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
// next to it, because from July to September it is the reason to come back.
export const NAV_GROUPS = [
  { label: "Insight", items: [...INSIGHT_TOOLS, ...INSIGHT_BOARDS], match: "/insight" },
  { label: "Draft", items: DRAFT_ITEMS, match: "/draft" },
  { label: "Explore", items: EXPLORE_ITEMS, match: "/explore" },
  { label: "Fantasy Leaderboards", items: FANTASY_BOARDS, match: "/fantasy" },
  { label: "NFL Leaderboards", items: NFL_BOARDS, match: "/nfl" },
];
