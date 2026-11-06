// "Who threw to him" (rounds six and seven): a receiver's or back's numbers in the games
// each quarterback started, read from the box score (the quarterback with the most
// attempts that game). Career, or one season. Each number is coloured where he was better
// or worse than with every quarterback together, and the tick on each bar is that overall
// number; a career card lists the seasons under it.
import { useState } from "react";
import { usePlayerByQuarterback } from "../../../hooks/usePlayer";
import { Headshot } from "../../explore/common";
import { Segmented } from "../../team/Segmented";
import { ringColors } from "../cardParts";
import { Panel } from "./common";

const METRICS = [
  { label: "PPG", long: "Fantasy points per game", value: (a) => (a.games ? a.fantasy_points / a.games : null), text: (v) => v.toFixed(1), range: [0, 30] },
  { label: "TGT%", long: "Target share", value: (a) => (a.team_targets ? a.targets / a.team_targets : null), text: (v) => `${(v * 100).toFixed(1)}%`, range: [0, 0.4] },
  { label: "YPRR", long: "Yards per route run", value: (a) => (a.routes_run ? a.route_yards / a.routes_run : null), text: (v) => v.toFixed(2), range: [0, 4] },
  { label: "TPRR", long: "Targets per route run", value: (a) => (a.routes_run ? a.route_targets / a.routes_run : null), text: (v) => v.toFixed(2), range: [0, 0.4] },
  { label: "EPA/TGT", long: "Receiving EPA per target", value: (a) => (a.epa_targets ? a.receiving_epa / a.epa_targets : null), text: (v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}`, range: [-0.5, 1] },
];
const SUMMED = ["games", "fantasy_points", "targets", "team_targets", "receptions", "receiving_yards", "receiving_epa", "epa_targets", "routes_run", "route_targets", "route_yards"];

function total(rows) {
  const out = Object.fromEntries(SUMMED.map((key) => [key, 0]));
  rows.forEach((row) => SUMMED.forEach((key) => { out[key] += row[key] ?? 0; }));
  return out;
}

function Cell({ metric, values, base, color, compare }) {
  const value = metric.value(values);
  if (value == null) {
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint">{metric.label}</span>
        <b className="stat-num text-[17px] font-extrabold text-faint">-</b>
      </div>
    );
  }
  const [lo, hi] = metric.range;
  const zero = Math.max(0, Math.min(1, (0 - lo) / (hi - lo)));
  const at = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
  const overall = base == null ? null : metric.value(base);
  const diff = overall == null || !compare ? null : value - overall;
  const tone = diff == null ? null : diff > (hi - lo) * 0.02 ? "var(--pos)" : diff < -(hi - lo) * 0.02 ? "var(--neg)" : null;
  return (
    <div className="flex min-w-0 flex-col gap-1" title={`${metric.long}: ${metric.text(value)}${overall != null ? `\nWith every quarterback: ${metric.text(overall)}` : ""}`}>
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint">{metric.label}</span>
      <b className="stat-num text-[17px] font-extrabold" style={{ color: tone ?? "var(--fg)" }}>{metric.text(value)}</b>
      <span className="relative block h-[5px] rounded-full" style={{ background: "color-mix(in srgb, var(--fg) 8%, transparent)" }}>
        <i className="absolute inset-y-0 rounded-full" style={{ left: `${Math.min(zero, at) * 100}%`, width: `${Math.abs(at - zero) * 100}%`, background: color }} />
        {overall != null && compare && (
          <i className="absolute -inset-y-[3px] w-[2px]" style={{ left: `calc(${Math.max(0, Math.min(1, (overall - lo) / (hi - lo))) * 100}% - 1px)`, background: "var(--fg)" }} />
        )}
      </span>
    </div>
  );
}

export function ByQuarterback({ page }) {
  const { playerId, scoring, team } = page;
  const { data, isLoading } = usePlayerByQuarterback(playerId, scoring);
  const [scope, setScope] = useState("career");
  const [color] = ringColors(team);
  if (isLoading) return <section className="glass-card h-64 animate-pulse p-5" />;
  const rows = data?.rows ?? [];
  if (!rows.length) return null;

  const seasons = data.seasons;
  const key = scope === "career" || !seasons.includes(Number(scope)) ? "career" : Number(scope);
  const inScope = key === "career" ? rows : rows.filter((row) => row.season === key);
  // Career: one card per quarterback, his seasons under it.
  const groups = new Map();
  inScope.forEach((row) => {
    if (!groups.has(row.qb_id)) groups.set(row.qb_id, { qb_id: row.qb_id, name: row.name, headshot_url: row.headshot_url, seasons: [] });
    groups.get(row.qb_id).seasons.push(row);
  });
  const cards = [...groups.values()]
    .map((group) => ({ ...group, totals: total(group.seasons) }))
    .sort((a, b) => b.totals.games - a.totals.games);
  const overall = total(inScope);
  const compare = cards.length > 1;
  const options = [{ value: "career", label: "Career" }, ...seasons.slice(0, 2).map((s) => ({ value: String(s), label: String(s) }))];

  return (
    <Panel
      title="By quarterback"
      sub="Numbers in the games each quarterback started, by the quarterback with the most attempts that game"
      controls={<Segmented options={options} value={String(key)} onChange={setScope} label="Seasons" />}
    >
      <p className="mb-2.5 text-[12px] text-muted">
        {compare
          ? "Coloured better or worse than with every quarterback together; the tick on each bar is that overall number"
          : `Every game ${key === "career" ? "of the career" : `in ${key}`} has come with ${cards[0].name}${key === "career" ? ", so here is each season with that quarterback" : ""}.`}
      </p>
      <div className="space-y-2.5">
        {cards.map((card) => (
          <div key={card.qb_id} className="rounded-2xl border border-line px-3.5 py-3" style={{ background: "color-mix(in srgb, var(--fg) 4%, transparent)" }}>
            <div className="grid items-center gap-3.5 md:grid-cols-[minmax(200px,1.1fr)_minmax(0,3fr)]">
              <div className="flex min-w-0 items-center gap-3">
                <Headshot url={card.headshot_url} name={card.name} className="h-[46px] w-[46px] shrink-0 rounded-full" style={{ border: `2px solid ${color}`, background: "var(--surface-2)" }} />
                <div className="min-w-0">
                  <div className="truncate text-[14.5px] font-extrabold text-fg">{card.name}</div>
                  <div className="stat-num text-xs text-muted">
                    <b className="text-[15px] text-fg">{card.totals.games}</b> game{card.totals.games === 1 ? "" : "s"} together
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3.5 sm:grid-cols-5">
                {METRICS.map((metric) => (
                  <Cell key={metric.label} metric={metric} values={card.totals} base={overall} color={color} compare={compare} />
                ))}
              </div>
            </div>
            {key === "career" && (card.seasons.length > 1 || cards.length === 1) && (
              <div className="mt-2.5 grid gap-1 border-t border-line pt-2">
                {card.seasons.map((entry) => (
                  <div key={entry.season} className="grid items-center gap-3.5 text-[12.5px] md:grid-cols-[minmax(200px,1.1fr)_minmax(0,3fr)]">
                    <div className="flex items-center gap-2.5 md:pl-[58px]">
                      <span className="stat-num font-bold text-fg">{entry.season}</span>
                      <span className="stat-num text-faint">{entry.games} games</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3.5 sm:grid-cols-5">
                      {METRICS.map((metric) => {
                        const value = metric.value(entry);
                        return (
                          <span key={metric.label} className="stat-num text-fg">
                            <small className="mr-1 text-faint md:hidden">{metric.label}</small>
                            {value == null ? "-" : metric.text(value)}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}
