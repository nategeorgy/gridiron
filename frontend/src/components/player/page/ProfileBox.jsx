// The Dashboard's first box (round ten, "Side by side"): his role at the top left, the
// percentile radar and the player card's percentile bars beside each other. Hovering a
// stat in either lights it in both.
import { useState } from "react";
import { ChartTooltip, useChartTooltip } from "../../explore/ChartTooltip";
import { StatTooltip, useStatTooltip } from "../../StatTooltip";
import { CARD_PERCENTILES, forPosition } from "../../../constants/playerPage";
import { RADAR_STATS, ROLE_RULES, roleLabel } from "../../../constants/playerTabs";
import { isMetricAvailable } from "../../../utils/availability";
import { asIfNote, isAsIf } from "../../../utils/qualifiers";
import { PercentileBar, cardValue, positionName, ringColors, statLabel, tint } from "../cardParts";
import { metricTip } from "../metricTip";
import { PercentileRadar } from "./Radar";
import { mix } from "./common";

function Role({ position, row, season, color }) {
  const role = roleLabel(position, row);
  if (!role) return null;
  return (
    <div
      className="min-w-0 rounded-2xl border px-4 py-3"
      style={{ borderColor: mix(color, 35), background: `linear-gradient(110deg, ${mix(color, 26)}, transparent 85%)` }}
      title={forPosition(ROLE_RULES, position)}
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-faint">{season} role</div>
      <div className="text-[22px] font-extrabold leading-tight tracking-tight text-fg">{role[0]}</div>
      <div className="text-xs text-muted">{role[1]}</div>
    </div>
  );
}

export function ProfileBox({ page }) {
  const { position, row, metrics, season, scoring, team, seasonQuery } = page;
  const [hot, setHot] = useState(null);
  const tip = useChartTooltip();
  const tooltip = useStatTooltip();
  const [color] = ringColors(team);

  if (seasonQuery.isLoading) return <section className="glass-card h-[520px] animate-pulse p-5" />;
  if (!row) return <section className="glass-card p-8 text-center text-sm text-muted">No stats for {season}.</section>;

  return (
    <section className="glass-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <Role position={position} row={row} season={season} color={color} />
        <div className="text-right">
          <div className="text-[15px] font-bold tracking-tight text-fg">Percentile profile</div>
          <div className="text-xs text-muted">
            {season} · rate stats among qualified {position}s only · counting stats among all {position}s
          </div>
        </div>
      </div>
      <div className="mt-2 grid items-center gap-x-8 gap-y-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <PercentileRadar
          stats={forPosition(RADAR_STATS, position)}
          players={[{ name: page.player.name, color: "var(--series-1)", row }]}
          metrics={metrics}
          hot={hot}
          onHot={setHot}
          tip={tip}
        />
        <div>
          <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-faint">Percentile among {positionName(position)}</div>
          {forPosition(CARD_PERCENTILES, position).map((stat, index) => {
            const metric = metrics[stat.id] ?? {};
            const available = isMetricAvailable(metric, season);
            const percentile = row.percentiles?.[stat.id];
            const lit = hot === stat.id;
            return (
              <div
                key={stat.id}
                onMouseEnter={() => setHot(stat.id)}
                onMouseLeave={() => setHot(null)}
                className="grid min-h-[34px] grid-cols-[minmax(0,1.4fr)_3.25rem_minmax(0,1fr)] items-center gap-2.5 rounded-lg px-2.5 py-0.5 sm:grid-cols-[minmax(0,1fr)_4.25rem_minmax(0,1.3fr)] sm:gap-3"
                style={{
                  background: lit ? mix("var(--accent)", 14) : index % 2 === 0 ? tint(4) : undefined,
                  boxShadow: lit ? "inset 0 0 0 1px color-mix(in srgb, var(--accent) 50%, transparent)" : undefined,
                }}
              >
                <span
                  className="text-[12.5px] font-semibold leading-tight text-muted"
                  onMouseEnter={(event) => tooltip.show(event.currentTarget, metricTip(metric, stat.id, season))}
                  onMouseLeave={tooltip.hide}
                >
                  {statLabel(stat, scoring)}
                </span>
                <span className="stat-num text-right text-[14px] font-extrabold text-fg">{available ? cardValue(row[stat.id], stat) : "-"}</span>
                {percentile == null ? (
                  <span className="text-right text-[11px] text-faint">{available ? "Not ranked" : "Not recorded"}</span>
                ) : (
                  <PercentileBar percentile={percentile} size={22} open={isAsIf(row, stat.id)} />
                )}
              </div>
            );
          })}
        </div>
      </div>
      {asIfNote(row, page.player.name, position) && (
        <p className="mt-2 text-[11.5px] text-muted">{asIfNote(row, page.player.name, position)}</p>
      )}
      <p className="mt-2 text-[11.5px] text-faint">Hover the role for how it is decided, and any stat to find it in both charts.</p>
      <ChartTooltip tip={tip} />
      <StatTooltip tip={tooltip.tip} />
    </section>
  );
}
