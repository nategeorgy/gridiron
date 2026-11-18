// Player Comparison's week by week (November 2026): rolling lines (W1) and the weekly
// finishes on the finish bands (W2).
//
// The lines are the Compare tab's line chart for up to five: each player's average to date
// (or over the last three games) after every game, smoothed, with a name card at the right
// end. A share is the mean of the weekly shares, the definition every share average here
// uses. Each line runs over its own season's weeks, so two seasons share an axis by week.
import { useState } from "react";
import { WEEKLY_STATS } from "../../constants/compare";
import { scoringLabel } from "../../constants/scoring";
import { formatStat } from "../../utils/format";
import { lastName, niceTicks } from "../../utils/explore";
import { CardTitle, Foot, Headshot } from "../explore/common";
import { Select } from "../ui/Select";
import { ExportImageButton } from "../explore/ExportImageButton";
import { ClipDef, SvgHeadshot, useClipId } from "../explore/SvgHeadshot";
import { teamText } from "../game/colors";
import { finishBands, finishTier } from "../player/FinishChip";
import { Crosshair, ReadoutRow, smoothPath, useSvgRef } from "../player/page/common";
import { Segmented } from "../team/Segmented";

export const WINDOWS = [
  { value: "todate", label: "Season to date" },
  { value: "last3", label: "Last 3 games" },
];

/** The weeks on the x-axis: the picked weeks, or every week up to the last game played. */
export function weekRange(slots, weeks) {
  if (weeks) return weeks.split(",").map(Number).sort((a, b) => a - b);
  const last = Math.max(1, ...slots.flatMap((slot) => slot.log.map((line) => line.week)));
  return Array.from({ length: last }, (_, index) => index + 1);
}

function rolling(slot, stat, window, shown) {
  const inWeeks = new Set(shown);
  const games = slot.log
    .filter((line) => inWeeks.has(line.week) && line[stat] !== null && line[stat] !== undefined)
    .sort((a, b) => a.week - b.week);
  return games.map((line, index) => {
    const take = window === "last3" ? games.slice(Math.max(0, index - 2), index + 1) : games.slice(0, index + 1);
    return { week: line.week, value: take.reduce((total, game) => total + game[stat], 0) / take.length, game: line[stat], line };
  });
}

/** The chart alone, so the export can draw it without the page around it. */
export function RollingChart({ slots, weeks, stat, window, interactive = false }) {
  const option = WEEKLY_STATS.find((entry) => entry.value === stat) ?? WEEKLY_STATS[0];
  const clipId = useClipId();
  const svgRef = useSvgRef();
  const shown = weekRange(slots, weeks);
  const first = shown[0] ?? 1;
  const last = shown[shown.length - 1] ?? 18;
  const share = option.format === "pct";
  const series = slots.map((slot) => ({ slot, points: rolling(slot, stat, window, shown) }));
  const values = series.flatMap((entry) => entry.points.map((point) => point.value));
  const width = 1180;
  const height = 340;
  const L = 46;
  const R = 186;
  const T = 16;
  const B = 30;
  const hi = Math.max(1e-9, ...values) * 1.06;
  const lo = share ? Math.max(0, Math.min(...values, 1) - 0.05) : 0;
  const ticks = niceTicks(lo, hi, 5);
  const top = Math.max(ticks[ticks.length - 1] ?? hi, hi);
  const bottom = Math.min(ticks[0] ?? lo, lo);
  const X = (week) => L + ((week - first) / Math.max(1, last - first)) * (width - L - R);
  const Y = (value) => height - B - ((value - bottom) / (top - bottom || 1)) * (height - T - B);
  const show = (value) => (share ? `${Math.round(value * 100)}%` : formatStat(value, value >= 100 ? "int" : 1));

  // Name cards at the right end, pushed apart so none overlaps.
  const ends = series.filter((entry) => entry.points.length).map((entry) => {
    const end = entry.points[entry.points.length - 1];
    return { slot: entry.slot, value: end.value, x: X(end.week), y0: Y(end.value), y: Y(end.value) };
  }).sort((a, b) => a.y - b.y);
  for (let index = 1; index < ends.length; index += 1) if (ends[index].y - ends[index - 1].y < 30) ends[index].y = ends[index - 1].y + 30;
  const over = ends.length ? ends[ends.length - 1].y - (height - B) : 0;
  if (over > 0) ends.forEach((end) => { end.y -= over; });
  const under = ends.length ? T + 13 - ends[0].y : 0;
  if (under > 0) ends.forEach((end) => { end.y += under; });

  const stops = shown.map((week) => {
    const rows = [];
    const readout = [];
    series.forEach(({ slot, points }) => {
      const hit = points.find((point) => point.week === week);
      if (hit) rows.push({ py: Y(hit.value), color: slot.color });
      readout.push(
        <ReadoutRow key={slot.key} color={slot.color} label={slot.label}
          value={hit ? show(hit.value) : "no game"} note={hit ? `this game ${show(hit.game)}${hit.line.opponent_abbreviation ? ` vs ${hit.line.opponent_abbreviation}` : ""}` : null} />,
      );
    });
    return { px: X(week), rows, content: <div><div className="mb-1 font-semibold text-fg">Week {week} · {window === "last3" ? "last three games" : "to date"}</div>{readout}</div> };
  });

  return (
    <svg ref={svgRef} className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${option.label} by week`}>
      <defs><ClipDef id={clipId} /></defs>
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={L} x2={width - R} y1={Y(tick)} y2={Y(tick)} stroke="var(--divider)" />
          <text x={L - 8} y={Y(tick) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--faint)" className="stat-num">{share ? `${Math.round(tick * 100)}%` : tick}</text>
        </g>
      ))}
      {shown.map((week) => <text key={week} x={X(week)} y={height - 10} textAnchor="middle" fontSize="10.5" fill="var(--faint)" className="stat-num">{week}</text>)}
      {series.map(({ slot, points }) => (
        <g key={slot.key}>
          <path d={smoothPath(points.map((point) => [X(point.week), Y(point.value)]))} fill="none" style={{ stroke: slot.color }}
            strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((point) => <circle key={point.week} cx={X(point.week)} cy={Y(point.value)} r="3" style={{ fill: slot.color }} />)}
        </g>
      ))}
      {ends.map((end) => {
        const cardX = width - R + 16;
        const cardW = R - 22;
        return (
          <g key={end.slot.key}>
            <line x1={end.x + 4} x2={cardX} y1={end.y0} y2={end.y} style={{ stroke: end.slot.color }} strokeOpacity="0.45" />
            <rect x={cardX} y={end.y - 13} width={cardW} height="26" rx="13"
              style={{ fill: `color-mix(in srgb, ${end.slot.color} 16%, var(--surface-solid))`, stroke: `color-mix(in srgb, ${end.slot.color} 55%, transparent)` }} />
            <g transform={`translate(${cardX + 13},${end.y})`}>
              <SvgHeadshot url={end.slot.headshot_url} name={end.slot.name} r={11} ring={end.slot.color} ringWidth={1.5} clipId={clipId} />
            </g>
            <text x={cardX + 30} y={end.y + 4} fontSize="11.5" fontWeight="750" fill="var(--fg)">{end.slot.label.length > 13 ? lastName(end.slot.name) : end.slot.label}</text>
            <text x={cardX + cardW - 10} y={end.y + 4} textAnchor="end" fontSize="11.5" fontWeight="800" className="stat-num" style={{ fill: teamText(end.slot.color) }}>{show(end.value)}</text>
          </g>
        );
      })}
      {interactive && <Crosshair stops={stops} box={{ w: width, h: height, L, R, T, B }} svgRef={svgRef} />}
    </svg>
  );
}

export function RollingCard({ slots, weeks, stat, onStat, window, onWindow }) {
  const option = WEEKLY_STATS.find((entry) => entry.value === stat) ?? WEEKLY_STATS[0];
  const loading = slots.some((slot) => !slot.log.length && slot.row);
  const per = option.format === "pct" ? "" : " per game";
  return (
    <section className="glass-card min-w-0 p-4">
      <CardTitle title="Week by week" sub={`${option.label}${per}, ${window === "last3" ? "over each player's last three games" : "season to date"}, after every game. Hover to read every line`}>
        <Select value={stat} onChange={onStat} options={WEEKLY_STATS.map(({ value, label }) => ({ value, label }))} />
        <Segmented label="Window" value={window} onChange={onWindow} options={WINDOWS} />
        <ExportImageButton title={`${option.label}${per}, ${window === "last3" ? "last three games" : "season to date"}`} subtitle={slots.map((slot) => slot.fullLabel).join(" · ")}
          render={() => <RollingChart slots={slots} weeks={weeks} stat={stat} window={window} />} sizes={["fit", "wide"]} />
      </CardTitle>
      {loading ? <div className="h-[300px] animate-pulse rounded-xl bg-surface-2" /> : (
        <div className="overflow-x-auto"><div className="min-w-[720px]"><RollingChart slots={slots} weeks={weeks} stat={stat} window={window} interactive /></div></div>
      )}
      <Foot>Weeks without a game are skipped. Across seasons, each line runs over its own season's weeks.</Foot>
    </section>
  );
}

/** Every week's finish on the finish bands, with the top-band counts and the average finish (W2). */
export function FinishesCard({ slots, weeks, scoring }) {
  const shown = weekRange(slots, weeks);
  const positions = [...new Set(slots.map((slot) => slot.position).filter(Boolean))];
  const single = positions.length === 1 ? positions[0] : null;
  const bands = single ? finishBands(single) : null;
  const heads = single
    ? [`${single}1-${bands[0].to}`, `${single}1-${bands[1].to}`, "Avg"]
    : ["Top band", "Top two", "Avg"];
  const template = `170px repeat(${shown.length}, minmax(28px, 1fr)) 60px 60px 56px`;
  return (
    <section className="glass-card min-w-0 p-4">
      <CardTitle title="Weekly finishes" sub={`Rank at the position each week, in ${scoringLabel(scoring)}, coloured by the finish bands. Hover a week for the points`} />
      <div className="overflow-x-auto">
        <div className="stat-num grid gap-[4px] text-[11px]" style={{ minWidth: 360 + shown.length * 32 }}>
          <div className="grid items-center gap-[4px]" style={{ gridTemplateColumns: template }}>
            <div />
            {shown.map((week) => <div key={week} className="text-center text-[10.5px] text-faint">{week}</div>)}
            {heads.map((head) => <div key={head} className="text-center text-[10.5px] text-faint">{head}</div>)}
          </div>
          {slots.map((slot) => {
            const byWeek = new Map(slot.log.map((line) => [line.week, line]));
            const ends = finishBands(slot.position);
            let first = 0;
            let second = 0;
            let sum = 0;
            let count = 0;
            const cells = shown.map((week) => {
              const line = byWeek.get(week);
              if (!line || !line.position_rank) {
                return <div key={week} className="grid h-[30px] place-items-center rounded-[7px] text-faint" style={{ background: "color-mix(in srgb, var(--fg) 4%, transparent)" }} title={`${slot.name}, Week ${week}: no game`}>·</div>;
              }
              const rank = line.position_rank;
              if (rank <= ends[0].to) first += 1;
              if (rank <= ends[1].to) second += 1;
              sum += rank;
              count += 1;
              const tier = finishTier(rank, slot.position);
              return (
                <div key={week} className="grid h-[30px] place-items-center rounded-[7px] font-bold"
                  style={{ background: tier.background, color: tier.color }}
                  title={`${slot.name}, Week ${week}: ${slot.position}${rank} · ${formatStat(line.fantasy_points, 1)} points vs ${line.opponent_abbreviation ?? ""}`}>
                  {rank}
                </div>
              );
            });
            const total = (value) => <div className="grid h-[30px] place-items-center rounded-[7px] text-[12px] font-bold text-fg" style={{ background: "color-mix(in srgb, var(--fg) 5%, transparent)" }}>{value}</div>;
            return (
              <div key={slot.key} className="grid items-center gap-[4px]" style={{ gridTemplateColumns: template }}>
                <div className="flex min-w-0 items-center gap-2 font-sans text-[12.5px] font-bold text-fg">
                  <Headshot url={slot.headshot_url} name={slot.name} size={26} ring={slot.color} />
                  <span className="truncate">{slot.fullLabel}</span>
                </div>
                {cells}
                {total(first)}
                {total(second)}
                {total(count ? (sum / count).toFixed(1) : "-")}
              </div>
            );
          })}
        </div>
      </div>
      {single && (
        <div className="stat-num mt-3 flex flex-wrap gap-1.5 text-[11px] font-bold">
          {bands.map((band) => {
            const tier = finishTier(band.from, single);
            return <span key={band.from} className="rounded-md px-2 py-0.5" style={{ background: tier.background, color: tier.color }}>{band.label}</span>;
          })}
        </div>
      )}
    </section>
  );
}
