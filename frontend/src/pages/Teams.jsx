// Team leaderboard: ranked offensive production, filterable by season.
import { useMemo, useState } from "react";
import { Select } from "../components/ui/Select";
import { useTeamLeaderboard } from "../hooks/useTeamLeaderboard";
import { formatStat } from "../utils/format";
import { SEASONS, SEASON_TYPES, TEAM_COLUMNS, TEAM_METRICS } from "../constants";

const seasonOptions = SEASONS.map((year) => ({ value: String(year), label: String(year) }));
const sortOptions = TEAM_COLUMNS.map((key) => ({ value: key, label: TEAM_METRICS[key].label }));

export function Teams() {
  const [season, setSeason] = useState(String(SEASONS[0]));
  const [seasonType, setSeasonType] = useState("REG");
  const [metric, setMetric] = useState("total_yards");

  const params = useMemo(
    () => ({ season: Number(season), season_type: seasonType, metric, order: "desc" }),
    [season, seasonType, metric],
  );

  const { data, isLoading, isError, error, isPlaceholderData } = useTeamLeaderboard(params);
  const rows = data?.data ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Team Leaderboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          Offensive production by team. Click a column to rank by it.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 rounded-lg border border-navy-800 bg-navy-900 p-4">
        <Select label="Season" value={season} onChange={setSeason} options={seasonOptions} />
        <Select label="Type" value={seasonType} onChange={setSeasonType} options={SEASON_TYPES} />
        <Select label="Sort by" value={metric} onChange={setMetric} options={sortOptions} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-navy-800 bg-navy-900">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-navy-700 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-3 py-3 text-right">#</th>
              <th className="px-3 py-3">Team</th>
              <th className="px-3 py-3 text-right">G</th>
              {TEAM_COLUMNS.map((key) => (
                <th
                  key={key}
                  onClick={() => setMetric(key)}
                  className={`cursor-pointer whitespace-nowrap px-3 py-3 text-right transition hover:text-white ${
                    metric === key ? "text-accent" : ""
                  }`}
                  title={TEAM_METRICS[key].label}
                >
                  {TEAM_METRICS[key].short}
                  {metric === key ? " ↓" : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={isPlaceholderData ? "opacity-60 transition" : "transition"}>
            {rows.map((row, index) => (
              <tr key={row.team_id} className="border-b border-navy-850 last:border-0 hover:bg-navy-850/60">
                <td className="stat-num px-3 py-2.5 text-right text-slate-500">{index + 1}</td>
                <td className="px-3 py-2.5">
                  <span className="font-medium text-slate-100">{row.name}</span>
                  <span className="stat-num ml-2 text-xs text-slate-500">{row.abbreviation}</span>
                </td>
                <td className="stat-num px-3 py-2.5 text-right text-slate-400">{row.games}</td>
                {TEAM_COLUMNS.map((key) => (
                  <td
                    key={key}
                    className={`stat-num px-3 py-2.5 text-right ${
                      metric === key ? "font-semibold text-accent" : "text-slate-200"
                    }`}
                  >
                    {formatStat(row[key], TEAM_METRICS[key].format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {isLoading && <div className="p-6 text-center text-sm text-slate-400">Loading…</div>}
        {isError && (
          <div className="p-6 text-center text-sm text-red-400">
            Failed to load: {error?.message}
          </div>
        )}
      </div>
    </div>
  );
}
