// Route table for the app.
import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { Leaderboard } from "./pages/Leaderboard";
import { PlayerProfile } from "./pages/PlayerProfile";
import { Teams } from "./pages/Teams";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="leaderboard" element={<Leaderboard />} />
        <Route path="players/:playerId" element={<PlayerProfile />} />
        <Route path="teams" element={<Teams />} />
      </Route>
    </Routes>
  );
}
