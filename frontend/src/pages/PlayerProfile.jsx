// Player profile (rebuilt in M13).
//
// The reading order is the order a manager asks the questions in: who is this and how
// does his season rank (the player card, which opens the page), what did he do this
// season, what has his career looked like, game by game, and how does he compare.
//
// **Everything fantasy is in the user's own league scoring** (M1 spine A), including the
// career finishes, so a TE-premium league sees its own history rather than someone
// else's PPR one.
//
// **One request serves the season.** The stat grid, the player card and the head-to-head
// are views of rows from one `/stats/intelligence` request, which carries both the stored
// columns and the query-time ones (the buy/sell indices and friends) plus a percentile and
// a positional rank for every metric the position's page can show. Adding the comparison
// player to that same request is what keeps the two halves of a matchup on identical pools.
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Select } from "../components/ui/Select";
import { ScoringControl } from "../components/ScoringControl";
import { CareerTable } from "../components/player/CareerTable";
import { ComparePicker } from "../components/player/ComparePicker";
import { GameLog, buildSeasonLog } from "../components/player/GameLog";
import { HeadToHead } from "../components/player/HeadToHead";
import { PlayerCard } from "../components/player/PlayerCard";
import { FloorCeiling } from "../components/player/FloorCeiling";
import { SeasonStatGrid } from "../components/player/SeasonStatGrid";
import { TableViewBar } from "../components/player/TableViewBar";
import { PlayerTargetCard } from "../components/explore/TargetCard";
import {
  usePlayer,
  usePlayerCareer,
  usePlayerGameLog,
  usePlayerSeason,
} from "../hooks/usePlayer";
import { useGames } from "../hooks/useGames";
import { useLeague } from "../hooks/useLeague";
import { useMetrics } from "../hooks/useMetrics";
import { useScoring } from "../hooks/useScoring";
import { useSeasons } from "../hooks/useSeasons";
import { useTeamsList } from "../hooks/useTeamStats";
import { scoringLabel } from "../constants/scoring";
import {
  HEADLINE_STATS,
  TABLE_VIEWS,
  forPosition,
  percentileColumns,
  rankColumns,
  seasonBoards,
} from "../constants/playerPage";
import { useTableView } from "../hooks/useTableView";

/**
 * @param {string} [playerId] render a specific player instead of the route's.
 *   The draft room opens this inside a dialog, where there is no route param to read
 *   — and a second, near-identical "profile card" component would drift from this one
 *   the first time either changed.
 */
export function PlayerProfile({ playerId: playerIdProp } = {}) {
  const params = useParams();
  const playerId = playerIdProp ?? params.playerId;
  const embedded = Boolean(playerIdProp);

  const [scoring, setScoring] = useScoring();
  const [league] = useLeague();
  const { metrics } = useMetrics();

  const playerQuery = usePlayer(playerId);
  const player = playerQuery.data;
  const position = player?.position ?? "WR";

  // The career table and the game log each pick their own leaderboard tab (September
  // 2026), in the URL unless the page is embedded in a dialog.
  const careerView = useTableView(TABLE_VIEWS.career, position, embedded);
  const gameLogView = useTableView(TABLE_VIEWS.gamelog, position, embedded);

  const careerQuery = usePlayerCareer(playerId, scoring);
  const careerSeasons = careerQuery.data?.data ?? [];

  // Defaults to the newest season this player actually has stats for, which is not
  // necessarily the newest season in the database: a retired player's page should open
  // on his last season rather than on an empty current one.
  const [chosenSeason, setChosenSeason] = useState(null);
  const season = chosenSeason ?? careerSeasons[0]?.season ?? null;

  const [opponent, setOpponent] = useState(null);
  const wanted = useMemo(() => percentileColumns(position), [position]);
  const ranked = useMemo(() => rankColumns(position), [position]);
  const seasonQuery = usePlayerSeason({
    playerIds: [playerId, opponent?.player_id],
    season,
    scoring,
    league,
    percentiles: wanted,
    ranks: ranked,
  });

  const rows = seasonQuery.data?.data ?? [];
  const row = rows.find((candidate) => candidate.player_id === playerId) ?? null;
  const opponentRow = opponent
    ? rows.find((candidate) => candidate.player_id === opponent.player_id) ?? null
    : null;

  const gameLogQuery = usePlayerGameLog(playerId, scoring);
  const seasonGames = useMemo(
    () =>
      (gameLogQuery.data?.data ?? [])
        .filter((game) => game.season === season && game.season_type === "REG")
        .sort((a, b) => a.week - b.week),
    [gameLogQuery.data, season],
  );

  // The log is the whole season, so it needs his team's fixture list beside his stat
  // lines: weeks still to come become rows of dashes and the bye becomes a greyed row.
  //
  // The team comes from his latest game in the season, the same rule a season row uses
  // (`players.team_id` is who employs him *now*, which is the wrong answer for any
  // season but the current one). Falling back to it covers a player with no stat lines
  // yet, whose remaining schedule is his current team's by definition.
  const logTeamId = seasonGames.length
    ? seasonGames[seasonGames.length - 1].team_id
    : player?.team_id;
  const scheduleQuery = useGames(
    useMemo(
      () => ({ season, season_type: "REG", team_id: logTeamId, limit: 400 }),
      [season, logTeamId],
    ),
    { enabled: Boolean(season && logTeamId) },
  );
  const seasonLog = useMemo(
    () => buildSeasonLog(seasonGames, scheduleQuery.data?.data ?? [], logTeamId),
    [seasonGames, scheduleQuery.data, logTeamId],
  );

  // The player card's ring, logo and team name, and the head-to-head's. The header's Teams
  // menu already loads this list, so it is a cache hit.
  const teamsQuery = useTeamsList();
  const teams = useMemo(
    () => Object.fromEntries((teamsQuery.data ?? []).map((team) => [team.abbreviation, team])),
    [teamsQuery.data],
  );
  const { currentSeason } = useSeasons();


  if (playerQuery.isLoading) {
    return <div className="p-6 text-center text-sm text-muted">Loading…</div>;
  }
  if (playerQuery.isError) {
    return (
      <div className="p-6 text-center text-sm text-neg">
        Player not found.{" "}
        <Link to="/leaderboards/fantasy" className="text-accent hover:underline">
          Back to leaderboard
        </Link>
      </div>
    );
  }

  const seasonOptions = careerSeasons.map((entry) => ({
    value: String(entry.season),
    label: String(entry.season),
  }));
  const poolSize = seasonQuery.data?.percentiles?.pool_sizes?.[position];
  // The newest week the season's stats reach. A season still being played says "through
  // Week N"; the card's week strip stops there either way.
  const lastWeek = seasonQuery.data?.window?.week_to ?? 0;
  const through = season === currentSeason ? lastWeek : null;
  // Both players are in one response, so a comparison only renders once both rows are
  // in hand — a half-drawn matchup is worse than a late one.
  const comparing = Boolean(opponent && opponentRow && row);
  // A season row is an aggregate of stat lines and carries no identity image; the
  // headshots come from the profile and from the picker's own search result.
  const matchup = comparing
    ? [
        { ...row, headshot_url: player.headshot_url },
        { ...opponentRow, headshot_url: opponent.headshot_url },
      ]
    : [];

  return (
    <div className="space-y-4">
      {/* Only when this is the page. Embedded in a dialog there is nothing to go back
          *to* — the thing behind it is the draft board, and the close button is the
          way out. */}
      {!embedded && (
        <Link to="/leaderboards/fantasy" className="inline-block text-sm text-muted transition hover:text-accent">
          ← Leaderboard
        </Link>
      )}

      {/* The page opens on the player card, which carries the season and scoring pickers
          that govern everything below it. */}
      <PlayerCard
        player={player}
        row={row}
        // The team he played for in the season on screen, which is not the team that
        // employs him now once the range reaches back: Marshall Faulk's 2001 belongs to
        // STL, while his player record says LA.
        team={teams[row?.team_abbreviation ?? player.team_abbreviation]}
        position={position}
        season={season}
        through={through}
        scoring={scoring}
        log={seasonLog}
        lastWeek={lastWeek}
        metrics={metrics}
        poolSize={poolSize}
        isLoading={careerQuery.isLoading || seasonQuery.isLoading}
        extra={<FloorCeiling log={seasonLog} lastWeek={lastWeek} position={position} />}
        empty={season == null ? "No regular-season game data for this player." : undefined}
        controls={
          <>
            {seasonOptions.length > 0 && (
              <Select
                label="Season"
                value={String(season)}
                onChange={(value) => setChosenSeason(Number(value))}
                options={seasonOptions}
              />
            )}
            <ScoringControl scoring={scoring} onChange={setScoring} label="Scoring" bare />
          </>
        }
      />

      {season != null && (
        <>
          <SeasonStatGrid
            headline={forPosition(HEADLINE_STATS, position)}
            boards={seasonBoards(position)}
            row={row}
            metrics={metrics}
            position={position}
            season={season}
            isLoading={seasonQuery.isLoading}
          />

          <CareerTable
            seasons={careerSeasons}
            position={position}
            sections={careerView.sections}
            controls={<TableViewBar view={careerView} title="Career" player={player.name} metrics={metrics} />}
            metrics={metrics}
                activeSeason={season}
            onSelectSeason={setChosenSeason}
            isLoading={careerQuery.isLoading}
          />

          <GameLog
            games={seasonLog}
            sections={gameLogView.sections}
            controls={<TableViewBar view={gameLogView} title="Game log" player={player.name} metrics={metrics} />}
            metrics={metrics}
            position={position}
                season={season}
            isLoading={gameLogQuery.isLoading}
          />

          <PlayerTargetCard player={player} season={season} />

          {/* Compare is a page-level tool, not a dialog one: inside the draft room the
              board behind this modal is already the comparison. */}
          {!embedded && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold tracking-tight text-fg">Compare</h2>
                <ComparePicker
                  position={position}
                  selected={opponent}
                  onSelect={setOpponent}
                  onClear={() => setOpponent(null)}
                />
              </div>

              {comparing ? (
                <section className="glass-card p-4 sm:p-5">
                  <HeadToHead
                    players={matchup}
                    teams={teams}
                    position={position}
                    season={season}
                    scoring={scoring}
                                metrics={metrics}
                    kicker={`Head to head · ${season}${through ? ` through Week ${through}` : ""} · ${scoringLabel(scoring)}`}
                  />
                </section>
              ) : (
                <p className="glass-card p-5 text-center text-xs text-muted">
                  {opponent ? `No ${season} stats for ${opponent.name}.` : `Pick another ${position} to see them head to head.`}
                </p>
              )}
            </section>
          )}

        </>
      )}
    </div>
  );
}
