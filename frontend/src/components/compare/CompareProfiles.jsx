// Player Comparison's percentile profile (November 2026): three cards, each its own
// view of the same percentiles (options V1 to V3, all three kept, one after another).
//
//   pizzas  one pizza per player in the tweet kit's D25 style, the same slices in the same
//           order; hovering a slice lights that stat on all of them (V1)
//   radar   every shape on one radar, one player filled in front with the percentiles on
//           its points, the rest as outlines; a name picks who is in front (V2)
//   strips  each stat as a track from 0 to 100 with every face at its percentile (V3)
//
// Percentiles are within each player's own position and season, so a mixed comparison
// still means something: a pizza takes its player's own position's slices, while the radar
// and the strips keep the stats every compared position shares.
import { useState } from "react";
import { forPosition } from "../../constants/playerPage";
import { PIZZA_STATS, RADAR_STATS } from "../../constants/playerTabs";
import { isAsIf } from "../../utils/qualifiers";
import { ChartTooltip, hoverProps, useChartTooltip } from "../explore/ChartTooltip";
import { CardTitle, Headshot } from "../explore/common";
import { teamText } from "../game/colors";
import { PercentileStrips } from "../player/PercentileStrips";
import { PizzaChart, PizzaKey } from "../player/PizzaChart";
import { statText } from "../player/page/Radar";
import { positionName } from "../player/cardParts";

const ordinal = (n) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

/** The radar stats every compared position shares, in the first position's order. */
export function sharedRadarStats(positions) {
  const lists = [...new Set(positions.filter(Boolean))].map((position) => forPosition(RADAR_STATS, position));
  if (!lists.length) return [];
  return lists[0].filter((stat) => lists.every((list) => list.some((other) => other.id === stat.id)));
}

function Pizzas({ slots, metrics }) {
  const tip = useChartTooltip();
  const [hot, setHot] = useState(null);
  return (
    <div>
      <div className="grid gap-x-4 gap-y-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 330px), 1fr))" }}>
        {slots.map((slot) => (
          <div key={slot.key} className="min-w-0 text-center">
            <div className="flex items-baseline justify-center gap-2">
              <b className="truncate text-[14px] text-fg">{slot.fullLabel}</b>
              <span className="stat-num shrink-0 text-xs text-muted">{slot.team} · {statText(metrics, "fantasy_ppg", slot.row?.fantasy_ppg)} PPG</span>
            </div>
            {slot.row ? (
              <PizzaChart stats={forPosition(PIZZA_STATS, slot.position)} row={slot.row} name={slot.fullLabel} metrics={metrics}
                headshot={slot.headshot_url} ring={slot.color} hot={hot} onHot={setHot} tip={tip} />
            ) : (
              <p className="py-16 text-xs text-muted">No stats in these weeks.</p>
            )}
          </div>
        ))}
      </div>
      <ChartTooltip tip={tip} />
    </div>
  );
}

/** Every shape on one radar, one in front (V2). */
function SpotlightRadar({ slots, stats, metrics, spot, onSpot }) {
  const tip = useChartTooltip();
  const ready = slots.filter((slot) => slot.row);
  const shown = stats.filter((stat) => ready.every((slot) => slot.row.percentiles?.[stat.id] != null));
  if (shown.length < 3) return <p className="py-10 text-center text-xs text-muted">These players share too few ranked stats for a radar.</p>;
  const lead = ready.find((slot) => slot.key === spot) ?? ready[0];
  const width = 640;
  const height = 500;
  const radius = 175;
  const cx = width / 2;
  const cy = height / 2 + 6;
  const n = shown.length;
  const point = (index, value) => {
    const angle = (Math.PI * 2 * index) / n - Math.PI / 2;
    return [cx + Math.cos(angle) * radius * (value / 100), cy + Math.sin(angle) * radius * (value / 100)];
  };
  const ring = (value) => shown.map((_, index) => point(index, value).join(",")).join(" ");
  const others = ready.filter((slot) => slot !== lead);
  return (
    <div>
      <div className="mb-1 flex flex-wrap justify-center gap-1.5" role="group" aria-label="Player in front">
        {ready.map((slot) => {
          const on = slot === lead;
          return (
            <button key={slot.key} type="button" aria-pressed={on} onClick={() => onSpot(slot.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border py-[3px] pl-[3px] pr-2.5 text-xs font-semibold transition ${on ? "text-fg" : "text-muted opacity-60 hover:opacity-100"}`}
              style={{ borderColor: on ? slot.color : "var(--line)", background: on ? `color-mix(in srgb, ${slot.color} 14%, var(--surface-solid))` : "var(--surface-solid)" }}>
              <Headshot url={slot.headshot_url} name={slot.name} size={22} ring={slot.color} />
              {slot.label}
            </button>
          );
        })}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="mx-auto block h-auto w-full" style={{ maxWidth: width }} role="img" aria-label="Percentile radar">
        {[25, 50, 75, 100].map((value) => (
          <polygon key={value} points={ring(value)} fill={value === 100 ? "color-mix(in srgb, var(--fg) 2%, transparent)" : "none"} stroke="var(--divider)" />
        ))}
        {shown.map((stat, index) => {
          const [ex, ey] = point(index, 100);
          const [lx, ly] = point(index, 118);
          const anchor = Math.abs(lx - cx) < 12 ? "middle" : lx > cx ? "start" : "end";
          const base = ly < cy - radius * 0.6 ? ly - 14 : ly;
          const mine = lead.row.percentiles[stat.id];
          const place = ready.filter((slot) => slot.row.percentiles[stat.id] > mine).length + 1;
          return (
            <g key={stat.id}>
              <line x1={cx} y1={cy} x2={ex} y2={ey} stroke="var(--divider)" />
              <text x={lx} y={base} textAnchor={anchor} fontSize="11.5" fontWeight="650" fill="var(--fg)">{stat.label}</text>
              <text x={lx} y={base + 14} textAnchor={anchor} fontSize="11" className="stat-num">
                <tspan style={{ fill: teamText(lead.color) }} fontWeight="800">{statText(metrics, stat.id, lead.row[stat.id])}</tspan>
                <tspan fill="var(--faint)"> {place === 1 ? `best of ${ready.length}` : `${ordinal(place)} of ${ready.length}`}</tspan>
              </text>
            </g>
          );
        })}
        {[...others, lead].map((slot) => {
          const on = slot === lead;
          return (
            <polygon key={slot.key} points={shown.map((stat, index) => point(index, slot.row.percentiles[stat.id]).join(",")).join(" ")}
              style={{ fill: slot.color, stroke: slot.color }} fillOpacity={on ? 0.2 : 0} strokeWidth={on ? 3 : 1.6} strokeOpacity={on ? 1 : 0.55} strokeLinejoin="round" />
          );
        })}
        {shown.map((stat, index) => {
          const percentile = lead.row.percentiles[stat.id];
          const open = isAsIf(lead.row, stat.id);
          const [px, py] = point(index, percentile);
          const content = (
            <div>
              <div className="font-semibold text-fg">{lead.fullLabel}</div>
              <div className="mt-1 text-muted">{metrics?.[stat.id]?.label ?? stat.label}: <b className="stat-num text-fg">{statText(metrics, stat.id, lead.row[stat.id])}</b></div>
              <div className="text-muted">{percentile} percentile{open ? ", as if qualified" : ""}</div>
              <div className="mt-1 border-t border-line pt-1">
                {others.map((slot) => (
                  <div key={slot.key} className="flex justify-between gap-4 text-muted">
                    <span>{slot.label}</span><b className="stat-num text-fg">{statText(metrics, stat.id, slot.row[stat.id])}</b>
                  </div>
                ))}
              </div>
            </div>
          );
          return (
            <g key={stat.id} {...hoverProps(tip, content)}>
              {open ? (
                <circle cx={px} cy={py} r="10.5" fill="var(--surface-solid)" style={{ stroke: lead.color }} strokeWidth="2" strokeDasharray="3.4 2.4" />
              ) : (
                <circle cx={px} cy={py} r="10.5" style={{ fill: lead.color }} stroke="var(--surface-solid)" strokeWidth="1.5" />
              )}
              <text x={px} y={py + 3.5} textAnchor="middle" fontSize="9.5" fontWeight="800" className="stat-num" pointerEvents="none"
                fill={open ? "var(--muted)" : "#0b0d12"}>{percentile}</text>
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-center text-[11.5px] text-faint">Pick a name to bring that player forward. Under each label: that player's number and where it sits among the {ready.length}.</p>
      <ChartTooltip tip={tip} />
    </div>
  );
}

export function CompareProfiles({ slots, metrics }) {
  const [spot, setSpot] = useState(null);
  const positions = [...new Set(slots.map((slot) => slot.position).filter(Boolean))];
  const stats = sharedRadarStats(positions);
  const ready = slots.filter((slot) => slot.row);
  const among = positions.length > 1
    ? "Percentiles within each player's own position and season"
    : `Percentiles among qualified ${positionName(positions[0])} that season`;
  return (
    <>
      <section className="glass-card min-w-0 p-4">
        <CardTitle title="Percentile pizzas" sub={`${among}. One slice per stat, clockwise from the top. Hover a slice to light it on every pizza`}>
          {positions.map((position) => (
            <span key={position} className="flex items-center gap-1.5">
              {positions.length > 1 && <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-faint">{position}</span>}
              <PizzaKey stats={forPosition(PIZZA_STATS, position)} />
            </span>
          ))}
        </CardTitle>
        <Pizzas slots={slots} metrics={metrics} />
      </section>
      <section className="glass-card min-w-0 p-4">
        <CardTitle title="Percentile radar" sub={`${among}. Every player on one radar`} />
        <SpotlightRadar slots={slots} stats={stats} metrics={metrics} spot={spot} onSpot={setSpot} />
      </section>
      <section className="glass-card min-w-0 p-4">
        <CardTitle title="Percentile strips" sub={`${among}. Each stat from 0 to 100, the best number at the end. Hover a face for the number`} />
        <PercentileStrips
          stats={stats}
          players={ready.map((slot) => ({ key: slot.key, name: slot.fullLabel, short: slot.label, color: slot.color, headshot: slot.headshot_url, row: slot.row }))}
          metrics={metrics}
        />
      </section>
    </>
  );
}
