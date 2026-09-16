// Command Center — the app's home (rebuilt in M10 as the "Fantasy Desk" layout).
//
// Two columns, not a bento. The wide column is the reading order a manager actually
// follows — who is gaining work, what happened last week, who is worth arguing about —
// and the narrow rail is reference they glance at: the scoreboard, their own players,
// and the two signal cards. A sticky rail means the scores stay on screen while they
// scroll the boards.
//
// **Two seasons are in play from January to September.** The fantasy tiles describe the
// last season *played*; the scoreboard describes the schedule, which runs a year ahead.
// Every card names its own season rather than the page claiming one, for the same
// reason the M6.2 team page does.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useLeaderboard } from "../hooks/useLeaderboard";
import { useTrending } from "../hooks/useTrending";
import { useGames, useScoreboard } from "../hooks/useGames";
import { useIntelligence } from "../hooks/useInsight";
import { useCompare } from "../hooks/useExplore";
import { useAuth } from "../hooks/useAuth";
import { useFavorites } from "../hooks/useAccount";
import { useScoring } from "../hooks/useScoring";
import { ScoringPill } from "../components/ScoringPill";
import { useLeague } from "../hooks/useLeague";
import { useMetrics } from "../hooks/useMetrics";
import { useSeasons } from "../hooks/useSeasons";
import { getPlayers } from "../services/players";
import { parseLeague } from "../constants/league";
import {
  FEATURED_MATCHUP,
  REGRESSION_CANDIDATES,
  SIGNALS_SEASON,
  UNDERPERFORMERS,
  WEEKLY_STANDOUTS,
} from "../constants/signals";
import { scaledMinGames, weeksPlayed } from "../utils/qualify";

import { ScoreboardCard } from "../components/home/ScoreboardCard";
import { StandoutsCard, STANDOUT_METRICS } from "../components/home/StandoutsCard";
import { TrendingCard } from "../components/home/TrendingCard";
import { HeadToHeadCard } from "../components/home/HeadToHeadCard";
import { SignalCard } from "../components/home/SignalCard";
import {
  MyPlayersCard,
  OpportunityCard,
  QuarterbackCard,
  WEEKLY_TAB_POSITIONS,
  WeeklyScoringCard,
} from "../components/home/BoardCards";

// The same fixed-PPR fallback the leaderboard uses when the backend cannot score yet.
const FANTASY_FALLBACK = { fantasy_points: "fantasy_points_ppr", fantasy_ppg: "fantasy_ppg_ppr" };

/** Merge a hardcoded signal list with the live numbers fetched for those players. */
function withStats(picks, rows) {
  const byId = new Map((rows ?? []).map((row) => [row.player_id, row]));
  return picks
    .map((pick) => {
      const row = byId.get(pick.playerId);
      return row ? { ...row, note: pick.note } : null;
    })
    .filter(Boolean);
}

export function Home() {
  const [scoring, setScoring] = useScoring();
  const [league] = useLeague();
  const leagueConfig = useMemo(() => parseLeague(league), [league]);
  const { currentSeason: season } = useSeasons();
  const { supportsScoring } = useMetrics();
  const pointsKey = supportsScoring ? "fantasy_points" : FANTASY_FALLBACK.fantasy_points;

  const [weekPosition, setWeekPosition] = useState("ALL");
  const [oppPosition, setOppPosition] = useState("RB");

  // --- The rail's scoreboard. Which two weeks it shows is the server's call. ---
  const scoreboard = useScoreboard();
  const lastPlayed = scoreboard.data?.last;

  // The season boards' game floors are written for a full season and scaled to the
  // weeks played, or both cards sit empty until October. They wait for the scoreboard
  // to say how far in we are rather than asking twice; an error falls back to the floor.
  const weeks = weeksPlayed(season, lastPlayed);
  const seasonBoardsReady = !scoreboard.isLoading;

  // --- Trending usage, in the reader's own scoring. ---
  const trending = useTrending({ season, season_type: "REG", direction: "up", scoring, limit: 6 });

  // The card renders only once the season has produced something to measure. Two ways
  // it has not: the newest scheduled season has not kicked off at all (so `season` is
  // still last year's, and last year's "last three weeks" is history, not news), or it
  // has kicked off but there is no trailing window yet — which the endpoint reports for
  // itself rather than making the client guess.
  const { seasons: scheduled } = useSeasons({ statsOnly: false });
  const seasonUnderway = scheduled[0] === season;
  const trendingLive = seasonUnderway && (trending.data?.data?.length ?? 0) > 0;

  // --- Week standouts: one week's usage for a hand-picked few, ranked at the position.
  //     Scoped to that week alone (`weeks=`), and in the reader's scoring for FP/RR. ---
  const standoutIds = WEEKLY_STANDOUTS.players.join(",");
  const standouts = useIntelligence(
    useMemo(
      () => ({
        season: WEEKLY_STANDOUTS.season,
        weeks: String(WEEKLY_STANDOUTS.week),
        season_type: "REG",
        player_ids: standoutIds,
        metric: "fantasy_points",
        ranks: STANDOUT_METRICS.join(","),
        scoring,
        league,
        limit: WEEKLY_STANDOUTS.players.length,
      }),
      [standoutIds, scoring, league],
    ),
  );
  // In the order they were picked, not the order the endpoint sorts them.
  const standoutRows = useMemo(() => {
    const byId = new Map((standouts.data?.data ?? []).map((row) => [row.player_id, row]));
    return WEEKLY_STANDOUTS.players.map((id) => byId.get(id)).filter(Boolean);
  }, [standouts.data]);
  // Headshots live on the profile, not on an aggregated stat row. One request for all.
  const { data: standoutPlayers } = useQuery({
    queryKey: ["players", standoutIds],
    queryFn: () => getPlayers({ player_ids: standoutIds, limit: 10 }),
    staleTime: Infinity,
  });
  const standoutHeadshots = useMemo(
    () => Object.fromEntries((standoutPlayers?.data ?? []).map((row) => [row.player_id, row.headshot_url])),
    [standoutPlayers],
  );
  const standoutGames = useGames({
    season: WEEKLY_STANDOUTS.season,
    week: WEEKLY_STANDOUTS.week,
    season_type: "REG",
    limit: 32,
  });

  // --- Last week's scoring. Waits for the scoreboard to say which week that was. ---
  const weeklyParams = useMemo(
    () => ({
      season: lastPlayed?.season,
      week: lastPlayed?.week,
      season_type: "REG",
      metric: pointsKey,
      positions: WEEKLY_TAB_POSITIONS[weekPosition],
      scoring,
      order: "desc",
      limit: 10,
    }),
    [lastPlayed?.season, lastPlayed?.week, pointsKey, weekPosition, scoring],
  );
  const weekly = useLeaderboard(weeklyParams, { enabled: Boolean(lastPlayed?.week) });

  // --- Opportunity leaders: carries for backs, targets for pass catchers. ---
  const opportunity = useLeaderboard(
    useMemo(
      () => ({
        season,
        season_type: "REG",
        position: oppPosition,
        metric: oppPosition === "RB" ? "carries" : "targets",
        scoring,
        order: "desc",
        min_games: scaledMinGames(4, weeks),
        limit: 10,
      }),
      [season, oppPosition, scoring, weeks],
    ),
    { enabled: seasonBoardsReady },
  );

  // --- Quarterbacks by EPA, with the per-play rate beside it. ---
  const quarterbacks = useLeaderboard(
    useMemo(
      () => ({
        season,
        season_type: "REG",
        position: "QB",
        metric: "epa",
        scoring,
        order: "desc",
        min_games: scaledMinGames(8, weeks),
        limit: 10,
      }),
      [season, scoring, weeks],
    ),
    { enabled: seasonBoardsReady },
  );

  // --- Watchlist. Rendered only once signed in *and* something is starred: an empty
  //     card here would be a permanent advert for a feature rather than a useful panel.
  const { isSignedIn } = useAuth();
  const { favorites } = useFavorites();
  const favoriteIds = favorites.map((favorite) => favorite.player.player_id).join(",");
  // Served by /stats/intelligence rather than the leaderboard: the card shows FOR,
  // which is a query-time score with no stored column. `include_unqualified` keeps a
  // starred player who has missed games on his owner's own card.
  const watchlist = useIntelligence(
    useMemo(
      () => ({
        season,
        season_type: "REG",
        metric: pointsKey,
        scoring,
        league,
        order: "desc",
        limit: 6,
        include_unqualified: true,
        player_ids: favoriteIds,
      }),
      [season, pointsKey, scoring, league, favoriteIds],
    ),
    { enabled: isSignedIn && favoriteIds.length > 0 },
  );

  // --- The two signal cards. The *picks* are hardcoded (see constants/signals.js);
  //     every number below is live, and in the reader's own scoring — for the season
  //     the picks describe, not the current one. ---
  const signalIds = [...UNDERPERFORMERS, ...REGRESSION_CANDIDATES].map((pick) => pick.playerId).join(",");
  const signals = useLeaderboard(
    useMemo(
      () => ({
        season: SIGNALS_SEASON,
        season_type: "REG",
        metric: "fantasy_points_over_expected",
        scoring,
        order: "asc",
        min_games: 1,
        limit: 20,
        player_ids: signalIds,
      }),
      [scoring, signalIds],
    ),
  );
  const underRows = withStats(UNDERPERFORMERS, signals.data?.data);
  const overRows = withStats(REGRESSION_CANDIDATES, signals.data?.data);

  // --- The featured matchup. ---
  const matchup = useCompare(
    useMemo(
      () => ({ players: FEATURED_MATCHUP.players.join(","), season: SIGNALS_SEASON, season_type: "REG", scoring }),
      [scoring],
    ),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-fg">Highlighted Data</h1>
        <ScoringPill scoring={scoring} onChange={setScoring} />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,2.15fr)_minmax(300px,1fr)]">
        <div className="grid min-w-0 gap-4">
          <StandoutsCard
            week={WEEKLY_STANDOUTS.week}
            rows={standoutRows}
            headshots={standoutHeadshots}
            games={standoutGames.data?.data}
            league={leagueConfig}
            isLoading={standouts.isLoading}
            isError={standouts.isError}
          />
          {/* Moved out of the sticky rail when it grew to seven stat columns: the
              rail is 300px of reference, and a board this wide could only have
              scrolled sideways in it. */}
          {isSignedIn && favorites.length > 0 && (
            <MyPlayersCard
              season={season}
              count={favorites.length}
              result={watchlist.data}
              isLoading={watchlist.isLoading}
              isError={watchlist.isError}
            />
          )}
          {trendingLive && (
            <TrendingCard result={trending.data} isLoading={trending.isLoading} isError={trending.isError} />
          )}
          <WeeklyScoringCard
            week={lastPlayed?.week}
            position={weekPosition}
            onPositionChange={setWeekPosition}
            result={weekly.data}
            isLoading={scoreboard.isLoading || weekly.isLoading}
            isError={weekly.isError}
          />
          <OpportunityCard
            season={season}
            position={oppPosition}
            onPositionChange={setOppPosition}
            result={opportunity.data}
            isLoading={scoreboard.isLoading || opportunity.isLoading}
            isError={opportunity.isError}
          />
          <QuarterbackCard
            season={season}
            result={quarterbacks.data}
            isLoading={scoreboard.isLoading || quarterbacks.isLoading}
            isError={quarterbacks.isError}
          />
          <HeadToHeadCard
            caption={FEATURED_MATCHUP.caption}
            result={matchup.data}
            isLoading={matchup.isLoading}
            isError={matchup.isError}
          />
        </div>

        {/* Sticky so the scoreboard stays put while the boards scroll past it. */}
        <aside className="grid min-w-0 gap-4 lg:sticky lg:top-[76px]">
          <ScoreboardCard
            scoreboard={scoreboard.data}
            isLoading={scoreboard.isLoading}
            isError={scoreboard.isError}
          />
          <SignalCard
            kind="under"
            season={SIGNALS_SEASON}
            rows={underRows}
            isLoading={signals.isLoading}
            isError={signals.isError}
          />
          <SignalCard
            kind="over"
            season={SIGNALS_SEASON}
            rows={overRows}
            isLoading={signals.isLoading}
            isError={signals.isError}
          />
        </aside>
      </div>
    </div>
  );
}
