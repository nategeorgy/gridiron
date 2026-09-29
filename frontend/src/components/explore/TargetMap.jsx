// One subject's targets on a field, three ways: zones, a heatmap, or every target.
//
// Shared by Target Analysis, the player page, the team page and Player Comparison. The
// subject is a receiver (the targets he drew), a passer (the targets he threw) or a
// team (every target it threw); the average beside it is the API's: every target to
// the receiver's position, or every target in the league for a passer or a team.
import { useMemo, useState } from "react";
import { Segmented } from "../team/Segmented";
import { ExportImageButton } from "./ExportImageButton";
import { ChartTooltip, hoverProps, useChartTooltip } from "./ChartTooltip";
import { ChartState, Foot, Toggle } from "./common";
import { EveryTargetField, EveryTargetLegend, HeatField, HeatLegend, ZonesChart } from "./TargetField";
import { DEPTHS, SIDES, sideHistograms, zoneCounts } from "../../utils/explore";

const NOUNS = {
  receiver: { one: "target", many: "targets", every: "Every target" },
  passer: { one: "throw", many: "throws", every: "Every throw" },
  team: { one: "target", many: "targets", every: "Every target" },
};

/**
 * @param targets   the list the API returned (every mode but zones needs it)
 * @param average   the API's `average` block
 * @param position  the receiver's position, for "the WR average"; omit for passers and teams
 */
export function TargetMap({
  targets, average, position, role = "receiver", subject, exportTitle, exportSubtitle,
  initialMode = "zones", isLoading = false, isError = false,
}) {
  const [mode, setMode] = useState(initialMode);
  const [versus, setVersus] = useState(false);
  const tip = useChartTooltip();
  const noun = NOUNS[role] ?? NOUNS.receiver;
  const averageName = position ? `${position} average` : "league average";

  const { zones, caught } = useMemo(() => zoneCounts(targets), [targets]);
  const heat = useMemo(() => sideHistograms(targets), [targets]);
  const charted = zones.reduce((sum, value) => sum + value, 0);
  const adot = useMemo(() => {
    const depths = (targets ?? []).filter((target) => target.air_yards !== null && target.air_yards !== undefined);
    return depths.length ? depths.reduce((sum, target) => sum + target.air_yards, 0) / depths.length : null;
  }, [targets]);

  const describeZone = (depth, side) => {
    const index = depth * 3 + side;
    const count = zones[index];
    return (
      <div>
        <b>{DEPTHS[depth].label}, {SIDES[side].toLowerCase()}</b>
        <div className="stat-num mt-0.5 text-muted">
          {count} {count === 1 ? noun.one : noun.many} ({charted ? ((count / charted) * 100).toFixed(1) : 0}%), {caught[index]} caught
        </div>
        {average?.zone_shares && (
          <div className="stat-num text-muted">{averageName[0].toUpperCase() + averageName.slice(1)} {(average.zone_shares[index] * 100).toFixed(1)}%</div>
        )}
      </div>
    );
  };

  const chart = (forExport = false) => {
    if (mode === "dots") return <EveryTargetField targets={targets} adot={adot} label={`${subject}: ${noun.every.toLowerCase()}`} />;
    if (mode === "heat") {
      return <HeatField heat={heat} averageHeat={average?.heat} versus={versus} adot={adot} label={`${subject}: ${noun.many} heatmap`} />;
    }
    return (
      <ZonesChart
        zones={zones}
        caught={caught}
        averageShares={average?.zone_shares}
        versus={versus}
        noun={role === "passer" ? "att" : "tgt"}
        cellProps={forExport ? undefined : (depth, side) => hoverProps(tip, () => describeZone(depth, side))}
      />
    );
  };

  const modeName = { zones: `${noun.many} by zone`, heat: `${noun.one} heatmap`, dots: noun.every.toLowerCase() }[mode];
  const versusApplies = mode !== "dots" && Boolean(average);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          label="Map"
          value={mode}
          onChange={setMode}
          options={[
            { value: "zones", label: "Zones" },
            { value: "heat", label: "Heatmap" },
            { value: "dots", label: noun.every },
          ]}
        />
        <ExportImageButton
          title={`${exportTitle ?? subject}: ${modeName}${versusApplies && versus ? ` vs the ${averageName}` : ""}`}
          subtitle={exportSubtitle}
          render={() => chart(true)}
          sizes={["fit", "square"]}
          disabled={!targets?.length}
        />
      </div>
      {versusApplies && (
        <Toggle checked={versus} onChange={setVersus}>
          Compare to the {averageName}
        </Toggle>
      )}
      {isLoading || isError || !targets?.length ? (
        <ChartState isLoading={isLoading} isError={isError} isEmpty={!targets?.length} height={420}
          empty={`No ${noun.many} in this selection.`} />
      ) : (
        <div className="mx-auto w-full max-w-[560px]">{chart()}</div>
      )}
      {targets?.length > 0 && mode === "dots" && <EveryTargetLegend />}
      {targets?.length > 0 && mode === "heat" && <HeatLegend versus={versus} position={position} />}
      {targets?.length > 0 && (
        <Foot>
          {mode === "zones" && (versus
            ? `Percentage points above or below the ${averageName} (every ${noun.one} to the position, pooled).`
            : `Share of ${charted} ${noun.many} with a charted depth and side. Beneath each: ${noun.many} and catch rate.`)}
          {mode === "heat" && "Depth comes from air yards; side from the left, middle or right third play-by-play records, blended across the field."}
          {mode === "dots" && "Height is air yards, exact. Side is one of the three thirds play-by-play records; within a third, marks are spread out so they don't stack."}
        </Foot>
      )}
      <ChartTooltip tip={tip} />
    </div>
  );
}
