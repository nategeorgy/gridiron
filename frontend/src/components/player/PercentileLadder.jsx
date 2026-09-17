// Every headline metric, ranked within the position (M13).
//
// **A bare measure line, nothing behind it.** No filled track, no quartile bands, and no
// marker parked on the value — the length of the line is the rank and the number beside
// it says so exactly. The alternative, a filled bar with the percentile in a circle at
// its tip, is the Baseball Savant house style, and borrowing it wholesale would make the
// page look like someone else's.
//
// Percentiles are direction-corrected by the API, so a long line always means good.
// A metric a player cannot be *ranked* in still shows its value with "not ranked"
// beside it: the value is real (a receiver's rushing yards happened), the rank would
// not be (he is not in the rushing pool). That is a different state from no data, and
// the page has to keep them apart.
import { formatStat } from "../../utils/format";
import { isMetricAvailable } from "../../utils/availability";
import { StatTooltip, useStatTooltip } from "../StatTooltip";
import { metricTip } from "./metricTip";
import { percentileColor } from "./percentile";

function Row({ column, row, metrics, season, tooltip }) {
  const metric = metrics[column] ?? {};
  const percentile = row?.percentiles?.[column];
  const available = isMetricAvailable(metric, season);
  const value = available ? formatStat(row?.[column], metric.format) : "—";

  const label = (
    <span
      className="truncate text-[12.5px] text-muted"
      onMouseEnter={(event) => tooltip.show(event.currentTarget, metricTip(metric, column, season))}
      onMouseLeave={tooltip.hide}
    >
      {metric.label ?? column}
    </span>
  );

  if (percentile == null) {
    return (
      <div className="grid grid-cols-[9.5rem_1fr_3.9rem] items-center gap-2.5 border-b border-dashed border-line py-1 last:border-0">
        {label}
        <span className="text-[10.5px] text-faint">{available ? "not ranked" : "not recorded"}</span>
        <span className="stat-num text-right text-[12px] text-faint">{value}</span>
      </div>
    );
  }

  const color = percentileColor(percentile);
  return (
    <div className="grid grid-cols-[9.5rem_1fr_1.6rem_3.9rem] items-center gap-2.5 border-b border-dashed border-line py-1 last:border-0">
      {label}
      <span className="relative h-5">
        <i
          className="absolute left-0 top-1/2 block h-1 -translate-y-1/2 rounded-sm"
          style={{ width: `${percentile}%`, background: color }}
        />
      </span>
      <span className="stat-num text-right text-[11px] font-bold" style={{ color }}>
        {percentile}
      </span>
      <span className="stat-num text-right text-[12px] text-fg">{value}</span>
    </div>
  );
}

export function PercentileLadder({ groups, row, metrics, position, season, poolSize, isLoading }) {
  const tooltip = useStatTooltip();

  return (
    <section className="glass-card p-4">
      <h2 className="text-sm font-semibold tracking-tight text-fg">Percentile Rankings</h2>
      <p className="mt-0.5 text-[11.5px] text-faint">
        Ranked within {position}s for {season}
        {poolSize ? ` (${poolSize} qualified)` : ""}, direction-corrected so further right
        always means better
      </p>

      {isLoading ? (
        <div className="mt-3 space-y-2" aria-busy="true">
          {Array.from({ length: 10 }).map((_, index) => (
            <div key={index} className="h-5 animate-pulse rounded bg-surface-2/70" />
          ))}
        </div>
      ) : !row ? (
        <p className="py-6 text-center text-xs text-muted">No stats for this season.</p>
      ) : (
        groups.map((group, index) => (
          <div key={group.name} className="mt-3">
            <h3 className="border-b-2 border-edge pb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-fg">
              {group.name}
            </h3>
            {index === 0 && (
              <div className="flex justify-between px-0 pb-0.5 pt-1 text-[9.5px] uppercase tracking-[0.1em] text-faint">
                <span>◂ Poor</span>
                <span>Average</span>
                <span>Great ▸</span>
              </div>
            )}
            {group.columns.map((column) => (
              <Row
                key={column}
                column={column}
                row={row}
                metrics={metrics}
                season={season}
                tooltip={tooltip}
              />
            ))}
          </div>
        ))
      )}
      <StatTooltip tip={tooltip.tip} />
    </section>
  );
}
