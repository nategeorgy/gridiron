// Route table for the app.
import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { LeaderboardView } from "./pages/LeaderboardView";
import { PlayerDashboard } from "./pages/PlayerDashboard";
import { SosView } from "./pages/SosView";
import { GamesView } from "./pages/GamesView";
import { StyleGuide } from "./pages/StyleGuide";
import { TeamProfile } from "./pages/TeamProfile";
import { TeamLeaderboards } from "./pages/TeamLeaderboards";
import { TeamsIndex } from "./pages/TeamsIndex";
import { EXPLORE_ITEMS, PLAYER_ITEMS, SCHEDULE_ITEMS } from "./constants/boards";
import { DEFAULT_GROUP, GROUP_VALUES, LEGACY_BOARD_REDIRECTS } from "./constants/leaderboards";

// Route prefixes that are built but hidden for launch. Everything beneath one
// redirects to the home page.
//
//   draft   — M9's Rankings, Mock Draft and Value Board. The season has started, so a
//             redraft board has nothing left to say; it returns as a rookie-draft
//             surface while the college season runs.
//
// Explore was hidden here too until its September 2026 rebuild.
//
// The pages still live in pages/ and still compile; nothing here deletes them. But
// redirecting is deliberate rather than merely un-linking from the nav: a hidden
// section still has bookmarks, saved views (M5), and — once the site is public —
// search results pointing into it, and finding an unfinished page that way is worse
// than finding no page. Un-hiding a section is two edits: drop its prefix here, and
// restore its group in NAV_GROUPS (constants/boards.js).
const HIDDEN_SECTIONS = ["draft"];

// Schedule (M10), under /schedule. Strength of Schedule moved here from Insight in
// November 2026.
const SCHEDULE_VIEWS = {
  "schedule-games": GamesView,
  "schedule-sos": SosView,
};

// Explore (September 2026): five tools, each its own page, loaded on first visit. They
// are most of a megabyte of charts between them, and a visitor who never opens one
// should not download them with the home page.
const page = (load, name) => lazy(() => load().then((module) => ({ default: module[name] })));
const CompareView = page(() => import("./pages/CompareView"), "CompareView");
const EXPLORE_VIEWS = {
  "explore-scatter": page(() => import("./pages/ScatterView"), "ScatterView"),
  "explore-network": page(() => import("./pages/PassingNetworkView"), "PassingNetworkView"),
  "explore-targets": page(() => import("./pages/TargetAnalysisView"), "TargetAnalysisView"),
  "explore-query": page(() => import("./pages/QueryBuilderView"), "QueryBuilderView"),
};

// A game page (October 2026), loaded on first visit like the Explore tools: it draws the
// passing network and the target map, which a visitor who never opens a game should not
// download with the home page.
const GamePage = page(() => import("./pages/GamePage"), "GamePage");

// The player page (November 2026) draws Explore's scatter, network and target map and a
// dozen charts of its own, so it loads on first visit too.
const PlayerProfile = page(() => import("./pages/PlayerProfile"), "PlayerProfile");

function PageLoading() {
  return <div className="glass-card p-6 text-center text-sm text-muted">Loading…</div>;
}

// Paths that have been retired, and the page that absorbed each. A saved view (M5) and a
// shared link both store a route, and with no route matching, the app renders nothing at
// all (header included), so a retired path has to go somewhere.
//
// Insight was removed in November 2026. Strength of Schedule moved under Schedule; By
// Team and the Vegas board were removed, and the Games page is what is left of them.
// The old player-board paths are redirected by LegacyBoard below, since each one also
// names a position group.
const RETIRED_PAGES = {
  "insight/sos": "/schedule/sos",
  "insight/vegas": "/schedule/games",
  "schedule/vegas": "/schedule/games",
  "schedule/by-team": "/schedule/games",
};

// The Insight boards (and VORP, retired before them) go to the Expected leaderboard tab,
// which carries the expected points and points over expected they were built on. They
// covered every position, so that is the group they land on.
const RETIRED_INSIGHT_BOARDS = Object.fromEntries(
  ["insight/opportunity", "insight/buy-low", "insight/sell-high", "insight/vorp"].map(
    (path) => [path, { tab: "expected", group: "all" }],
  ),
);

/** Redirect keeping the query string: the filters are what a saved view saved. */
function MovedTo({ path }) {
  const { search } = useLocation();
  return <Navigate to={`${path}${search}`} replace />;
}

/**
 * An M12 board path, redirected to the leaderboard tab and position group that answer
 * the same question. Filters survive; a `positions` the old board carried survives too
 * when it is one of the new groups, and otherwise the board's own group replaces it.
 */
function LegacyBoard({ tab, group }) {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  if (!GROUP_VALUES.includes(params.get("positions"))) {
    if (group === DEFAULT_GROUP) params.delete("positions");
    else params.set("positions", group);
  }
  // The old boards' sort ids mostly survive as columns; one that does not is dropped by
  // the page's whitelist, so it needs no handling here.
  const query = params.toString();
  return <Navigate to={`/leaderboards/${tab}${query ? `?${query}` : ""}`} replace />;
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />

        {/* Player leaderboards: one page, the tab in the path. One route rather than one
            per tab, so switching tabs keeps the page (and an open Edit Columns panel). */}
        <Route path="leaderboards" element={<Navigate to="/leaderboards/fantasy" replace />} />
        <Route path="leaderboards/:tab" element={<LeaderboardView />} />

        {/* Schedule (M10): fixtures and strength of schedule. */}
        <Route path="schedule" element={<Navigate to="/schedule/games" replace />} />
        {SCHEDULE_ITEMS.map((item) => {
          const View = SCHEDULE_VIEWS[item.id];
          return (
            <Route
              key={item.id}
              path={item.path.replace(/^\//, "")}
              element={<View key={item.id} board={item} />}
            />
          );
        })}

        {/* Explore: the scatter, passing networks, player comparison, target analysis
            and the Query Builder. */}
        <Route path="explore" element={<Navigate to="/explore/scatter" replace />} />
        {EXPLORE_ITEMS.map((item) => {
          const View = EXPLORE_VIEWS[item.id];
          return (
            <Route
              key={item.id}
              path={item.path.replace(/^\//, "")}
              element={<Suspense fallback={<PageLoading />}><View board={item} /></Suspense>}
            />
          );
        })}

        {/* Hidden for launch — the whole subtree, board editor included. */}
        {HIDDEN_SECTIONS.map((prefix) => (
          <Route key={prefix} path={`${prefix}/*`} element={<Navigate to="/" replace />} />
        ))}

        {/* The Value Board moved to /draft/value in M9, and Draft is now hidden — so
            its old Insight path goes home directly rather than bouncing through a
            redirect into a redirect. */}
        <Route path="insight/draft" element={<Navigate to="/" replace />} />

        {Object.entries(RETIRED_PAGES).map(([retired, current]) => (
          <Route key={retired} path={retired} element={<MovedTo path={current} />} />
        ))}
        {Object.entries({ ...LEGACY_BOARD_REDIRECTS, ...RETIRED_INSIGHT_BOARDS }).map(([retired, target]) => (
          <Route key={retired} path={retired} element={<LegacyBoard {...target} />} />
        ))}

        {/* Players (November 2026): the dashboard, Player Comparison (moved here from
            Explore, its old path redirected) and the tabbed player page, the tab in the
            path. "compare" is a static segment, so it outranks a player id. */}
        <Route path="players" element={<PlayerDashboard />} />
        <Route
          path="players/compare"
          element={<Suspense fallback={<PageLoading />}><CompareView board={PLAYER_ITEMS.find((item) => item.id === "players-compare")} /></Suspense>}
        />
        <Route path="explore/compare" element={<MovedTo path="/players/compare" />} />
        {/* One route with an optional tab, so switching tabs keeps the page (and the
            season picked on it) rather than mounting a new one. */}
        <Route path="players/:playerId/:tab?" element={<Suspense fallback={<PageLoading />}><PlayerProfile /></Suspense>} />
        <Route path="teams" element={<TeamsIndex />} />
        <Route path="teams/leaderboards" element={<Navigate to="/teams/leaderboards/overview" replace />} />
        <Route path="teams/leaderboards/:tab" element={<TeamLeaderboards />} />
        <Route path="teams/:teamId" element={<TeamProfile />} />
        <Route path="games/:gameId" element={<Suspense fallback={<PageLoading />}><GamePage /></Suspense>} />

        {/* Design-token studio — a build tool, not a page of the product, so it
            exists only under `npm run dev` and is never linked from the nav.
            React Router ignores non-element children, which is what makes this
            inline conditional work. */}
        {import.meta.env.DEV && <Route path="styleguide" element={<StyleGuide />} />}
      </Route>
    </Routes>
  );
}
