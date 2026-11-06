// Career: the arc (every game, a column per season), the profile (the radar's stats,
// every season), the career table, and this season against last.
import { CareerTable } from "../CareerTable";
import { TableViewBar } from "../TableViewBar";
import { TABLE_VIEWS, forPosition } from "../../../constants/playerPage";
import { RADAR_STATS } from "../../../constants/playerTabs";
import { useTableView } from "../../../hooks/useTableView";
import { usePlayerCareerDetail } from "../../../hooks/usePlayer";
import { CareerArc } from "../page/CareerArc";
import { CareerProfile } from "../page/CareerProfile";
import { VsLastSeason } from "../page/VsLastSeason";

export function CareerTab({ page }) {
  const { player, playerId, position, scoring, metrics, season, setSeason, careerSeasons, careerLoading, embedded } = page;
  const careerView = useTableView(TABLE_VIEWS.career, position, embedded);
  const detail = usePlayerCareerDetail(playerId, scoring, { percentiles: forPosition(RADAR_STATS, position).map((stat) => stat.id) });
  return (
    <div className="space-y-4">
      <CareerArc page={page} />
      <CareerProfile page={page} detail={detail} />
      <CareerTable
        seasons={careerSeasons}
        position={position}
        sections={careerView.sections}
        controls={<TableViewBar view={careerView} title="Career" player={player.name} metrics={metrics} />}
        metrics={metrics}
        activeSeason={season}
        onSelectSeason={setSeason}
        isLoading={careerLoading}
      />
      <VsLastSeason page={page} detail={detail} />
    </div>
  );
}
