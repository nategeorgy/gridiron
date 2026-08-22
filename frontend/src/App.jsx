// Route table for the app.
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { CompareView } from "./pages/CompareView";
import { DraftBoardView } from "./pages/DraftBoardView";
import { Home } from "./pages/Home";
import { InsightView } from "./pages/InsightView";
import { LeaderboardView } from "./pages/LeaderboardView";
import { PlayerProfile } from "./pages/PlayerProfile";
import { ScatterView } from "./pages/ScatterView";
import { SosView } from "./pages/SosView";
import { VegasView } from "./pages/VegasView";
import { StyleGuide } from "./pages/StyleGuide";
import { TeamProfile } from "./pages/TeamProfile";
import { Teams } from "./pages/Teams";
import { ALL_BOARDS, EXPLORE_ITEMS, INSIGHT_TOOLS } from "./constants/boards";

// Explore tools are pages rather than boards, so they map to their own components.
const EXPLORE_VIEWS = {
  "explore-scatter": ScatterView,
  "explore-compare": CompareView,
};

// Insight tools (M6) — same idea, under /insight.
const INSIGHT_TOOL_VIEWS = {
  "insight-draft": DraftBoardView,
  "insight-sos": SosView,
  "insight-vegas": VegasView,
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
