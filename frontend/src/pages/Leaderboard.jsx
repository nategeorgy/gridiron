// Leaderboard page: filterable, sortable player rankings in your league scoring.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Select } from "../components/ui/Select";
import { ScoringControl } from "../components/ScoringControl";
import { useLeaderboard } from "../hooks/useLeaderboard";
import { useScoring } from "../hooks/useScoring";
import { useMetrics } from "../hooks/useMetrics";
import { formatStat } from "../utils/format";
import {
  COLUMN_SETS,
  POSITIONS,
  SEASONS,
  SEASON_TYPES,
  SORT_METRICS,
  WEEKS,
} from "../constants";

const PAGE_SIZE = 50;

const seasonOptions = SEASONS.map((year) => ({ value: String(year), label: String(year) }));

// Fixed-PPR equivalents used when the backend doesn't yet support scoring-aware
// metrics (e.g. during a deploy window). Both exist on the old and new backend.
const FANTASY_FALLBACK = { fantasy_points: "fantasy_points_ppr", fantasy_ppg: "fantasy_ppg_ppr" };

export function Leaderboard() {
  const [season, setSeason] = useState(String(SEASONS[0]));
  const [week, setWeek] = useState("");
  const [position, setPosition] = useState("");
  const [seasonType, setSeasonType] = useState("REG");
  const [metric, setMetric] = useState("fantasy_points");
  const [offset, setOffset] = useState(0);
  const [scoring, setScoring] = useScoring();
  const { metrics, supportsScoring } = useMetrics();

  // Translate scoring-aware metric ids to their fixed-PPR fallback when the
  // backend can't score them yet, so we never request a metric it would reject.
  const toBackendMetric = (key) => (!supportsScoring && FANTASY_FALLBACK[key]) || key;

  const params = useMemo(
    () => ({
      season: Number(season),
      ...(week ? { week: Number(week) } : {}),
      season_type: seasonType,
      ...(position ? { position } : {}),
      metric: toBackendMetric(metric),
      scoring,
      order: "desc",
      limit: PAGE_SIZE,
      offset,
    }),
    [season, week, position, seasonType, metric, scoring, offset, supportsScoring],
  );

  const { data, isLoading, isError, error, isPlaceholderData } = useLeaderboard(params);

  const columns = COLUMN_SETS[position] ?? COLUMN_SETS[""];
  const sortOptions = SORT_METRICS.map((key) => ({ value: key, label: metrics[key]?.label ?? key }));
  const rows = data?.data ?? [];
  const total = data?.total ?? 0;

  // Update a filter and reset pagination to the first page.
  const withReset = (setter) => (value) => {
    setter(value);
    setOffset(0);
  };

  const sortByColumn = (key) => {
    setMetric(key);
    setOffset(0);
  };

  // Scoring changes should also snap back to the first page.
  const changeScoring = (spec) => {
    setScoring(spec);
    setOffset(0);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Player Leaderboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          Fantasy and advanced stats across the 2020–2025 seasons, scored in your league
          settings. Click a column to rank by it.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 rounded-lg border border-navy-800 bg-navy-900 p-4">
        <Select label="Season" value={season} onChange={withReset(setSeason)} options={seasonOptions} />
        <Select label="Timeframe" value={week} onChange={withReset(setWeek)} options={WEEKS} />
        <Select label="Position" value={position} onChange={withReset(setPosition)} options={POSITIONS} />
        <Select label="Type" value={seasonType} onChange={withReset(setSeasonType)} options={SEASON_TYPES} />
        <Select label="Sort by" value={metric} onChange={withReset(setMetric)} options={sortOptions} />
      </div>

      {supportsScoring && <ScoringControl scoring={scoring} onChange={changeScoring} />}

      <div className="overflow-x-auto rounded-lg border border-navy-800 bg-navy-900">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-navy-700 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-3 py-3 text-right">#</th>
              <th className="px-3 py-3">Player</th>
              <th className="px-3 py-3">Team</th>
              <th className="px-3 py-3 text-right">G</th>
              {columns.map((key) => (
                <th
                  key={key}
                  onClick={() => sortByColumn(key)}
                  className={`cursor-pointer whitespace-nowrap px-3 py-3 text-right transition hover:text-white ${
                    metric === key ? "text-accent" : ""
                  }`}
                  title={metrics[key]?.label ?? key}
                >
                  {metrics[key]?.short ?? key}
                  {metric === key ? " ↓" : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={isPlaceholderData ? "opacity-60 transition" : "transition"}>
            {rows.map((row, index) => (
              <tr
                key={row.player_id}
                className="border-b border-navy-850 last:border-0 hover:bg-navy-850/60"
              >
                <td className="stat-num px-3 py-2.5 text-right text-slate-500">
                  {offset + index + 1}
                </td>
                <td className="px-3 py-2.5 font-medium">
                  <Link to={`/players/${row.player_id}`} className="text-slate-100 hover:text-accent hover:underline">
                    {row.name}
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  <span className="stat-num text-xs text-slate-400">{row.team_abbreviation ?? "—"}</span>
                  <span className="ml-2 rounded bg-navy-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
                    {row.position}
                  </span>
                </td>
                <td className="stat-num px-3 py-2.5 text-right text-slate-400">{row.games_played}</td>
                {columns.map((key) => (
                  <td
                    key={key}
                    className={`stat-num px-3 py-2.5 text-right ${
                      metric === key ? "font-semibold text-accent" : "text-slate-200"
                    }`}
                  >
                    {formatStat(row[toBackendMetric(key)], metrics[key]?.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {isLoading && <div className="p-6 text-center text-sm text-slate-400">Loading…</div>}
        {isError && (
          <div className="p-6 text-center text-sm text-red-400">
            Failed to load leaderboard: {error?.message}
          </div>
        )}
        {!isLoading && !isError && rows.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-400">No results for these filters.</div>
        )}
      </div>

      <div className="flex items-center justify-between text-sm text-slate-400">
        <span>
          {total > 0 && (
            <>
              Showing <span className="stat-num text-slate-200">{offset + 1}</span>–
              <span className="stat-num text-slate-200">{Math.min(offset + PAGE_SIZE, total)}</span> of{" "}
              <span className="stat-num text-slate-200">{total}</span>
            </>
          )}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0}
            className="rounded-md border border-navy-700 px-3 py-1.5 transition enabled:hover:border-accent enabled:hover:text-white disabled:opacity-40"
          >
            Prev
          </button>
          <button
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={offset + PAGE_SIZE >= total}
            className="rounded-md border border-navy-700 px-3 py-1.5 transition enabled:hover:border-accent enabled:hover:text-white disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
