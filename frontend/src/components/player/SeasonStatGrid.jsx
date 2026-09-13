// The season, in one section: a headline of ten stats, then every board as a row (M13).
//
// **The headline** is one open row — no tile per stat, no rules between them; alignment
// alone does the separating. Each stat carries its **positional rank** ("WR4") rather
// than a percentile, tinted by that percentile so colour and number agree. Ten across
// on a desktop screen and never a horizontal scroll: it wraps to five across below
// `xl`, and to two on a phone.
//
// **The boards** — Fantasy, Production, Advanced — sit beneath as three rows sharing a
// single scroll frame, like three players on a leaderboard, so one scrollbar moves all
// of them. The board names are a static column *outside* that frame rather than a
// sticky one inside it: a sticky label needs a background to mask the cells sliding
// under it, and a label that nothing can scroll under can be plain text. Every cell
// carries its own label, because the three boards hold different stats and cannot share
// a header row.
import { formatStat, formatSigned } from "../../utils/format";
import { isMetricAvailable } from "../../utils/availability";
import { StatTooltip, useStatTooltip } from "../StatTooltip";
import { metricTip } from "./metricTip";
import { percentileColor } from "./percentile";

// Columns whose sign is the whole point, so they carry an explicit "+".
const SIGNED = new Set([
  "fantasy_points_over_expected",
  "vorp",
  "vorp_ppg",
  "expected_vorp",
  "expected_vorp_ppg",
  "epa",
  "receiving_epa",
  "rushing_epa",
  "cpoe",
  "ngs_rec_yac_above_expectation",
  "ngs_rush_yards_over_expected",
  "ngs_rush_yards_over_expected_per_att",
  "ngs_pass_completion_pct_above_expectation",
  "ngs_pass_air_yards_differential",
]);

// Row height is fixed so the static label column and the scrolling strips stay in step.
const BOARD_ROW_HEIGHT = "h-[54px]";

function display(column, row, metric, season) {
  if (!isMetricAvailable(metric, season)) return null;
  return SIGNED.has(column)
    ? formatSigned(row?.[column], metric.format)
    : formatStat(row?.[column], metric.format);
}

function Headline({ stats, row, metrics, position, season, tooltip }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5 xl:grid-cols-10">
      {stats.map((stat) => {
        const metric = metrics[stat.id] ?? {};
        const value = display(stat.id, row, metric, season);
        const rank = value === null ? null : row?.ranks?.[stat.id];
        const percentile = row?.percentiles?.[stat.id];
        return (
          <div
            key={stat.id}
            className="min-w-0"
            onMouseEnter={(event) => tooltip.show(event.currentTarget, metricTip(metric, stat.id, season))}
            onMouseLeave={tooltip.hide}
          >
            <div className="truncate text-[9.5px] font-semibold uppercase tracking-[0.06em] text-faint">
              {stat.label}
            </div>
            {/* A season the stat was never measured in shows a dash, not a zero (M8). */}
            <div className={`stat-num truncate text-[24px] font-bold leading-tight tracking-tight ${value === null ? "text-faint" : "text-fg"}`}>
              {value ?? "—"}
            </div>
            <div
              className="stat-num text-[11.5px] font-bold"
              style={{ color: rank == null ? "var(--faint)" : percentileColor(percentile) }}
            >
              {rank == null ? "—" : `${position}${rank}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BoardCell({ column, row, metrics, season, sectionStart, tooltip }) {
  const metric = metrics[column] ?? {};
  const value = display(column, row, metric, season);
  const percentile = row?.percentiles?.[column];
  return (
    <div
      className={`w-[78px] shrink-0 px-2 ${sectionStart ? "border-l border-line" : ""}`}
      onMouseEnter={(event) => tooltip.show(event.currentTarget, metricTip(metric, column, season))}
      onMouseLeave={tooltip.hide}
    >
      <div className="truncate text-[9px] font-semibold uppercase tracking-[0.05em] text-faint">
        {metric.short ?? column}
      </div>
      <div className={`stat-num whitespace-nowrap text-[13.5px] font-semibold leading-tight ${value === null ? "text-faint" : "text-fg"}`}>
        {value ?? "—"}
      </div>
      <div
        className="stat-num text-[9.5px] font-bold leading-tight"
        style={{ color: percentile == null ? "var(--faint)" : percentileColor(percentile) }}
      >
        {percentile == null ? "—" : percentile}
      </div>
    </div>
  );
}

function BoardRows({ boards, row, metrics, season, tooltip }) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5">
      <div>
        {boards.map((board) => (
          <div
            key={board.id}
            className={`${BOARD_ROW_HEIGHT} flex items-center whitespace-nowrap text-[11.5px] font-bold uppercase tracking-[0.07em] text-fg`}
          >
            {board.label}
          </div>
        ))}
      </div>
      <div className="overflow-x-auto">
        {boards.map((board, index) => (
          <div
            key={board.id}
            className={`${BOARD_ROW_HEIGHT} flex w-max items-center ${index > 0 ? "border-t border-line" : ""}`}
          >
            {board.sections.flatMap((section, sectionIndex) =>
              section.columns.map((column, columnIndex) => (
                <BoardCell
                  key={`${section.name}-${column}`}
                  column={column}
                  row={row}
                  metrics={metrics}
                  season={season}
                  sectionStart={columnIndex === 0 && sectionIndex > 0}
                  tooltip={tooltip}
                />
              )),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SeasonStatGrid({ headline, boards, row, metrics, position, season, isLoading }) {
  const tooltip = useStatTooltip();

  return (
    <section className="glass-card px-4 pb-3 pt-3.5">
      <h2 className="mb-2.5 text-sm font-semibold tracking-tight text-fg">
        Season Stats
        <span className="ml-2 text-[11px] font-medium text-faint">
          {season} · rank among {position}s in the headline, percentile beneath each board stat
        </span>
      </h2>

      {isLoading ? (
        <div className="space-y-2 py-2" aria-busy="true">
          <div className="h-14 animate-pulse rounded-lg bg-surface-2/70" />
          <div className="h-40 animate-pulse rounded-lg bg-surface-2/70" />
        </div>
      ) : !row ? (
        <p className="py-6 text-center text-xs text-muted">No stats for this season.</p>
      ) : (
        <>
          <Headline
            stats={headline}
            row={row}
            metrics={metrics}
            position={position}
            season={season}
            tooltip={tooltip}
          />
          <div className="my-3 border-t border-line" />
          <BoardRows boards={boards} row={row} metrics={metrics} season={season} tooltip={tooltip} />
        </>
      )}
      <StatTooltip tip={tooltip.tip} />
    </section>
  );
}
