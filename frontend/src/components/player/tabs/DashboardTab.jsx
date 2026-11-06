// Dashboard (round ten): the profile box, the fantasy game log, then the game chart and
// Next game stacked (layout A).
import { GameLog } from "../GameLog";
import { PLAYER_FANTASY, forPosition } from "../../../constants/playerPage";
import { ProfileBox } from "../page/ProfileBox";
import { GameChart } from "../page/GameChart";
import { NextGame } from "../page/NextGame";

export function DashboardTab({ page }) {
  const { position, metrics, season, seasonLog, gameLogLoading, goTab, embedded } = page;
  return (
    <div className="space-y-4">
      <ProfileBox page={page} />
      <GameLog
        title="Fantasy game log"
        games={seasonLog}
        sections={forPosition(PLAYER_FANTASY, position)}
        controls={
          !embedded && (
            <button type="button" onClick={() => goTab("stats")} className="text-[11.5px] text-muted transition hover:text-accent">
              Every category is on the Stats tab →
            </button>
          )
        }
        metrics={metrics}
        position={position}
        season={season}
        isLoading={gameLogLoading}
      />
      <GameChart page={page} />
      <NextGame page={page} />
    </div>
  );
}
