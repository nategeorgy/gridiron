// Highlighted Viz of the Week (October 2026): one Explore chart, large, at the top of the page.
//
// The pick is `HIGHLIGHTED_VIZ` in constants/signals.js. Only the selection is written
// down: the passer's name and every number on the card are read from the same
// `/explore/network` response the Passing Network page draws, so the card cannot say
// something the chart does not show. Since November 2026 the network is drawn as a
// broadcast graphic across the whole card (`BroadcastField`), with the five most-targeted
// receivers as a lower third inside it and the passer's line as a row of numbers under it.
import { Link, useNavigate } from "react-router-dom";
import { Card, CardState } from "./primitives";
import { BroadcastField } from "./BroadcastField";
import { ExportImageButton } from "../explore/ExportImageButton";
import { epaColor, signed } from "../../utils/explore";
import { useTeamsList } from "../../hooks/useTeamStats";

function Stat({ label, value }) {
  return (
    <div className="flex items-baseline gap-2 rounded-xl border border-edge px-3 py-2" style={{ background: "color-mix(in srgb, var(--surface-2) 60%, transparent)" }}>
      <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-faint">{label}</span>
      <span className="stat-num text-[17px] font-bold text-fg">{value}</span>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted">
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <span className="inline-block h-2 w-16 rounded"
          style={{ background: `linear-gradient(90deg, ${epaColor(-0.5, 0.5)}, ${epaColor(0, 0.5)}, ${epaColor(0.5, 0.5)})` }} />
        Line colour: EPA per target
      </span>
      <span>Line width: targets</span>
      <span>Across: average depth of target</span>
    </div>
  );
}

export function HighlightedVizCard({ pick, network, shape, isLoading, isError }) {
  const navigate = useNavigate();
  const teams = useTeamsList();
  const ready = network && shape.shown.length > 0;
  const passer = network?.passer;
  const totals = network?.totals;
  const team = teams.data?.find((row) => row.abbreviation === (passer?.team ?? pick.team));
  const weekLabel = pick.weeks ? `Week ${pick.weeks} · ${pick.season}` : `${pick.season} season`;
  const subtitle = passer ? `${passer.team} · ${weekLabel}` : weekLabel;
  const eyebrow = pick.weeks ? `Week ${pick.weeks} pass attempts` : "Season long pass attempts";
  const exploreLink = `/explore/network?season=${pick.season}${pick.weeks ? `&weeks=${pick.weeks}` : ""}&qb=${pick.passerId}${pick.team ? `&team=${pick.team}` : ""}`;
  const chart = (props) => <BroadcastField passer={passer} shown={shape.shown} team={team} eyebrow={eyebrow} {...props} />;

  return (
    <Card className="!p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-accent">Highlighted viz of the week</span>
          <span className="text-[12px] text-faint">Passing Network {"·"} {subtitle}</span>
        </div>
        {ready && (
          <div className="flex flex-wrap items-center gap-2">
            <ExportImageButton
              title={`${passer.name}'s passing network`}
              subtitle={subtitle}
              render={() => chart({ width: 1280, interactive: false })}
            />
            <Link
              to={exploreLink}
              className="rounded-[10px] border px-3 py-1.5 text-[12.5px] font-semibold text-accent transition hover:text-fg"
              style={{ borderColor: "color-mix(in srgb, var(--accent) 55%, transparent)", background: "color-mix(in srgb, var(--accent) 8%, transparent)" }}
            >
              Open in Explore {"→"}
            </Link>
          </div>
        )}
      </div>

      <CardState isLoading={isLoading} isError={isError} isEmpty={!ready} empty="No targets for this pick yet." rows={8} />

      {ready && (
        <>
          {/* The name is drawn on the field; this is the heading for everyone not looking at it. */}
          <h2 className="sr-only">{passer.name} {pick.weeks ? `Week ${pick.weeks}` : "Season Long"} Pass Attempts</h2>
          {chart({ onSelect: (playerId) => navigate(`/players/${playerId}`) })}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Stat label="Targets" value={totals.targets} />
            <Stat label="Cmp/Att" value={`${passer.completions}/${passer.attempts}`} />
            <Stat label="Yards" value={passer.passing_yards.toLocaleString()} />
            <Stat label="TD/INT" value={`${passer.passing_tds}/${passer.interceptions}`} />
            <Stat label="aDOT" value={totals.adot?.toFixed(1) ?? "—"} />
            <Stat label="EPA/target" value={signed(totals.epa_per_target, 2)} />
            {passer.cpoe !== null && passer.cpoe !== undefined && <Stat label="CPOE" value={signed(passer.cpoe, 1)} />}
            <div className="min-[1100px]:ml-auto"><Legend /></div>
          </div>
        </>
      )}
    </Card>
  );
}
