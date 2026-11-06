// "Most similar this season" (round ten, the closeness line): every qualified player at
// his position on one line by how close his percentile profile is to this player's, the
// five closest as faces. Click any dot to load that player into the head to head above.
// How closeness is computed lives in constants/similarity.js, so it can be swapped
// without touching this chart.
import { useMemo } from "react";
import { ChartTooltip, hoverProps, useChartTooltip } from "../../explore/ChartTooltip";
import { ClipDef, SvgHeadshot, useClipId } from "../../explore/SvgHeadshot";
import { usePhone } from "../../../hooks/useMediaQuery";
import { useHeadshots } from "../../../hooks/useExplore";
import { SIMILARITY_STATS, closeness } from "../../../constants/similarity";
import { forPosition } from "../../../constants/playerPage";
import { lastName } from "../../../utils/explore";
import { positionName, ringColors } from "../cardParts";
import { Panel, lin } from "./common";

const NAMES = { WR: "receiver", RB: "back", TE: "tight end", QB: "quarterback" };

/** Every other qualified player with his match to `mine`, closest first. */
export function rankSimilar(pool, mine, playerId, position) {
  const stats = forPosition(SIMILARITY_STATS, position);
  return pool
    .filter((row) => row.player_id !== playerId)
    .map((row) => ({ row, match: closeness(mine, row.percentiles, stats) }))
    .filter((entry) => entry.match != null)
    .sort((a, b) => b.match - a.match);
}

/** Dots along a horizontal line, stacked up and down as they collide. */
function swarm(items, r) {
  const placed = [];
  const gap = (2 * r + 0.8) ** 2;
  [...items].sort((a, b) => a.px - b.px).forEach((item) => {
    for (let k = 0; ; k += 1) {
      const dy = k === 0 ? 0 : Math.ceil(k / 2) * (r * 1.9) * (k % 2 ? 1 : -1);
      if (placed.every((p) => Math.abs(p.px - item.px) > 2 * r + 1 || (p.px - item.px) ** 2 + (p.dy - dy) ** 2 >= gap)) {
        item.dy = dy;
        placed.push(item);
        break;
      }
    }
  });
  return items;
}

export function MostSimilar({ page, ranked, onPick, selected }) {
  const { player, position, season, team } = page;
  const tip = useChartTooltip();
  const clipId = useClipId();
  const phone = usePhone();
  const top = ranked.slice(0, 5);
  const topIds = new Set(top.map((entry) => entry.row.player_id));
  const headshots = useHeadshots(top.map((entry) => entry.row.player_id));
  const stats = forPosition(SIMILARITY_STATS, position);
  const [ring] = ringColors(team);
  const median = ranked.length ? ranked[Math.floor(ranked.length / 2)].match : null;

  const layout = useMemo(() => {
    const w = phone ? 440 : 1040;
    const h = phone ? 220 : 250;
    const L = 30, R = phone ? 40 : 70;
    const base = h - 70;
    const low = ranked.length ? Math.max(0, Math.floor((ranked[ranked.length - 1].match - 2) / 10) * 10) : 0;
    const x = lin(low, 100, L, w - R);
    const r = phone ? 2.6 : 3.4;
    const dots = swarm(ranked.map((entry) => ({ ...entry, px: x(entry.match) })), r);
    // The five faces in a row above, in match order, kept apart.
    const faceY = phone ? 46 : 54;
    const spots = top.map((entry) => x(entry.match)).sort((a, b) => a - b);
    const minGap = phone ? 54 : 84;
    for (let i = spots.length - 2; i >= 0; i -= 1) spots[i] = Math.min(spots[i], spots[i + 1] - minGap);
    for (let i = 1; i < spots.length; i += 1) spots[i] = Math.max(spots[i], spots[i - 1] + minGap);
    const order = [...top].sort((a, b) => a.match - b.match);
    return { w, h, L, R, base, x, r, dots, faceY, faces: order.map((entry, index) => ({ entry, fx: Math.min(w - R - 40, spots[index]) })), low };
  }, [ranked, top, phone]);

  if (!ranked.length) {
    return (
      <Panel title="Most similar this season">
        <p className="py-8 text-center text-sm text-muted">Not enough qualified {positionName(position)} to compare this season.</p>
      </Panel>
    );
  }
  const { w, h, L, R, base, x, r, dots, faceY, faces, low } = layout;
  const faceR = phone ? 14 : 19;
  const ticks = Array.from({ length: Math.floor((100 - low) / 10) + 1 }, (_, index) => low + index * 10);

  return (
    <Panel
      title="Most similar this season"
      sub={`Every qualified ${positionName(position).replace(/s$/, "")} at the position on one line by closeness; the five closest as faces. ${stats.length} stats among ${positionName(position)}: ${stats.map((stat) => stat.label).join(", ")}`}
    >
      <svg viewBox={`0 0 ${w} ${h}`} className="block h-auto w-full" role="img" aria-label="Closeness to every player">
        <defs><ClipDef id={clipId} /></defs>
        <line x1={L} x2={w - R} y1={base} y2={base} stroke="var(--divider)" />
        {ticks.map((tick) => (
          <text key={tick} x={x(tick)} y={h - 14} textAnchor="middle" fontSize="10" fill="var(--faint)" className="stat-num">{tick}%</text>
        ))}
        {median != null && (
          <g>
            <line x1={x(median)} x2={x(median)} y1={base - 26} y2={base + 26} stroke="var(--muted)" strokeDasharray="3 3" />
            <text x={x(median)} y={base + 40} textAnchor="middle" fontSize="10.5" fill="var(--muted)">Typical {NAMES[position] ?? "player"} {median}%</text>
          </g>
        )}
        {faces.map(({ entry, fx }) => (
          <polyline
            key={`lead-${entry.row.player_id}`}
            points={`${fx},${faceY + faceR + 16} ${fx},${faceY + faceR + 26} ${x(entry.match)},${base - 8}`}
            fill="none"
            stroke={ring}
            strokeOpacity="0.7"
          />
        ))}
        {dots.map((dot) => {
          const isTop = topIds.has(dot.row.player_id);
          const lit = dot.row.player_id === selected;
          return (
            <circle
              key={dot.row.player_id}
              cx={dot.px}
              cy={base + dot.dy}
              r={lit ? r + 2 : r}
              fill={isTop || lit ? ring : "color-mix(in srgb, var(--fg) 45%, transparent)"}
              stroke={lit ? "var(--fg)" : "none"}
              style={{ cursor: "pointer" }}
              onClick={() => onPick(dot.row)}
              {...hoverProps(tip, <div><b className="text-fg">{dot.row.name}</b><div className="text-muted">{dot.row.team_abbreviation} · {dot.match}% similar</div><div className="text-faint">Click to load into the head to head</div></div>)}
            />
          );
        })}
        {faces.map(({ entry, fx }) => (
          <g key={entry.row.player_id} style={{ cursor: "pointer" }} onClick={() => onPick(entry.row)}>
            <g transform={`translate(${fx},${faceY})`}>
              <SvgHeadshot url={headshots[entry.row.player_id]} name={entry.row.name} r={faceR} ring={ring} clipId={clipId} />
            </g>
            <text x={fx} y={faceY + faceR + 13} textAnchor="middle" fontSize={phone ? 9.5 : 11} fontWeight="700" fill="var(--fg)">
              {lastName(entry.row.name)} <tspan fill={ring} className="stat-num" fontWeight="800">{entry.match}%</tspan>
            </text>
          </g>
        ))}
        <g transform={`translate(${x(100)},${base})`}>
          <SvgHeadshot url={player.headshot_url} name={player.name} r={phone ? 12 : 16} ring="var(--fg)" clipId={clipId} />
        </g>
        <text x={x(100)} y={base - (phone ? 18 : 24)} textAnchor="middle" fontSize="11" fontWeight="800" fill="var(--fg)">{lastName(player.name)}</text>
      </svg>
      <ChartTooltip tip={tip} />
      <p className="mt-1 text-[11.5px] text-faint">
        Every qualified {NAMES[position] ?? "player"} ({ranked.length}) placed by how closely each percentile profile matches {lastName(player.name)}'s, {lastName(player.name)} at 100%. {season}. Click one to load that player into the head to head.
      </p>
    </Panel>
  );
}
