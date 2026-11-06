// Opportunity: usage by week, then the position's own work. A back: the run fan and how
// his runs end, who threw to him, where he's targeted. A quarterback: his network and run
// fan, where he throws, the routes he threw to. A receiver: who threw to him, where he's
// targeted, the routes he ran.
import { PlayerTargetCard } from "../../explore/TargetCard";
import { USAGE_ROWS } from "../../../constants/playerTabs";
import { WeekGrid } from "../page/WeekGrid";
import { ByQuarterback } from "../page/ByQuarterback";
import { RouteTree } from "../page/RouteTree";
import { RunEnds, RunFan } from "../page/Runs";
import { NetworkField, NetworkList } from "../page/QbNetwork";

export function OpportunityTab({ page }) {
  const { player, position, season } = page;
  const usage = (
    <WeekGrid
      page={page}
      rows={USAGE_ROWS}
      title="Usage by week"
      sub={`Each week shaded by where it ranked among every ${position} who played that week: green at the top, then yellow, orange and red${position === "QB" ? " (fewer sacks is greener)" : ""}. Hover for the rank`}
    />
  );
  const targets = <PlayerTargetCard player={player} season={season} />;
  if (position === "RB") {
    return (
      <div className="space-y-4">
        {usage}
        <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <RunFan page={page} />
          <RunEnds page={page} />
        </div>
        <ByQuarterback page={page} />
        {targets}
      </div>
    );
  }
  if (position === "QB") {
    return (
      <div className="space-y-4">
        {usage}
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className="space-y-4">
            <NetworkField page={page} />
            <RunFan page={page} />
          </div>
          <NetworkList page={page} />
        </div>
        {targets}
        <RouteTree page={page} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {usage}
      <ByQuarterback page={page} />
      {targets}
      <RouteTree page={page} />
    </div>
  );
}
