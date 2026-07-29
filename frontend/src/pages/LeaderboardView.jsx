// Generalized leaderboard, driven by a board config (see constants/boards.js).
// Every /fantasy/* and /nfl/* route renders this with a different board.
// Fantasy boards show the league-scoring editor and scoring-aware columns; NFL
// boards show raw stats with the same filters (season / week / position / type).
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Select } from "../components/ui/Select";
import { ScoringControl } from "../components/ScoringControl";
import { useLeaderboard } from "../hooks/useLeaderboard";
import { useScoring } from "../hooks/useScoring";
import { useMetrics } from "../hooks/useMetrics";
import { formatStat } from "../utils/format";
import { POSITIONS, SEASONS, SEASON_TYPES, WEEKS } from "../constants";

const PAGE_SIZE = 50;
const seasonOptions = SEASONS.map((year) => ({ value: String(year), label: String(year) }));

// Fixed-PPR equivalents used on fantasy boards when the backend can't score yet
// (e.g. a deploy window). Both exist on the old and new backend.
const FANTASY_FALLBACK = { fantasy_points: "fantasy_points_ppr", fantasy_ppg: "fantasy_ppg_ppr" };

export function LeaderboardView({ board }) {
  const [season, setSeason] = useState(String(SEASONS[0]));
  const [week, setWeek] = useState("");
  const [position, setPosition] = useState(board.defaultPosition);
  const [seasonType, setSeasonType] = useState("REG");
  const [metric, setMetric] = useState(board.defaultSort);
  const [offset, setOffset] = useState(0);
  const [scoring, setScoring] = useScoring();
  const { metrics, supportsScoring } = useMetrics();

  // Scoring-aware ids fall back to their fixed-PPR column when the backend can't
  // score them; on NFL boards there are no scoring-aware columns, so this is a no-op.
  const toBackendMetric = (key) =>
    (board.scoring && !supportsScoring && FANTASY_FALLBACK[key]) || key;

  const params = useMemo(
    () => ({
      season: Number(season),
      ...(week ? { week: Number(week) } : {}),
      season_type: seasonType,
      ...(position ? { position } : {}),
      metric: toBackendMetric(metric),
      ...(board.scoring ? { scoring } : {}),
      order: "desc",
      limit: PAGE_SIZE,
      offset,
    }),
    [season, week, position, seasonType, metric, scoring, offset, supportsScoring, board],
  );

  const { data, isLoading, isError, error, isPlaceholderData } = useLeaderboard(params);

  const columns = board.columns;
  const sortOptions = columns.map((key) => ({ value: key, label: metrics[key]?.label ?? key }));
  const rows = data?.data ?? [];
  const total = data?.total ?? 0;

  const withReset = (setter) => (value) => {
    setter(value);
    setOffset(0);
  };

  const sortByColumn = (key) => {
    setMetric(key);
    setOffset(0);
  };

  const changeScoring = (spec) => {
    setScoring(spec);
    setOffset(0);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">{board.title}</h1>
        <p className="mt-1 text-sm text-muted">{board.description}</p>
      </div>

      <div className="glass-card flex flex-wrap gap-3 p-4">
        <Select label="Season" value={season} onChange={withReset(setSeason)} options={seasonOptions} />
        <Select label="Timeframe" value={week} onChange={withReset(setWeek)} options={WEEKS} />
        <Select label="Position" value={position} onChange={withReset(setPosition)} options={POSITIONS} />
        <Select label="Type" value={seasonType} onChange={withReset(setSeasonType)} options={SEASON_TYPES} />
        <Select label="Sort by" value={metric} onChange={withReset(setMetric)} options={sortOptions} />
      </div>

      {board.scoring && supportsScoring && <ScoringControl scoring={scoring} onChange={changeScoring} />}

      <div className="glass-card overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-faint">
              <th className="px-3 py-3 text-right">#</th>
              <th className="px-3 py-3">Player</th>
              <th className="px-3 py-3">Team</th>
              <th className="px-3 py-3 text-right">G</th>
              {columns.map((key) => (
                <th
                  key={key}
                  onClick={() => sortByColumn(key)}
                  className={`cursor-pointer whitespace-nowrap px-3 py-3 text-right transition hover:text-fg ${
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
              <tr key={row.player_id} className="border-b border-line last:border-0 hover:bg-surface-2">
                <td className="stat-num px-3 py-2.5 text-right text-faint">{offset + index + 1}</td>
                <td className="px-3 py-2.5 font-medium">
                  <Link to={`/players/${row.player_id}`} className="text-fg hover:text-accent hover:underline">
                    {row.name}
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  <span className="stat-num text-xs text-muted">{row.team_abbreviation ?? "—"}</span>
                  <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-faint">
                    {row.position}
                  </span>
                </td>
                <td className="stat-num px-3 py-2.5 text-right text-muted">{row.games_played}</td>
                {columns.map((key) => (
                  <td
                    key={key}
                    className={`stat-num px-3 py-2.5 text-right ${
                      metric === key ? "font-semibold text-accent" : "text-fg"
                    }`}
                  >
                    {formatStat(row[toBackendMetric(key)], metrics[key]?.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {isLoading && <div className="p-6 text-center text-sm text-muted">Loading…</div>}
        {isError && (
          <div className="p-6 text-center text-sm text-neg">Failed to load: {error?.message}</div>
        )}
        {!isLoading && !isError && rows.length === 0 && (
          <div className="p-6 text-center text-sm text-muted">No results for these filters.</div>
        )}
      </div>

      <div className="flex items-center justify-between text-sm text-muted">
        <span>
          {total > 0 && (
            <>
              Showing <span className="stat-num text-fg">{offset + 1}</span>–
              <span className="stat-num text-fg">{Math.min(offset + PAGE_SIZE, total)}</span> of{" "}
              <span className="stat-num text-fg">{total}</span>
            </>
          )}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0}
            className="btn-ghost px-3 py-1.5 text-sm transition enabled:hover:!text-accent disabled:opacity-40"
          >
            Prev
          </button>
          <button
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={offset + PAGE_SIZE >= total}
            className="btn-ghost px-3 py-1.5 text-sm transition enabled:hover:!text-accent disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
