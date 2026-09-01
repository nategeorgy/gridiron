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
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { useLeaderboard } from "../hooks/useLeaderboard";
import { useTrending } from "../hooks/useTrending";
import { useScoreboard } from "../hooks/useGames";
import { useCompare } from "../hooks/useExplore";
import { useAuth } from "../hooks/useAuth";
import { useFavorites } from "../hooks/useAccount";
import { useScoring } from "../hooks/useScoring";
import { useMetrics } from "../hooks/useMetrics";
import { useSeasons } from "../hooks/useSeasons";
import { getPlayers } from "../services/players";
import { scoringLabel } from "../constants/scoring";
import {
  FEATURED_MATCHUP,
  OPPORTUNITY_OUTLOOK,
  REGRESSION_CANDIDATES,
  UNDERPERFORMERS,
} from "../constants/signals";

import { ScoreboardCard } from "../components/home/ScoreboardCard";
import { TrendingCard } from "../components/home/TrendingCard";
import { HeadToHeadCard } from "../components/home/HeadToHeadCard";
import { SignalCard } from "../components/home/SignalCard";
import {
  MyPlayersCard,
  OpportunityCard,
  QuarterbackCard,
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
  const [scoring] = useScoring();
  const { currentSeason: season } = useSeasons();
  const { supportsScoring } = useMetrics();
  const pointsKey = supportsScoring ? "fantasy_points" : FANTASY_FALLBACK.fantasy_points;

  const [weekPosition, setWeekPosition] = useState("ALL");
  const [oppPosition, setOppPosition] = useState("RB");

  // --- The rail's scoreboard. Which two weeks it shows is the server's call. ---
  const scoreboard = useScoreboard();
  const lastPlayed = scoreboard.data?.last;

  // --- Trending usage, in the reader's own scoring. ---
  const trending = useTrending({ season, season_type: "REG", direction: "up", scoring, limit: 6 });

  // The card shows the live board only once the season has produced something to
  // measure. Two ways it has not: the newest scheduled season has not kicked off at
  // all (so `season` is still last year's, and last year's "last three weeks" is
  // history, not news), or it has kicked off but there is no trailing window yet —
  // which the endpoint reports for itself rather than making the client guess.
  const { seasons: scheduled } = useSeasons({ statsOnly: false });
  const seasonUnderway = scheduled[0] === season;
  const trendingHasSomethingToSay = (trending.data?.data?.length ?? 0) > 0;
  const trendingMode = seasonUnderway && trendingHasSomethingToSay ? "live" : "outlook";

  // Identities for the hand-picked outlook set. One request rather than six, and
  // deliberately not the leaderboard — that aggregates stat lines, so a player who
  // barely featured last season would come back thin or not at all.
  const outlookIds = OPPORTUNITY_OUTLOOK.map((pick) => pick.playerId).join(",");
  const { data: outlookPlayers } = useQuery({
    queryKey: ["players", outlookIds],
    queryFn: () => getPlayers({ player_ids: outlookIds, limit: 50 }),
    enabled: trendingMode === "outlook",
    staleTime: Infinity,
  });
  const outlookHeadshots = useMemo(
    () => Object.fromEntries((outlookPlayers?.data ?? []).map((row) => [row.player_id, row.headshot_url])),
    [outlookPlayers],
  );

  // --- Last week's scoring. Waits for the scoreboard to say which week that was. ---
  const weeklyParams = useMemo(
    () => ({
      season: lastPlayed?.season,
      week: lastPlayed?.week,
      season_type: "REG",
      metric: pointsKey,
      position: weekPosition === "ALL" ? undefined : weekPosition,
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
        min_games: 4,
        limit: 10,
      }),
      [season, oppPosition, scoring],
    ),
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
        min_games: 8,
        limit: 10,
      }),
      [season, scoring],
    ),
  );

  // --- Watchlist. Rendered only once signed in *and* something is starred: an empty
  //     card here would be a permanent advert for a feature rather than a useful panel.
  const { isSignedIn } = useAuth();
  const { favorites } = useFavorites();
  const favoriteIds = favorites.map((favorite) => favorite.player.player_id).join(",");
  const watchlist = useLeaderboard(
    useMemo(
      () => ({ season, season_type: "REG", metric: pointsKey, scoring, order: "desc", limit: 6, player_ids: favoriteIds }),
      [season, pointsKey, scoring, favoriteIds],
    ),
    { enabled: isSignedIn && favoriteIds.length > 0 },
  );

  // --- The two signal cards. The *picks* are hardcoded (see constants/signals.js);
  //     every number below is live, and in the reader's own scoring. ---
  const signalIds = [...UNDERPERFORMERS, ...REGRESSION_CANDIDATES].map((pick) => pick.playerId).join(",");
  const signals = useLeaderboard(
    useMemo(
      () => ({
        season,
        season_type: "REG",
        metric: "fantasy_points_over_expected",
        scoring,
        order: "asc",
        min_games: 1,
        limit: 20,
        player_ids: signalIds,
      }),
      [season, scoring, signalIds],
    ),
  );
  const underRows = withStats(UNDERPERFORMERS, signals.data?.data);
  const overRows = withStats(REGRESSION_CANDIDATES, signals.data?.data);

  // --- The featured matchup. ---
  const matchup = useCompare(
    useMemo(
      () => ({ players: FEATURED_MATCHUP.players.join(","), season, season_type: "REG", scoring }),
      [season, scoring],
    ),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-fg">Highlighted Data</h1>
        <Link
          to="/fantasy/leaders"
          className="glass-pill inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold transition hover:!text-accent"
          title="Adjust your league scoring on the leaderboard"
        >
          <span className="text-muted">Scored in</span>
          <span className="text-accent">{scoringLabel(scoring)}</span>
          <span className="text-faint">·</span>
          <span className="text-muted">Edit →</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,2.15fr)_minmax(300px,1fr)]">
        <div className="grid min-w-0 gap-4">
          <TrendingCard
            mode={trendingMode}
            outlook={OPPORTUNITY_OUTLOOK}
            headshots={outlookHeadshots}
            result={trending.data}
            isLoading={trending.isLoading}
            isError={trending.isError}
          />
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
            isLoading={opportunity.isLoading}
            isError={opportunity.isError}
          />
          <QuarterbackCard
            season={season}
            result={quarterbacks.data}
            isLoading={quarterbacks.isLoading}
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
          {isSignedIn && favorites.length > 0 && (
            <MyPlayersCard
              season={season}
              count={favorites.length}
              result={watchlist.data}
              isLoading={watchlist.isLoading}
              isError={watchlist.isError}
            />
          )}
          <SignalCard
            kind="under"
            season={season}
            rows={underRows}
            isLoading={signals.isLoading}
            isError={signals.isError}
          />
          <SignalCard
            kind="over"
            season={season}
            rows={overRows}
            isLoading={signals.isLoading}
            isError={signals.isError}
          />
        </aside>
      </div>
    </div>
  );
}
