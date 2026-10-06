// Command Center: the app's home (rebuilt October 2026 as "Option C").
//
// Four bands, top to bottom (constants/homeLayout.js):
//
//   1. the week's scores as a ticker, then the Highlighted Viz of the Week, a large
//      Explore chart;
//   2. a row of Explore cards: the team landscape, air yards, the record book;
//   3. the week's players: Trending Players, the watchlist and Expected vs Actual on the
//      left, Last Week's Scoring and a reader-picked Head to Head on the right;
//   4. the Week N Preview: the slate, then matchups by position and implied team totals.
//
// **Two seasons are in play from January to September.** The fantasy cards describe the
// last season *played*; the ticker and the week-ahead cards describe the schedule, which
// runs a year ahead. Every card names its own season rather than the page claiming one.
import { cloneElement, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useLeaderboard } from "../hooks/useLeaderboard";
import { useGames, useScoreboard } from "../hooks/useGames";
import { useIntelligence } from "../hooks/useInsight";
import { useCompare, useNetwork, usePlayersById, useScatter, useTargetBoard } from "../hooks/useExplore";
import { useSos } from "../hooks/useDraftBoard";
import { useTeamsList, useTeamStats } from "../hooks/useTeamStats";
import { useAuth } from "../hooks/useAuth";
import { useFavorites } from "../hooks/useAccount";
import { useScoring } from "../hooks/useScoring";
import { ScoringPill } from "../components/ScoringPill";
import { useLeague } from "../hooks/useLeague";
import { useMetrics } from "../hooks/useMetrics";
import { useSeasons } from "../hooks/useSeasons";
import { useUrlState } from "../hooks/useUrlState";
import { getPlayers } from "../services/players";
import { parseLeague } from "../constants/league";
import {
  EXPECTED_VS_ACTUAL,
  FEATURED_MATCHUP,
  HIGHLIGHTED_VIZ,
  RECORD_BOOK,
  SIGNALS_SEASON,
  TRENDING_BASIS,
  TRENDING_PLAYERS,
  trendingWindows,
} from "../constants/signals";
import { HOME_LAYOUT } from "../constants/homeLayout";
import { shapeNetwork } from "../components/explore/NetworkChart";

import { ScoreTicker } from "../components/home/ScoreTicker";
import { HighlightedVizCard } from "../components/home/HighlightedVizCard";
import { AirYardsCard } from "../components/home/AirYardsCard";
import { TeamLandscapeCard } from "../components/home/TeamLandscapeCard";
import { RecordBookCard } from "../components/home/RecordBookCard";
import { TrendingPlayersCard } from "../components/home/TrendingPlayersCard";
import { HeadToHeadCard, matchupMetrics } from "../components/home/HeadToHeadCard";
import { ExpectedActualCard } from "../components/home/ExpectedActualCard";
import { MATCHUP_POSITIONS, MatchupsCard } from "../components/home/MatchupsCard";
import { EnvironmentsCard } from "../components/home/EnvironmentsCard";
import { SlateCard } from "../components/home/SlateCard";
import { BandHeading } from "../components/home/BandHeading";
import { dateParts } from "../components/schedule/kickoff";
import { MyPlayersCard, WEEKLY_TAB_POSITIONS, WeeklyScoringCard } from "../components/home/BoardCards";

// The same fixed-PPR fallback the leaderboard uses when the backend cannot score yet.
const FANTASY_FALLBACK = { fantasy_points: "fantasy_points_ppr", fantasy_ppg: "fantasy_ppg_ppr" };

// The air-yard card's floor: Target Analysis's own 25-target minimum.
const AIR_YARDS_MIN_TARGETS = 25;

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

const WEEKDAY_NAMES = { Sun: "Sunday", Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday" };

/** "Thursday Oct 1 through Monday Oct 5 · No byes", the line under the preview heading. */
function previewSub(games, teams) {
  const dates = games.map((game) => game.game_date).filter(Boolean).sort();
  if (!dates.length) return "";
  const day = (iso) => {
    const parts = dateParts(iso);
    return `${WEEKDAY_NAMES[parts.dow]} ${parts.mon} ${parts.day}`;
  };
  const span = dates.length > 1 && dates[0] !== dates[dates.length - 1] ? `${day(dates[0])} through ${day(dates[dates.length - 1])}` : day(dates[0]);
  // Byes need all 32 teams to subtract from, so they wait for the teams list.
  if (!teams?.length) return span;
  const playing = new Set(games.flatMap((game) => [game.home_abbreviation, game.away_abbreviation]));
  const byes = teams.map((team) => team.abbreviation).filter((abbreviation) => !playing.has(abbreviation)).sort();
  return `${span} · ${byes.length ? `Byes: ${byes.join(", ")}` : "No byes"}`;
}

export function Home() {
  const [scoring, setScoring] = useScoring();
  const [league] = useLeague();
  const leagueConfig = useMemo(() => parseLeague(league), [league]);
  const { currentSeason: season } = useSeasons();
  const { metrics, supportsScoring } = useMetrics();
  const pointsKey = supportsScoring ? "fantasy_points" : FANTASY_FALLBACK.fantasy_points;

  const [weekPosition, setWeekPosition] = useState("ALL");

  // --- The scoreboard: the ticker's finals, and the week ahead for the bottom band.
  //     Which two weeks those are is the server's call. ---
  const scoreboard = useScoreboard();
  const lastPlayed = scoreboard.data?.last;
  const upcoming = scoreboard.data?.next;

  // --- Highlighted Viz of the Week. ---
  const network = useNetwork({
    season: HIGHLIGHTED_VIZ.season,
    weeks: HIGHLIGHTED_VIZ.weeks || undefined,
    passer_id: HIGHLIGHTED_VIZ.passerId,
    team: HIGHLIGHTED_VIZ.team,
  });
  const networkShape = useMemo(() => shapeNetwork(network.data, 7, 1), [network.data]);

  // --- The Explore row. ---
  const airYards = useTargetBoard({ season, positions: "WR", min_targets: AIR_YARDS_MIN_TARGETS });
  const teamBoard = useTeamStats({ season, scoring });

  // --- Trending Players: one week of usage for a hand-picked few, each with his own
  //     four stats and his own basis for the change beneath them (constants/signals.js).
  //     Scoped to that week alone (`weeks=`) and in the reader's scoring. ---
  const trendingIds = useMemo(
    () => [
      ...new Set(TRENDING_PLAYERS.players.flatMap((pick) => [pick.playerId, pick.against].filter(Boolean))),
    ],
    [],
  );
  // Fantasy points are always ranked: the finish chip beside each pick's points reads it,
  // whether or not any pick shows fantasy points as one of its four stats.
  const trendingMetrics = useMemo(
    () => [...new Set(["fantasy_points", ...TRENDING_PLAYERS.players.flatMap((pick) => pick.stats)])].join(","),
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
  const recentWeeksIds = TRENDING_PLAYERS.players
    .filter((pick) => pick.basis === TRENDING_BASIS.RECENT_WEEKS)
    .map((pick) => pick.playerId)
    .join(",");
  const windows = trendingWindows(TRENDING_PLAYERS.week, TRENDING_PLAYERS.window ?? 2);

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
  // A RECENT_WEEKS pick reads two windows (weeks 3-4 against 1-2), each one request for
  // every such pick. Rates come back aggregated over the window, not averaged by week.
  const recentWeeks = windows.recent.join(",");
  const earlierWeeks = windows.earlier.join(",");
  const trendingRecent = useIntelligence(
    useMemo(
      () => ({ ...trendingParams, player_ids: recentWeeksIds, limit: 10, weeks: recentWeeks }),
      [trendingParams, recentWeeksIds, recentWeeks],
    ),
    { enabled: Boolean(recentWeeksIds) },
  );
  const trendingEarlier = useIntelligence(
    useMemo(
      () => ({ ...trendingParams, player_ids: recentWeeksIds, limit: 10, weeks: earlierWeeks }),
      [trendingParams, recentWeeksIds, earlierWeeks],
    ),
    { enabled: Boolean(recentWeeksIds && earlierWeeks) },
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

  // --- Head to Head: the reader's pair rides in the URL, so a matchup is shareable. The
  //     radar's axes follow the first player's position, which the request has to know
  //     before it asks, so it waits for the players' positions. ---
  const [pairText, setPairText] = useUrlState("h2h", FEATURED_MATCHUP.players.join(","));
  const pair = useMemo(() => {
    const [first = "", second = ""] = pairText.split(",").map((id) => id.trim());
    return [first, second];
  }, [pairText]);
  const pairPeople = usePlayersById(pair.filter(Boolean));
  const pairPosition = pairPeople[pair[0]]?.position;
  const matchup = useCompare(
    useMemo(
      () => ({
        players: pairPosition ? pair.filter(Boolean).join(",") : "",
        metrics: matchupMetrics(pairPosition).map((metric) => metric.id).join(","),
        season: SIGNALS_SEASON,
        season_type: "REG",
        scoring,
      }),
      [pair, pairPosition, scoring],
    ),
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

  // --- The week ahead: one strength-of-schedule board per position, read for the
  //     coming week only. Four requests, each cached server-side per scoring. ---
  const sosParams = (position) => ({ season: upcoming?.season, position, window: "full", scoring });
  const sosBoards = {
    QB: useSos(sosParams("QB"), { enabled: Boolean(upcoming) }),
    RB: useSos(sosParams("RB"), { enabled: Boolean(upcoming) }),
    WR: useSos(sosParams("WR"), { enabled: Boolean(upcoming) }),
    TE: useSos(sosParams("TE"), { enabled: Boolean(upcoming) }),
  };
  // The slate's team colours and the preview's byes. The header's Teams menu already
  // loads this list, so it is a cache hit on every page.
  const teamsList = useTeamsList();
  const teamColors = useMemo(
    () => Object.fromEntries((teamsList.data ?? []).map((team) => [team.abbreviation, team.color])),
    [teamsList.data],
  );
  const logos = useMemo(() => {
    const out = {};
    for (const game of [...(upcoming?.games ?? []), ...(lastPlayed?.games ?? [])]) {
      out[game.home_abbreviation] = game.home_logo_url;
      out[game.away_abbreviation] = game.away_logo_url;
    }
    return out;
  }, [upcoming, lastPlayed]);

  // The cards, keyed so the arrangement can be a config rather than fixed JSX. A card
  // that has nothing to show returns null here and the layout skips it.
  const cards = {
    ticker: <ScoreTicker scoreboard={scoreboard.data} isLoading={scoreboard.isLoading} />,
    highlightedViz: (
      <HighlightedVizCard
        pick={HIGHLIGHTED_VIZ}
        network={network.data}
        shape={networkShape}
        isLoading={network.isLoading}
        isError={network.isError}
      />
    ),
    airYards: (
      <AirYardsCard
        season={season}
        minTargets={AIR_YARDS_MIN_TARGETS}
        players={airYards.data?.players}
        isLoading={airYards.isLoading}
        isError={airYards.isError}
      />
    ),
    landscape: (
      <TeamLandscapeCard board={teamBoard.data} season={season} isLoading={teamBoard.isLoading} isError={teamBoard.isError} />
    ),
    recordBook: <RecordBookCard book={RECORD_BOOK} scoring={scoring} />,
    trending: (
      <TrendingPlayersCard
        picks={TRENDING_PLAYERS.players}
        week={TRENDING_PLAYERS.week}
        rows={byPlayerId(trendingNow.data?.data)}
        previousRows={byPlayerId(trendingBefore.data?.data)}
        seasonRows={byPlayerId(trendingSeason.data?.data)}
        recentRows={byPlayerId(trendingRecent.data?.data)}
        earlierRows={byPlayerId(trendingEarlier.data?.data)}
        windows={windows}
        headshots={headshots}
        games={trendingGames.data?.data}
        league={leagueConfig}
        metrics={metrics}
        isLoading={trendingNow.isLoading || trendingRecent.isLoading}
        isError={trendingNow.isError}
      />
    ),
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
    headToHead: (
      <HeadToHeadCard
        caption={FEATURED_MATCHUP.caption}
        ids={pair}
        position={pairPosition}
        result={matchup.data}
        isLoading={!pairPosition || matchup.isLoading}
        isError={matchup.isError}
        onChange={(next) => setPairText(next.join(","))}
      />
    ),
    previewHeading: upcoming?.games?.length ? (
      <BandHeading eyebrow={upcoming.label} title="Preview" sub={previewSub(upcoming.games, teamsList.data)} />
    ) : null,
    slate: (
      <SlateCard upcoming={upcoming} colors={teamColors} isLoading={scoreboard.isLoading} isError={scoreboard.isError} />
    ),
    matchups: (
      <MatchupsCard
        week={upcoming?.week}
        season={upcoming?.season}
        boards={Object.fromEntries(MATCHUP_POSITIONS.map((position) => [position, sosBoards[position].data]))}
        logos={logos}
        isLoading={scoreboard.isLoading || MATCHUP_POSITIONS.some((position) => sosBoards[position].isLoading)}
        isError={MATCHUP_POSITIONS.every((position) => sosBoards[position].isError)}
      />
    ),
    environments: (
      <EnvironmentsCard upcoming={upcoming} isLoading={scoreboard.isLoading} isError={scoreboard.isError} />
    ),
  };

  // Each card carries its own key so React can follow it across a layout change rather
  // than re-mounting the column, which would lose each card's own tab state.
  const present = (keys) => keys.filter((key) => cards[key]).map((key) => cloneElement(cards[key], { key }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-fg">Highlighted Data</h1>
        <ScoringPill scoring={scoring} onChange={setScoring} />
      </div>

      {/* The column template has to come from data and a Tailwind class cannot carry a
          runtime value, so it ships as scoped rules rather than an inline style: inline
          styles have no media query, and each template applies only above its own
          width. The widths are the tables' (see homeLayout.js), not Tailwind's. */}
      <style>
        {HOME_LAYOUT.columns
          .map((step) => `@media (min-width:${step.from}px){[data-home-columns]{grid-template-columns:${step.template}}}`)
          .join("")}
      </style>

      <div className="grid gap-4">
        {HOME_LAYOUT.bands.map((band, index) => {
          if (band.kind === "full") return <div key={index} className="grid min-w-0 gap-4">{present(band.cards)}</div>;
          if (band.kind === "grid") {
            // Each card sits in a one-cell grid so it stretches to the row's height, and an
            // odd last card spans both columns in the two-across range instead of leaving
            // half a row empty.
            const contents = present(band.cards);
            return (
              <div key={index} className="grid items-stretch gap-4 md:grid-cols-2 min-[1100px]:grid-cols-3">
                {contents.map((card, position) => (
                  <div
                    key={card.key}
                    className={`grid min-w-0 ${contents.length % 2 && position === contents.length - 1 ? "md:col-span-2 min-[1100px]:col-span-1" : ""}`}
                  >
                    {card}
                  </div>
                ))}
              </div>
            );
          }
          return (
            <div key={index} className="grid grid-cols-1 items-start gap-4" data-home-columns="">
              {band.cards.map((keys, column) => {
                const contents = present(keys);
                return contents.length ? (
                  <div key={column} className="grid min-w-0 gap-4">{contents}</div>
                ) : (
                  <div key={column} className="hidden" />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
