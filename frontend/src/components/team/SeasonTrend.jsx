// A team's EPA per play week by week: each game as a connected line, the team's season
// to date, the league's season to date (dashed), and the middle half of the league's
// single games that week as a band.
//
// Defense EPA is plotted with the axis flipped so up is always better.
import { useState } from "react";
import { formatTeamStat } from "../../utils/teamStats";
import { Segmented } from "./Segmented";

const METRICS = [
  { key: "net", label: "Net EPA", title: "Net EPA per play" },
  { key: "off", label: "Offense EPA", title: "Offense EPA per play" },
  { key: "def", label: "Defense EPA", title: "Defense EPA per play", invert: true },
];

function ticks(lo, hi) {
  const step = [0.05, 0.1, 0.2, 0.25, 0.5, 1].find((s) => (hi - lo) / s <= 6) ?? 1;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(3)));
  return out;
}

export function SeasonTrend({ trend, abbreviation, logos, selectedWeeks }) {
  const [metricKey, setMetricKey] = useState("net");
  const metric = METRICS.find((m) => m.key === metricKey);
  const points = trend?.[metricKey] ?? [];
  const W = 900, H = 280, ml = 46, mr = 64, mt = 16, mb = 46;
  const values = points.flatMap((p) => [p.value, p.to_date, p.league_to_date, p.league_q25, p.league_q75]).filter((v) => v !== null && v !== undefined);
  let lo = values.length ? Math.min(...values) : -0.2, hi = values.length ? Math.max(...values) : 0.2;
  const pad = (hi - lo) * 0.08 || 0.1; lo -= pad; hi += pad;
  const nWeeks = Math.max(points.length, 4);
  const X = (i) => ml + (i / Math.max(1, nWeeks - 1)) * (W - ml - mr);
  const Y = (v) => { const t = (v - lo) / (hi - lo); return mt + (metric.invert ? t : 1 - t) * (H - mt - mb); };
  const line = (key) => points.map((p, i) => (p[key] === null || p[key] === undefined ? null : `${X(i)},${Y(p[key])}`)).filter(Boolean).join(" ");
  const band = points.map((p, i) => ({ i, lo: p.league_q25, hi: p.league_q75 })).filter((b) => b.lo !== null && b.lo !== undefined);
  const games = points.map((p, i) => ({ ...p, i })).filter((p) => p.value !== null && p.value !== undefined);
  const toDate = points.map((p, i) => ({ ...p, i })).filter((p) => p.to_date !== null && p.to_date !== undefined);
  const last = toDate[toDate.length - 1];
  const selected = selectedWeeks?.length && selectedWeeks.length < points.length ? selectedWeeks : null;
  const indexOf = (week) => points.findIndex((p) => p.week === week);

  return (
    <section className="glass-card p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-fg">Season trend</h2>
          <p className="text-[11.5px] text-faint">{metric.title}, game by game</p>
        </div>
        <Segmented label="Trend metric" value={metricKey} onChange={setMetricKey} options={METRICS.map((m) => ({ value: m.key, label: m.label }))} />
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`${metric.title} by week`}>
        {ticks(lo, hi).map((v) => (
          <g key={v}>
            <line x1={ml} x2={W - mr} y1={Y(v)} y2={Y(v)} stroke="var(--divider)" />
            <text x={ml - 8} y={Y(v) + 3} textAnchor="end" fontSize="10" fill="var(--faint)">{Math.abs(v) < 1e-9 ? "0" : formatTeamStat(v, "sgn2")}</text>
          </g>
        ))}
        {selected && (
          <rect x={X(indexOf(Math.min(...selected))) - 10} y={mt} width={X(indexOf(Math.max(...selected))) - X(indexOf(Math.min(...selected))) + 20}
            height={H - mt - mb} rx="6" fill="color-mix(in srgb, var(--accent) 7%, transparent)" />
        )}
        {band.length > 1 && (
          <polygon fill="color-mix(in srgb, var(--fg) 9%, transparent)"
            points={`${band.map((b) => `${X(b.i)},${Y(b.hi)}`).join(" ")} ${band.slice().reverse().map((b) => `${X(b.i)},${Y(b.lo)}`).join(" ")}`} />
        )}
        <polyline points={line("league_to_date")} fill="none" stroke="var(--plot-rule)" strokeWidth="1.6" strokeDasharray="5 4" opacity="0.85" />
        <polyline points={line("to_date")} fill="none" stroke="var(--fg)" strokeWidth="2.4" strokeLinejoin="round" opacity="0.72" />
        <polyline points={games.map((p) => `${X(p.i)},${Y(p.value)}`).join(" ")} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
        {games.map((p) => (
          <circle key={p.week} cx={X(p.i)} cy={Y(p.value)} r="3.6" fill="var(--accent)" stroke="var(--surface-solid)" strokeWidth="1.4">
            <title>{`Week ${p.week}: ${formatTeamStat(p.value, "sgn2")}${p.points_for !== null ? ` (${p.points_for > p.points_against ? "W" : p.points_for < p.points_against ? "L" : "T"} ${p.points_for}–${p.points_against})` : ""}`}</title>
          </circle>
        ))}
        {last && (
          <g>
            <circle cx={X(last.i)} cy={Y(last.to_date)} r="4.5" fill="var(--fg)" stroke="var(--surface-solid)" strokeWidth="1.6" />
            <text x={X(last.i) + 10} y={Y(last.to_date) + 4} fontSize="12" fontWeight="700" fill="var(--fg)">{formatTeamStat(last.to_date, "sgn2")}</text>
            <text x={X(last.i) + 10} y={Y(last.to_date) + 16} fontSize="9.5" fill="var(--faint)">to date</text>
          </g>
        )}
        <text x="4" y={H - mb + 14} fontSize="10" fill="var(--faint)">Wk</text>
        {points.map((p, i) => (
          <g key={p.week}>
            <text x={X(i)} y={H - mb + 14} textAnchor="middle" fontSize="10" fill="var(--faint)">{p.week}</text>
            {p.opponent && logos?.[p.opponent] ? (
              <image href={logos[p.opponent]} x={X(i) - 8} y={H - mb + 19} width="16" height="16" opacity="0.85"><title>{`Week ${p.week} ${p.home ? "vs" : "at"} ${p.opponent}`}</title></image>
            ) : p.value === null ? <text x={X(i)} y={H - mb + 31} textAnchor="middle" fontSize="9" fill="var(--faint)">bye</text> : null}
          </g>
        ))}
        {metric.invert && <text x={W - mr} y={mt - 4} textAnchor="end" fontSize="10" fill="var(--faint)">Axis flipped: up is better</text>}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-faint">
        <span className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 bg-accent" />{abbreviation} each game</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-4" style={{ background: "color-mix(in srgb, var(--fg) 72%, transparent)" }} />{abbreviation} season to date</span>
        <span className="flex items-center gap-1.5"><i className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: "var(--plot-rule)" }} />League average, season to date</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2 w-4 rounded-sm" style={{ background: "color-mix(in srgb, var(--fg) 12%, transparent)" }} />Middle half of the league that week</span>
      </div>
    </section>
  );
}
