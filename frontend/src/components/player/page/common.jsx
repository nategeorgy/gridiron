// Shared pieces for the tabbed player page's charts (November 2026).
//
// Scales, a smooth line, the card every panel sits in, and the crosshair readout every
// line chart uses: hover anywhere over the plot and the nearest week (or season) lights
// up, with a card listing what each line reads there. Tap does the same on a phone.
import { useRef, useState } from "react";
import { ChartTooltip, useChartTooltip } from "../../explore/ChartTooltip";
import { CardTitle } from "../../explore/common";
import { percentileScale, tint } from "../cardParts";

export { tint, percentileScale };

/** A linear scale: domain [d0, d1] onto range [r0, r1]. */
export const lin = (d0, d1, r0, r1) => (value) => r0 + ((value - d0) / (d1 - d0 || 1)) * (r1 - r0);
export const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
export const mix = (color, amount, base = "transparent") => `color-mix(in srgb, ${color} ${amount}%, ${base})`;

/** A smooth path through points (Catmull-Rom as cubic Béziers, tension 1/6). */
export function smoothPath(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M${points[0][0]},${points[0][1]}`;
  let d = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/** A card on the player page: title row with controls, then the body. */
export function Panel({ title, sub, controls, children, className = "", style }) {
  return (
    <section className={`glass-card min-w-0 p-4 sm:p-5 ${className}`} style={style}>
      {title && <CardTitle title={title} sub={sub}>{controls}</CardTitle>}
      {children}
    </section>
  );
}

/** A short line of fine print. */
export function Note({ children, className = "" }) {
  return <p className={`mt-2 text-[11.5px] leading-relaxed text-faint ${className}`}>{children}</p>;
}

/** One row of the crosshair's readout card. */
export function ReadoutRow({ color, label, value, note }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="inline-flex min-w-0 items-center gap-1.5 text-muted">
        {color && <i className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />}
        <span className="truncate">{label}</span>
      </span>
      <span className="stat-num shrink-0 font-bold text-fg">
        {value}
        {note ? <span className="ml-1.5 font-normal text-faint">{note}</span> : null}
      </span>
    </div>
  );
}

/**
 * An SVG line chart's hover layer. `stops` is [{ px, rows: [{ py, color, r? }], content }]:
 * the nearest stop to the pointer is drawn as a crosshair and its content shown in the
 * tooltip card. `box` is { w, h, L, R, T, B }, the plot area in viewBox units.
 */
export function Crosshair({ stops, box, svgRef }) {
  const tip = useChartTooltip();
  const [active, setActive] = useState(null);

  const locate = (event) => {
    const svg = svgRef.current;
    if (!svg || !stops.length) return;
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * box.w;
    let best = 0;
    stops.forEach((stop, index) => {
      if (Math.abs(stop.px - x) < Math.abs(stops[best].px - x)) best = index;
    });
    setActive(best);
    tip.show(event, stops[best].content);
  };
  const stop = active == null ? null : stops[active];
  return (
    <>
      {stop && (
        <g pointerEvents="none">
          <line x1={stop.px} x2={stop.px} y1={box.T} y2={box.h - box.B} stroke="var(--fg)" strokeOpacity="0.25" />
          {stop.rows.map((row, index) => (
            <circle key={index} cx={stop.px} cy={row.py} r={row.r ?? 5} fill={row.color} stroke="var(--surface-solid)" strokeWidth="2" />
          ))}
        </g>
      )}
      <rect
        x={box.L}
        y={box.T}
        width={Math.max(0, box.w - box.L - box.R)}
        height={Math.max(0, box.h - box.T - box.B)}
        fill="transparent"
        onMouseMove={locate}
        onClick={locate}
        onMouseLeave={() => {
          setActive(null);
          tip.hide();
        }}
      />
      <ChartTooltip tip={tip} />
    </>
  );
}

/** Wraps a chart that uses `Crosshair`: hands it the SVG's ref. */
export function useSvgRef() {
  return useRef(null);
}

/** "@ SF" or "vs SF" for a game-log row (a game id ends with the home team's code). */
export function whereText(game) {
  if (!game?.opponent_abbreviation) return "";
  const home = game.team_abbreviation && game.game_id?.endsWith(`_${game.team_abbreviation}`);
  return `${home ? "vs" : "@"} ${game.opponent_abbreviation}`;
}

/** Whether a game id's home team is `abbreviation`. */
export const isHomeGame = (gameId, abbreviation) => Boolean(gameId && abbreviation && gameId.endsWith(`_${abbreviation}`));

/** The colour for a percentile, red through yellow to green (the player card's scale). */
export const pctColor = (percentile) => percentileScale(percentile);

/** A heat-grid cell fill: the percentile's colour, stronger the further it is from the middle. */
export const heatFill = (percentile) =>
  percentile == null ? tint(4) : `color-mix(in srgb, ${percentileScale(percentile)} ${Math.round(12 + percentile * 0.32)}%, transparent)`;
