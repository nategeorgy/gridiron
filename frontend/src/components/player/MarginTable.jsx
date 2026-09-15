// The head-to-head table (M13): values either side of a column of metric names.
//
// **The margin pill sits on the winner's side, in his colour.** That is the whole
// design: the eye finds who leads a row before reading either number, and a column of
// pills down one side is a matchup summarised without a sentence.
//
// Shared by the player page and the Command Center's Head to Head card, so the same two
// players read the same way on both. Each row arrives with its pair of values already
// resolved, which is what lets the two callers keep their own response shapes.
import { formatStat } from "../../utils/format";
import { SIDES } from "./sides";

/** The gap in the metric's own units — "+11.2%" for a share, "+44" for a count. */
function gapText(format, gap) {
  if (format === "pct") return `+${(gap * 100).toFixed(1)}%`;
  if (format === "int") return `+${Math.round(gap)}`;
  return `+${gap.toFixed(1)}`;
}

function MarginPill({ side, children }) {
  return (
    <span
      className="stat-num inline-block rounded-md px-1.5 py-0.5 text-[11px] font-bold"
      style={{ background: side.badge, color: side.ink }}
    >
      {children}
    </span>
  );
}

/**
 * @param {{ rows: Array<{ id: string, label: string, format: string|number,
 *   values: [number|null, number|null], higherIsBetter?: boolean, description?: string }> }} props
 */
export function MarginTable({ rows }) {
  return (
    <div>
      {rows.map((row) => {
        const [left, right] = row.values;
        let leader = null;
        if (left !== null && right !== null && left !== right) {
          // Direction comes from the registry, so "winning" drops means the fewest.
          const higherWins = row.higherIsBetter !== false;
          leader = higherWins === left > right ? 0 : 1;
        }
        const gap = leader === null ? null : Math.abs(left - right);

        return (
          <div
            key={row.id}
            className="grid grid-cols-[3.4rem_1fr_7.5rem_1fr_3.4rem] items-center border-b border-dashed border-line py-1.5 last:border-0"
          >
            <span>{leader === 0 && <MarginPill side={SIDES[0]}>{gapText(row.format, gap)}</MarginPill>}</span>
            <span className="stat-num text-center text-[15px] font-semibold text-fg">
              {formatStat(left, row.format)}
            </span>
            <span className="truncate text-center text-[12px] text-muted" title={row.description}>
              {row.label}
            </span>
            <span className="stat-num text-center text-[15px] font-semibold text-fg">
              {formatStat(right, row.format)}
            </span>
            <span className="text-right">
              {leader === 1 && <MarginPill side={SIDES[1]}>{gapText(row.format, gap)}</MarginPill>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
