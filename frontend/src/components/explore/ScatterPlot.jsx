// A scatter of players, as headshots or dots. Used by the Scatter page and by Player
// Comparison's "On the scatter".
//
// Medians are dashed so the corners carry the story (or, for expected against actual, a
// diagonal marks scoring exactly as expected). Players sharing an exact pair of values,
// which is common on count axes, fan out around the shared point instead of stacking
// into one face. Outliers are named, placed wherever a label does not collide.
import { useMemo } from "react";
import { ClipDef, SvgHeadshot, useClipId } from "./SvgHeadshot";
import { hoverProps } from "./ChartTooltip";
import { lastName, median, niceTicks, positionColor } from "../../utils/explore";

const MARGIN = { left: 64, right: 26, top: 20, bottom: 52 };

function tickText(metric, value) {
  if (metric?.format === "pct") return `${Math.round(value * 100)}%`;
  if (metric?.format === "int" || Math.abs(value) >= 100 || Number.isInteger(value)) return Math.round(value).toLocaleString();
  return Number(value).toFixed(Math.abs(value) < 1 ? 2 : 1);
}

/**
 * @param points   [{ id, name, position, headshot_url, x, y, z?, rank, ring?, label? }]
 * @param context  background points [{ x, y }] drawn faintly (the league behind a comparison)
 * @param display  "heads" | "dots"
 * @param lit      ids to emphasise (the rest dim) when non-empty
 * @param always   ids whose names are always drawn
 * @param tip      a useChartTooltip() instance, with tipFor(point); omit for exports
 */
export function ScatterPlot({
  points, context = [], xMetric, yMetric, sizeMetric, identity = false, corners, display = "heads",
  labels = true, outliers = true, always = [], lit, fixedRadius, width = 1180, height = 600,
  tip, tipFor, onPick,
}) {
  const clipId = useClipId();
  const heads = display !== "dots";

  const layout = useMemo(() => {
    const everyone = [...points, ...context];
    let [x0, x1] = [Math.min(...everyone.map((p) => p.x)), Math.max(...everyone.map((p) => p.x))];
    let [y0, y1] = [Math.min(...everyone.map((p) => p.y)), Math.max(...everyone.map((p) => p.y))];
    if (identity) {
      x0 = y0 = Math.min(x0, y0);
      x1 = y1 = Math.max(x1, y1);
    }
    const padX = (x1 - x0 || 1) * 0.06;
    const padY = (y1 - y0 || 1) * 0.08;
    x0 -= padX; x1 += padX; y0 -= padY; y1 += padY;
    const X = (value) => MARGIN.left + ((value - x0) / (x1 - x0)) * (width - MARGIN.left - MARGIN.right);
    const Y = (value) => height - MARGIN.bottom - ((value - y0) / (y1 - y0)) * (height - MARGIN.top - MARGIN.bottom);
    const medianX = median(everyone.map((p) => p.x));
    const medianY = median(everyone.map((p) => p.y));

    const sizes = points.map((p) => p.z).filter((z) => z !== null && z !== undefined);
    const [z0, z1] = [Math.min(...sizes), Math.max(...sizes)];
    const radius = (p) => {
      if (fixedRadius) return fixedRadius;
      if (!sizeMetric || p.z === null || p.z === undefined) return heads ? 16 : 5.5;
      const k = Math.sqrt((p.z - z0) / (z1 - z0 || 1));
      return heads ? 11 + 15 * k : 3.5 + 7.5 * k;
    };

    // Fan out exact ties around the shared point.
    const groups = new Map();
    for (const p of points) {
      const key = `${p.x}|${p.y}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
    const offsets = new Map();
    const hubs = [];
    for (const list of groups.values()) {
      list.forEach((p, index) => {
        if (list.length === 1) {
          offsets.set(p.id, [0, 0]);
          return;
        }
        const ring = heads ? radius(p) * 1.05 + list.length * 1.5 : radius(p) * 1.8;
        const angle = -Math.PI / 2 + (index / list.length) * Math.PI * 2;
        offsets.set(p.id, [Math.cos(angle) * ring, Math.sin(angle) * ring]);
      });
      if (list.length > 1) hubs.push({ x: X(list[0].x), y: Y(list[0].y) });
    }
    const marks = points.map((p) => {
      const [dx, dy] = offsets.get(p.id);
      return { point: p, cx: X(p.x) + dx, cy: Y(p.y) + dy, r: radius(p) };
    }).sort((a, b) => b.point.rank - a.point.rank);

    // Name the outliers (distance from the medians, in each axis's own units) and anyone
    // asked for, wherever a label fits.
    const placedLabels = [];
    if (labels) {
      const span = (value, lo, hi) => (value - lo) / (hi - lo || 1);
      const picked = new Set(always);
      if (outliers) {
        [...points]
          .map((p) => ({ p, distance: Math.hypot(span(p.x, x0, x1) - span(medianX, x0, x1), span(p.y, y0, y1) - span(medianY, y0, y1)) }))
          .sort((a, b) => b.distance - a.distance)
          .slice(0, heads ? 9 : 12)
          .forEach(({ p }) => picked.add(p.id));
        if (!heads) [...points].sort((a, b) => a.rank - b.rank).slice(0, 8).forEach((p) => picked.add(p.id));
      }
      const boxes = [];
      const ordered = marks.filter((mark) => picked.has(mark.point.id))
        .sort((a, b) => (always.includes(b.point.id) ? 1 : 0) - (always.includes(a.point.id) ? 1 : 0));
      for (const mark of ordered) {
        const text = mark.point.label ?? lastName(mark.point.name);
        const textWidth = text.length * 6.6 + 4;
        const forced = always.includes(mark.point.id);
        const { cx, cy, r } = mark;
        const spots = [[cx + r + 5, cy + 4, "start"], [cx - r - 5, cy + 4, "end"], [cx, cy - r - 6, "middle"], [cx, cy + r + 13, "middle"]];
        for (const [tx, ty, anchor] of spots) {
          const bx = anchor === "start" ? tx : anchor === "end" ? tx - textWidth : tx - textWidth / 2;
          const box = { x: bx, y: ty - 10, w: textWidth, h: 13 };
          if (box.x < MARGIN.left || box.x + textWidth > width - MARGIN.right || box.y < MARGIN.top) continue;
          const hitsLabel = boxes.some((b) => box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y);
          const hitsMark = marks.some((other) => other.point.id !== mark.point.id
            && other.cx + other.r > box.x && other.cx - other.r < box.x + box.w && other.cy + other.r > box.y && other.cy - other.r < box.y + box.h);
          if (hitsLabel || (hitsMark && !forced)) continue;
          boxes.push(box);
          placedLabels.push({ id: mark.point.id, x: tx, y: ty, anchor, text });
          break;
        }
      }
    }

    return {
      X, Y, x0, x1, y0, y1, medianX, medianY, marks, hubs, placedLabels,
      xTicks: niceTicks(x0, x1, 8).filter((tick) => xMetric?.format !== "int" || Number.isInteger(tick)),
      yTicks: niceTicks(y0, y1, 6).filter((tick) => yMetric?.format !== "int" || Number.isInteger(tick)),
    };
  }, [points, context, identity, width, height, sizeMetric, heads, fixedRadius, labels, outliers, always, xMetric, yMetric]);

  const { X, Y, x0, x1, y0, y1 } = layout;
  const litSet = lit && lit.size ? lit : null;
  const inset = 10;
  const halo = { paintOrder: "stroke", stroke: "var(--surface-solid)", strokeWidth: 3, pointerEvents: "none" };

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label={`${yMetric?.label ?? ""} against ${xMetric?.label ?? ""}`}>
      <defs><ClipDef id={clipId} /></defs>
      {layout.xTicks.map((tick) => (
        <g key={`x${tick}`}>
          <line className="grid" x1={X(tick)} x2={X(tick)} y1={MARGIN.top} y2={height - MARGIN.bottom} />
          <text className="axis-t" x={X(tick)} y={height - MARGIN.bottom + 16} textAnchor="middle">{tickText(xMetric, tick)}</text>
        </g>
      ))}
      {layout.yTicks.map((tick) => (
        <g key={`y${tick}`}>
          <line className="grid" x1={MARGIN.left} x2={width - MARGIN.right} y1={Y(tick)} y2={Y(tick)} />
          <text className="axis-t" x={MARGIN.left - 8} y={Y(tick) + 3.5} textAnchor="end">{tickText(yMetric, tick)}</text>
        </g>
      ))}
      <text className="axis-l" x={MARGIN.left + (width - MARGIN.left - MARGIN.right) / 2} y={height - 10} textAnchor="middle">
        {xMetric?.label} →
      </text>
      <text className="axis-l" textAnchor="middle"
        transform={`translate(16 ${MARGIN.top + (height - MARGIN.top - MARGIN.bottom) / 2}) rotate(-90)`}>
        {yMetric?.label} →
      </text>
      {identity ? (() => {
        const from = Math.max(x0, y0);
        const to = Math.min(x1, y1);
        return (
          <g>
            <line x1={X(from)} y1={Y(from)} x2={X(to)} y2={Y(to)} stroke="var(--plot-rule)" strokeWidth={1} />
            <text className="corner" x={X(to) - 6} y={Y(to) + 14} textAnchor="end">Scoring exactly as expected</text>
          </g>
        );
      })() : (
        <g>
          <line className="med" x1={X(layout.medianX)} x2={X(layout.medianX)} y1={MARGIN.top} y2={height - MARGIN.bottom} />
          <line className="med" x1={MARGIN.left} x2={width - MARGIN.right} y1={Y(layout.medianY)} y2={Y(layout.medianY)} />
        </g>
      )}
      {corners?.topLeft && <text className="corner" x={MARGIN.left + inset} y={MARGIN.top + 14}>{corners.topLeft}</text>}
      {corners?.topRight && <text className="corner" x={width - MARGIN.right - inset} y={MARGIN.top + 14} textAnchor="end">{corners.topRight}</text>}
      {corners?.bottomLeft && <text className="corner" x={MARGIN.left + inset} y={height - MARGIN.bottom - 10}>{corners.bottomLeft}</text>}
      {corners?.bottomRight && <text className="corner" x={width - MARGIN.right - inset} y={height - MARGIN.bottom - 10} textAnchor="end">{corners.bottomRight}</text>}
      {context.map((p, index) => (
        <circle key={`c${index}`} cx={X(p.x)} cy={Y(p.y)} r={4} fill="color-mix(in srgb, var(--fg) 22%, transparent)" />
      ))}
      {layout.hubs.map((hub, index) => <circle key={`h${index}`} cx={hub.x} cy={hub.y} r={2.5} fill="var(--plot-rule)" />)}
      <g>
        {layout.marks.map(({ point, cx, cy, r }) => {
          const state = litSet ? (litSet.has(point.id) ? " is-lit" : " is-dim") : "";
          return (
            <g key={point.id} className={`bubble${state}`} transform={`translate(${cx} ${cy})`}
              {...(tip ? hoverProps(tip, () => tipFor?.(point)) : {})}
              onClick={onPick ? () => onPick(point) : undefined}>
              {heads ? (
                <SvgHeadshot url={point.headshot_url} name={point.name} r={r} ring={point.ring ?? positionColor(point.position)}
                  ringWidth={point.ring ? 3 : 2} clipId={clipId} />
              ) : (
                <>
                  <circle r={r + 2} fill="var(--surface-solid)" />
                  <circle r={r} fill={point.ring ?? "color-mix(in srgb, var(--accent) 80%, transparent)"} />
                  <circle className="ring" r={r + 1} fill="none" stroke="transparent" />
                </>
              )}
              <circle r={Math.max(r, 12)} fill="transparent" />
            </g>
          );
        })}
        {layout.placedLabels.map((label) => (
          <text key={`l${label.id}`} x={label.x} y={label.y} textAnchor={label.anchor}
            className={litSet && !litSet.has(label.id) ? "is-dim" : undefined}
            style={{ fontSize: 11.5, fontWeight: 600, fill: "var(--fg)", ...halo }}>
            {label.text}
          </text>
        ))}
      </g>
    </svg>
  );
}
