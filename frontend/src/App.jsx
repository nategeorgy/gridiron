// Route table for the app.
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { CompareView } from "./pages/CompareView";
import { Home } from "./pages/Home";
import { InsightView } from "./pages/InsightView";
import { LeaderboardView } from "./pages/LeaderboardView";
import { PlayerProfile } from "./pages/PlayerProfile";
import { ScatterView } from "./pages/ScatterView";
import { Teams } from "./pages/Teams";
import { ALL_BOARDS, EXPLORE_ITEMS } from "./constants/boards";

// Explore tools are pages rather than boards, so they map to their own components.
const EXPLORE_VIEWS = {
  "explore-scatter": ScatterView,
  "explore-compare": CompareView,
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
      </Route>
    </Routes>
  );
}
