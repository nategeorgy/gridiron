// Stats: Season Stats, the game log with its five tabs, every week ranked (in the
// Usage-by-week style, round ten) and the scatter.
import { SeasonStatGrid } from "../SeasonStatGrid";
import { GameLog } from "../GameLog";
import { TableViewBar } from "../TableViewBar";
import { HEADLINE_STATS, TABLE_VIEWS, forPosition, seasonBoards } from "../../../constants/playerPage";
import { RANKED_ROWS } from "../../../constants/playerTabs";
import { useTableView } from "../../../hooks/useTableView";
import { positionName } from "../cardParts";
import { WeekGrid } from "../page/WeekGrid";
import { StatScatter } from "../page/StatScatter";

export function StatsTab({ page }) {
  const { player, position, row, metrics, season, seasonQuery, seasonLog, gameLogLoading, embedded } = page;
  const gameLogView = useTableView(TABLE_VIEWS.gamelog, position, embedded);
  return (
    <div className="space-y-4">
      <SeasonStatGrid
        headline={forPosition(HEADLINE_STATS, position)}
        boards={seasonBoards(position)}
        row={row}
        metrics={metrics}
        position={position}
        season={season}
        isLoading={seasonQuery.isLoading}
      />
      <GameLog
        games={seasonLog}
        sections={gameLogView.sections}
        controls={<TableViewBar view={gameLogView} title="Game log" player={player.name} metrics={metrics} />}
        metrics={metrics}
        position={position}
        season={season}
        isLoading={gameLogLoading}
      />
      <WeekGrid
        page={page}
        rows={RANKED_ROWS}
        title="Every week, ranked"
        sub={`Each game's number and its rank among every ${position} who played that week, shaded the same way: greener is higher. Season is the average a game (the rate, for a rate) and the percentile among qualified ${positionName(position)}`}
        showRank
      />
      <StatScatter page={page} />
    </div>
  );
}
