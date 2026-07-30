// The ranked stat table shared by the leaderboard boards and the Insight boards.
// Column headers are click-to-sort; the active sort column is accented. Signed
// columns (gaps and trends) are tinted positive/negative because their sign is the
// whole point — "+4.6 over expected" and "−4.6" mean opposite things.
import { Link } from "react-router-dom";
import { formatStat } from "../utils/format";

export function StatTable({
  columns,
  rows,
  metrics,
  sortMetric,
  onSort,
  offset = 0,
  // Maps a display column to the row field holding its value (used by the
  // leaderboard's fixed-PPR fallback). Identity by default.
  columnKey = (key) => key,
  signedColumns = [],
  isLoading = false,
  isError = false,
  error = null,
  dimmed = false,
  emptyMessage = "No results for these filters.",
}) {
  const signed = new Set(signedColumns);

  const valueClass = (key, value) => {
    if (sortMetric === key) return "font-semibold text-accent";
    if (signed.has(key) && typeof value === "number" && value !== 0) {
      return value > 0 ? "text-pos" : "text-neg";
    }
    return "text-fg";
  };

  return (
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
                onClick={() => onSort(key)}
                className={`cursor-pointer whitespace-nowrap px-3 py-3 text-right transition hover:text-fg ${
                  sortMetric === key ? "text-accent" : ""
                }`}
                title={metrics[key]?.description ?? metrics[key]?.label ?? key}
              >
                {metrics[key]?.short ?? key}
                {sortMetric === key ? " ↓" : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={dimmed ? "opacity-60 transition" : "transition"}>
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
              {columns.map((key) => {
                const value = row[columnKey(key)];
                return (
                  <td key={key} className={`stat-num px-3 py-2.5 text-right ${valueClass(key, value)}`}>
                    {formatStat(value, metrics[key]?.format)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {isLoading && <div className="p-6 text-center text-sm text-muted">Loading…</div>}
      {isError && (
        <div className="p-6 text-center text-sm text-neg">Failed to load: {error?.message}</div>
      )}
      {!isLoading && !isError && rows.length === 0 && (
        <div className="p-6 text-center text-sm text-muted">{emptyMessage}</div>
      )}
    </div>
  );
}

/** Prev/next pager shared by the ranked pages. */
export function TablePager({ offset, pageSize, total, onOffsetChange }) {
  return (
    <div className="flex items-center justify-between text-sm text-muted">
      <span>
        {total > 0 && (
          <>
            Showing <span className="stat-num text-fg">{offset + 1}</span>–
            <span className="stat-num text-fg">{Math.min(offset + pageSize, total)}</span> of{" "}
            <span className="stat-num text-fg">{total}</span>
          </>
        )}
      </span>
      <div className="flex gap-2">
        <button
          onClick={() => onOffsetChange(Math.max(0, offset - pageSize))}
          disabled={offset === 0}
          className="btn-ghost px-3 py-1.5 text-sm transition enabled:hover:!text-accent disabled:opacity-40"
        >
          Prev
        </button>
        <button
          onClick={() => onOffsetChange(offset + pageSize)}
          disabled={offset + pageSize >= total}
          className="btn-ghost px-3 py-1.5 text-sm transition enabled:hover:!text-accent disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
