// Scatter of two metrics (M4), with players drawn as their own headshots.
//
// The photo *is* the identity encoding — which is why nothing else needs to carry it.
// An earlier version coloured points by position; four categorical hues cannot clear
// the colour-vision separation floors in the all-pairs case a scatter always is (any
// two points may be compared), and a headshot identifies a player far better than a
// hue ever could. Position lives in the tooltip instead.
//
// Median guides split the plot into quadrants — without them a scatter is a cloud;
// with them the corners are the story. Presets that put the same unit on both axes
// also draw an x=y diagonal, where "above the line" is the whole reading.
import { useMemo } from "react";
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { formatStat } from "../../utils/format";

// Bubble radius in px. Without a size metric every mark is BASE_RADIUS; with one,
// Recharts hands us an *area* from the ZAxis range and we convert back to a radius.
const BASE_RADIUS = 15;
const SIZE_RANGE = [340, 2000]; // → radius ≈ 10.4px … 25.2px

function radiusFromArea(area) {
  return area ? Math.sqrt(area / Math.PI) : BASE_RADIUS;
}

/**
 * One player, drawn as a circular headshot. Falls back to an initialled disc when a
 * player has no photo (~2.5% of the pool), so a missing image never leaves a hole
 * where a data point should be.
 */
function HeadshotSymbol(props) {
  const { cx, cy, payload, size } = props;
  if (cx == null || cy == null) return null;

  const radius = radiusFromArea(size);
  const photo = payload?.headshot_url;
  const clipId = `hs-${payload?.player_id ?? "x"}-${payload?.week ?? "s"}`;
  const initials = (payload?.name ?? "")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");

  return (
    <g style={{ cursor: "pointer" }}>
      {photo ? (
        <>
          <defs>
            <clipPath id={clipId}>
              <circle cx={cx} cy={cy} r={radius} />
            </clipPath>
          </defs>
          {/* A disc behind the cut-out portrait: NFL headshots are transparent PNGs. */}
          <circle cx={cx} cy={cy} r={radius} fill="var(--surface-2)" />
          <image
            href={photo}
            x={cx - radius}
            y={cy - radius}
            width={radius * 2}
            height={radius * 2}
            clipPath={`url(#${clipId})`}
            preserveAspectRatio="xMidYMid slice"
          />
        </>
      ) : (
        <>
          <circle cx={cx} cy={cy} r={radius} fill="var(--surface-2)" />
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={radius * 0.8}
            fill="var(--muted)"
            fontWeight="600"
          >
            {initials}
          </text>
        </>
      )}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="var(--accent)"
        strokeOpacity={0.75}
        strokeWidth={1.5}
      />
    </g>
  );
}

function ChartTooltip({ active, payload, axes }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="glass-popover px-3 py-2 text-xs">
      <div className="font-semibold text-fg">
        {point.name}
        <span className="ml-1 font-normal text-muted">
          {point.position}
          {point.team_abbreviation ? ` · ${point.team_abbreviation}` : ""}
          {point.week ? ` · Wk ${point.week}` : ""}
        </span>
      </div>
      <div className="stat-num mt-1 text-muted">
        {axes.x.label}: <span className="text-accent">{formatStat(point.x, axes.x.format)}</span>
      </div>
      <div className="stat-num text-muted">
        {axes.y.label}: <span className="text-accent">{formatStat(point.y, axes.y.format)}</span>
      </div>
      {axes.size && point.size != null && (
        <div className="stat-num text-muted">
          {axes.size.label}: <span className="text-fg">{formatStat(point.size, axes.size.format)}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Faint corner captions naming what each quadrant means.
 *
 * They sit inside the plot, so they will sometimes land on a bubble — a small
 * translucent backdrop keeps them readable without competing with the data. Offsets
 * clear the y-axis tick labels on the left and the axis title along the bottom.
 */
function CornerLabels({ corners }) {
  if (!corners) return null;
  const positions = {
    topLeft: { left: 76, top: 6, align: "left" },
    topRight: { right: 28, top: 6, align: "right" },
    bottomLeft: { left: 76, bottom: 48, align: "left" },
    bottomRight: { right: 28, bottom: 48, align: "right" },
  };
  return (
    <>
      {Object.entries(corners).map(([corner, text]) => {
        const style = positions[corner];
        if (!style || !text) return null;
        const { align, ...offsets } = style;
        return (
          <div
            key={corner}
            style={{
              position: "absolute",
              ...offsets,
              textAlign: align,
              maxWidth: "32%",
              background: "var(--surface-2)",
              padding: "2px 7px",
              borderRadius: 5,
            }}
            className="pointer-events-none text-[10px] font-medium uppercase leading-snug tracking-wide text-muted"
          >
            {text}
          </div>
        );
      })}
    </>
  );
}

export function MetricScatter({ points, axes, medians, preset, onSelect }) {
  const hasSize = Boolean(axes.size);

  // The identity diagonal only makes sense when both axes are the same unit, so it is
  // opt-in per preset. Span it across the union of both axes' ranges.
  const diagonal = useMemo(() => {
    if (!preset?.identity || points.length === 0) return null;
    const values = points.flatMap((point) => [point.x, point.y]).filter((v) => v != null);
    if (values.length === 0) return null;
    const low = Math.min(...values);
    const high = Math.max(...values);
    return [
      { x: low, y: low },
      { x: high, y: high },
    ];
  }, [preset, points]);

  return (
    <div style={{ position: "relative" }}>
      <ResponsiveContainer width="100%" height={480}>
        <ScatterChart margin={{ top: 16, right: 24, bottom: 30, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" />
          <XAxis
            type="number"
            dataKey="x"
            name={axes.x.label}
            domain={["dataMin", "dataMax"]}
            tick={{ fill: "var(--faint)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--divider)" }}
            tickFormatter={(value) => formatStat(value, axes.x.format)}
            label={{
              value: axes.x.label,
              position: "insideBottom",
              offset: -18,
              fill: "var(--muted)",
              fontSize: 12,
            }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name={axes.y.label}
            domain={["dataMin", "dataMax"]}
            tick={{ fill: "var(--faint)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(value) => formatStat(value, axes.y.format)}
            label={{
              value: axes.y.label,
              angle: -90,
              position: "insideLeft",
              fill: "var(--muted)",
              fontSize: 12,
              style: { textAnchor: "middle" },
            }}
          />
          {hasSize && (
            <ZAxis type="number" dataKey="size" range={SIZE_RANGE} name={axes.size.label} />
          )}

          {medians?.x != null && (
            <ReferenceLine x={medians.x} stroke="var(--muted)" strokeDasharray="4 4" strokeOpacity={0.5} />
          )}
          {medians?.y != null && (
            <ReferenceLine y={medians.y} stroke="var(--muted)" strokeDasharray="4 4" strokeOpacity={0.5} />
          )}
          {diagonal && (
            <ReferenceLine
              segment={diagonal}
              stroke="var(--accent)"
              strokeDasharray="5 4"
              strokeOpacity={0.45}
              ifOverflow="hidden"
            />
          )}

          <Tooltip
            cursor={{ strokeDasharray: "3 3", stroke: "var(--muted)" }}
            content={<ChartTooltip axes={axes} />}
          />

          <Scatter
            data={points}
            shape={<HeadshotSymbol />}
            isAnimationActive={false}
            onClick={(point) => onSelect?.(point)}
          />
        </ScatterChart>
      </ResponsiveContainer>
      <CornerLabels corners={preset?.corners} />
    </div>
  );
}
