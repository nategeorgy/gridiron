// The ranked stat table shared by the leaderboard boards and the Insight boards.
//
// Three things it does that a plain table does not:
//
// **Sections.** A board's columns arrive grouped (see constants/boards.js) and render
// under a spanning header row. A 35-column receiving board is unreadable as one flat
// sweep of abbreviations; the same 35 columns under General / Expected / Advanced /
// Next Gen / Other / Opportunity read as six short tables sharing a row.
//
// **Percentiles.** Each value can carry its rank within that player's own position for
// that season, as a small tinted number beneath it. Every number on a leaderboard
// answers "how much" and almost none answer "is that a lot" — 3.0 yards of separation
// is meaningless to most readers until it says 56th percentile. The scale DIVERGES
// around the median rather than ramping in one direction: on a 30-column row a
// single-direction ramp turns everything green and distinguishes nothing, while
// neutral-at-50 makes an unusual row visible at a glance.
//
// **Direction is the API's problem, not this component's.** The backend inverts
// `higher_is_better` before reporting, so 95th percentile always means good — even for
// drops and interceptions. Nothing here needs to know which way a metric points.
//
// Column headers are click-to-sort; the active sort column is accented. Signed columns
// (gaps and trends) are tinted positive/negative because their sign is the whole point.
import { Link } from "react-router-dom";
import { FavoriteStar } from "./FavoriteStar";
import { PositionTag } from "./PositionTag";
import { formatStat } from "../utils/format";

/** Tailwind-free tint for a percentile, diverging around the median. */
function percentileColor(percentile) {
  if (percentile === null || percentile === undefined) return undefined;
  const distance = Math.abs(percentile - 50) / 50; // 0 at the median, 1 at the extremes
  const strength = Math.round(distance * 100);
  const hue = percentile >= 50 ? "var(--pos)" : "var(--neg)";
  return `color-mix(in srgb, ${hue} ${strength}%, var(--faint))`;
}

export function StatTable({
  columns,
  rows,
  metrics,
  sortMetric,
  onSort,
  offset = 0,
  // Column groups. Optional: without them the table renders one flat header row, which
  // is what the narrower boards (and the Insight boards) still want.
  sections = null,
  // Maps a display column to the row field holding its value (used by the
  // leaderboard's fixed-PPR fallback). Identity by default.
  columnKey = (key) => key,
  signedColumns = [],
  // Columns the selected season has no data for (M8). Their headers are dimmed and
  // inert rather than hidden: a receiving board that quietly drops Air Yards for 2004
  // leaves the reader thinking the page is broken, while a greyed header with a
  // tooltip tells them something true about 2004.
  unavailableColumns = [],
  showPercentiles = true,
  isLoading = false,
  isError = false,
  error = null,
  dimmed = false,
  emptyMessage = "No results for these filters.",
}) {
  const signed = new Set(signedColumns);
  const unavailable = new Set(unavailableColumns);

  // Which column starts each section, so a divider can mark the boundary.
  const sectionStart = new Set((sections ?? []).map((section) => section.columns[0]));

  // The sorted column is marked in its *header* only. Accenting every value in it
  // spends the one colour that means "good" on something that means "you clicked
  // here", and on a 30-column board that reads as a green stripe with no meaning.
  const valueClass = (key, value) => {
    if (signed.has(key) && typeof value === "number" && value !== 0) {
      return value > 0 ? "text-pos" : "text-neg";
    }
    return "text-fg";
  };

  const headerCell = (key) => {
    const isUnavailable = unavailable.has(key);
    return (
      <th
        key={key}
        onClick={isUnavailable ? undefined : () => onSort(key)}
        className={`whitespace-nowrap px-3 py-2.5 text-center align-bottom transition ${
          sectionStart.has(key) ? "border-l border-line" : ""
        } ${
          isUnavailable
            ? "cursor-default opacity-40"
            : `cursor-pointer hover:text-fg ${sortMetric === key ? "text-accent" : ""}`
        }`}
        title={
          isUnavailable
            ? "Not recorded in this season"
            : (metrics[key]?.description ?? metrics[key]?.label ?? key)
        }
      >
        {/* The id is the last resort, and only reachable with a stale /metrics
            cache — but underscores in a header look like a crash, so soften it. */}
        {metrics[key]?.short ?? key.replace(/_/g, " ")}
        {sortMetric === key && !isUnavailable ? " ↓" : ""}
      </th>
    );
  };

  return (
    <div className="glass-card overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          {sections && (
            <tr className="border-b border-line text-[10px] uppercase tracking-[0.11em] text-faint">
              {/* Rank, player, team, games — the identity block the sections sit beside. */}
              <th colSpan={4} className="px-3 py-1.5" />
              {sections.map((section) => (
                <th
                  key={section.name}
                  colSpan={section.columns.length}
                  className="border-l border-line px-3 py-1.5 text-center"
                >
                  {/* Section headings read as structure, not as data — same weight and
                      ink as a player name, so the accent stays reserved for meaning. */}
                  <span className="font-bold text-fg">{section.name}</span>
                </th>
              ))}
            </tr>
          )}
          <tr className="border-b border-line text-xs uppercase tracking-wide text-faint">
            <th className="px-3 py-2.5 text-right">#</th>
            <th className="px-3 py-2.5">Player</th>
            <th className="px-3 py-2.5">Team</th>
            <th className="px-3 py-2.5 text-center">G</th>
            {columns.map(headerCell)}
          </tr>
        </thead>
        <tbody className={dimmed ? "opacity-60 transition" : "transition"}>
          {rows.map((row, index) => (
            <tr key={row.player_id} className="border-b border-line last:border-0 hover:bg-surface-2">
              <td className="stat-num px-3 py-2 text-right text-faint">{offset + index + 1}</td>
              <td className="px-3 py-2 font-medium">
                <span className="flex items-center gap-1.5">
                  {/* Renders nothing when signed out, so the column keeps its
                      pre-M5 width for a signed-out visitor. */}
                  <FavoriteStar playerId={row.player_id} size="h-3.5 w-3.5" />
                  <Link
                    to={`/players/${row.player_id}`}
                    className="whitespace-nowrap text-fg hover:text-accent hover:underline"
                  >
                    {row.name}
                  </Link>
                </span>
              </td>
              {/* Position first, then team. The tag is a fixed width where the team
                  abbreviation is two or three characters, so leading with it keeps
                  every team code on the same left edge down the column — and the
                  position colours (shared with the draft room) make a mixed-position
                  board scannable by shape rather than by reading. */}
              <td className="whitespace-nowrap px-3 py-2">
                <span className="flex items-center gap-2">
                  <PositionTag position={row.position} />
                  <span className="stat-num text-xs text-muted">
                    {row.team_abbreviation ?? "—"}
                  </span>
                </span>
              </td>
              <td className="stat-num px-3 py-2 text-center text-muted">{row.games_played}</td>
              {columns.map((key) => {
                const value = row[columnKey(key)];
                const percentile = showPercentiles ? row.percentiles?.[key] : undefined;
                return (
                  <td
                    key={key}
                    className={`stat-num px-3 py-2 text-center ${
                      sectionStart.has(key) ? "border-l border-line" : ""
                    } ${valueClass(key, value)}`}
                  >
                    <span className="flex flex-col items-center leading-tight">
                      <span>{formatStat(value, metrics[key]?.format)}</span>
                      {showPercentiles &&
                        (percentile === undefined || percentile === null ? (
                          <span className="text-[10px] font-semibold text-faint" aria-hidden="true">
                            &ndash;
                          </span>
                        ) : (
                          <span
                            className="text-[10px] font-semibold"
                            style={{ color: percentileColor(percentile) }}
                            title={`${percentile}th percentile among ${row.position}s this season`}
                          >
                            {percentile}
                          </span>
                        ))}
                    </span>
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
