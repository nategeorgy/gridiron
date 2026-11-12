// A radar of percentiles among the position: one player, or two overlaid.
//
// One player: each point is a bubble holding his percentile, coloured on the player
// card's red-to-green scale, and his number sits under each label. Two players: two
// translucent shapes in the series colours, and both percentiles under each label.
// `hot` / `onHot` link it to a list beside it, so hovering a stat lights it in both.
//
// A percentile ranked as if qualified (`row.as_if`, utils/qualifiers.js) is an open point:
// an unfilled dashed ring, the card's open bubble. The shape still runs through it, since
// it is where this player's rate would sit.
import { formatSigned, formatStat } from "../../../utils/format";
import { isAsIf } from "../../../utils/qualifiers";
import { hoverProps } from "../../explore/ChartTooltip";
import { pctColor } from "./common";

function valueText(metric, value) {
  if (value == null) return "-";
  const format = metric?.format ?? 1;
  if (format === "pct") return `${(value * 100).toFixed(1)}%`;
  const signed = ["epa", "receiving_epa", "rushing_epa", "cpoe", "ngs_rush_yards_over_expected_per_att"].includes(metric?.id);
  return signed ? formatSigned(value, format) : formatStat(value, format);
}

/**
 * @param stats   [{ id, label }]
 * @param players [{ name, color, row }] where row has the metric values and `percentiles`
 */
export function PercentileRadar({ stats, players, metrics, hot, onHot, tip, width = 540, height = 440, radius = 140 }) {
  const shown = stats.filter((stat) => players.every((player) => player.row?.percentiles?.[stat.id] != null));
  if (shown.length < 3) return <p className="py-10 text-center text-xs text-muted">Not enough ranked stats for a profile.</p>;
  const cx = width / 2;
  const cy = height / 2 + 4;
  const n = shown.length;
  const pair = players.length > 1;
  const point = (index, value) => {
    const angle = (Math.PI * 2 * index) / n - Math.PI / 2;
    return [cx + Math.cos(angle) * radius * (value / 100), cy + Math.sin(angle) * radius * (value / 100)];
  };
  const ring = (value) => shown.map((_, index) => point(index, value).join(",")).join(" ");
  const pctOf = (player, id) => player.row?.percentiles?.[id] ?? 0;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mx-auto block h-auto w-full" style={{ maxWidth: width }} role="img" aria-label="Percentile profile">
      {[25, 50, 75, 100].map((value) => (
        <polygon key={value} points={ring(value)} fill={value === 100 ? "color-mix(in srgb, var(--fg) 2%, transparent)" : "none"} stroke="var(--divider)" />
      ))}
      {[50, 100].map((value) => (
        <text key={value} x={cx + 4} y={point(0, value)[1] + 11} fontSize="9" fill="var(--faint)" className="stat-num">{value}</text>
      ))}
      {shown.map((stat, index) => {
        const [ex, ey] = point(index, 100);
        const [lx, ly] = point(index, 121);
        const anchor = Math.abs(lx - cx) < 12 ? "middle" : lx > cx ? "start" : "end";
        const base = ly < cy - radius * 0.6 ? ly - (pair ? 14 : 8) : ly;
        const lit = hot === stat.id;
        return (
          <g key={stat.id} onMouseEnter={() => onHot?.(stat.id)} onMouseLeave={() => onHot?.(null)} style={{ cursor: onHot ? "default" : undefined }}>
            <line x1={cx} y1={cy} x2={ex} y2={ey} stroke="var(--divider)" />
            <text x={lx} y={base} textAnchor={anchor} fontSize="11" fontWeight={lit ? 800 : 650} fill={lit ? "var(--accent)" : "var(--fg)"}>
              {stat.label}
            </text>
            {pair ? (
              <text x={lx} y={base + 14} textAnchor={anchor} fontSize="11.5" className="stat-num">
                {players.map((player, which) => (
                  <tspan key={which} style={{ fill: player.color }} fontWeight="800">
                    {which ? <tspan fill="var(--faint)" fontWeight="400"> · </tspan> : null}
                    {player.row?.percentiles?.[stat.id] ?? "-"}
                  </tspan>
                ))}
              </text>
            ) : (
              <text x={lx} y={base + 13} textAnchor={anchor} fontSize="10.5" fill="var(--muted)" className="stat-num">
                {valueText(metrics[stat.id] ? { ...metrics[stat.id], id: stat.id } : { id: stat.id }, players[0].row?.[stat.id])}
              </text>
            )}
          </g>
        );
      })}
      {[...players].reverse().map((player) => (
        <polygon
          key={player.name}
          points={shown.map((stat, index) => point(index, pctOf(player, stat.id)).join(",")).join(" ")}
          style={{ fill: player.color, stroke: player.color }}
          fillOpacity={pair ? 0.16 : 0.2}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      ))}
      {[...players].reverse().map((player) =>
        shown.map((stat, index) => {
          const percentile = pctOf(player, stat.id);
          const [px, py] = point(index, percentile);
          const content = (
            <div>
              <div className="font-semibold text-fg">{player.name}</div>
              <div className="mt-1 text-muted">
                {metrics[stat.id]?.label ?? stat.label}: <b className="stat-num text-fg">{valueText(metrics[stat.id] ? { ...metrics[stat.id], id: stat.id } : { id: stat.id }, player.row?.[stat.id])}</b>
              </div>
              <div className="text-muted">
                {player.row?.percentiles?.[stat.id] ?? "-"} percentile{isAsIf(player.row, stat.id) ? ", as if qualified" : ""}
              </div>
            </div>
          );
          const lit = hot === stat.id;
          const open = isAsIf(player.row, stat.id);
          const events = tip ? hoverProps(tip, content, { onEnter: () => onHot?.(stat.id), onLeave: () => onHot?.(null) }) : {};
          if (pair) {
            return open ? (
              <circle key={`${player.name}-${stat.id}`} cx={px} cy={py} r={lit ? 6 : 4.5} fill="var(--surface-solid)" style={{ stroke: player.color }} strokeWidth="1.6" strokeDasharray="2.2 1.6" {...events} />
            ) : (
              <circle key={`${player.name}-${stat.id}`} cx={px} cy={py} r={lit ? 6 : 4} style={{ fill: player.color }} stroke="var(--surface-solid)" strokeWidth="1.5" {...events} />
            );
          }
          return (
            <g key={stat.id} {...events}>
              {open ? (
                <circle cx={px} cy={py} r={lit ? 13.5 : 11} fill="var(--surface-solid)" style={{ stroke: pctColor(percentile) }} strokeWidth="2" strokeDasharray="3.4 2.4" />
              ) : (
                <circle cx={px} cy={py} r={lit ? 13.5 : 11} style={{ fill: pctColor(percentile) }} stroke={lit ? "var(--fg)" : "var(--surface-solid)"} strokeWidth="2" />
              )}
              <text x={px} y={py + 3.6} textAnchor="middle" fontSize="9.5" fontWeight="800" fill={open ? "var(--muted)" : "#06110b"} className="stat-num" pointerEvents="none">
                {percentile}
              </text>
            </g>
          );
        }),
      )}
    </svg>
  );
}
