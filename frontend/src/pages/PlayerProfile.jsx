// Player profile (rebuilt in M13).
//
// The reading order is the order a manager asks the questions in: who is this, what did
// he do this season, what has his career looked like, how does that rank, how does he
// compare, and finally the receipts game by game.
//
// **Everything fantasy is in the user's own league scoring** (M1 spine A) and league
// context (M3) — including the career finishes, so a superflex league sees its own
// history rather than someone else's PPR one.
//
// **One request serves the season.** The stat grid, the radar and the percentile panel
// are three views of a single row from `/stats/intelligence`, which carries both the
// stored columns and the query-time ones (VORP and friends) plus a percentile for every
// metric the position's page can show. Adding the comparison player to that same request
// is what keeps the two halves of a matchup on identical pools.
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Select } from "../components/ui/Select";
import { LeagueSettings } from "../components/LeagueSettings";
import { FavoriteStar } from "../components/FavoriteStar";
import { PositionTag } from "../components/PositionTag";
import { CareerTable } from "../components/player/CareerTable";
import { ComparePicker } from "../components/player/ComparePicker";
import { CompareRadar } from "../components/player/CompareRadar";
import { GameLog } from "../components/player/GameLog";
import { HeadToHead } from "../components/player/HeadToHead";
import { PercentileLadder } from "../components/player/PercentileLadder";
import { SeasonRadar } from "../components/player/SeasonRadar";
import { SeasonStatGrid } from "../components/player/SeasonStatGrid";
import {
  usePlayer,
  usePlayerCareer,
  usePlayerGameLog,
  usePlayerSeason,
} from "../hooks/usePlayer";
import { useLeague } from "../hooks/useLeague";
import { useMetrics } from "../hooks/useMetrics";
import { useScoring } from "../hooks/useScoring";
import { parseLeague } from "../constants/league";
import {
  CAREER_GROUPS,
  COMPARE_AXES,
  GAMELOG_GROUPS,
  H2H_ROWS,
  HEADLINE_STATS,
  PERCENTILE_GROUPS,
  SEASON_BOARDS,
  forPosition,
  headlineColumns,
  percentileColumns,
} from "../constants/playerPage";

function ProfileHeader({ player, seasonTeam }) {
  return (
    <section className="glass-card flex items-center gap-4 p-5">
      {player.headshot_url ? (
        <img
          src={player.headshot_url}
          alt=""
          className="h-20 w-20 rounded-full border border-edge bg-surface-2 object-cover object-top"
        />
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded-full border border-edge bg-surface-2 text-2xl font-bold text-faint">
          {player.name?.[0]}
        </div>
      )}
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-bold tracking-tight text-fg">{player.name}</h1>
          <FavoriteStar playerId={player.player_id} size="h-5 w-5" />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
          <PositionTag position={player.position} />
          {/* The team he played for in the season on screen, which is not the same as
              the team that employs him now once the range reaches back to 1999 —
              Marshall Faulk's 2001 belongs to STL, while his player record says LA. */}
          <span className="stat-num">{seasonTeam ?? player.team_abbreviation ?? "FA"}</span>
          {player.jersey_number != null && (
            <span className="stat-num text-faint">#{player.jersey_number}</span>
          )}
          {player.age != null && <span className="stat-num text-faint">{player.age}y</span>}
        </div>
        {player.college_name && (
          <div className="mt-1 text-xs text-faint">
            {player.college_name}
            {player.draft_year && (
              <>
                {" · "}
                {player.draft_round
                  ? `${player.draft_year} round ${player.draft_round}, pick ${player.draft_pick}`
                  : `${player.draft_year} undrafted`}
                {player.draft_team ? ` (${player.draft_team})` : ""}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

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
  const [league, setLeague] = useLeague();
  const { metrics } = useMetrics();
  // Finish chips are tiered by how deep this league starts each position, so a QB22 week
  // reads as unstartable in a one-quarterback league and fine in a superflex one.
  const leagueConfig = useMemo(() => parseLeague(league), [league]);

  const playerQuery = usePlayer(playerId);
  const player = playerQuery.data;
  const position = player?.position ?? "WR";

  const careerQuery = usePlayerCareer(playerId, scoring);
  const careerSeasons = careerQuery.data?.data ?? [];

  // Defaults to the newest season this player actually has stats for, which is not
  // necessarily the newest season in the database: a retired player's page should open
  // on his last season rather than on an empty current one.
  const [chosenSeason, setChosenSeason] = useState(null);
  const season = chosenSeason ?? careerSeasons[0]?.season ?? null;

  const [opponent, setOpponent] = useState(null);
  const wanted = useMemo(() => percentileColumns(position), [position]);
  const ranked = useMemo(() => headlineColumns(position), [position]);
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

  if (playerQuery.isLoading) {
    return <div className="p-6 text-center text-sm text-muted">Loading…</div>;
  }
  if (playerQuery.isError) {
    return (
      <div className="p-6 text-center text-sm text-neg">
        Player not found.{" "}
        <Link to="/fantasy/leaders" className="text-accent hover:underline">
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
        <Link to="/fantasy/leaders" className="inline-block text-sm text-muted transition hover:text-accent">
          ← Leaderboard
        </Link>
      )}

      <ProfileHeader player={player} seasonTeam={row?.team_abbreviation} />

      <div className="flex flex-wrap items-center gap-3">
        {seasonOptions.length > 0 && (
          <Select
            value={String(season)}
            onChange={(value) => setChosenSeason(Number(value))}
            options={seasonOptions}
          />
        )}
        <span className="text-xs text-faint">
          Fantasy numbers and career finishes are in your league scoring.
        </span>
      </div>

      <LeagueSettings
        scoring={scoring}
        onScoringChange={setScoring}
        league={league}
        onLeagueChange={setLeague}
        replacement={seasonQuery.data?.replacement}
      />

      {season == null ? (
        <section className="glass-card p-8 text-center text-sm text-muted">
          No regular-season game data for this player.
        </section>
      ) : (
        <>
          <SeasonStatGrid
            headline={forPosition(HEADLINE_STATS, position)}
            boards={forPosition(SEASON_BOARDS, position)}
            row={row}
            metrics={metrics}
            position={position}
            season={season}
            isLoading={seasonQuery.isLoading}
          />

          <CareerTable
            seasons={careerSeasons}
            position={position}
            groups={forPosition(CAREER_GROUPS, position)}
            metrics={metrics}
            league={leagueConfig}
            activeSeason={season}
            onSelectSeason={setChosenSeason}
            isLoading={careerQuery.isLoading}
          />

          <GameLog
            games={seasonGames}
            groups={forPosition(GAMELOG_GROUPS, position)}
            metrics={metrics}
            position={position}
            league={leagueConfig}
            season={season}
            isLoading={gameLogQuery.isLoading}
          />

          <div className="grid items-start gap-4 lg:grid-cols-[10fr_11fr]">
            <SeasonRadar row={row} metrics={metrics} position={position} season={season} />
            <PercentileLadder
              groups={forPosition(PERCENTILE_GROUPS, position)}
              row={row}
              metrics={metrics}
              position={position}
              season={season}
              poolSize={poolSize}
              isLoading={seasonQuery.isLoading}
            />
          </div>

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
                <div className="grid items-start gap-4 lg:grid-cols-2">
                  <HeadToHead
                    rows={forPosition(H2H_ROWS, position)}
                    players={matchup}
                    metrics={metrics}
                    season={season}
                  />
                  <CompareRadar
                    axes={forPosition(COMPARE_AXES, position)}
                    players={matchup}
                    metrics={metrics}
                  />
                </div>
              ) : (
                <p className="glass-card p-5 text-center text-xs text-muted">
                  {opponent
                    ? `No ${season} stats for ${opponent.name}.`
                    : `Pick another ${position} to see the head-to-head and the profile comparison.`}
                </p>
              )}
            </section>
          )}

        </>
      )}
    </div>
  );
}
