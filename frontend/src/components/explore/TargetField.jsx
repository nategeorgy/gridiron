// Where targets go, drawn on a field: every target as a dot, a smoothed heatmap, and
// the depth-by-side zone grid.
//
// **Depth is exact; side is one of three thirds.** Play-by-play records air yards to the
// yard but the side only as left, middle or right, so every chart here says so: dots are
// spread within their third rather than placed, and the heatmap blends the thirds into
// one surface instead of pretending to know where across the field a ball went.
//
// Each chart is one SVG with a viewBox and no outside dependencies, so the same element
// renders on the page and in an exported image (utils/exportImage.js).
import { useMemo } from "react";
import { DEPTHS, HIST_MIN, SIDES } from "../../utils/explore";
import { useThemeName } from "../../hooks/useThemeName";
import { Legend } from "./common";

export const FIELD = { width: 400, height: 470, top: 14, bottom: 20, near: -8, far: 45, left: 40 };
FIELD.right = FIELD.width - 8;

/** Air yards to a y coordinate on the field (clamped to what the field shows). */
export function fieldY(yards) {
  const { height, top, bottom, near, far } = FIELD;
  const clamped = Math.max(near, Math.min(far, yards));
  return height - bottom - ((clamped - near) / (far - near)) * (height - top - bottom);
}

/**
 * The root <svg>'s props: a chart on the page, or (with `nested`, as { x, y, width,
 * height }) one placed inside another SVG, as a combined export does. A nested chart
 * drops the `chart` class, whose CSS width would override the placement.
 */
export function chartRoot(nested, viewBox, label) {
  return nested
    ? { ...nested, viewBox }
    : { className: "chart", viewBox, role: "img", "aria-label": label };
}

/** Yard lines, the line of scrimmage, the three thirds and their labels. */
function FieldFrame({ band = true }) {
  const { left, right, top, height, bottom } = FIELD;
  const third = (right - left) / 3;
  const lines = [];
  for (let yards = -5; yards <= 45; yards += 5) lines.push(yards);
  return (
    <g>
      {band && (
        <rect x={left} y={fieldY(20)} width={right - left} height={fieldY(0) - fieldY(20)}
          fill="color-mix(in srgb, var(--fg) 2.5%, transparent)" />
      )}
      {lines.map((yards) => (
        <g key={yards}>
          <line x1={left} x2={right} y1={fieldY(yards)} y2={fieldY(yards)}
            stroke={yards === 0 ? "var(--plot-rule)" : "var(--divider)"} strokeWidth={yards === 0 ? 1.5 : 1} />
          <text className="axis-t" x={left - 6} y={fieldY(yards) + 3.5} textAnchor="end">
            {yards === 0 ? "LOS" : yards > 0 ? `+${yards}` : yards}
          </text>
        </g>
      ))}
      {[1, 2].map((index) => (
        <line key={index} x1={left + index * third} x2={left + index * third} y1={top} y2={height - bottom}
          stroke="var(--divider)" strokeDasharray="2 4" />
      ))}
      {SIDES.map((side, index) => (
        <text key={side} x={left + (index + 0.5) * third} y={height - 3} textAnchor="middle"
          style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", fill: "var(--faint)" }}>
          {side.toUpperCase()}
        </text>
      ))}
    </g>
  );
}

function AdotLine({ adot }) {
  if (adot === null || adot === undefined) return null;
  const { left, right } = FIELD;
  return (
    <g>
      <line x1={left} x2={right} y1={fieldY(adot)} y2={fieldY(adot)} stroke="var(--fg)" strokeWidth={1.5} strokeDasharray="5 4" />
      <text x={right - 4} y={fieldY(adot) - 5} textAnchor="end"
        style={{ fontSize: 11, fontWeight: 600, fill: "var(--fg)", paintOrder: "stroke", stroke: "var(--surface-solid)", strokeWidth: 3 }}>
        aDOT {adot.toFixed(1)}
      </text>
    </g>
  );
}

/** A deterministic sequence, so the dots keep their places from one render to the next. */
function seeded(seed = 7) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

/** Every target as a mark: caught, touchdown, incomplete, intercepted. */
export function EveryTargetField({ targets, adot, label, nested }) {
  const marks = useMemo(() => {
    const random = seeded();
    const third = (FIELD.right - FIELD.left) / 3;
    const out = [];
    for (const target of targets ?? []) {
      const side = ["left", "middle", "right"].indexOf(target.location);
      if (side < 0 || target.air_yards === null || target.air_yards === undefined) continue;
      out.push({
        x: FIELD.left + (side + 0.5) * third + (random() - 0.5) * (third - 22),
        y: fieldY(target.air_yards + (random() - 0.5) * 0.8),
        target,
      });
    }
    return out;
  }, [targets]);

  return (
    <svg {...chartRoot(nested, `0 0 ${FIELD.width} ${FIELD.height}`, label)}>
      <FieldFrame />
      {marks.map(({ x, y, target }, index) => {
        if (target.interception) {
          return <path key={index} d={`M ${x - 4} ${y - 4} L ${x + 4} ${y + 4} M ${x + 4} ${y - 4} L ${x - 4} ${y + 4}`} stroke="var(--neg)" strokeWidth={2} />;
        }
        if (target.touchdown) {
          return <circle key={index} cx={x} cy={y} r={5} fill="var(--accent)" stroke="var(--surface-solid)" strokeWidth={1.5} />;
        }
        if (target.complete) {
          return <circle key={index} cx={x} cy={y} r={3.6} fill="color-mix(in srgb, var(--series-1) 80%, transparent)" />;
        }
        return <circle key={index} cx={x} cy={y} r={3.2} fill="none" stroke="var(--muted)" strokeWidth={1.2} opacity={0.8} />;
      })}
      <AdotLine adot={adot} />
    </svg>
  );
}

export function EveryTargetLegend() {
  return (
    <Legend
      items={[
        { label: "Catch", color: "color-mix(in srgb, var(--series-1) 80%, transparent)", round: true, size: 8 },
        { label: "Touchdown", color: "var(--accent)", round: true },
      ]}
    >
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full border border-[color:var(--muted)]" />
        Incomplete
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="font-bold text-neg">×</span>
        Interception
      </span>
    </Legend>
  );
}

// --- heatmap ---------------------------------------------------------------------------

const HEAT_COLUMNS = 120;
const HEAT_ROWS = 180;

/**
 * A smoothed density of targets over the field, from one-yard histograms per side.
 * Separable: each third contributes its depth profile (Gaussian-smoothed, σ 2.4 yards)
 * times a Gaussian across the width centred on that third, so the three recorded sides
 * blend into one surface rather than three hard stripes.
 */
function density(heat, columns = HEAT_COLUMNS, rows = HEAT_ROWS) {
  const { near, far } = FIELD;
  const third = columns / 3;
  const spreadX = third * 0.42;
  const spreadY = (2.4 / (far - near)) * rows;
  const across = [0, 1, 2].map((side) =>
    Float32Array.from({ length: columns }, (_, x) => Math.exp(-0.5 * ((x + 0.5 - (side + 0.5) * third) / spreadX) ** 2)));
  const reach = Math.ceil(spreadY * 3);
  const kernel = Float32Array.from({ length: 2 * reach + 1 }, (_, index) => Math.exp(-0.5 * ((index - reach) / spreadY) ** 2));
  const out = new Float32Array(columns * rows);
  let total = 0;
  heat.forEach((histogram, side) => {
    const counts = new Float32Array(rows);
    histogram.forEach((count, bin) => {
      if (!count) return;
      const yards = Math.max(near, Math.min(far, bin + HIST_MIN));
      const row = Math.min(rows - 1, Math.max(0, Math.floor(((far - yards) / (far - near)) * rows)));
      counts[row] += count;
      total += count;
    });
    const profile = new Float32Array(rows);
    for (let y = 0; y < rows; y += 1) {
      let value = 0;
      for (let offset = -reach; offset <= reach; offset += 1) {
        const source = y + offset;
        if (source >= 0 && source < rows) value += counts[source] * kernel[offset + reach];
      }
      profile[y] = value;
    }
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) out[y * columns + x] += profile[y] * across[side][x];
    }
  });
  if (total) for (let index = 0; index < out.length; index += 1) out[index] /= total;
  return out;
}

function tokenRgb(name) {
  const context = document.createElement("canvas").getContext("2d");
  context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
  const hex = context.fillStyle.startsWith("#") ? context.fillStyle.slice(1) : "888888";
  return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
}

const mix = (from, to, amount) => from.map((channel, index) => channel + (to[index] - channel) * amount);

/**
 * The heatmap's pixels as a PNG data URI. Green is rarely, amber in between, red most
 * often; against an average, red is more often than the average and green less.
 */
function heatImage(heat, averageHeat, versus) {
  const canvas = document.createElement("canvas");
  canvas.width = HEAT_COLUMNS;
  canvas.height = HEAT_ROWS;
  const context = canvas.getContext("2d");
  const pixels = context.createImageData(HEAT_COLUMNS, HEAT_ROWS);
  const good = tokenRgb("--pos");
  const middle = tokenRgb("--warn");
  const bad = tokenRgb("--neg");
  const mine = density(heat);
  const theirs = versus && averageHeat ? density(averageHeat) : null;
  let max = 0;
  for (let index = 0; index < mine.length; index += 1) {
    max = Math.max(max, theirs ? Math.abs(mine[index] - theirs[index]) : mine[index]);
  }
  for (let index = 0; index < mine.length; index += 1) {
    let color;
    let alpha;
    if (theirs) {
      const difference = (mine[index] - theirs[index]) / (max || 1);
      color = difference >= 0 ? bad : good;
      alpha = Math.min(1, Math.abs(difference) * 1.25) * 0.9;
    } else {
      const level = mine[index] / (max || 1);
      color = level < 0.5 ? mix(good, middle, level / 0.5) : mix(middle, bad, (level - 0.5) / 0.5);
      alpha = Math.min(1, 0.08 + level * 1.3) * 0.9;
    }
    pixels.data.set([color[0], color[1], color[2], Math.round(alpha * 255)], index * 4);
  }
  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL();
}

/**
 * `heat` is three one-yard histograms (left, middle, right), as sideHistograms() builds
 * from a target list and the API returns for an average.
 */
export function HeatField({ heat, averageHeat, versus = false, adot, label, nested }) {
  const theme = useThemeName();
  const image = useMemo(
    () => heatImage(heat, averageHeat, versus),
    // The colours come from the theme's tokens, so a theme switch repaints.
    [heat, averageHeat, versus, theme], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const { left, right } = FIELD;
  const top = fieldY(FIELD.far);
  const bottom = fieldY(FIELD.near);
  return (
    <svg {...chartRoot(nested, `0 0 ${FIELD.width} ${FIELD.height}`, label)}>
      <rect x={left} y={top} width={right - left} height={bottom - top} fill="color-mix(in srgb, var(--fg) 2%, transparent)" />
      <image href={image} x={left} y={top} width={right - left} height={bottom - top} preserveAspectRatio="none" />
      <FieldFrame band={false} />
      <AdotLine adot={adot} />
    </svg>
  );
}

export function HeatLegend({ versus, position }) {
  return (
    <div className="flex items-center gap-2 text-[11.5px] text-muted">
      {versus ? `Fewer than the ${position ? `${position} ` : ""}average` : "Less often"}
      <span
        className="inline-block h-2 w-28 rounded"
        style={{
          background: versus
            ? "linear-gradient(90deg, var(--pos), transparent, var(--neg))"
            : "linear-gradient(90deg, color-mix(in srgb, var(--pos) 45%, transparent), var(--warn), var(--neg))",
        }}
      />
      {versus ? "More" : "More often"}
    </div>
  );
}

// --- zones -----------------------------------------------------------------------------

const ZONES = { width: 560, height: 470, labels: 110, top: 30, cell: 92, gap: 6 };

function zoneCell({ zones, caught, averageShares, versus, index, shares, max }) {
  const share = shares[index];
  const count = zones[index];
  if (versus && averageShares) {
    const difference = share - averageShares[index];
    const strength = Math.min(100, Math.round((Math.abs(difference) / 0.08) * 60));
    return {
      fill: `color-mix(in srgb, ${difference >= 0 ? "var(--pos)" : "var(--neg)"} ${strength}%, color-mix(in srgb, var(--fg) 4%, transparent))`,
      ink: "var(--fg)",
      big: `${difference >= 0 ? "+" : "−"}${Math.abs(difference * 100).toFixed(1)}`,
      small: `${(share * 100).toFixed(0)}% vs ${(averageShares[index] * 100).toFixed(0)}%`,
    };
  }
  const level = share / (max || 1);
  return {
    fill: `color-mix(in srgb, var(--accent) ${Math.round(level * 62)}%, color-mix(in srgb, var(--fg) 4%, transparent))`,
    ink: level > 0.55 ? "var(--fg)" : "var(--muted)",
    big: `${(share * 100).toFixed(0)}%`,
    small: `${count} tgt · ${count ? Math.round((caught[index] / count) * 100) : 0}%`,
  };
}

/**
 * The twelve depth-by-side zones as shares of the charted targets, deep at the top.
 * Against the average, each zone is its gap in percentage points (green above, red below).
 */
/**
 * `cellProps(depth, side)` returns extra props for a zone's group (the page passes a
 * tooltip there; an export passes nothing).
 */
export function ZonesChart({ zones, caught, averageShares, versus = false, noun = "tgt", cellProps, nested }) {
  const total = zones.reduce((sum, value) => sum + value, 0) || 1;
  const shares = zones.map((value) => value / total);
  const max = Math.max(...shares);
  const { width, labels, top, cell, gap } = ZONES;
  const columnWidth = (width - labels - 10) / 3;
  return (
    <svg {...chartRoot(nested, `0 0 ${width} ${ZONES.height}`, "Targets by depth and side")}>
      {SIDES.map((side, index) => (
        <text key={side} x={labels + index * columnWidth + columnWidth / 2} y={18} textAnchor="middle"
          style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", fill: "var(--faint)" }}>
          {side.toUpperCase()}
        </text>
      ))}
      {[3, 2, 1, 0].map((depth, row) => {
        const y = top + row * (cell + gap) + (depth === 0 ? 14 : 0);
        return (
          <g key={depth}>
            <text x={10} y={y + cell / 2 - 2} style={{ fontSize: 13, fontWeight: 600, fill: "var(--muted)" }}>{DEPTHS[depth].short}</text>
            <text x={10} y={y + cell / 2 + 14} className="mono" style={{ fontSize: 11, fill: "var(--faint)" }}>{DEPTHS[depth].range}</text>
            {[0, 1, 2].map((side) => {
              const index = depth * 3 + side;
              const zone = zoneCell({ zones, caught, averageShares, versus, index, shares, max });
              const x = labels + side * columnWidth;
              const small = versus ? zone.small : zone.small.replace("tgt", noun);
              return (
                <g key={side} {...(cellProps ? cellProps(depth, side) : {})}>
                  <rect x={x + 2} y={y} width={columnWidth - 4} height={cell} rx={10} fill={zone.fill} />
                  <text x={x + columnWidth / 2} y={y + cell / 2 + 2} textAnchor="middle" className="mono"
                    style={{ fontSize: 22, fontWeight: 700, fill: zone.ink }}>{zone.big}</text>
                  <text x={x + columnWidth / 2} y={y + cell / 2 + 22} textAnchor="middle" className="mono"
                    style={{ fontSize: 12, fill: zone.ink }}>{small}</text>
                </g>
              );
            })}
            {depth === 1 && (
              <g>
                <line x1={labels} x2={width - 10} y1={y + cell + gap / 2 + 7} y2={y + cell + gap / 2 + 7} stroke="var(--plot-rule)" strokeWidth={2} />
                <text x={labels - 8} y={y + cell + gap / 2 + 11} textAnchor="end" className="mono" style={{ fontSize: 10, fill: "var(--muted)" }}>LOS</text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
