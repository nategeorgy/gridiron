// Player profile: header, season summary, PPR trend chart, and game log.
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Select } from "../components/ui/Select";
import { FantasyTrendChart } from "../components/charts/FantasyTrendChart";
import { usePlayer, usePlayerGameLog } from "../hooks/usePlayer";
import { formatStat } from "../utils/format";
import { GAMELOG_COLUMN_SETS, METRICS, SUMMARY_STATS } from "../constants";

function Panel({ children, className = "" }) {
  return (
    <div className={`rounded-lg border border-navy-800 bg-navy-900 ${className}`}>{children}</div>
  );
}

function ProfileHeader({ player }) {
  return (
    <Panel className="flex items-center gap-4 p-5">
      {player.headshot_url ? (
        <img
          src={player.headshot_url}
          alt={player.name}
          className="h-20 w-20 rounded-full border border-navy-700 bg-navy-800 object-cover"
        />
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded-full border border-navy-700 bg-navy-800 text-2xl font-bold text-slate-500">
          {player.name?.[0]}
        </div>
      )}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{player.name}</h1>
        <div className="mt-1 flex items-center gap-2 text-sm text-slate-400">
          <span className="rounded bg-navy-800 px-2 py-0.5 text-xs font-semibold text-accent">
            {player.position}
          </span>
          <span className="stat-num">{player.team_abbreviation ?? "FA"}</span>
          {player.jersey_number != null && (
            <span className="stat-num text-slate-500">#{player.jersey_number}</span>
          )}
        </div>
      </div>
    </Panel>
  );
}

function SummaryCards({ position, games }) {
  const stats = SUMMARY_STATS[position] ?? SUMMARY_STATS.WR;
  const gameCount = games.length;

  const values = stats.map((stat) => {
    const sum = games.reduce((acc, game) => acc + (game[stat.base ?? stat.key] ?? 0), 0);
    const value = stat.agg === "ppg" ? (gameCount ? sum / gameCount : 0) : sum;
    return { ...stat, value };
  });

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
      <Panel className="p-3">
        <div className="text-xs uppercase tracking-wide text-slate-500">Games</div>
        <div className="stat-num mt-1 text-xl font-semibold text-slate-100">{gameCount}</div>
      </Panel>
      {values.map((stat) => (
        <Panel key={stat.key} className="p-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            {METRICS[stat.key].short}
          </div>
          <div className="stat-num mt-1 text-xl font-semibold text-slate-100">
            {formatStat(stat.value, METRICS[stat.key].format)}
          </div>
        </Panel>
      ))}
    </div>
  );
}

export function PlayerProfile() {
  const { playerId } = useParams();
  const playerQuery = usePlayer(playerId);
  const gameLogQuery = usePlayerGameLog(playerId);

  const allGames = gameLogQuery.data?.data ?? [];
  // Regular-season games only, so season totals match the leaderboard.
  const regGames = useMemo(
    () => allGames.filter((game) => game.season_type === "REG"),
    [allGames],
  );
  const seasons = useMemo(
    () => [...new Set(regGames.map((game) => game.season))].sort((a, b) => b - a),
    [regGames],
  );

  const [season, setSeason] = useState(null);
  const activeSeason = season ?? seasons[0];
  const seasonGames = useMemo(
    () =>
      regGames
        .filter((game) => game.season === activeSeason)
        .sort((a, b) => a.week - b.week),
    [regGames, activeSeason],
  );

  const player = playerQuery.data;
  const position = player?.position ?? "WR";
  const columns = GAMELOG_COLUMN_SETS[position] ?? GAMELOG_COLUMN_SETS.WR;

  if (playerQuery.isLoading) {
    return <div className="p-6 text-center text-sm text-slate-400">Loading…</div>;
  }
  if (playerQuery.isError) {
    return (
      <div className="p-6 text-center text-sm text-red-400">
        Player not found.{" "}
        <Link to="/" className="text-accent hover:underline">Back to leaderboard</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link to="/" className="inline-block text-sm text-slate-400 hover:text-accent">
        ← Leaderboard
      </Link>

      <ProfileHeader player={player} />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Season Stats</h2>
        {seasons.length > 0 && (
          <Select
            value={String(activeSeason)}
            onChange={(value) => setSeason(Number(value))}
            options={seasons.map((year) => ({ value: String(year), label: String(year) }))}
          />
        )}
      </div>

      {seasonGames.length === 0 ? (
        <Panel className="p-8 text-center text-sm text-slate-400">
          No regular-season game data for this player.
        </Panel>
      ) : (
        <>
          <SummaryCards position={position} games={seasonGames} />

          <Panel className="p-4">
            <div className="mb-2 text-sm font-medium text-slate-300">
              PPR Fantasy Points by Week — {activeSeason}
            </div>
            <FantasyTrendChart games={seasonGames} />
          </Panel>

          <Panel className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-navy-700 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-3 text-right">WK</th>
                  <th className="px-3 py-3">Opp</th>
                  {columns.map((key) => (
                    <th key={key} className="whitespace-nowrap px-3 py-3 text-right" title={METRICS[key].label}>
                      {METRICS[key].short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {seasonGames.map((game) => (
                  <tr key={game.game_id} className="border-b border-navy-850 last:border-0 hover:bg-navy-850/60">
                    <td className="stat-num px-3 py-2.5 text-right text-slate-400">{game.week}</td>
                    <td className="stat-num px-3 py-2.5 text-slate-300">{game.opponent_abbreviation ?? "—"}</td>
                    {columns.map((key) => (
                      <td key={key} className="stat-num px-3 py-2.5 text-right text-slate-200">
                        {formatStat(game[key], METRICS[key].format)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </>
      )}
    </div>
  );
}
