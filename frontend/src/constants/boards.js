// Nav config for everything that is not a player leaderboard: the Insight boards and
// tools, Schedule, and the hidden Draft and Explore sections.
//
// The player leaderboards live in constants/leaderboards.js (September 2026). They were
// fourteen boards here, one route each; they are now one page with preset tabs, and
// only their nav entry is assembled below.
import { LEADERBOARD_ITEMS } from "./leaderboards";

/**
 * @typedef {Object} Section
 * @property {string} name      section heading, spanning its columns
 * @property {string[]} columns metric ids in display order
 */

/**
 * @typedef {Object} Board
 * @property {string} id
 * @property {string} label           short label (nav item)
 * @property {string} path            route path
 * @property {string} menuDesc        one-liner in the nav dropdown
 * @property {string} title           page H1
 * @property {string} [description]   page subtitle
 * @property {Section[]} sections     column groups, in display order
 * @property {string[]} columns       every column flattened, in display order
 * @property {string} defaultSort     metric id to sort by initially
 * @property {string} defaultPosition '' for every position, or a comma-separated set
 * @property {boolean} scoring        true = scoring control + scoring-aware columns
 * @property {boolean} [insight]      served by /stats/intelligence
 * @property {string[]} [signed]      columns tinted positive/negative
 */

/** @type {Board[]} */
export const INSIGHT_BOARDS = [
  {
    id: "insight-opportunity",
    label: "Opportunity Rating",
    path: "/insight/opportunity",
    menuDesc: "What players see the most chances",
    title: "Fantasy Opportunity Rating",
    description:
      "0–100 on how much of an offense runs through a player, regardless of what they " +
      "produced.",
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
    menuDesc: "Players scoring less than expected based on usage",
    title: "Buy Low | Positive Regression",
    description:
      "0–100 on players earning more than they're scoring: output below what the " +
      "opportunity has been worth.",
    columns: ["positive_regression_index", "fantasy_opportunity_rating", "fantasy_ppg", "expected_fantasy_ppg", "fantasy_points_over_expected", "tds_over_expected", "opportunity_share", "target_share"],
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
      }
    ],
    percentileColumns: ["positive_regression_index", "fantasy_opportunity_rating", "fantasy_ppg", "expected_fantasy_ppg", "fantasy_points_over_expected", "tds_over_expected", "opportunity_share", "target_share"],
  },
  {
    id: "insight-sell-high",
    label: "Sell High",
    path: "/insight/sell-high",
    menuDesc: "Players scoring more than expected based on usage",
    title: "Sell High",
    description:
      "0–100 on players whose production is running ahead of their opportunity: " +
      "touchdown luck and efficiency above what the opportunity has been worth.",
    columns: ["sell_high_index", "fantasy_opportunity_rating", "fantasy_ppg", "expected_fantasy_ppg", "fantasy_points_over_expected", "tds_over_expected", "efficiency_over_baseline", "opportunity_trend"],
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
      }
    ],
    percentileColumns: ["sell_high_index", "fantasy_opportunity_rating", "fantasy_ppg", "expected_fantasy_ppg", "fantasy_points_over_expected", "tds_over_expected", "efficiency_over_baseline", "opportunity_trend"],
  }
];

/** @type {Board[]} */
export const INSIGHT_TOOLS = [
  {
    id: "insight-sos",
    label: "Strength of Schedule",
    path: "/insight/sos",
    menuDesc: "Positional matchup difficulty",
    title: "Strength of Schedule",
    description: "How difficult each position's matchups are.",
    lede:
      "Difficulty is fantasy points allowed to this position, on a 0-100 scale where " +
      "higher is harder.",
  }
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
    menuDesc: "Weekly schedule with lines",
    title: "Games",
    description:
      "Entire schedule, filterable by season, week and team. Results where they have " +
      "been played, and the betting market's view where they have not.",
  },
  {
    id: "schedule-by-team",
    label: "By Team",
    path: "/schedule/by-team",
    menuDesc: "All teams and all games in one view",
    title: "Schedule by Team",
    description:
      "Every team's season schedule in one grid. Home games are plain, away games carry " +
      "an @. Played weeks are tinted by result.",
  },
  {
    id: "schedule-vegas",
    label: "Vegas Board",
    path: "/schedule/vegas",
    menuDesc: "Implied point totals, betting market lines",
    title: "Vegas Board",
    description:
      "What the betting market expects each offense to score in a week, and the players " +
      "who are in those games. Which players have the best scoring environment this week.",
    lede:
      "Implied total is the game total split by the spread - the points the market " +
      "expects one offense to put up.",
  }
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
      "Expert consensus by default, with our valuation of every player beside it, " +
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
      "board you want to practise against, then graded on what your roster was " +
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
      "your scoring and league size, and the gap between the two. A positive gap is " +
      "a player we rate above the market.",
    lede:
      "Our side is built on expected points, not actual ones: a player who scored " +
      "twelve touchdowns on six touchdowns' worth of usage is valued at six here. " +
      "That is the point: it prices the opportunity, which tends to repeat, rather " +
      "than the finish, which often does not.",
  }
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
      "lines are the medians, so the corners are the story, and every dot is a player " +
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
      "much, and only stats that apply to all of them are shown, so a quarterback and " +
      "a receiver get compared on common ground.",
  }
];


// Nav dropdown groups. Insight leads, since it is the reason to come back. Leaderboards
// lists the five preset tabs; Custom is a tab on the page only.
//
// ⚠️ **Draft and Explore are built but hidden for launch**, which is why DRAFT_ITEMS
// and EXPLORE_ITEMS are still exported above and absent here. Draft has nothing left
// to say now the season has started (it returns as a rookie-draft surface); Explore's
// two builders want another pass before strangers see them. Their routes redirect to
// the home page — see HIDDEN_SECTIONS in App.jsx — so an old link cannot reach them
// either. Un-hiding one is two edits: add its group back to this list, and drop its
// prefix from HIDDEN_SECTIONS.
export const NAV_GROUPS = [
  { label: "Insight", items: [...INSIGHT_TOOLS, ...INSIGHT_BOARDS], match: "/insight" },
  { label: "Schedule", items: SCHEDULE_ITEMS, match: "/schedule" },
  { label: "Leaderboards", items: LEADERBOARD_ITEMS, match: "/leaderboards" }
];

/** Every Insight board, for routing and for saved-view path validation. */
export const ALL_BOARDS = [...INSIGHT_BOARDS];
