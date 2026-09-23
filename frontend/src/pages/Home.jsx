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
import { cloneElement, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useLeaderboard } from "../hooks/useLeaderboard";
import { useTrending } from "../hooks/useTrending";
import { useGames, useScoreboard } from "../hooks/useGames";
import { useIntelligence } from "../hooks/useInsight";
import { useCompare, useScatter } from "../hooks/useExplore";
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
  EXPECTED_VS_ACTUAL,
  FEATURED_MATCHUP,
  SIGNALS_SEASON,
  TRENDING_BASIS,
  TRENDING_PLAYERS,
} from "../constants/signals";
import { scaledMinGames, weeksPlayed } from "../utils/qualify";
import { HOME_LAYOUT } from "../constants/homeLayout";

import { ScoreboardCard } from "../components/home/ScoreboardCard";
import { TrendingPlayersCard } from "../components/home/TrendingPlayersCard";
import { TrendingCard } from "../components/home/TrendingCard";
import { HeadToHeadCard } from "../components/home/HeadToHeadCard";
import { ExpectedActualCard } from "../components/home/ExpectedActualCard";
import {
  MyPlayersCard,
  OpportunityCard,
  QuarterbackCard,
  WEEKLY_TAB_POSITIONS,
  WeeklyScoringCard,
} from "../components/home/BoardCards";

// The same fixed-PPR fallback the leaderboard uses when the backend cannot score yet.
const FANTASY_FALLBACK = { fantasy_points: "fantasy_points_ppr", fantasy_ppg: "fantasy_ppg_ppr" };

// The watchlist card's seven stat columns, ranked within each player's own position for
// the season (M12's `percentiles=`). The pool is the whole league at that position, not
// the starred players: "84th percentile" has to mean the same thing here as on a board.
const MY_PLAYERS_PERCENTILES = [
  "fantasy_points",
  "fantasy_ppg",
  "fantasy_opportunity_rating",
  "opportunity_share",
  "target_share",
  "route_participation",
  "rush_attempt_share",
].join(",");

/** Index rows by player id, so a card can look a pick up rather than scanning. */
function byPlayerId(rows) {
  return Object.fromEntries((rows ?? []).map((row) => [row.player_id, row]));
}

export function Home() {
  const [scoring, setScoring] = useScoring();
  const [league] = useLeague();
  const leagueConfig = useMemo(() => parseLeague(league), [league]);
  const { currentSeason: season } = useSeasons();
  const { metrics, supportsScoring } = useMetrics();
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

  // --- Trending Players: one week of usage for a hand-picked few, each with his own
  //     four stats and his own basis for the change beneath them (constants/signals.js).
  //     Scoped to that week alone (`weeks=`) and in the reader's scoring. ---
  const trendingIds = useMemo(
    () => [
      ...new Set(TRENDING_PLAYERS.players.flatMap((pick) => [pick.playerId, pick.against].filter(Boolean))),
    ],
    [],
  );
  const trendingMetrics = useMemo(
    () => [...new Set(TRENDING_PLAYERS.players.flatMap((pick) => pick.stats))].join(","),
    [],
  );
  // Which extra windows the picks actually need. A card of quarterbacks ranked on the
  // season asks for no previous week; a card with no season ranks asks for no season.
  const needsPreviousWeek = TRENDING_PLAYERS.players.some(
    (pick) => (pick.basis ?? TRENDING_BASIS.LAST_WEEK) === TRENDING_BASIS.LAST_WEEK,
  );
  const seasonRankIds = TRENDING_PLAYERS.players
    .filter((pick) => pick.basis === TRENDING_BASIS.SEASON_RANK)
    .map((pick) => pick.playerId)
    .join(",");

  const trendingParams = useMemo(
    () => ({
      season: TRENDING_PLAYERS.season,
      season_type: "REG",
      player_ids: trendingIds.join(","),
      metric: "fantasy_points",
      ranks: trendingMetrics,
      scoring,
      league,
      limit: trendingIds.length,
      // A pick can miss games and still be the story; the card is a list, not a board.
      include_unqualified: true,
    }),
    [trendingIds, trendingMetrics, scoring, league],
  );
  const trendingNow = useIntelligence(
    useMemo(() => ({ ...trendingParams, weeks: String(TRENDING_PLAYERS.week) }), [trendingParams]),
  );
  const trendingBefore = useIntelligence(
    useMemo(() => ({ ...trendingParams, weeks: String(TRENDING_PLAYERS.week - 1) }), [trendingParams]),
    { enabled: needsPreviousWeek && TRENDING_PLAYERS.week > 1 },
  );
  const trendingSeason = useIntelligence(
    useMemo(
      () => ({ ...trendingParams, player_ids: seasonRankIds, limit: 10 }),
      [trendingParams, seasonRankIds],
    ),
    { enabled: Boolean(seasonRankIds) },
  );

  // --- Expected vs Actual: the five picks, plus every other player as a faint dot. ---
  const expectedIds = EXPECTED_VS_ACTUAL.join(",");
  const expected = useLeaderboard(
    useMemo(
      () => ({
        season: SIGNALS_SEASON,
        season_type: "REG",
        metric: "fantasy_points_over_expected",
        scoring,
        order: "asc",
        min_games: 1,
        limit: EXPECTED_VS_ACTUAL.length,
        player_ids: expectedIds,
      }),
      [scoring, expectedIds],
    ),
  );
  // The scatter endpoint rather than a paged leaderboard: the cloud needs two numbers a
  // row, and /stats/scatter returns exactly those for the whole league in one request.
  const expectedCloud = useScatter(
    useMemo(
      () => ({
        season: SIGNALS_SEASON,
        season_type: "REG",
        x: "expected_fantasy_points",
        y: "fantasy_points",
        mode: "season",
        min_games: 1,
        limit: 600,
        scoring,
      }),
      [scoring],
    ),
  );

  // Headshots live on the profile, not on an aggregated stat row. One request for every
  // face the page draws.
  const faceIds = useMemo(
    () => [...new Set([...trendingIds, ...EXPECTED_VS_ACTUAL])].join(","),
    [trendingIds],
  );
  const { data: facePlayers } = useQuery({
    queryKey: ["players", faceIds],
    queryFn: () => getPlayers({ player_ids: faceIds, limit: 30 }),
    staleTime: Infinity,
  });
  const headshots = useMemo(
    () => Object.fromEntries((facePlayers?.data ?? []).map((row) => [row.player_id, row.headshot_url])),
    [facePlayers],
  );
  const trendingGames = useGames({
    season: TRENDING_PLAYERS.season,
    week: TRENDING_PLAYERS.week,
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
        percentiles: MY_PLAYERS_PERCENTILES,
      }),
      [season, pointsKey, scoring, league, favoriteIds],
    ),
    { enabled: isSignedIn && favoriteIds.length > 0 },
  );

  // --- The featured matchup. ---
  const matchup = useCompare(
    useMemo(
      () => ({ players: FEATURED_MATCHUP.players.join(","), season: SIGNALS_SEASON, season_type: "REG", scoring }),
      [scoring],
    ),
  );

  // The cards, keyed so the arrangement can be a config rather than fixed JSX. A card
  // that has nothing to show returns null here and the layout skips it.
  const cards = {
    trending: (
      <TrendingPlayersCard
        picks={TRENDING_PLAYERS.players}
        week={TRENDING_PLAYERS.week}
        rows={byPlayerId(trendingNow.data?.data)}
        previousRows={byPlayerId(trendingBefore.data?.data)}
        seasonRows={byPlayerId(trendingSeason.data?.data)}
        headshots={headshots}
        games={trendingGames.data?.data}
        league={leagueConfig}
        metrics={metrics}
        isLoading={trendingNow.isLoading}
        isError={trendingNow.isError}
      />
    ),
    // Rendered only once signed in *and* something is starred: an empty card here
    // would be a permanent advert for a feature rather than a useful panel.
    myPlayers:
      isSignedIn && favorites.length > 0 ? (
        <MyPlayersCard
          season={season}
          count={favorites.length}
          result={watchlist.data}
          isLoading={watchlist.isLoading}
          isError={watchlist.isError}
        />
      ) : null,
    trendingUsage: trendingLive ? (
      <TrendingCard result={trending.data} isLoading={trending.isLoading} isError={trending.isError} />
    ) : null,
    weekly: (
      <WeeklyScoringCard
        week={lastPlayed?.week}
        scoring={scoring}
        position={weekPosition}
        onPositionChange={setWeekPosition}
        result={weekly.data}
        isLoading={scoreboard.isLoading || weekly.isLoading}
        isError={weekly.isError}
      />
    ),
    expected: (
      <ExpectedActualCard
        season={SIGNALS_SEASON}
        scoring={scoring}
        rows={expected.data?.data ?? []}
        cloud={expectedCloud.data?.data ?? []}
        headshots={headshots}
        isLoading={expected.isLoading}
        isError={expected.isError}
      />
    ),
    opportunity: (
      <OpportunityCard
        season={season}
        position={oppPosition}
        onPositionChange={setOppPosition}
        result={opportunity.data}
        isLoading={scoreboard.isLoading || opportunity.isLoading}
        isError={opportunity.isError}
      />
    ),
    quarterbacks: (
      <QuarterbackCard
        season={season}
        result={quarterbacks.data}
        isLoading={scoreboard.isLoading || quarterbacks.isLoading}
        isError={quarterbacks.isError}
      />
    ),
    headToHead: (
      <HeadToHeadCard
        caption={FEATURED_MATCHUP.caption}
        result={matchup.data}
        isLoading={matchup.isLoading}
        isError={matchup.isError}
      />
    ),
    scoreboard: (
      <ScoreboardCard
        scoreboard={scoreboard.data}
        isLoading={scoreboard.isLoading}
        isError={scoreboard.isError}
      />
    ),
  };

  // Each card carries its own key so React can follow it across a layout change rather
  // than re-mounting the column, which would refetch nothing but would lose each card's
  // own tab state (the position pickers on the weekly and opportunity boards).
  const column = (keys) =>
    keys.filter((key) => cards[key]).map((key) => cloneElement(cards[key], { key }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-fg">Highlighted Data</h1>
        <ScoringPill scoring={scoring} onChange={setScoring} />
      </div>

      <div className="grid grid-cols-1 items-start gap-4" data-home-columns="">
        {/* The column template has to come from data and a Tailwind class cannot carry a
            runtime value, so it ships as scoped rules rather than an inline style: inline
            styles have no media query, and each template applies only above its own
            width. The widths are the tables' (see homeLayout.js), not Tailwind's. */}
        <style>
          {HOME_LAYOUT.columns
            .map((step) => `@media (min-width:${step.from}px){[data-home-columns]{grid-template-columns:${step.template}}}`)
            .join("")}
        </style>
        {HOME_LAYOUT.assign.map((keys, index) => {
          const contents = column(keys);
          if (contents.length === 0) return <div key={index} className="hidden" />;
          const sticky = HOME_LAYOUT.sticky === index;
          return (
            <div
              key={index}
              className={`grid min-w-0 gap-4 ${sticky ? "lg:sticky lg:top-[76px]" : ""}`}
            >
              {contents}
            </div>
          );
        })}
      </div>
    </div>
  );
}
