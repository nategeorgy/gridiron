// Each pass depth: volume, share against the average, and what it returned. Shared by
// Target Analysis and the target maps on player and team pages.
import { DEPTHS, DEPTH_COLORS, signed } from "../../utils/explore";

/**
 * @param tally    the API's tally (depth, depth_receptions, depth_yards, depth_touchdowns, depth_epa, charted)
 * @param average  the API's average block (depth_shares), or nothing
 * @param versus   the column heading's subject: "WR", "league"
 */
export function TargetDepthTable({ tally, average, versus }) {
  const charted = tally.charted || 1;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-xs">
        <thead>
          <tr className="text-[10px] font-bold uppercase tracking-[0.07em] text-faint">
            <th className="pb-1.5 text-left">Depth</th>
            <th className="pb-1.5 text-right">TGT</th>
            <th className="pb-1.5 text-right">Share</th>
            {average && <th className="pb-1.5 text-right">vs {versus}</th>}
            <th className="pb-1.5 text-right">Catch</th>
            <th className="pb-1.5 text-right">Yds/T</th>
            <th className="pb-1.5 text-right">TD</th>
            <th className="pb-1.5 text-right">EPA/T</th>
          </tr>
        </thead>
        <tbody>
          {[3, 2, 1, 0].map((index) => {
            const count = tally.depth[index];
            const share = count / charted;
            const difference = average ? share - average.depth_shares[index] : null;
            const epa = count ? tally.depth_epa[index] / count : null;
            return (
              <tr key={index} className="border-t border-line">
                <td className="py-1.5 text-left">
                  <span className="inline-flex items-center gap-1.5 text-muted">
                    <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: DEPTH_COLORS[index] }} />
                    {DEPTHS[index].short}
                  </span>
                </td>
                <td className="stat-num py-1.5 text-right">{count}</td>
                <td className="stat-num py-1.5 text-right">{(share * 100).toFixed(0)}%</td>
                {average && (
                  <td className="stat-num py-1.5 text-right"
                    style={{ color: Math.abs(difference) < 0.015 ? undefined : difference > 0 ? "var(--pos)" : "var(--neg)" }}>
                    {`${difference >= 0 ? "+" : "−"}${Math.abs(difference * 100).toFixed(1)}`}
                  </td>
                )}
                <td className="stat-num py-1.5 text-right">{count ? `${Math.round((tally.depth_receptions[index] / count) * 100)}%` : "—"}</td>
                <td className="stat-num py-1.5 text-right">{count ? (tally.depth_yards[index] / count).toFixed(1) : "—"}</td>
                <td className="stat-num py-1.5 text-right">{tally.depth_touchdowns[index]}</td>
                <td className="stat-num py-1.5 text-right" style={{ color: epa === null ? undefined : epa >= 0 ? "var(--pos)" : "var(--neg)" }}>
                  {signed(epa, 2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** A labelled number in a tile. */
export function StatTile({ label, value, note }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-2 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.07em] text-faint">{label}</div>
      <div className="stat-num text-lg font-semibold text-fg">{value}</div>
      {note && <div className="stat-num truncate text-[10.5px] text-faint">{note}</div>}
    </div>
  );
}
