// A pizza chart of percentiles (November 2026), drawn as the tweet kit's D25 is: one slice
// per stat, clockwise from 12 o'clock, each slice's length its percentile from the hole (0)
// to the rim (100), on tinted category quadrants (NFL.com's identity chart). The percentile
// sits on a badge at each slice's end and the stat with its number outside the rim (The
// Athletic's labelling), and the player's headshot fills the hole, ringed in the colour that
// player draws in everywhere else on the page.
//
// Player Comparison draws one per player, so `hot` / `onHot` link them: hovering a slice
// lights that stat on every pizza and dims the rest.
//
// A percentile ranked as if qualified (`row.as_if`, utils/qualifiers.js) is a faded slice
// with a dashed edge and an unfilled badge, the open bubble everywhere else.
import { isAsIf } from "../../utils/qualifiers";
import { hoverProps } from "../explore/ChartTooltip";
import { ClipDef, SvgHeadshot, useClipId } from "../explore/SvgHeadshot";
import { statText } from "./page/Radar";

const point = (cx, cy, r, angle) => [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];

/** An annular sector from radius r0 to r1 between two angles. */
function sector(cx, cy, r0, r1, a0, a1) {
  if (r1 <= r0 + 0.01) return "";
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = point(cx, cy, r1, a0);
  const [x1, y1] = point(cx, cy, r1, a1);
  const [x2, y2] = point(cx, cy, r0, a1);
  const [x3, y3] = point(cx, cy, r0, a0);
  return `M${x0.toFixed(2)},${y0.toFixed(2)}A${r1},${r1} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`
    + `L${x2.toFixed(2)},${y2.toFixed(2)}A${r0},${r0} 0 ${large} 0 ${x3.toFixed(2)},${y3.toFixed(2)}Z`;
}

/** A label on one line, or two when it runs past about `max` characters. */
function wrap(text, max = 12) {
  if (text.length <= max) return [text];
  const words = text.split(" ");
  let first = "";
  let index = 0;
  while (index < words.length && `${first}${first ? " " : ""}${words[index]}`.length <= max) {
    first = `${first}${first ? " " : ""}${words[index]}`;
    index += 1;
  }
  if (!first) {
    first = words[0];
    index = 1;
  }
  return [first, words.slice(index).join(" ")].filter(Boolean);
}

const mix = (color, amount, base = "transparent") => `color-mix(in srgb, ${color} ${amount}%, ${base})`;

/**
 * @param stats    [{ id, label, category, color }]
 * @param row      a `/stats/intelligence` row: the values, `percentiles` and `as_if`
 * @param headshot the player's photo for the hole; `ring` the colour round it
 */
export function PizzaChart({ stats, row, name, headshot, ring, metrics, hot, onHot, tip }) {
  const clipId = useClipId();
  const W = 490;
  const H = 450;
  const cx = W / 2;
  const cy = H / 2;
  const R = 126;
  const r0 = 30;
  const step = (Math.PI * 2) / stats.length;
  const slices = stats.map((stat, index) => ({
    stat,
    a0: -Math.PI / 2 + index * step,
    a1: -Math.PI / 2 + (index + 1) * step,
    mid: -Math.PI / 2 + (index + 0.5) * step,
    percentile: row?.percentiles?.[stat.id],
    open: isAsIf(row, stat.id),
  }));
  const radius = (percentile) => r0 + (R - r0) * (Math.max(0, Math.min(100, percentile)) / 100);
  const fade = (stat) => ({ opacity: hot && hot !== stat.id ? 0.28 : 1, transition: "opacity 120ms" });
  // Consecutive slices of one category share a tinted quadrant behind them.
  const quadrants = [];
  slices.forEach((slice) => {
    const last = quadrants[quadrants.length - 1];
    if (last && last.color === slice.stat.color) last.a1 = slice.a1;
    else quadrants.push({ color: slice.stat.color, a0: slice.a0, a1: slice.a1 });
  });
  const events = (stat, percentile, open) => {
    if (!tip) return {};
    const content = (
      <div>
        <div className="font-semibold text-fg">{name}</div>
        <div className="mt-1 text-muted">
          {metrics?.[stat.id]?.label ?? stat.label}: <b className="stat-num text-fg">{statText(metrics, stat.id, row?.[stat.id])}</b>
        </div>
        <div className="text-muted">{percentile ?? "-"} percentile{open ? ", as if qualified" : ""} · {stat.category}</div>
      </div>
    );
    return hoverProps(tip, content, { onEnter: () => onHot?.(stat.id), onLeave: () => onHot?.(null) });
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block h-auto w-full" style={{ maxWidth: W }} role="img" aria-label={`${name} percentile pizza`}>
      <defs><ClipDef id={clipId} /></defs>
      {quadrants.map((quadrant) => (
        <path key={quadrant.a0} d={sector(cx, cy, r0, R + 4, quadrant.a0, quadrant.a1)} style={{ fill: mix(quadrant.color, 11) }} />
      ))}
      {slices.map(({ stat, a0, a1, percentile, open }) => (percentile == null ? null : (
        <path
          key={stat.id}
          d={sector(cx, cy, r0, radius(percentile), a0, a1)}
          style={{ fill: open ? mix(stat.color, 38) : stat.color, stroke: open ? stat.color : "var(--surface-solid)", ...fade(stat) }}
          strokeWidth={open ? 1.3 : 1.6}
          strokeDasharray={open ? "3.5 2.5" : undefined}
          {...events(stat, percentile, open)}
        />
      )))}
      {[33, 66].map((value) => (
        <circle key={value} cx={cx} cy={cy} r={radius(value)} fill="none" stroke={mix("var(--fg)", 22)} strokeDasharray="3.5 3.5" pointerEvents="none" />
      ))}
      <circle cx={cx} cy={cy} r={r0 + 1.5} fill="var(--surface-solid)" />
      <g transform={`translate(${cx},${cy})`}>
        <SvgHeadshot url={headshot} name={name} r={r0 - 2.5} ring={ring} ringWidth={2.5} clipId={clipId} />
      </g>
      {slices.map(({ stat, mid, percentile, open }) => {
        if (percentile == null) return null;
        const [bx, by] = point(cx, cy, radius(Math.max(percentile, 30)), mid);
        const bw = String(percentile).length > 2 ? 33 : 27;
        return (
          <g key={stat.id} pointerEvents="none" style={fade(stat)}>
            <rect x={bx - bw / 2} y={by - 9.5} width={bw} height={19} rx="5"
              style={{ fill: open ? "var(--surface-solid)" : stat.color, stroke: open ? stat.color : "var(--surface-solid)" }}
              strokeWidth="1.2" strokeDasharray={open ? "2.5 1.8" : undefined} />
            <text x={bx} y={by + 4.3} textAnchor="middle" fontSize="12.5" fontWeight="800" className="stat-num"
              style={{ fill: open ? mix(stat.color, 62, "var(--fg)") : "#0b0d12" }}>
              {percentile}
            </text>
          </g>
        );
      })}
      {slices.map(({ stat, mid, percentile, open }) => {
        const [x, y] = point(cx, cy, R + 20, mid);
        const cos = Math.cos(mid);
        const sin = Math.sin(mid);
        const anchor = Math.abs(cos) < 0.2 ? "middle" : cos > 0 ? "start" : "end";
        const lines = wrap(stat.label);
        const lineHeight = 15;
        const total = lines.length * lineHeight + 14;
        const top = sin < -0.55 ? y - total + 10 : sin > 0.55 ? y + 10 : y - total / 2 + 10;
        return (
          <g key={stat.id} style={{ ...fade(stat), cursor: "default" }} {...events(stat, percentile, open)}>
            {lines.map((line, index) => (
              <text key={line} x={x} y={top + index * lineHeight} textAnchor={anchor} fontSize="13.5" fontWeight="700" fill="var(--fg)">{line}</text>
            ))}
            <text x={x} y={top + lines.length * lineHeight + 0.5} textAnchor={anchor} fontSize="12.5" fontWeight="600" fill="var(--muted)" className="stat-num">
              {statText(metrics, stat.id, row?.[stat.id])}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** The categories as tinted pills, the key to the slices' colours (as on the tweet kit's D25). */
export function PizzaKey({ stats }) {
  const categories = [...new Map(stats.map((stat) => [stat.category, stat.color])).entries()];
  return (
    <div className="flex flex-wrap gap-1.5">
      {categories.map(([category, color]) => (
        <span
          key={category}
          title={stats.filter((stat) => stat.category === category).map((stat) => stat.label).join(", ")}
          className="rounded-full px-2.5 py-0.5 text-[11.5px] font-bold"
          style={{ background: mix(color, 16), border: `1px solid ${mix(color, 40)}`, color: mix(color, 62, "var(--fg)") }}
        >
          {category}
        </span>
      ))}
    </div>
  );
}
