// Route table for the app.
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { InsightView } from "./pages/InsightView";
import { LeaderboardView } from "./pages/LeaderboardView";
import { PlayerProfile } from "./pages/PlayerProfile";
import { SosView } from "./pages/SosView";
import { VegasView } from "./pages/VegasView";
import { GamesView } from "./pages/GamesView";
import { ScheduleGridView } from "./pages/ScheduleGridView";
import { StyleGuide } from "./pages/StyleGuide";
import { TeamProfile } from "./pages/TeamProfile";
import { Teams } from "./pages/Teams";
import { ALL_BOARDS, INSIGHT_TOOLS, SCHEDULE_ITEMS } from "./constants/boards";

// Route prefixes that are built but hidden for launch. Everything beneath one
// redirects to the home page.
//
//   draft   — M9's Rankings, Mock Draft and Value Board. The season has started, so a
//             redraft board has nothing left to say; it returns as a rookie-draft
//             surface while the college season runs.
//   explore — M4's Scatter and Compare builders, pending another pass.
//
// The pages still live in pages/ and still compile; nothing here deletes them. But
// redirecting is deliberate rather than merely un-linking from the nav: a hidden
// section still has bookmarks, saved views (M5), and — once the site is public —
// search results pointing into it, and finding an unfinished page that way is worse
// than finding no page. Un-hiding a section is two edits: drop its prefix here, and
// restore its group in NAV_GROUPS (constants/boards.js).
const HIDDEN_SECTIONS = ["draft", "explore"];

// Insight tools (M6) — pages rather than boards, so they map to their own components.
const INSIGHT_TOOL_VIEWS = {
  "insight-sos": SosView,
};

// Schedule (M10) — under /schedule. The Vegas board is the M6.4 page, moved here.
const SCHEDULE_VIEWS = {
  "schedule-games": GamesView,
  "schedule-by-team": ScheduleGridView,
  "schedule-vegas": VegasView,
};

// Board paths that have been retired, and the board that absorbed each. A saved view
// (M5) and a shared link both store a route, and with no route matching, the app
// renders nothing at all — header included — so a retired path has to go somewhere.
//
// `insight/vorp` is the newest entry: VORP was pulled from the product before launch,
// and Opportunity Rating is the nearest surviving board — it answers the question
// people were mostly asking VORP, which is who is actually worth starting.
const RETIRED_BOARDS = {
  "fantasy/leaders": "/fantasy/all",
  "fantasy/expected": "/fantasy/all",
  "nfl/all-general": "/nfl/all",
  "nfl/passing-general": "/nfl/passing",
  "nfl/receiving-general": "/nfl/receiving",
  "nfl/rushing-general": "/nfl/rushing",
  "insight/vorp": "/insight/opportunity",
};

/** Redirect keeping the query string: the filters are what a saved view saved. */
function MovedTo({ path }) {
  const { search } = useLocation();
  return <Navigate to={`${path}${search}`} replace />;
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />

        {/* One route per board (Insight + fantasy + NFL). Insight boards are served by
            a different endpoint, so they render InsightView instead. The key forces a
            fresh instance per board so filters/sort reset to that board's defaults. */}
        {ALL_BOARDS.map((board) => {
          const View = board.insight ? InsightView : LeaderboardView;
          return (
            <Route
              key={board.id}
              path={board.path.replace(/^\//, "")}
              element={<View key={board.id} board={board} />}
            />
          );
        })}

        {/* Insight tools (M6): Strength of Schedule, which is a grid rather than a
            ranked table, so it is a page not a board config. */}
        {INSIGHT_TOOLS.map((item) => {
          const View = INSIGHT_TOOL_VIEWS[item.id];
          return (
            <Route
              key={item.id}
              path={item.path.replace(/^\//, "")}
              element={<View key={item.id} board={item} />}
            />
          );
        })}

        {/* Schedule (M10): fixtures, the season grid, and the betting board. */}
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

        {/* Hidden for launch — the whole subtree, board editor included. */}
        {HIDDEN_SECTIONS.map((prefix) => (
          <Route key={prefix} path={`${prefix}/*`} element={<Navigate to="/" replace />} />
        ))}

        {/* The Value Board moved to /draft/value in M9, and Draft is now hidden — so
            its old Insight path goes home directly rather than bouncing through a
            redirect into a redirect. */}
        <Route path="insight/draft" element={<Navigate to="/" replace />} />

        {/* The Vegas board moved out of Insight ▾ in M10: redirected, not renamed, so
            shared links and saved views survive. */}
        <Route path="insight/vegas" element={<Navigate to="/schedule/vegas" replace />} />

        {/* Legacy leaderboard URL → the default fantasy board. */}
        <Route path="leaderboard" element={<Navigate to="/fantasy/all" replace />} />
        {Object.entries(RETIRED_BOARDS).map(([retired, current]) => (
          <Route key={retired} path={retired} element={<MovedTo path={current} />} />
        ))}

        <Route path="players/:playerId" element={<PlayerProfile />} />
        <Route path="teams" element={<Teams />} />
        <Route path="teams/:teamId" element={<TeamProfile />} />

        {/* Design-token studio — a build tool, not a page of the product, so it
            exists only under `npm run dev` and is never linked from the nav.
            React Router ignores non-element children, which is what makes this
            inline conditional work. */}
        {import.meta.env.DEV && <Route path="styleguide" element={<StyleGuide />} />}
      </Route>
    </Routes>
  );
}
