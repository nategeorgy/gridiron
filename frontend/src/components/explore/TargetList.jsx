// The Target Analysis list: each receiver's depth mix as a stacked bar, or his air-yard
// distribution as a curve, plus the same list as an exportable chart.
import { useMemo } from "react";
import { hoverProps } from "./ChartTooltip";
import { ClipDef, SvgHeadshot, useClipId } from "./SvgHeadshot";
import { DEPTHS, DEPTH_COLORS, airYardDensity, positionColor, tallyRates } from "../../utils/explore";

/** Where one receiver's charted targets went, as four stacked segments. */
export function DepthMixBar({ player, tip }) {
  const charted = player.charted || 0;
  return (
    <div className="flex h-3.5 gap-0.5">
      {player.depth.map((count, index) => {
        if (!count) return null;
        const share = count / charted;
        return (
          <i
            key={DEPTHS[index].key}
            className="block h-full min-w-0 first:rounded-l last:rounded-r"
            style={{ width: `${share * 100}%`, background: DEPTH_COLORS[index] }}
            {...hoverProps(tip, () => (
              <div>
                <b>{player.name}: {DEPTHS[index].label}</b>
                <div className="stat-num mt-0.5 text-muted">
                  {count} of {charted} targets ({(share * 100).toFixed(0)}%) · {player.depth_receptions[index]} catches, {player.depth_yards[index]} yds
                </div>
              </div>
            ))}
          />
        );
      })}
    </div>
  );
}

/** Densities for a set of players on one shared height, so shapes compare. */
export function useDensities(players) {
  return useMemo(() => {
    const curves = new Map();
    let max = 0;
    for (const player of players) {
      const curve = airYardDensity(player.hist);
      curves.set(player.player_id, curve);
      for (const value of curve) max = Math.max(max, value);
    }
    return { curves, max: max || 1 };
  }, [players]);
}

function ridgePath(curve, max, width, height, left = 0) {
  const x = (yards) => left + ((yards + 10) / 50) * width;
  const y = (value) => height - 1 - (value / max) * (height - 3);
  const line = curve.map((value, index) => `${index ? "L" : "M"} ${x(index - 10).toFixed(1)} ${y(value).toFixed(1)}`).join(" ");
  return { line, area: `${line} L ${x(40)} ${height} L ${x(-10)} ${height} Z`, x };
}

/** A small air-yard curve with the line of scrimmage, 20 yards and a tick at his aDOT. */
export function AirYardRidge({ curve, max, adot }) {
  const width = 300;
  const height = 30;
  const path = ridgePath(curve, max, width, height);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block h-[30px] w-full overflow-visible">
      <line x1={path.x(0)} x2={path.x(0)} y1={0} y2={height} stroke="var(--plot-rule)" opacity={0.5} vectorEffect="non-scaling-stroke" />
      <line x1={path.x(20)} x2={path.x(20)} y1={0} y2={height} stroke="var(--divider)" vectorEffect="non-scaling-stroke" />
      <path d={path.area} fill="color-mix(in srgb, var(--series-1) 30%, transparent)" />
      <path d={path.line} fill="none" stroke="var(--series-1)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      {adot !== null && adot !== undefined && (
        <line x1={path.x(adot)} x2={path.x(adot)} y1={2} y2={height} stroke="var(--fg)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}

/** The top of the list as one chart, for export: faces, volume, aDOT, and bars or curves. */
export function TargetListChart({ players, view }) {
  const clipId = useClipId();
  const { curves, max } = useDensities(players);
  const width = 1000;
  const rowHeight = 36;
  const head = 44;
  const height = head + players.length * rowHeight + 8;
  const barLeft = 470;
  const barWidth = 400;
  const heading = (x, text, anchor = "start") => (
    <text x={x} y={24} textAnchor={anchor} style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", fill: "var(--faint)" }}>{text}</text>
  );
  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Where receivers are targeted">
      <defs><ClipDef id={clipId} /></defs>
      {heading(16, "#")}
      {heading(50, "PLAYER")}
      {heading(360, "TGT", "end")}
      {heading(430, "ADOT", "end")}
      {heading(width - 16, "20+ %", "end")}
      {view === "ridge"
        ? [-10, 0, 10, 20, 30, 40].map((yards) => (
          <g key={yards}>{heading(barLeft + ((yards + 10) / 50) * barWidth, yards > 0 ? `+${yards}` : String(yards), "middle")}</g>
        ))
        : DEPTHS.map((depth, index) => (
          <g key={depth.key}>
            <rect x={barLeft + index * 100} y={13} width={12} height={12} rx={3} fill={DEPTH_COLORS[index]} />
            <text x={barLeft + index * 100 + 17} y={23} style={{ fontSize: 11, fill: "var(--muted)" }}>{depth.short}</text>
          </g>
        ))}
      {players.map((player, index) => {
        const y = head + index * rowHeight;
        const middle = y + rowHeight / 2;
        const { deep } = tallyRates(player);
        let x = barLeft;
        return (
          <g key={player.player_id}>
            <line x1={8} x2={width - 8} y1={y} y2={y} stroke="var(--divider)" />
            <text x={16} y={middle + 4} className="mono" style={{ fontSize: 13, fill: "var(--faint)" }}>{index + 1}</text>
            <g transform={`translate(64 ${middle})`}>
              <SvgHeadshot url={player.headshot_url} name={player.name} r={13} ring={positionColor(player.position)} ringWidth={1.5} clipId={clipId} />
            </g>
            <text x={86} y={middle - 1} style={{ fontSize: 14, fontWeight: 600, fill: "var(--fg)" }}>{player.name}</text>
            <text x={86} y={middle + 13} className="mono" style={{ fontSize: 11, fill: "var(--faint)" }}>{player.position} · {player.team}</text>
            <text x={360} y={middle + 5} textAnchor="end" className="mono" style={{ fontSize: 14, fill: "var(--fg)" }}>{player.targets}</text>
            <text x={430} y={middle + 5} textAnchor="end" className="mono" style={{ fontSize: 14, fontWeight: 700, fill: "var(--fg)" }}>
              {player.adot?.toFixed(1) ?? "—"}
            </text>
            <text x={width - 16} y={middle + 5} textAnchor="end" className="mono" style={{ fontSize: 14, fill: "var(--fg)" }}>
              {(deep * 100).toFixed(0)}%
            </text>
            {view === "ridge" ? (() => {
              const path = ridgePath(curves.get(player.player_id), max, barWidth, rowHeight - 8, barLeft);
              return (
                <g transform={`translate(0 ${y + 4})`}>
                  <line x1={path.x(0)} x2={path.x(0)} y1={0} y2={rowHeight - 8} stroke="var(--plot-rule)" opacity={0.5} />
                  <path d={path.area} fill="color-mix(in srgb, var(--series-1) 30%, transparent)" />
                  <path d={path.line} fill="none" stroke="var(--series-1)" strokeWidth={1.5} />
                  {player.adot !== null && (
                    <line x1={path.x(player.adot)} x2={path.x(player.adot)} y1={2} y2={rowHeight - 8} stroke="var(--fg)" strokeWidth={2} />
                  )}
                </g>
              );
            })() : player.depth.map((count, depthIndex) => {
              const segment = (count / (player.charted || 1)) * barWidth;
              const rect = segment > 0 ? (
                <rect key={depthIndex} x={x + (depthIndex ? 1 : 0)} y={middle - 8} width={Math.max(0, segment - 2)} height={16} rx={3} fill={DEPTH_COLORS[depthIndex]} />
              ) : null;
              x += segment;
              return rect;
            })}
          </g>
        );
      })}
    </svg>
  );
}
