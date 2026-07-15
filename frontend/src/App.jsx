// Route table for the app.
import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Leaderboard } from "./pages/Leaderboard";
import { Teams } from "./pages/Teams";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Leaderboard />} />
        <Route path="teams" element={<Teams />} />
      </Route>
    </Routes>
  );
}
