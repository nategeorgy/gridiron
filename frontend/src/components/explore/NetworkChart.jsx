// A quarterback's passing network: the passer, and each receiver he targets as a face,
// joined by a line whose width is volume and whose colour is EPA per target.
//
// Two layouts. **Field**: height is each receiver's average depth of target, to scale,
// and left to right is which side he is targeted on more, spread evenly so faces never
// stack. **Radial**: distance from the quarterback is the average depth, around an arc
// ordered by the same lean. Both are one SVG, so the page and an export draw the same.
import { useMemo, useState } from "react";
import { ChartTooltip, TipCard, hoverProps, useChartTooltip } from "./ChartTooltip";
import { ClipDef, SvgHeadshot, useClipId } from "./SvgHeadshot";
import { DEPTHS, SIDES, epaColor, lastName, positionColor, signed } from "../../utils/explore";

const SIZE = 640;

/**
 * Receivers as the network draws them: the top `limit` by targets (each needing
 * `floor` targets), the rest folded into one "others" row, and a lean from left (-1) to
 * right (+1). Receivers play-by-play names but we do not track (a fullback, a two-way
 * player) always count toward the totals and go to "others".
 */
export function shapeNetwork(network, limit, floor = 1) {
  if (!network) return { total: 0, shown: [], others: null, all: [] };
  const total = network.totals.targets;
  const withRates = (receiver) => {
    const sided = receiver.locations[0] + receiver.locations[1] + receiver.locations[2];
    return {
      ...receiver,
      share: total ? receiver.targets / total : 0,
      lean: (receiver.locations[2] - receiver.locations[0]) / Math.max(1, sided),
    };
  };
  const named = network.receivers.filter((receiver) => receiver.player_id).map(withRates);
  const unnamed = network.receivers.filter((receiver) => !receiver.player_id).map(withRates);
  const shown = named.slice(0, limit).filter((receiver) => receiver.targets >= floor);
  const rest = [...named.slice(shown.length), ...unnamed];
  let others = null;
  if (rest.length) {
    const sum = (key) => rest.reduce((running, receiver) => running + (receiver[key] ?? 0), 0);
    const charted = sum("charted");
    const targets = sum("targets");
    others = {
      name: `${rest.length} other${rest.length === 1 ? "" : "s"}`, others: true, targets, receptions: sum("receptions"),
      yards: sum("yards"), touchdowns: sum("touchdowns"), interceptions: sum("interceptions"), epa: sum("epa"),
      adot: charted ? sum("air_yards") / charted : null, epa_per_target: targets ? sum("epa") / targets : null,
      share: total ? targets / total : 0,
    };
  }
  return { total, shown, others, all: named };
}

function receiverTip(receiver, passer) {
  const sided = receiver.locations[0] + receiver.locations[1] + receiver.locations[2];
  return (
    <TipCard
      player={receiver}
      sub={`${receiver.position ?? ""} · from ${lastName(passer.name)}`}
      rows={[
        ["Targets", `${receiver.targets} (${(receiver.share * 100).toFixed(1)}%)`],
        ["Catches", `${receiver.receptions} (${Math.round((receiver.receptions / receiver.targets) * 100)}%)`],
        ["Yards", receiver.yards.toLocaleString()],
        ["TD / INT", `${receiver.touchdowns} / ${receiver.interceptions}`],
        ["aDOT", receiver.adot === null ? "—" : receiver.adot.toFixed(1)],
        ["EPA per target", signed(receiver.epa_per_target, 2)],
      ]}
      note={
        <div>
          <div>{receiver.depth.map((count, index) => `${DEPTHS[index].short} ${receiver.charted ? Math.round((count / receiver.charted) * 100) : 0}%`).join(" · ")}</div>
          <div>{receiver.locations.map((count, index) => `${SIDES[index]} ${Math.round((count / Math.max(1, sided)) * 100)}%`).join(" · ")}</div>
        </div>
      }
    />
  );
}

/**
 * @param shown        receivers from shapeNetwork
 * @param selected     a receiver id to ring
 * @param interactive  hover focus, tooltips and clicks (off for exports)
 * @param nested       { x, y, width, height } to render inside another SVG
 */
export function NetworkChart({ layout = "field", passer, shown, selected, onSelect, interactive = true, nested }) {
  const clipId = useClipId();
  const tip = useChartTooltip();
  const [focus, setFocus] = useState(null);
  const placed = useMemo(() => (layout === "radial" ? placeRadial(shown) : placeField(shown)), [layout, shown]);
  const label = `${passer.name} passing network`;
  const root = nested
    ? { ...nested, viewBox: `0 0 ${SIZE} ${SIZE}` }
    : { className: `chart${focus ? " is-focused" : ""}`, viewBox: `0 0 ${SIZE} ${SIZE}`, role: "img", "aria-label": label };

  if (!shown.length) {
    return (
      <svg {...root}>
        <text x={SIZE / 2} y={SIZE / 2} textAnchor="middle">No targets in this selection</text>
      </svg>
    );
  }

  const itemClass = (receiver) => `net-item${focus === receiver.player_id ? " is-lit" : ""}`;
  const events = (receiver) => (interactive ? {
    ...hoverProps(tip, () => receiverTip(receiver, passer), {
      onEnter: () => setFocus(receiver.player_id),
      onLeave: () => setFocus(null),
    }),
    onClick: () => onSelect?.(receiver.player_id),
    style: { cursor: "pointer" },
  } : {});
  const halo = { paintOrder: "stroke", stroke: "var(--surface-solid)", strokeWidth: 3 };

  return (
    <>
      <svg {...root}>
        <defs><ClipDef id={clipId} /></defs>
        {layout === "radial" ? <RadialFrame /> : <FieldFrame />}
        <g>
          {placed.nodes.map((node) => (
            <path
              key={`edge-${node.receiver.player_id}`}
              className={itemClass(node.receiver)}
              d={placed.edge(node)}
              fill="none"
              stroke={epaColor(node.receiver.epa_per_target, 0.5)}
              strokeWidth={node.width}
              strokeLinecap="round"
              opacity={0.9}
              {...events(node.receiver)}
            />
          ))}
        </g>
        <g>
          {placed.nodes.map((node) => (
            <g key={`node-${node.receiver.player_id}`} className={itemClass(node.receiver)}
              transform={`translate(${node.x} ${node.y})`} {...events(node.receiver)}>
              <SvgHeadshot url={node.receiver.headshot_url} name={node.receiver.name} r={node.r}
                ring={positionColor(node.receiver.position)} ringWidth={2.5} clipId={clipId} />
              {selected === node.receiver.player_id && <circle r={node.r + 6} fill="none" stroke="var(--accent)" strokeWidth={2} />}
            </g>
          ))}
        </g>
        <g style={{ pointerEvents: "none" }}>
          {placed.nodes.map((node) => (
            <g key={`label-${node.receiver.player_id}`} className={itemClass(node.receiver)}>
              <text x={node.labelX} y={node.labelY} textAnchor={node.anchor} style={{ fontSize: 11.5, fontWeight: 600, fill: "var(--fg)", ...halo }}>
                {lastName(node.receiver.name)}
              </text>
              <text x={node.labelX} y={node.labelY + 12} textAnchor={node.anchor} className="mono"
                style={{ fontSize: 10.5, fill: "var(--muted)", ...halo }}>
                {node.receiver.targets} · {(node.receiver.share * 100).toFixed(0)}%
              </text>
            </g>
          ))}
        </g>
        <g transform={`translate(${placed.passer.x} ${placed.passer.y})`}>
          <SvgHeadshot url={passer.headshot_url} name={passer.name} r={placed.passer.r} ring={positionColor("QB")} ringWidth={3} clipId={clipId} />
        </g>
        {layout !== "radial" && (
          <text x={placed.passer.x} y={placed.passer.y + placed.passer.r + 15} textAnchor="middle"
            style={{ fontSize: 11.5, fontWeight: 700, fill: "var(--fg)", ...halo }}>
            {lastName(passer.name)}
          </text>
        )}
      </svg>
      {interactive && <ChartTooltip tip={tip} />}
    </>
  );
}

// --- field -------------------------------------------------------------------------------

const F = { near: -7, far: 26, top: 30, bottom: 22, left: 28, right: SIZE - 104 };
const fieldY = (depth) => SIZE - F.bottom - (depth - F.near) * ((SIZE - F.top - F.bottom) / (F.far - F.near));

function FieldFrame() {
  const bands = [[F.near, 0, DEPTHS[0]], [0, 10, DEPTHS[1]], [10, 20, DEPTHS[2]], [20, F.far, DEPTHS[3]]];
  return (
    <g>
      {bands.map(([from, to, depth], index) => (
        <g key={depth.key}>
          <rect x={F.left} y={fieldY(to)} width={F.right - F.left} height={fieldY(from) - fieldY(to)}
            fill={`color-mix(in srgb, var(--fg) ${index % 2 ? 3.5 : 1.5}%, transparent)`} />
          <text x={F.right + 10} y={(fieldY(from) + fieldY(to)) / 2 - 2}
            style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", fill: "var(--muted)" }}>
            {depth.short.toUpperCase()}
          </text>
          <text x={F.right + 10} y={(fieldY(from) + fieldY(to)) / 2 + 11} className="mono" style={{ fontSize: 10, fill: "var(--faint)" }}>
            {depth.range}
          </text>
        </g>
      ))}
      {[-5, 5, 10, 15, 20, 25].map((yards) => (
        <g key={yards}>
          <line x1={F.left} x2={F.right} y1={fieldY(yards)} y2={fieldY(yards)} stroke="var(--divider)" />
          <text className="axis-t" x={20} y={fieldY(yards) + 3.5} textAnchor="end">{yards > 0 ? `+${yards}` : yards}</text>
        </g>
      ))}
      <line x1={F.left} x2={F.right} y1={fieldY(0)} y2={fieldY(0)} stroke="var(--plot-rule)" strokeWidth={1.5} />
      <text className="axis-t" x={20} y={fieldY(0) + 3.5} textAnchor="end" style={{ fontWeight: 700, fill: "var(--muted)" }}>LOS</text>
    </g>
  );
}

/** Spread layout: order by lean, space evenly, then push apart any faces or labels that touch. */
function placeField(shown) {
  const most = Math.max(...shown.map((receiver) => receiver.targets), 1);
  const passer = { x: (F.left + F.right) / 2, y: fieldY(-4.6), r: 27 };
  const depthOf = (receiver) => Math.max(-3, Math.min(F.far - 1.5, receiver.adot ?? 0));
  const order = [...shown].sort((a, b) => a.lean - b.lean);
  const left = 50;
  const right = F.right - 22;
  const nodes = order.map((receiver, index) => ({
    receiver,
    x: left + (index + 0.5) * ((right - left) / order.length),
    y: fieldY(depthOf(receiver)),
    r: 13 + 19 * Math.sqrt(receiver.targets / most),
    width: 2 + 11 * (receiver.targets / most),
  }));
  const box = (node) => {
    const labelWidth = Math.max(2 * node.r, lastName(node.receiver.name).length * 6.6 + 8);
    return { x0: node.x - labelWidth / 2, x1: node.x + labelWidth / 2, y0: node.y - node.r, y1: node.y + node.r + 26, half: labelWidth / 2 };
  };
  for (let pass = 0; pass < 300; pass += 1) {
    let moved = false;
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = box(nodes[i]);
        const b = box(nodes[j]);
        const overlapX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        const overlapY = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        if (overlapX > -4 && overlapY > -2) {
          const push = (overlapX + 4) / 2 + 0.5;
          nodes[i].x -= push;
          nodes[j].x += push;
          moved = true;
        }
      }
    }
    for (const node of nodes) {
      const half = box(node).half;
      node.x = Math.max(32 + half, Math.min(F.right - 4 - half, node.x));
      if (Math.abs(node.x - passer.x) < node.r + passer.r + 6 && Math.abs(node.y - passer.y) < node.r + passer.r + 26) {
        node.x += node.x < passer.x ? -3 : 3;
        moved = true;
      }
    }
    if (!moved) break;
  }
  for (const node of nodes) {
    node.labelX = node.x;
    node.labelY = node.y + node.r + 14;
    node.anchor = "middle";
  }
  return {
    nodes,
    passer,
    edge: (node) => `M ${passer.x} ${passer.y - passer.r} C ${passer.x} ${passer.y - 110}, ${node.x} ${node.y + 120}, ${node.x} ${node.y}`,
  };
}

// --- radial ------------------------------------------------------------------------------

const CENTER = { x: SIZE / 2, y: SIZE / 2 + 6 };
const radius = (depth) => 70 + (Math.max(-4, Math.min(22, depth)) + 4) * 9.2;

function RadialFrame() {
  return (
    <g>
      {[[0, "LOS"], [10, "10 yds"], [20, "20 yds"]].map(([depth, label]) => (
        <g key={depth}>
          <circle cx={CENTER.x} cy={CENTER.y} r={radius(depth)} fill="none"
            stroke={depth === 0 ? "var(--plot-rule)" : "var(--divider)"} strokeWidth={depth === 0 ? 1.3 : 1} />
          <text className="axis-t" x={CENTER.x} y={CENTER.y + radius(depth) + 13} textAnchor="middle">{label}</text>
        </g>
      ))}
    </g>
  );
}

function placeRadial(shown) {
  const most = Math.max(...shown.map((receiver) => receiver.targets), 1);
  const order = [...shown].sort((a, b) => a.lean - b.lean);
  const nodes = order.map((receiver, index) => ({
    receiver,
    angle: -Math.PI / 2 - Math.PI * 0.8 + (index + 0.5) * ((Math.PI * 1.6) / order.length),
    distance: radius(receiver.adot ?? 0),
    r: 13 + 19 * Math.sqrt(receiver.targets / most),
    width: 2 + 11 * (receiver.targets / most),
  }));
  const at = (node) => ({ x: CENTER.x + node.distance * Math.cos(node.angle), y: CENTER.y + node.distance * Math.sin(node.angle) });
  for (let pass = 0; pass < 200; pass += 1) {
    let moved = false;
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = at(nodes[i]);
        const b = at(nodes[j]);
        if (Math.hypot(a.x - b.x, a.y - b.y) < nodes[i].r + nodes[j].r + 30) {
          nodes[i].angle -= 0.01;
          nodes[j].angle += 0.01;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  for (const node of nodes) {
    const { x, y } = at(node);
    node.x = x;
    node.y = y;
    const cos = Math.cos(node.angle);
    const sin = Math.sin(node.angle);
    node.labelX = x + (node.r + 12) * cos;
    node.labelY = y + (node.r + 12) * sin + (sin > 0.5 ? 10 : sin < -0.5 ? -8 : 4) - 6;
    node.anchor = cos > 0.25 ? "start" : cos < -0.25 ? "end" : "middle";
  }
  return {
    nodes,
    passer: { x: CENTER.x, y: CENTER.y, r: 30 },
    edge: (node) => `M ${CENTER.x} ${CENTER.y} L ${node.x} ${node.y}`,
  };
}

/** The key under the chart: what width, colour and position mean. */
export function NetworkLegend({ layout }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11.5px] text-muted">
      <span>Line width: targets</span>
      <span className="inline-flex items-center gap-1.5">
        Line colour: EPA per target
        <span className="inline-block h-2 w-24 rounded"
          style={{ background: `linear-gradient(90deg, ${epaColor(-0.5, 0.5)}, ${epaColor(0, 0.5)}, ${epaColor(0.5, 0.5)})` }} />
        <span className="stat-num">{"−"}0.5 · 0 · +0.5</span>
      </span>
      <span>
        {layout === "radial"
          ? "Distance from the quarterback: average depth of target"
          : "Height: average depth of target (to scale). Left to right: which side he is targeted on more"}
      </span>
    </div>
  );
}

export const NETWORK_SIZE = SIZE;
