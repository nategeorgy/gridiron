// The Highlighted Viz of the Week's passing network as a broadcast graphic (November 2026).
//
// The same network Explore draws, turned on its side to fill the card: the quarterback in
// the shotgun on the -5, each receiver out at his average depth of target (across, to
// scale) and toward the side he is targeted on more (up is the quarterback's left). A
// line's width is targets, its colour EPA per target. The passer's name sits on the field
// like a TV graphic, and the five most-targeted receivers hang under it as a lower third:
// tiles in the team's colours on a wide card, rows on a narrow one. The lower third is
// part of the SVG, so it exports with the field.
//
// Drawn at the width it is shown rather than scaled from a fixed box, so the type stays
// the size it is set at on a phone. An export passes `width` and renders without the
// router or React Query (utils/exportImage.js renders it offscreen).
import { useState } from "react";
import { ChartTooltip, hoverProps, useChartTooltip } from "../explore/ChartTooltip";
import { ClipDef, SvgHeadshot, useClipId } from "../explore/SvgHeadshot";
import { receiverTip } from "../explore/NetworkChart";
import { inkOn } from "../game/colors";
import { epaColor, lastName, positionColor, signed } from "../../utils/explore";
import { useElementWidth } from "../../hooks/useElementWidth";

const EPA_SPAN = 0.5; // the network's own ramp, so the legend reads the same as Explore's
const NEAR = -9;
const FAR = 26;
const QB_YARD = -5;
const DEPTH_LABELS = [["Behind", -4.5], ["Short", 4.5], ["Intermediate", 14.5], ["Deep", 23]];
const LEADERS = 5;
const TILE_GAP = 12;
const TILE_FULL = 240; // a tile at least this wide has room for catches and "of targets"
const TILE_MIN = 176;  // narrower than this, the five become rows
const SANS = "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const percent = (value) => `${Math.round(value * 100)}%`;

let measureContext = null;
/** The largest size from `size` down to `min` at which a bold name fits `maxWidth`. */
function fitSize(text, maxWidth, size, min) {
  if (typeof document === "undefined") return size;
  measureContext ??= document.createElement("canvas").getContext("2d");
  let fitted = size;
  for (; fitted > min; fitted -= 0.5) {
    measureContext.font = `700 ${fitted}px ${SANS}`;
    if (measureContext.measureText(text).width <= maxWidth) break;
  }
  return fitted;
}

/**
 * Push apart any two receivers whose face and name plate overlap, then ease back toward
 * where the data puts them. `fixed` holds the quarterback, who never moves: a receiver
 * that lands on him is pushed downfield or to the side.
 */
function relax(nodes, bounds, halfWidth, plate, fixed = []) {
  for (const node of nodes) {
    node.x = node.ax;
    node.y = node.ay;
    node.half = Math.max(node.r, halfWidth);
  }
  const pad = 10;
  const overlap = (a, b) => [
    Math.min(a.x + a.half, b.x + b.half) - Math.max(a.x - a.half, b.x - b.half) + pad,
    Math.min(a.y + a.r + plate, b.y + b.r + plate) - Math.max(a.y - a.r, b.y - b.r) + pad,
  ];
  for (let pass = 0; pass < 300; pass += 1) {
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        const [overlapX, overlapY] = overlap(a, b);
        if (overlapX <= 0 || overlapY <= 0) continue;
        if (overlapY < overlapX) {
          const sign = a.y < b.y || (a.y === b.y && a.ay <= b.ay) ? 1 : -1;
          a.y -= (sign * overlapY) / 2;
          b.y += (sign * overlapY) / 2;
        } else {
          const sign = a.x < b.x || (a.x === b.x && a.ax <= b.ax) ? 1 : -1;
          a.x -= (sign * overlapX) / 2;
          b.x += (sign * overlapX) / 2;
        }
      }
    }
    for (const node of nodes) {
      for (const anchor of fixed) {
        const [overlapX, overlapY] = overlap(node, anchor);
        if (overlapX <= 0 || overlapY <= 0) continue;
        if (overlapY < overlapX) node.y += node.y < anchor.y ? -overlapY : overlapY;
        else node.x += overlapX;
      }
    }
    for (const node of nodes) {
      node.x += (node.ax - node.x) * 0.03;
      node.y += (node.ay - node.y) * 0.03;
      node.x = Math.max(bounds.x0, Math.min(bounds.x1, node.x));
      node.y = Math.max(bounds.y0, Math.min(bounds.y1, node.y));
    }
  }
  return nodes;
}

/**
 * @param shown        receivers from shapeNetwork (each with share and lean)
 * @param team         the passer's team: { abbreviation, color, color2, logo_url }
 * @param eyebrow      the line over the name, e.g. "Season long pass attempts"
 * @param width        draw at this width instead of the measured one (exports)
 * @param interactive  hover focus, tooltips and clicks (off for exports)
 */
export function BroadcastField({ passer, shown, team, eyebrow, width: fixedWidth, interactive = true, onSelect }) {
  const [ref, measured] = useElementWidth();
  const clipId = useClipId();
  const tip = useChartTooltip();
  const [focus, setFocus] = useState(null);
  const W = fixedWidth ?? measured;

  if (!W) return <div ref={ref} style={{ minHeight: 600 }} />;

  const phone = W < 700;
  const fieldH = phone ? 600 : 640;
  const top = phone ? 150 : 172;
  const bottom = fieldH - 34;
  const stripe = phone ? 30 : 64;
  const headX = stripe + (phone ? 14 : 28);
  const x = (depth) => stripe + (phone ? 14 : 30) + ((depth - NEAR) / (FAR - NEAR)) * (W - (phone ? 12 : 30) - stripe - (phone ? 14 : 30));
  const lean = Math.max(0.15, ...shown.map((receiver) => Math.abs(receiver.lean))) * 1.25;
  // The offense moves right, so the quarterback's left is up the screen.
  const y = (value) => top + 44 + ((value + lean) / (2 * lean)) * (bottom - 58 - top - 44);

  // The lower third: the five most-targeted, as tiles when five fit across, else as rows.
  const leaders = [...shown].sort((a, b) => b.targets - a.targets).slice(0, LEADERS);
  const tileWidth = (W - TILE_GAP * (LEADERS - 1)) / LEADERS;
  const lower = !leaders.length ? null : tileWidth < TILE_MIN ? "rows" : tileWidth < TILE_FULL ? "compact" : "tiles";
  const rowH = phone ? 52 : 58;
  const lowerH = { tiles: 116, compact: 104, rows: 40 + leaders.length * rowH + 12 }[lower] ?? 0;
  const lowerY = fieldH + 14;
  const H = lower ? lowerY + lowerH : fieldH;

  const plate = phone ? 30 : 40;
  const halfWidth = phone ? 34 : 48;
  const qb = { x: x(QB_YARD), y: y(0), r: phone ? 20 : 36 };
  qb.half = Math.max(qb.r, halfWidth);
  const most = Math.max(1, ...shown.map((receiver) => receiver.targets));
  const radius = phone ? [11, 20] : [18, 34];
  const nodes = relax(
    shown.map((receiver) => ({
      receiver,
      r: radius[0] + (radius[1] - radius[0]) * Math.sqrt(receiver.targets / most),
      width: 2 + ((phone ? 13 : 24) - 2) * (receiver.targets / most),
      ax: x(Math.max(-4, Math.min(25, receiver.adot ?? 0))),
      ay: y(receiver.lean),
    })),
    { x0: x(-4), x1: W - 50, y0: top + 44, y1: bottom - 46 },
    halfWidth,
    plate,
    [qb],
  );

  const name = passer.name;
  const sub = [`${passer.completions} of ${passer.attempts}, ${passer.passing_yards.toLocaleString()} yards`, `${passer.passing_tds} TD, ${passer.interceptions} INT in ${passer.games} game${passer.games === 1 ? "" : "s"}`];

  const primary = team?.color || "var(--surface-2)";
  const secondary = team?.color2 || "var(--accent)";
  const ink = team?.color ? inkOn(team.color) : "var(--fg)";
  const inkSub = `color-mix(in srgb, ${ink} 62%, transparent)`;
  const inkLine = `color-mix(in srgb, ${ink} 14%, transparent)`;
  const tileFill = team?.color ? `url(#${clipId}-tile)` : "var(--surface-2)";
  const faint = (amount) => `color-mix(in srgb, var(--fg) ${amount}%, transparent)`;
  const halo = { paintOrder: "stroke", stroke: "var(--surface-solid)", strokeWidth: 3.5, strokeLinejoin: "round" };
  const itemClass = (receiver) => `net-item${focus === receiver.player_id ? " is-lit" : ""}`;
  const events = (receiver) => (interactive ? {
    ...hoverProps(tip, () => receiverTip(receiver, passer), {
      onEnter: () => setFocus(receiver.player_id),
      onLeave: () => setFocus(null),
    }),
    onClick: () => onSelect?.(receiver.player_id),
    style: { cursor: "pointer" },
  } : {});
  const mono = (size, fill, extra = {}) => ({ fontSize: size, fontWeight: 700, fill, ...extra });
  const epaChip = (value, cx, cy, chipWidth, size) => (
    <g>
      <rect x={cx - chipWidth / 2} y={cy - 11} width={chipWidth} height={22} rx={7} fill={`color-mix(in srgb, ${epaColor(value, EPA_SPAN)} 40%, transparent)`} />
      <text className="mono" x={cx} y={cy} dy="0.36em" textAnchor="middle"
        style={{ ...mono(size, `color-mix(in srgb, ${epaColor(value, EPA_SPAN)} 45%, ${ink})`), fontWeight: 800 }}>{signed(value, 2)}</text>
    </g>
  );

  const yardLines = [-5, 0, 5, 10, 15, 20, 25];
  const hashes = [];
  for (let yard = -8; yard <= 25; yard += 1) hashes.push(yard);

  // One tile: face, name and share up top, the numbers across the bottom.
  const tile = (receiver, index) => {
    const tx = index * (tileWidth + TILE_GAP);
    const y0 = lowerY;
    const ring = positionColor(receiver.position);
    const last = lastName(receiver.name);
    const full = lower === "tiles";
    const faceX = tx + (full ? 42 : 32);
    const faceY = y0 + (full ? 44 : 38);
    const nameX = tx + (full ? 80 : 62);
    const nameRoom = full ? tileWidth - 80 - 14 - 56 - 8 : tileWidth - 62 - 12;
    const nameSize = fitSize(last, nameRoom, full ? 15 : 14, 11);
    const cells = full
      ? [["TGT", receiver.targets, 1], ["REC", receiver.receptions, 1], ["YDS", receiver.yards.toLocaleString(), 1], ["TD", receiver.touchdowns, 1]]
      : [["TGT", receiver.targets, 0.8], ["YDS", receiver.yards.toLocaleString(), 1.3], ["TD", receiver.touchdowns, 0.6], ["EPA/T", signed(receiver.epa_per_target, 2), 1.4]];
    const unit = (tileWidth - 32) / cells.reduce((sum, cell) => sum + cell[2], 0);
    let cursor = tx + 16;
    return (
      <g key={`tile-${receiver.player_id}`} className={itemClass(receiver)} {...events(receiver)}>
        <rect x={tx} y={y0} width={tileWidth} height={lowerH} rx={14} fill={tileFill} />
        <rect x={tx} y={y0} width={tileWidth} height={4} rx={2} fill={ring} />
        <g transform={`translate(${faceX} ${faceY})`}>
          <SvgHeadshot url={receiver.headshot_url} name={receiver.name} r={full ? 26 : 22} ring={ring} ringWidth={3} clipId={clipId} />
        </g>
        <text x={nameX} y={y0 + (full ? 38 : 35)} style={{ fontSize: nameSize, fontWeight: 700, fill: ink }}>{last}</text>
        <text className="mono" x={nameX} y={y0 + (full ? 56 : 52)} style={{ fontSize: full ? 11.5 : 11, fill: inkSub }}>
          {receiver.position} {"·"} {percent(receiver.share)}{full ? " of targets" : ""}
        </text>
        {full && epaChip(receiver.epa_per_target, tx + tileWidth - 14 - 28, y0 + 27, 56, 11.5)}
        {cells.map(([label, value, weight], cellIndex) => {
          const cx = cursor;
          cursor += weight * unit;
          const epa = label === "EPA/T";
          return (
            <g key={label}>
              {cellIndex > 0 && <line x1={cx - 4} x2={cx - 4} y1={y0 + (full ? 80 : 70)} y2={y0 + (full ? 104 : 94)} stroke={inkLine} />}
              <text className="mono" x={cx + 4} y={y0 + (full ? 92 : 82)}
                style={mono(full ? 17 : 15, epa ? `color-mix(in srgb, ${epaColor(receiver.epa_per_target, EPA_SPAN)} 55%, ${ink})` : ink)}>{value}</text>
              <text className="mono" x={cx + 4} y={y0 + (full ? 106 : 96)} style={mono(9.5, inkSub, { letterSpacing: "0.08em" })}>{label}</text>
            </g>
          );
        })}
      </g>
    );
  };

  // On a narrow card: one team-colour panel, a row per receiver.
  const rowsPanel = () => {
    const left = phone ? 16 : 24;
    const right = W - (phone ? 14 : 22);
    const y0 = lowerY + 40;
    const columns = phone
      ? [["targets", "TGT", right - 150], ["yards", "YDS", right - 104], ["touchdowns", "TD", right - 70], ["epa", "EPA/T", right - 29]]
      : [["targets", "TGT", right - 214], ["receptions", "REC", right - 168], ["yards", "YDS", right - 112], ["touchdowns", "TD", right - 74], ["epa", "EPA/T", right - 29]];
    const faceR = Math.min(20, rowH * 0.36);
    const nameX = left + faceR * 2 + 14;
    return (
      <g>
        <rect y={lowerY} width={W} height={lowerH} rx={16} fill={tileFill} />
        <text className="mono" x={left} y={y0 - 10} style={mono(10, inkSub, { letterSpacing: "0.12em" })}>TOP {leaders.length} TARGETS</text>
        {columns.map(([key, label, cx]) => (
          <text key={key} className="mono" x={cx} y={y0 - 10} textAnchor={key === "epa" ? "middle" : "end"}
            style={mono(10, inkSub, { letterSpacing: "0.08em" })}>{label}</text>
        ))}
        {leaders.map((receiver, index) => {
          const cy = y0 + index * rowH + rowH / 2;
          const last = lastName(receiver.name);
          return (
            <g key={`row-${receiver.player_id}`} className={itemClass(receiver)} {...events(receiver)}>
              <rect x={left} y={y0 + index * rowH} width={right - left} height={rowH} fill="transparent" />
              {index > 0 && <line x1={left} x2={right} y1={y0 + index * rowH} y2={y0 + index * rowH} stroke={inkLine} />}
              <g transform={`translate(${left + faceR + 2} ${cy})`}>
                <SvgHeadshot url={receiver.headshot_url} name={receiver.name} r={faceR} ring={positionColor(receiver.position)} ringWidth={2.5} clipId={clipId} />
              </g>
              <text x={nameX} y={cy - 3} style={{ fontSize: fitSize(last, columns[0][2] - 34 - nameX, 14.5, 11), fontWeight: 700, fill: ink }}>{last}</text>
              <text className="mono" x={nameX} y={cy + 13} style={{ fontSize: 11, fill: inkSub }}>{receiver.position} {"·"} {percent(receiver.share)}</text>
              {columns.map(([key, , cx]) => (key === "epa"
                ? <g key={key}>{epaChip(receiver.epa_per_target, cx, cy, 58, 12)}</g>
                : <text key={key} className="mono" x={cx} y={cy} dy="0.36em" textAnchor="end" style={mono(15, ink)}>{Number(receiver[key]).toLocaleString()}</text>))}
            </g>
          );
        })}
      </g>
    );
  };

  return (
    <div ref={ref}>
      <svg className={`chart${focus ? " is-focused" : ""}`} viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img"
        aria-label={`${name} passing network: each receiver at his average depth of target and side of the field, then the five most-targeted receivers' numbers`}>
        <defs>
          <ClipDef id={clipId} />
          {team?.color && (
            <linearGradient id={`${clipId}-tile`} x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor={team.color} />
              <stop offset="1" stopColor={`color-mix(in srgb, ${team.color} 84%, #5a7bb5)`} />
            </linearGradient>
          )}
        </defs>

        {/* the field */}
        <rect width={W} height={fieldH} rx={16} fill="color-mix(in srgb, var(--turf) 16%, var(--surface-solid))" />
        {[-5, 5, 15].map((yard) => (
          <rect key={yard} x={x(yard)} y={top} width={x(yard + 5) - x(yard)} height={bottom - top} fill="color-mix(in srgb, var(--turf) 9%, transparent)" />
        ))}
        {yardLines.map((yard) => (
          <g key={yard}>
            <line x1={x(yard)} x2={x(yard)} y1={top} y2={bottom}
              stroke={yard === 0 ? "color-mix(in srgb, var(--accent) 55%, transparent)" : faint(11)} strokeWidth={yard === 0 ? 2.5 : 1} />
            <text className="mono" x={x(yard)} y={fieldH - 12} textAnchor="middle"
              style={{ fontSize: phone ? 10 : 12, fontWeight: 700, fill: yard === 0 ? "var(--accent)" : faint(34) }}>
              {yard === 0 ? "LOS" : yard > 0 ? `+${yard}` : yard}
            </text>
          </g>
        ))}
        {hashes.map((yard) => (
          <g key={yard} stroke={faint(14)}>
            <line x1={x(yard)} x2={x(yard)} y1={top} y2={top + 7} />
            <line x1={x(yard)} x2={x(yard)} y1={bottom} y2={bottom - 7} />
          </g>
        ))}
        {/* the team's end zone */}
        <path d={`M16,0 H${stripe} V${fieldH} H16 a16,16 0 0 1 -16,-16 V16 a16,16 0 0 1 16,-16 Z`} fill={primary} />
        <rect x={stripe - 4} width={4} height={fieldH} fill={secondary} />
        {team?.logo_url && (
          <image href={team.logo_url} x={stripe / 2 - 2 - (phone ? 11 : 20)} y={(top + bottom) / 2 - (phone ? 11 : 20)}
            width={phone ? 22 : 40} height={phone ? 22 : 40} preserveAspectRatio="xMidYMid meet" />
        )}
        {DEPTH_LABELS.map(([label, yard]) => (
          <text key={label} x={x(yard)} y={top + 22} textAnchor="middle"
            style={{ fontSize: phone ? 9 : 11, fontWeight: 700, letterSpacing: "0.12em", fill: faint(38) }}>{label.toUpperCase()}</text>
        ))}

        {/* the headline, like a broadcast graphic */}
        <text className="mono" x={headX} y={phone ? 30 : 38}
          style={{ fontSize: phone ? 10 : 12, fontWeight: 700, letterSpacing: "0.16em", fill: "var(--accent)" }}>{eyebrow.toUpperCase()}</text>
        <text x={headX} y={phone ? 68 : 92} style={{ fontSize: phone ? 32 : 52, fontWeight: 800, letterSpacing: "-0.03em", fill: "var(--fg)" }}>{name}</text>
        {phone
          ? sub.map((line, index) => <text key={line} x={headX} y={94 + index * 18} style={{ fontSize: 13, fill: "var(--muted)" }}>{line}</text>)
          : <text x={headX} y={126} style={{ fontSize: 16, fill: "var(--muted)" }}>{sub.join(", ")}</text>}

        {/* lines from the quarterback */}
        <g>
          {nodes.map((node) => {
            const mid = (qb.x + node.x) / 2;
            return (
              <path key={`edge-${node.receiver.player_id}`} className={itemClass(node.receiver)}
                d={`M${qb.x},${qb.y} C${mid},${qb.y} ${mid},${node.y} ${node.x},${node.y}`}
                fill="none" stroke={epaColor(node.receiver.epa_per_target, EPA_SPAN)} strokeWidth={node.width}
                strokeLinecap="round" opacity={0.88} {...events(node.receiver)} />
            );
          })}
        </g>

        {/* faces, then every name plate over them */}
        {nodes.map((node) => (
          <g key={`node-${node.receiver.player_id}`} className={itemClass(node.receiver)} {...events(node.receiver)}>
            <g transform={`translate(${node.x} ${node.y})`}>
              <SvgHeadshot url={node.receiver.headshot_url} name={node.receiver.name} r={node.r}
                ring={positionColor(node.receiver.position)} ringWidth={phone ? 2.5 : 3.5} clipId={clipId} />
            </g>
          </g>
        ))}
        <g style={{ pointerEvents: "none" }}>
          {nodes.map((node) => (
            <g key={`plate-${node.receiver.player_id}`} className={itemClass(node.receiver)}>
              <text x={node.x} y={node.y + node.r + (phone ? 13 : 17)} textAnchor="middle"
                style={{ fontSize: phone ? 11 : 14, fontWeight: 700, fill: "var(--fg)", ...halo }}>{lastName(node.receiver.name)}</text>
              <text className="mono" x={node.x} y={node.y + node.r + (phone ? 25 : 33)} textAnchor="middle"
                style={{ fontSize: phone ? 9.5 : 11.5, fill: "var(--muted)", ...halo }}>
                {node.receiver.targets} tgt {"·"} {percent(node.receiver.share)}
              </text>
            </g>
          ))}
        </g>
        <g transform={`translate(${qb.x} ${qb.y})`}>
          <SvgHeadshot url={passer.headshot_url} name={passer.name} r={qb.r} ring={positionColor("QB")} ringWidth={3.5} clipId={clipId} />
        </g>
        <text x={qb.x} y={qb.y + (phone ? 34 : 54)} textAnchor="middle"
          style={{ fontSize: phone ? 11 : 14, fontWeight: 700, fill: "var(--fg)", ...halo }}>{lastName(passer.name)}</text>

        {/* the lower third */}
        {lower === "rows" ? rowsPanel() : leaders.map(tile)}
      </svg>
      {interactive && <ChartTooltip tip={tip} />}
    </div>
  );
}
