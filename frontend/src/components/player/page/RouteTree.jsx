// The Route Tree (round eight, tiles from November 2026): the targets a receiver drew (or a
// quarterback's throws) by the route the receiver ran. One tile per route with its shape as
// a small glyph, its targets and share, a bar against the most-used route and the EPA per
// target, sorted by targets, beside a table of the same routes. From the participation
// feed, which arrives a season behind, so the page opens on the newest season it has and
// says so.
import { useState } from "react";
import { usePlayerRoutes } from "../../../hooks/usePlayer";
import { ChartTooltip, hoverProps, useChartTooltip } from "../../explore/ChartTooltip";
import { Legend } from "../../explore/common";
import { Segmented } from "../../team/Segmented";
import { epaColor } from "../../../utils/explore";
import { routeGroup } from "../../../constants/playerTabs";
import { Panel, tint } from "./common";

// Each route's shape in a 42 x 50 box: the snap at (21,44), the line of scrimmage through
// it, the sideline to the left and the middle of the field to the right.
const GLYPH = {
  Go: "M21,44 L21,5",
  Post: "M21,44 L21,22 L35,8",
  Corner: "M21,44 L21,22 L7,8",
  In: "M21,44 L21,24 L38,24",
  Out: "M21,44 L21,24 L4,24",
  Hitch: "M21,44 L21,16 L15,23",
  Slant: "M21,44 L21,38 L37,20",
  Cross: "M21,44 L21,40 Q25,32 39,30",
  Angle: "M21,44 L13,38 L33,26",
  Flat: "M21,44 Q12,42 3,34",
  Screen: "M21,44 Q31,50 39,47",
  Wheel: "M21,44 Q8,42 6,32 L4,6",
};

function Glyph({ name, color }) {
  return (
    <svg viewBox="0 0 42 50" className="h-[50px] w-[32px] shrink-0 sm:w-[42px]" aria-hidden="true">
      <line x1="2" x2="40" y1="44" y2="44" stroke="var(--divider)" strokeDasharray="3 3" />
      <path
        d={GLYPH[name] ?? GLYPH.Go}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={name === "Screen" ? "4 4" : undefined}
      />
      <circle cx="21" cy="44" r="2.6" fill="var(--fg)" />
    </svg>
  );
}

const signed = (value) => `${value > 0 ? "+" : ""}${value.toFixed(2)}`;

function fold(routes) {
  const out = {};
  for (const route of routes) {
    const name = routeGroup(route.route);
    const entry = out[name] ?? (out[name] = { n: 0, rec: 0, yds: 0, td: 0, epa: 0 });
    for (const key of ["n", "rec", "yds", "td", "epa"]) entry[key] += route[key] ?? 0;
  }
  return out;
}

export function RouteTree({ page }) {
  const { playerId, position, season: pageSeason } = page;
  const passer = position === "QB";
  const [season, setSeason] = useState(null);
  const { data, isLoading } = usePlayerRoutes(playerId, passer ? "passer" : "receiver", season);
  const tip = useChartTooltip();
  if (isLoading) return <section className="glass-card h-80 animate-pulse p-5" />;
  if (!data?.season) return null;

  const routes = fold(data.routes);
  const tagged = Object.values(routes).reduce((sum, route) => sum + route.n, 0) || 1;
  const names = [...new Set([...Object.keys(GLYPH), ...Object.keys(routes)])];
  const order = names.sort((a, b) => (routes[b]?.n ?? 0) - (routes[a]?.n ?? 0));
  const most = Math.max(1, ...Object.values(routes).map((route) => route.n));
  const unit = passer ? "throws" : "targets";
  const short = passer ? "att" : "tgt";
  const behind = pageSeason > data.season
    ? `, so ${pageSeason} arrives in February`
    : "";
  return (
    <Panel
      title="Route Tree"
      sub={`${data.season} · ${data.charted} of ${data.total} ${unit} with a charted route. Routes publish after the season${behind}`}
      controls={data.seasons.length > 1 && (
        <Segmented
          options={data.seasons.slice(0, 4).map((value) => ({ value: String(value), label: String(value) }))}
          value={String(data.season)}
          onChange={(value) => setSeason(Number(value))}
          label="Season"
        />
      )}
    >
      <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {order.map((name) => {
              const route = routes[name];
              if (!route) {
                return (
                  <div key={name} className="flex items-center gap-1.5 rounded-2xl border border-line px-2 py-2 opacity-45 sm:gap-2">
                    <Glyph name={name} color="var(--faint)" />
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-bold text-fg">{name}</div>
                      <div className="text-[11px] text-muted">None</div>
                    </div>
                  </div>
                );
              }
              const epa = route.epa / route.n;
              const color = epaColor(epa);
              return (
                <div
                  key={name}
                  className="flex items-center gap-1.5 rounded-2xl border border-line px-2 py-2 sm:gap-2"
                  style={{ background: "color-mix(in srgb, var(--fg) 2.5%, transparent)" }}
                  {...hoverProps(tip, (
                    <div>
                      <b className="text-fg">{name}</b>
                      <div className="text-muted">{route.n} {unit} ({Math.round((route.n / tagged) * 100)}%)</div>
                      <div className="text-muted">Caught {route.rec}, {route.yds} yards, {route.td} TD</div>
                      <div className="text-muted">{signed(epa)} EPA per {passer ? "throw" : "target"}</div>
                    </div>
                  ))}
                >
                  <Glyph name={name} color={color} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-1.5">
                      <span className="truncate text-[12.5px] font-bold text-fg">{name}</span>
                      <span className="stat-num text-[12px] font-extrabold" style={{ color }}>{signed(epa)}</span>
                    </div>
                    <div className="stat-num mt-0.5 text-[11px] text-muted">{route.n} {short} · {Math.round((route.n / tagged) * 100)}%</div>
                    <div className="mt-1.5 h-[5px] overflow-hidden rounded-full" style={{ background: tint(7) }}>
                      <div className="h-full rounded-full" style={{ width: `${((route.n / most) * 100).toFixed(1)}%`, background: color }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <Legend>
            <span>Line: the route's shape</span>
            <span>Bar: {unit} against the most-used route</span>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-2.5 w-11 rounded" style={{ background: `linear-gradient(90deg, ${epaColor(-0.4)}, ${epaColor(0.2)}, ${epaColor(0.8)})` }} />
              EPA per {passer ? "throw" : "target"}, worse to better
            </span>
          </Legend>
        </div>
        <div>
          <div className="grid grid-cols-[minmax(0,1fr)_3rem_3.5rem_3.5rem_3.75rem] gap-2 border-b border-line pb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
            <span>Route</span><span className="text-right">{passer ? "Att" : "Tgt"}</span><span className="text-right">Catch</span><span className="text-right">Yds/T</span><span className="text-right">EPA/T</span>
          </div>
          {order.filter((name) => routes[name]).map((name) => {
            const route = routes[name];
            const epa = route.epa / route.n;
            return (
              <div key={name} className="grid grid-cols-[minmax(0,1fr)_3rem_3.5rem_3.5rem_3.75rem] gap-2 border-b border-line py-1.5 text-[12.5px]">
                <span className="font-semibold text-fg">{name}</span>
                <span className="stat-num text-right text-fg">{route.n}</span>
                <span className="stat-num text-right text-muted">{Math.round((route.rec / route.n) * 100)}%</span>
                <span className="stat-num text-right text-muted">{(route.yds / route.n).toFixed(1)}</span>
                <span className="stat-num text-right font-extrabold" style={{ color: epaColor(epa) }}>{signed(epa)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <ChartTooltip tip={tip} />
    </Panel>
  );
}
