// One back's run lanes (October 2026): where his designed runs went and how they ended,
// beside every back's. The lane chart is Player Comparison's own `LaneChart`, so the two
// draw the same thing; the back is `RUN_LANES_PLAYER` in constants/signals.js.
import { Link } from "react-router-dom";
import { Card, CardHead, CardLink, CardState } from "./primitives";
import { Headshot } from "../explore/common";
import { ChartTooltip, useChartTooltip } from "../explore/ChartTooltip";
import { ExportImageButton } from "../explore/ExportImageButton";
import { LaneChart, OUTCOMES, laned } from "../explore/CompareVisuals";

/** How every carry ended, as one stacked bar. */
function OutcomeBar({ label, outcomes, carries }) {
  return (
    <div className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-faint">{label}</span>
      <span className="flex h-3.5 gap-0.5 overflow-hidden rounded">
        {OUTCOMES.map((outcome) => {
          const share = carries ? outcomes[outcome.key] / carries : 0;
          return share > 0 ? (
            <span key={outcome.key} className="block h-full" style={{ width: `${share * 100}%`, background: outcome.color }}
              title={`${outcome.label}: ${Math.round(share * 100)}%`} />
          ) : null;
        })}
      </span>
    </div>
  );
}

export function RunLanesCard({ player, run, isLoading, isError }) {
  const tip = useChartTooltip();
  const ready = run && laned(run) > 0;
  const name = player?.name ?? "";
  const slot = { key: run?.player_id, name, color: "var(--series-1)" };
  const maxShare = ready ? Math.max(0.01, ...run.lanes.map((lane) => lane.carries / laned(run))) : 1;
  const perCarry = ready && run.carries ? (run.yards / run.carries).toFixed(1) : null;
  const average = run?.average;

  return (
    <Card>
      <CardHead title="Run Lanes" sub={run ? String(run.season) : ""} />
      <CardState isLoading={isLoading} isError={isError} isEmpty={!ready} empty="No designed runs yet." rows={5} />
      {ready && (
        <>
          <div className="mb-1 flex items-center gap-2.5">
            <Headshot url={player?.headshot_url} name={name} size={36} ring="var(--position-rb)" />
            <div className="min-w-0">
              <Link to={`/players/${run.player_id}`} className="block truncate text-[13px] font-bold text-fg hover:text-accent">{name}</Link>
              <div className="stat-num text-[11px] text-faint">
                {run.carries} designed runs {"·"} {run.yards} yds {"·"} {perCarry} per carry
              </div>
            </div>
          </div>
          <LaneChart slot={slot} run={run} maxShare={maxShare} tip={tip} />
          <div className="mt-2 grid gap-1.5">
            <OutcomeBar label="Him" outcomes={run.outcomes} carries={run.carries} />
            {average?.carries > 0 && <OutcomeBar label="All RBs" outcomes={average.outcomes} carries={average.carries} />}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-faint">
            {OUTCOMES.map((outcome) => (
              <span key={outcome.key} className="inline-flex items-center gap-1">
                <i className="inline-block h-2 w-2 rounded-sm" style={{ background: outcome.color }} />
                {outcome.label}
              </span>
            ))}
          </div>
          <ChartTooltip tip={tip} />
        </>
      )}
      <div className="mt-auto flex flex-wrap items-end justify-between gap-2">
        <CardLink to={`/explore/compare?players=${run?.player_id ?? ""}`}>Open in Player Comparison</CardLink>
        {ready && (
          <ExportImageButton
            title={`${name}: where he runs`}
            subtitle={`${run.season} · ${run.carries} designed runs · ${perCarry} yds per carry`}
            render={() => <LaneChart slot={slot} run={run} maxShare={maxShare} />}
            sizes={["fit", "square"]}
          />
        )}
      </div>
    </Card>
  );
}
