// Career profile (rounds five to ten): the Dashboard radar's stats, every season, as a
// table or as a small chart per stat. A chart opens bigger in a pop-out, zoomed to his
// own range, with his number or his percentile (his number by default, his pick in November 2026), and
// the arrow keys step through the stats.
import { useEffect, useMemo, useState } from "react";
import { Dialog } from "../../ui/Dialog";
import { Segmented } from "../../team/Segmented";
import { forPosition } from "../../../constants/playerPage";
import { RADAR_STATS } from "../../../constants/playerTabs";
import { formatSigned, formatStat } from "../../../utils/format";
import { positionName } from "../cardParts";
import { Panel, heatFill, lin, pctColor, smoothPath } from "./common";

const SIGNED = new Set(["epa", "receiving_epa", "rushing_epa", "cpoe", "ngs_rush_yards_over_expected_per_att"]);

export function statText(metric, id, value) {
  if (value == null) return "-";
  const format = metric?.format ?? 1;
  if (format === "pct") return `${(value * 100).toFixed(1)}%`;
  return SIGNED.has(id) ? formatSigned(value, format) : formatStat(value, format);
}

function lowerFirst(label) {
  return /[A-Z]{2}/.test(label) ? label : label.toLowerCase();
}

/** One stat across seasons: his number or his percentile. `big` is the pop-out. */
function SeasonLine({ seasons, stat, metric, view, big = false }) {
  const values = seasons.map((entry) => (view === "pct" ? entry.percentiles?.[stat.id] : entry[stat.id]));
  const present = values.filter((value) => value != null);
  const w = big ? 760 : 220;
  const h = big ? 360 : 92;
  const L = big ? 56 : 6, R = big ? 30 : 6, T = big ? 34 : 10, B = big ? 40 : 16;
  let lo;
  let hi;
  if (view === "pct") {
    lo = big ? Math.max(0, Math.floor((Math.min(...present) - 8) / 10) * 10) : 0;
    hi = big ? Math.min(100, Math.ceil((Math.max(...present) + 8) / 10) * 10) : 100;
  } else {
    const min = Math.min(...present);
    const max = Math.max(...present);
    const pad = (max - min || Math.abs(max) || 1) * (big ? 0.18 : 0.12);
    lo = min - pad;
    hi = max + pad;
  }
  const x = lin(0, Math.max(1, seasons.length - 1), L, w - R);
  const y = lin(lo, hi, h - B, T);
  const points = values.map((value, index) => (value == null ? null : [x(index), y(value)])).filter(Boolean);
  const latestPct = seasons[seasons.length - 1]?.percentiles?.[stat.id];
  const color = pctColor(latestPct);
  const text = (value) => (view === "pct" ? String(value) : statText(metric, stat.id, value));
  const ticks = big ? Array.from({ length: 5 }, (_, index) => lo + ((hi - lo) / 4) * index) : [];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="block h-auto w-full" role="img" aria-label={stat.label}>
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={L} x2={w - R} y1={y(tick)} y2={y(tick)} stroke="var(--divider)" />
          <text x={L - 8} y={y(tick) + 3.5} textAnchor="end" fontSize="11" fill="var(--faint)" className="stat-num">{text(view === "pct" ? Math.round(tick) : tick)}</text>
        </g>
      ))}
      {view === "pct" && !big && <line x1={L} x2={w - R} y1={y(50)} y2={y(50)} stroke="var(--divider)" strokeDasharray="3 4" />}
      {points.length > 1 && (
        <>
          <path d={`${smoothPath(points)} L${points[points.length - 1][0]},${h - B} L${points[0][0]},${h - B} Z`} fill={color} fillOpacity="0.12" />
          <path d={smoothPath(points)} fill="none" stroke={color} strokeWidth={big ? 3 : 2} strokeLinecap="round" />
        </>
      )}
      {values.map((value, index) => {
        if (value == null) return null;
        const pct = seasons[index].percentiles?.[stat.id];
        return (
          <g key={seasons[index].season}>
            <circle cx={x(index)} cy={y(value)} r={big ? 7 : 3} fill={pctColor(pct)} stroke="var(--surface-solid)" strokeWidth={big ? 2 : 1} />
            {big && (
              <>
                <text x={x(index)} y={y(value) - 13} textAnchor="middle" fontSize="12.5" fontWeight="800" fill="var(--fg)" className="stat-num">{text(value)}</text>
                {view !== "pct" && pct != null && (
                  <text x={x(index)} y={y(value) + 22} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={pctColor(pct)} className="stat-num">{pct}</text>
                )}
              </>
            )}
          </g>
        );
      })}
      {(big || seasons.length <= 8) && seasons.map((entry, index) => (
        <text key={entry.season} x={x(index)} y={h - (big ? 14 : 3)} textAnchor="middle" fontSize={big ? 11.5 : 8.5} fill="var(--faint)" className="stat-num">
          {big ? entry.season : `'${String(entry.season).slice(2)}`}
        </text>
      ))}
    </svg>
  );
}

function ChartTile({ stat, seasons, metric, onOpen }) {
  const latest = seasons[seasons.length - 1];
  const previous = seasons[seasons.length - 2];
  const pct = latest?.percentiles?.[stat.id];
  const change = pct != null && previous?.percentiles?.[stat.id] != null ? pct - previous.percentiles[stat.id] : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="rounded-2xl border border-line p-2.5 text-left transition hover:border-[color:var(--border-strong)]"
      style={{ background: "color-mix(in srgb, var(--fg) 3%, transparent)" }}
      title="Open bigger"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[11.5px] font-bold text-fg">{stat.label}</span>
        {change != null && (
          <span className="stat-num text-[10.5px] font-bold" style={{ color: change > 0 ? "var(--pos)" : change < 0 ? "var(--neg)" : "var(--muted)" }}>
            {change > 0 ? "▲" : change < 0 ? "▼" : "="} {Math.abs(change)}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="stat-num text-[17px] font-extrabold text-fg">{statText(metric, stat.id, latest?.[stat.id])}</span>
        {pct != null && <span className="stat-num text-[11px] font-bold" style={{ color: pctColor(pct) }}>{pct}</span>}
      </div>
      <SeasonLine seasons={seasons} stat={stat} metric={metric} view="value" />
    </button>
  );
}

function PopOut({ stats, index, seasons, metrics, position, onIndex, onClose }) {
  const [view, setView] = useState("value");
  const stat = stats[index];
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "ArrowRight") onIndex((index + 1) % stats.length);
      if (event.key === "ArrowLeft") onIndex((index - 1 + stats.length) % stats.length);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, stats.length, onIndex]);
  const label = metrics[stat.id]?.label ?? stat.label;
  return (
    <Dialog open title={label} onClose={onClose} width="max-w-3xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented
          options={[{ value: "value", label: "Number" }, { value: "pct", label: "Percentile" }]}
          value={view}
          onChange={setView}
          label="Show"
        />
        <div className="flex gap-1.5">
          <button type="button" className="btn-ghost px-2.5 py-1 text-xs" onClick={() => onIndex((index - 1 + stats.length) % stats.length)}>← Prev</button>
          <button type="button" className="btn-ghost px-2.5 py-1 text-xs" onClick={() => onIndex((index + 1) % stats.length)}>Next →</button>
        </div>
      </div>
      <SeasonLine seasons={seasons} stat={stat} metric={metrics[stat.id]} view={view} big />
      <p className="mt-2 text-[11.5px] text-faint">
        {view === "pct"
          ? `Percentile in ${lowerFirst(label)} among qualified ${positionName(position)}, each season. The axis is zoomed to fit.`
          : `${label} each season, the percentile under each point. The axis is zoomed to fit.`}{" "}
        Arrow keys step through the stats.
      </p>
    </Dialog>
  );
}

export function CareerProfile({ page, detail }) {
  const { position, metrics, season } = page;
  const [view, setView] = useState("charts");
  const [open, setOpen] = useState(null);
  const stats = forPosition(RADAR_STATS, position);
  const seasons = useMemo(() => [...(detail.data?.data ?? [])].sort((a, b) => a.season - b.season), [detail.data]);

  if (detail.isLoading) return <section className="glass-card h-72 animate-pulse" />;
  if (!seasons.length) return null;
  return (
    <Panel
      title="Career profile"
      sub={`The percentile profile's stats, every season, as a percentile among qualified ${positionName(position)}`}
      controls={<Segmented options={[{ value: "table", label: "Table" }, { value: "charts", label: "Charts" }]} value={view} onChange={setView} label="View" />}
    >
      {view === "charts" ? (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {stats.map((stat, index) => (
              <ChartTile key={stat.id} stat={stat} seasons={seasons} metric={metrics[stat.id]} onOpen={() => setOpen(index)} />
            ))}
          </div>
          <p className="mt-2 text-[11.5px] text-faint">Each season's number, each point coloured by its percentile. The big number is {seasons[seasons.length - 1]?.season}'s, the arrow its change in percentile from the season before. Click a chart to open it bigger.</p>
        </>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[12px]">
            <thead>
              <tr className="border-b border-line text-[9.5px] uppercase tracking-[0.06em] text-faint">
                <th className="pin-col px-2 py-1.5 font-semibold">Season</th>
                {stats.map((stat) => <th key={stat.id} className="px-1.5 py-1.5 text-right font-semibold">{stat.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {[...seasons].reverse().map((entry) => (
                <tr key={entry.season} className={entry.season === season ? "font-semibold" : ""}>
                  <td className="pin-col stat-num px-2 py-1 text-fg">{entry.season} <span className="text-faint">{entry.team_abbreviation}</span></td>
                  {stats.map((stat) => {
                    const pct = entry.percentiles?.[stat.id];
                    return (
                      <td key={stat.id} className="px-0.5 py-0.5">
                        <div className="rounded-md px-1.5 py-1 text-right" style={{ background: heatFill(pct ?? null) }}>
                          <div className="stat-num text-fg">{statText(metrics[stat.id], stat.id, entry[stat.id])}</div>
                          <div className="stat-num text-[9.5px] text-muted">{pct ?? "-"}</div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open != null && (
        <PopOut stats={stats} index={open} seasons={seasons} metrics={metrics} position={position} onIndex={setOpen} onClose={() => setOpen(null)} />
      )}
    </Panel>
  );
}
