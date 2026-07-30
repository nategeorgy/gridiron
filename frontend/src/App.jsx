// Route table for the app.
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { InsightView } from "./pages/InsightView";
import { LeaderboardView } from "./pages/LeaderboardView";
import { PlayerProfile } from "./pages/PlayerProfile";
import { Teams } from "./pages/Teams";
import { ALL_BOARDS } from "./constants/boards";

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

        {/* Legacy leaderboard URL → the default fantasy board. */}
        <Route path="leaderboard" element={<Navigate to="/fantasy/leaders" replace />} />

        <Route path="players/:playerId" element={<PlayerProfile />} />
        <Route path="teams" element={<Teams />} />
      </Route>
    </Routes>
  );
}
