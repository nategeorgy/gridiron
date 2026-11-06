// The player page (November 2026): six tabs under a team-colour banner.
//
// Picked over ten rounds of mockups. Dashboard (how is he doing), Stats (the numbers),
// Opportunity (the work behind them), Splits (when he scores), Career, and Compare. The
// tab is the path (`/players/:id/career`), so a link opens the tab it was sent from.
//
// **Everything fantasy is in the user's own league scoring** (M1 spine A), including the
// career finishes, so a TE-premium league sees its own history.
//
// **One request serves the season.** The banner, the Dashboard's radar and percentile
// bars, Season Stats and the weekly grids' season column are views of one row from
// `/stats/intelligence`, which carries the stored columns, the query-time ones and a
// percentile and positional rank for every metric the page shows. Each tab then asks for
// only what it draws, so a reader who never opens Splits never pays for it.
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Select } from "../components/ui/Select";
import { ScoringControl } from "../components/ScoringControl";
import { buildSeasonLog } from "../components/player/GameLog";
import { PlayerBanner } from "../components/player/page/PlayerBanner";
import { DashboardTab } from "../components/player/tabs/DashboardTab";
import { StatsTab } from "../components/player/tabs/StatsTab";
import { OpportunityTab } from "../components/player/tabs/OpportunityTab";
import { SplitsTab } from "../components/player/tabs/SplitsTab";
import { CareerTab } from "../components/player/tabs/CareerTab";
import { CompareTab } from "../components/player/tabs/CompareTab";
import { usePlayer, usePlayerCareer, usePlayerGameLog, usePlayerSeason } from "../hooks/usePlayer";
import { useGames } from "../hooks/useGames";
import { useLeague } from "../hooks/useLeague";
import { useMetrics } from "../hooks/useMetrics";
import { useScoring } from "../hooks/useScoring";
import { useSeasons } from "../hooks/useSeasons";
import { useTeamsList } from "../hooks/useTeamStats";
import { percentileColumns, rankColumns, forPosition } from "../constants/playerPage";
import { BANNER_STATS, RADAR_STATS, RANKED_ROWS, TAB_IDS, USAGE_ROWS } from "../constants/playerTabs";
import { rememberViewed } from "../components/players/recent";

const TABS = { dashboard: DashboardTab, stats: StatsTab, opportunity: OpportunityTab, splits: SplitsTab, career: CareerTab, compare: CompareTab };

/** Every metric the page's one season request ranks, for one position. */
function pageColumns(position) {
  const wanted = new Set(percentileColumns(position));
  for (const list of [RADAR_STATS, USAGE_ROWS, RANKED_ROWS]) {
    forPosition(list, position).forEach((stat) => wanted.add(stat.season ?? stat.id));
  }
  return [...wanted];
}

/**
 * @param {string} [playerId] render a specific player instead of the route's. The draft
 *   room opens this inside a dialog, where there is no route to read and the tab lives in
 *   component state.
 */
export function PlayerProfile({ playerId: playerIdProp } = {}) {
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const playerId = playerIdProp ?? params.playerId;
  const embedded = Boolean(playerIdProp);
  const [localTab, setLocalTab] = useState("dashboard");
  const tab = embedded ? localTab : TAB_IDS.includes(params.tab) ? params.tab : "dashboard";
  const goTab = (id) => {
    if (embedded) return setLocalTab(id);
    navigate(`/players/${playerId}${id === "dashboard" ? "" : `/${id}`}${location.search}`);
    return undefined;
  };

  const [scoring, setScoring] = useScoring();
  const [league] = useLeague();
  const { metrics } = useMetrics();
  const { currentSeason } = useSeasons();

  const playerQuery = usePlayer(playerId);
  const player = playerQuery.data;
  const position = player?.position ?? "WR";

  const careerQuery = usePlayerCareer(playerId, scoring);
  const careerSeasons = useMemo(() => careerQuery.data?.data ?? [], [careerQuery.data]);

  // Defaults to the newest season he has stats for, so a retired player's page opens on
  // his last season rather than on an empty current one.
  const [chosenSeason, setChosenSeason] = useState(null);
  const season = chosenSeason ?? careerSeasons[0]?.season ?? null;

  const wanted = useMemo(() => pageColumns(position), [position]);
  const ranked = useMemo(
    () => [...new Set([...rankColumns(position), ...forPosition(BANNER_STATS, position).map((stat) => stat.id)])],
    [position],
  );
  const seasonQuery = usePlayerSeason({ playerIds: [playerId], season, scoring, league, percentiles: wanted, ranks: ranked });
  const row = (seasonQuery.data?.data ?? []).find((candidate) => candidate.player_id === playerId) ?? null;

  // Every game of his career, once: the game charts, the career arc and the logs read it.
  const gameLogQuery = usePlayerGameLog(playerId, scoring);
  const allGames = useMemo(() => gameLogQuery.data?.data ?? [], [gameLogQuery.data]);
  const seasonGames = useMemo(
    () => allGames.filter((game) => game.season === season && game.season_type === "REG").sort((a, b) => a.week - b.week),
    [allGames, season],
  );

  // The season's whole slate: weeks still to come and the bye, beside his stat lines. The
  // team is his latest game's in the season (`players.team_id` is who employs him now).
  const logTeamId = seasonGames.length ? seasonGames[seasonGames.length - 1].team_id : player?.team_id;
  const scheduleQuery = useGames(
    useMemo(() => ({ season, season_type: "REG", team_id: logTeamId, limit: 400 }), [season, logTeamId]),
    { enabled: Boolean(season && logTeamId) },
  );
  const seasonLog = useMemo(
    () => buildSeasonLog(seasonGames, scheduleQuery.data?.data ?? [], logTeamId),
    [seasonGames, scheduleQuery.data, logTeamId],
  );

  const teamsQuery = useTeamsList();
  const teams = useMemo(
    () => Object.fromEntries((teamsQuery.data ?? []).map((team) => [team.abbreviation, team])),
    [teamsQuery.data],
  );

  useEffect(() => {
    if (player?.player_id && !embedded) rememberViewed(player.player_id);
  }, [player?.player_id, embedded]);

  if (playerQuery.isLoading) {
    return <div className="p-6 text-center text-sm text-muted">Loading…</div>;
  }
  if (playerQuery.isError || !player) {
    return (
      <div className="p-6 text-center text-sm text-neg">
        Player not found.{" "}
        <Link to="/players" className="text-accent hover:underline">
          Back to Player Dashboard
        </Link>
      </div>
    );
  }

  const lastWeek = seasonQuery.data?.window?.week_to ?? 0;
  const through = season === currentSeason ? lastWeek : null;
  const team = teams[row?.team_abbreviation ?? player.team_abbreviation];
  const page = {
    player, playerId, position, season, setSeason: setChosenSeason, careerSeasons, careerLoading: careerQuery.isLoading,
    scoring, league, metrics, row, seasonQuery, poolSize: seasonQuery.data?.percentiles?.pool_sizes?.[position],
    through, lastWeek, seasonLog, seasonGames, allGames, gameLogLoading: gameLogQuery.isLoading, teams, team,
    currentSeason, embedded, goTab,
  };
  const Tab = TABS[tab];

  return (
    <div className="space-y-4">
      {!embedded && (
        <Link to="/players" className="inline-block text-sm text-muted transition hover:text-accent">
          ← Player Dashboard
        </Link>
      )}
      <PlayerBanner
        player={player}
        team={team}
        row={row}
        position={position}
        season={season}
        through={through}
        scoring={scoring}
        tab={tab}
        onTab={goTab}
        isLoading={careerQuery.isLoading || seasonQuery.isLoading}
        controls={
          <>
            {careerSeasons.length > 0 && (
              <Select
                label="Season"
                value={String(season)}
                onChange={(value) => setChosenSeason(Number(value))}
                options={careerSeasons.map((entry) => ({ value: String(entry.season), label: String(entry.season) }))}
              />
            )}
            <ScoringControl scoring={scoring} onChange={setScoring} label="Scoring" bare />
          </>
        }
      />
      {season == null && !careerQuery.isLoading ? (
        <section className="glass-card p-8 text-center text-sm text-muted">No regular-season game data for this player.</section>
      ) : (
        season != null && <Tab page={page} />
      )}
    </div>
  );
}
