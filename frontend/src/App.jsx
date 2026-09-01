// Route table for the app.
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { BoardEditor } from "./pages/BoardEditor";
import { CompareView } from "./pages/CompareView";
import { DraftBoardView } from "./pages/DraftBoardView";
import { MockDraftView } from "./pages/MockDraftView";
import { RankingsView } from "./pages/RankingsView";
import { Home } from "./pages/Home";
import { InsightView } from "./pages/InsightView";
import { LeaderboardView } from "./pages/LeaderboardView";
import { PlayerProfile } from "./pages/PlayerProfile";
import { ScatterView } from "./pages/ScatterView";
import { SosView } from "./pages/SosView";
import { VegasView } from "./pages/VegasView";
import { GamesView } from "./pages/GamesView";
import { ScheduleGridView } from "./pages/ScheduleGridView";
import { StyleGuide } from "./pages/StyleGuide";
import { TeamProfile } from "./pages/TeamProfile";
import { Teams } from "./pages/Teams";
import {
  ALL_BOARDS,
  DRAFT_ITEMS,
  EXPLORE_ITEMS,
  INSIGHT_TOOLS,
  SCHEDULE_ITEMS,
} from "./constants/boards";

// Explore tools are pages rather than boards, so they map to their own components.
const EXPLORE_VIEWS = {
  "explore-scatter": ScatterView,
  "explore-compare": CompareView,
};

// Insight tools (M6) — same idea, under /insight.
const INSIGHT_TOOL_VIEWS = {
  "insight-sos": SosView,
};

// Schedule (M10) — under /schedule. The Vegas board is the M6.4 page, moved here.
const SCHEDULE_VIEWS = {
  "schedule-games": GamesView,
  "schedule-by-team": ScheduleGridView,
  "schedule-vegas": VegasView,
};

// Draft (M9) — under /draft. The Value Board is the M6.1 page, moved here.
const DRAFT_VIEWS = {
  "draft-rankings": RankingsView,
  "draft-mock": MockDraftView,
  "draft-value": DraftBoardView,
};

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

        {/* Insight tools (M6): the Draft Value Board, which compares two rankings
            rather than ranking one metric, so it is a page not a board config. */}
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

        {/* Draft (M9): rankings, the mock draft room, and the value board. */}
        {DRAFT_ITEMS.map((item) => {
          const View = DRAFT_VIEWS[item.id];
          return (
            <Route
              key={item.id}
              path={item.path.replace(/^\//, "")}
              element={<View key={item.id} board={item} />}
            />
          );
        })}

        {/* The board editor is its own route so a board being built is a URL you can
            come back to, rather than a modal that dies with the page. */}
        <Route path="draft/boards/:boardId" element={<BoardEditor />} />

        {/* The Value Board moved out of Insight ▾ in M9. Redirected rather than
            renamed, so shared links and saved views keep working. */}
        <Route path="insight/draft" element={<Navigate to="/draft/value" replace />} />

        {/* The Vegas board moved out of Insight ▾ in M10, for the same reason and with
            the same treatment: redirected, so shared links and saved views survive. */}
        <Route path="insight/vegas" element={<Navigate to="/schedule/vegas" replace />} />

        {/* Explore tools (M4): scatter + comparison builders. */}
        {EXPLORE_ITEMS.map((item) => {
          const View = EXPLORE_VIEWS[item.id];
          return (
            <Route
              key={item.id}
              path={item.path.replace(/^\//, "")}
              element={<View key={item.id} board={item} />}
            />
          );
        })}

        {/* Legacy leaderboard URL → the default fantasy board. */}
        <Route path="leaderboard" element={<Navigate to="/fantasy/leaders" replace />} />

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
