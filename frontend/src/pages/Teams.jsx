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
        <h1 className="text-2xl font-bold tracking-tight text-fg">Team Leaderboard</h1>
        <p className="mt-1 text-sm text-muted">
          Offensive production by team. Click a column to rank by it.
        </p>
      </div>

      <div className="glass-card flex flex-wrap gap-3 p-4">
        <Select label="Season" value={season} onChange={setSeason} options={seasonOptions} />
        <Select label="Type" value={seasonType} onChange={setSeasonType} options={SEASON_TYPES} />
        <Select label="Sort by" value={metric} onChange={setMetric} options={sortOptions} />
      </div>

      <div className="glass-card overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-faint">
              <th className="px-3 py-3 text-right">#</th>
              <th className="px-3 py-3">Team</th>
              <th className="px-3 py-3 text-right">G</th>
              {TEAM_COLUMNS.map((key) => (
                <th
                  key={key}
                  onClick={() => setMetric(key)}
                  className={`cursor-pointer whitespace-nowrap px-3 py-3 text-right transition hover:text-fg ${
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
              <tr key={row.team_id} className="border-b border-line last:border-0 hover:bg-surface-2">
                <td className="stat-num px-3 py-2.5 text-right text-faint">{index + 1}</td>
                <td className="px-3 py-2.5">
                  <span className="font-medium text-fg">{row.name}</span>
                  <span className="stat-num ml-2 text-xs text-faint">{row.abbreviation}</span>
                </td>
                <td className="stat-num px-3 py-2.5 text-right text-muted">{row.games}</td>
                {TEAM_COLUMNS.map((key) => (
                  <td
                    key={key}
                    className={`stat-num px-3 py-2.5 text-right ${
                      metric === key ? "font-semibold text-accent" : "text-fg"
                    }`}
                  >
                    {formatStat(row[key], TEAM_METRICS[key].format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {isLoading && <div className="p-6 text-center text-sm text-muted">Loading…</div>}
        {isError && (
          <div className="p-6 text-center text-sm text-neg">
            Failed to load: {error?.message}
          </div>
        )}
      </div>
    </div>
  );
}
