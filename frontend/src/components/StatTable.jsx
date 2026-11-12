// The ranked stat table shared by the leaderboard boards and the Insight boards.
//
// Three things it does that a plain table does not:
//
// **Sections.** A board's columns arrive grouped (see constants/boards.js) and render
// under a spanning header row. A 35-column receiving board is unreadable as one flat
// sweep of abbreviations; the same 35 columns under General / Expected / Advanced /
// Next Gen / Other / Opportunity read as six short tables sharing a row.
//
// **Percentiles.** Every number on a leaderboard answers "how much" and almost none
// answer "is that a lot": 3.0 yards of separation means little until it says 56th
// percentile. `display` picks how a cell says it (constants/boardDisplay.js): the cell
// tinted by its percentile, the percentile or the rank ("#12") in small type beneath,
// the value alone, or the percentile in place of the value. One scale for all of them,
// green at 100, yellow at the median, orange at 25, red at 0 (utils/percentileScale.js):
// it runs through a visible middle, so on a 30-column row an ordinary player reads as
// yellow and an unusual one stands out at a glance.
//
// **Direction is the API's problem, not this component's.** The backend inverts
// `higher_is_better` before reporting, so 95th percentile always means good — even for
// drops and interceptions. Nothing here needs to know which way a metric points.
//
// **Below the minimum** (November 2026, utils/qualifiers.js). A row short of its
// position's volume minimum carries a "Below min" tag, and each of its percentiles that
// was ranked as if qualified (`row.as_if`) is drawn open: a dashed ring instead of a
// fill, a dashed pill around the small number. Only seen with the leaderboard's
// Qualified filter off, since with it on those rows are not on the board.
//
// Column headers are click-to-sort, and the page reverses the order on a second click;
// the arrow says which way. Headers and values are centred over each other: the arrow
// and the filter mark hang outside the label, so a sorted or filtered column's label
// does not shift off its numbers. Signed columns (gaps and trends) are tinted
// positive/negative because their sign is the whole point.
import { Link } from "react-router-dom";
import { FavoriteStar } from "./FavoriteStar";
import { PositionTag } from "./PositionTag";
import { formatStat, ordinal, shortName } from "../utils/format";
import { StatTooltip, useStatTooltip } from "./StatTooltip";
import { asIfRing, percentileFill, percentileInk, rankPercentile } from "../utils/percentileScale";
import { belowMinimum, isAsIf, minimumProgress } from "../utils/qualifiers";

/** The tag beside a player short of his position's minimum. */
export function BelowMinTag({ minimum, className = "" }) {
  return (
    <span
      title={minimum ? `Below the minimum: ${minimumProgress(minimum)}` : "Below the minimum"}
      className={`inline-block whitespace-nowrap rounded-md px-1.5 py-px text-[10px] font-bold leading-4 ${className}`}
      style={{
        color: "color-mix(in srgb, var(--warn) 80%, var(--fg))",
        background: "color-mix(in srgb, var(--warn) 16%, transparent)",
      }}
    >
      Below min
    </span>
  );
}

/** The small number under a value, in a dashed pill when it is as if qualified. */
function Beneath({ color, open, children }) {
  return (
    <span
      className={`text-[10px] font-semibold ${open ? "mt-px rounded-full border border-dashed px-1 leading-[13px]" : ""}`}
      style={{ color, borderColor: open ? color : undefined }}
    >
      {children}
    </span>
  );
}

/** "2016 onwards", "1999-2025", or nothing when a metric spans the whole range. */
function seasonWindow(metric) {
  const window = metric?.availability;
  if (!window || (window.first_season <= 1999 && !window.last_season)) return null;
  const first = window.first_season >= 9999 ? null : window.first_season;
  if (!first) return "No free source publishes this";
  return window.last_season ? `${first}\u2013${window.last_season}` : `${first} onwards`;
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
  // How a cell is drawn: "shaded" | "percentile" | "rank" | "values" | "percentiles".
  // "percentile" is what the table drew before the Display menu existed.
  display = "percentile",
  // Per position and metric, how many players a rank is out of (the API's rank_pools),
  // for colouring "#12" by where it sits.
  rankPools = null,
  sortOrder = "desc",
  // Columns a stat filter is on: their headers carry a small funnel.
  filteredColumns = [],
  // No card of its own, for a table drawn inside a card that also holds its toolbar.
  bare = false,
  isLoading = false,
  isError = false,
  error = null,
  dimmed = false,
  emptyMessage = "No results for these filters.",
}) {
  const signed = new Set(signedColumns);
  const unavailable = new Set(unavailableColumns);
  const filtered = new Set(filteredColumns);
  const mode = showPercentiles ? display : "values";
  const shaded = mode === "shaded" || mode === "percentiles";
  const tooltip = useStatTooltip();

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
        onMouseEnter={(event) =>
          tooltip.show(event.currentTarget, {
            label: metrics[key]?.label ?? key.replace(/_/g, " "),
            short: metrics[key]?.short,
            description: metrics[key]?.description,
            seasons: seasonWindow(metrics[key]),
            unavailable: isUnavailable,
          })
        }
        onMouseLeave={tooltip.hide}
        onFocus={(event) =>
          tooltip.show(event.currentTarget, {
            label: metrics[key]?.label ?? key.replace(/_/g, " "),
            short: metrics[key]?.short,
            description: metrics[key]?.description,
            seasons: seasonWindow(metrics[key]),
            unavailable: isUnavailable,
          })
        }
        onBlur={tooltip.hide}
        tabIndex={isUnavailable ? -1 : 0}
        aria-sort={sortMetric === key && !isUnavailable ? (sortOrder === "asc" ? "ascending" : "descending") : undefined}
        className={`whitespace-nowrap px-3 py-2.5 text-center align-bottom transition ${
          sectionStart.has(key) ? "border-l border-line" : ""
        } ${
          isUnavailable
            ? "cursor-default opacity-40"
            : `cursor-pointer hover:text-fg ${sortMetric === key ? "text-accent" : ""}`
        }`}
      >
        <span className="relative inline-block">
          {filtered.has(key) && (
            <span className="absolute right-full top-1/2 -translate-y-1/2 pr-1 text-accent" title="Filtered">
              <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="currentColor" aria-hidden="true">
                <path d="M2 3h12l-4.6 5.4V13l-2.8-1.4V8.4z" />
              </svg>
            </span>
          )}
          {/* The id is the last resort, and only reachable with a stale /metrics
              cache, but underscores in a header look like a crash, so soften it. */}
          {metrics[key]?.short ?? key.replace(/_/g, " ")}
          {sortMetric === key && !isUnavailable && (
            <span className="absolute left-full top-0 pl-0.5 font-mono" aria-hidden="true">
              {sortOrder === "asc" ? "\u2191" : "\u2193"}
            </span>
          )}
        </span>
      </th>
    );
  };

  // On a phone the identity block is one pinned column (rank, short name, then position,
  // team and games beneath), so the stats start on the first screen rather than after
  // ~330px of name and team. From md up it is the four columns it has always been.
  return (
    <div className={bare ? "overflow-x-auto" : "glass-card overflow-x-auto"}>
      <StatTooltip tip={tooltip.tip} />
      <table className={`w-full text-left text-sm md:min-w-[720px] ${shaded ? "board-shaded" : ""}`}>
        <thead>
          {sections && (
            <tr className="border-b border-line text-[10px] uppercase tracking-[0.11em] text-faint">
              {/* Rank, player, team and games: the identity block the sections sit beside.
                  Two cells, because a span cannot shrink when three of its columns are
                  hidden: it would push every section header three columns right. */}
              <th colSpan={4} className="hidden px-3 py-1.5 md:table-cell" />
              <th className="pin-col px-3 py-1.5 md:hidden" />
              {/* Keyed by position: a custom board can repeat a section name (two runs
                  of Usage columns either side of a dragged one), and FPPG's is empty. */}
              {sections.map((section, index) => (
                <th
                  key={`${index}-${section.name}`}
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
            <th className="hidden px-3 py-2.5 text-center md:table-cell">#</th>
            <th className="pin-col px-3 py-2.5 max-md:pl-10">Player</th>
            <th className="hidden px-3 py-2.5 text-center md:table-cell">Team</th>
            <th className="hidden px-3 py-2.5 text-center md:table-cell">G</th>
            {columns.map(headerCell)}
          </tr>
        </thead>
        <tbody className={dimmed ? "opacity-60 transition" : "transition"}>
          {rows.map((row, index) => {
            const below = belowMinimum(row);
            return (
            <tr key={row.player_id} className="border-b border-line last:border-0 hover:bg-surface-2">
              <td className="stat-num hidden px-3 py-2 text-center text-faint md:table-cell">{offset + index + 1}</td>
              <td className="pin-col px-3 py-2 font-medium max-md:pl-2 max-md:pr-2.5">
                {/* Phone: rank, then the name over position, team and games. */}
                <span className="flex items-start gap-2 md:hidden">
                  <span className="stat-num w-6 shrink-0 pt-px text-right text-[11px] text-faint">
                    {offset + index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1">
                      <FavoriteStar playerId={row.player_id} size="h-3.5 w-3.5" />
                      <Link
                        to={`/players/${row.player_id}`}
                        className={`block max-w-[118px] truncate text-[13px] font-semibold ${below ? "text-muted" : "text-fg"}`}
                      >
                        {shortName(row.name)}
                      </Link>
                    </span>
                    <span className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-[11px] text-muted">
                      <PositionTag position={row.position} />
                      <span className="stat-num">
                        {row.team_abbreviation ?? "FA"} · {row.games_played}G
                      </span>
                    </span>
                    {below && <BelowMinTag minimum={row.minimum} className="mt-1" />}
                  </span>
                </span>
                <span className="hidden items-center gap-1.5 md:flex">
                  {/* Renders nothing when signed out, so the column keeps its
                      pre-M5 width for a signed-out visitor. */}
                  <FavoriteStar playerId={row.player_id} size="h-3.5 w-3.5" />
                  <Link
                    to={`/players/${row.player_id}`}
                    className={`whitespace-nowrap hover:text-accent hover:underline ${below ? "text-muted" : "text-fg"}`}
                  >
                    {row.name}
                  </Link>
                  {below && <BelowMinTag minimum={row.minimum} />}
                </span>
              </td>
              {/* Position first, then team. The tag is a fixed width where the team
                  abbreviation is two or three characters, so leading with it keeps
                  every team code on the same left edge down the column — and the
                  position colours (shared with the draft room) make a mixed-position
                  board scannable by shape rather than by reading. */}
              <td className="hidden whitespace-nowrap px-3 py-2 md:table-cell">
                <span className="flex items-center justify-center gap-2">
                  <PositionTag position={row.position} />
                  <span className="stat-num text-xs text-muted">
                    {row.team_abbreviation ?? "—"}
                  </span>
                </span>
              </td>
              <td className="stat-num hidden px-3 py-2 text-center text-muted md:table-cell">{row.games_played}</td>
              {columns.map((key) => {
                const value = row[columnKey(key)];
                const percentile = row.percentiles?.[key];
                const hasPercentile = percentile !== undefined && percentile !== null;
                const rank = row.ranks?.[key];
                const pool = rankPools?.[row.position]?.[key];
                const text = formatStat(value, metrics[key]?.format);
                const open = isAsIf(row, key);
                const tip = [
                  `${metrics[key]?.label ?? key}: ${text}`,
                  hasPercentile && `${ordinal(percentile)} percentile`,
                  rank && `#${rank}${pool ? ` of ${pool}` : ""} ${row.position}s`,
                  open && (hasPercentile || rank) && "as if qualified",
                ].filter(Boolean).join(" \u00b7 ");
                const dash = (
                  <span className="text-[10px] font-semibold text-faint" aria-hidden="true">
                    &ndash;
                  </span>
                );
                return (
                  <td
                    key={key}
                    title={mode === "values" ? undefined : tip}
                    className={`stat-cell stat-num px-3 py-2 text-center ${
                      sectionStart.has(key) ? "border-l border-line" : ""
                    } ${valueClass(key, value)}`}
                    style={
                      shaded && hasPercentile
                        ? open ? asIfRing(percentile) : { background: percentileFill(percentile) }
                        : undefined
                    }
                  >
                    <span className="flex flex-col items-center leading-tight">
                      {mode === "percentiles" ? (
                        hasPercentile ? <span className="font-semibold text-fg">{percentile}</span> : dash
                      ) : (
                        <span>{text}</span>
                      )}
                      {mode === "percentile" &&
                        (hasPercentile ? (
                          <Beneath color={percentileInk(percentile)} open={open}>
                            {percentile}
                          </Beneath>
                        ) : dash)}
                      {mode === "rank" &&
                        (rank ? (
                          <Beneath color={percentileInk(rankPercentile(rank, pool))} open={open}>
                            #{rank}
                          </Beneath>
                        ) : dash)}
                    </span>
                  </td>
                );
              })}
            </tr>
            );
          })}
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
