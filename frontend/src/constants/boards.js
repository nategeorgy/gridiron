// Nav config for everything that is not a player leaderboard: Schedule, Players,
// Explore, and the hidden Draft section.
//
// The player leaderboards live in constants/leaderboards.js (September 2026). They were
// fourteen boards here, one route each; they are now one page with preset tabs, and
// only their nav entry is assembled below.
import { LEADERBOARD_ITEMS } from "./leaderboards";

// --- Schedule (M10) ---
// The fixture list and strength of schedule. SOS moved here from Insight in November
// 2026, when Insight was removed along with its three boards (Opportunity Rating, Buy
// Low, Sell High); By Team and the Vegas board were removed at the same time. Every
// retired path redirects (App.jsx), so shared links and saved views survive.
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
    id: "schedule-sos",
    label: "Strength of Schedule",
    path: "/schedule/sos",
    menuDesc: "Positional matchup difficulty",
    title: "Strength of Schedule",
    description: "How difficult each position's matchups are.",
    lede:
      "Difficulty is fantasy points allowed to this position, on a 0-100 scale where " +
      "higher is harder.",
  },
];


// --- Draft (M9) ---
// The fourth product surface. Rankings is the board you read; Mock Draft is the room
// you practise in; the Value Board is the M6.1 comparison, moved here from Insight ▾
// (since removed) because a draft tool belongs in the draft menu.
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

// --- Explore (September 2026) ---
// Tools rather than ranked tables, so they have no `columns` and route to their own
// pages; they share the nav-item shape so the dropdown can render them. Names and
// subheadings are Nate's, as he wrote them.
export const EXPLORE_ITEMS = [
  {
    id: "explore-scatter",
    label: "Scatter",
    path: "/explore/scatter",
    menuDesc: "Visualize how players rank between two stats",
    title: "Scatter",
  },
  {
    id: "explore-network",
    label: "Passing Network",
    path: "/explore/network",
    menuDesc: "Where each quarterback's targets go",
    title: "Passing Network",
  },
  {
    id: "explore-targets",
    label: "Target Analysis",
    path: "/explore/targets",
    menuDesc: "Where and how deep players are targeted",
    title: "Target Analysis",
    description: "How deep and to which side each player is targeted.",
  },
  {
    id: "explore-query",
    label: "Query Builder",
    path: "/explore/query",
    menuDesc: "Search for games and seasons by any stat",
    title: "Query Builder",
    description: "Search every game and season since 2009 by any stat.",
  },
];

// --- Players (November 2026) ---
// The Player Dashboard (search any player, with last week's leaders) and Player
// Comparison, moved here from Explore; its old path redirects (App.jsx).
export const PLAYER_ITEMS = [
  {
    id: "players-dashboard",
    label: "Player Dashboard",
    path: "/players",
    menuDesc: "Search any player, with last week's leaders",
    title: "Player Dashboard",
  },
  {
    id: "players-compare",
    label: "Player Comparison",
    path: "/players/compare",
    menuDesc: "Compare up to five players side by side",
    title: "Player Comparison",
    description: "Up to five players side by side. Each player can be a different season.",
  },
];

/** The Explore dropdown. Rendered after Teams (components/Layout.jsx). */
export const EXPLORE_GROUP = { label: "Explore", items: EXPLORE_ITEMS, match: "/explore" };


// Nav dropdown groups. Leaderboards lists the five preset tabs; Custom is a tab on the
// page only. Insight led this list until November 2026, when it was removed.
//
// ⚠️ **Draft is built but hidden**, which is why DRAFT_ITEMS is still exported above
// and absent here: it has nothing left to say now the season has started (it returns
// as a rookie-draft surface). Its routes redirect to the home page (HIDDEN_SECTIONS in
// App.jsx), so an old link cannot reach it either. Un-hiding it is two edits: add its
// group back to this list, and drop its prefix from HIDDEN_SECTIONS. Explore is live
// again (September 2026) and is rendered after Teams, from EXPLORE_GROUP.
export const NAV_GROUPS = [
  { label: "Schedule", items: SCHEDULE_ITEMS, match: "/schedule" },
  { label: "Leaderboards", items: LEADERBOARD_ITEMS, match: "/leaderboards" },
  // Between Leaderboards and Teams, which Layout renders after this list.
  { label: "Players", items: PLAYER_ITEMS, match: "/players" },
];
