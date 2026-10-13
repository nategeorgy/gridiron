// Command Center: the app's home (rebuilt October 2026 as "Option C").
//
// Five bands, top to bottom (constants/homeLayout.js):
//
//   1. the week's scores as a ticker, then the Highlighted Viz of the Week, a large
//      Explore chart;
//   2. a row of Explore cards: the team landscape, air yards, the record book;
//   3. the week's players: the watchlist and Expected vs Actual on the left, a
//      reader-picked Head to Head on the right;
//   4. Weekly Finishes: a position's top scorers and where each finished every week;
//   5. the Week N Preview: the slate, then matchups by position and implied team totals.
//
// **Two seasons are in play from January to September.** The fantasy cards describe the
// last season *played*; the ticker and the week-ahead cards describe the schedule, which
// runs a year ahead. Every card names its own season rather than the page claiming one.
import { cloneElement, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useLeaderboard } from "../hooks/useLeaderboard";
import { useScoreboard } from "../hooks/useGames";
import { useIntelligence } from "../hooks/useInsight";
import { useCompare, useNetwork, usePlayersById, useScatter, useTargetBoard } from "../hooks/useExplore";
import { useSos } from "../hooks/useDraftBoard";
import { useWeeklyFinishes } from "../hooks/useWeeklyFinishes";
import { useTeamsList, useTeamStats } from "../hooks/useTeamStats";
import { useAuth } from "../hooks/useAuth";
import { useFavorites } from "../hooks/useAccount";
import { useScoring } from "../hooks/useScoring";
import { ScoringPill } from "../components/ScoringPill";
import { useLeague } from "../hooks/useLeague";
import { useMetrics } from "../hooks/useMetrics";
import { useSeasons } from "../hooks/useSeasons";
import { useUrlState } from "../hooks/useUrlState";
import { scaledMinGames, weeksPlayed } from "../utils/qualify";
import { getPlayers } from "../services/players";
import { parseLeague } from "../constants/league";
import { EXPECTED_VS_ACTUAL, FEATURED_MATCHUP, HIGHLIGHTED_VIZ, RECORD_BOOK, SIGNALS_SEASON } from "../constants/signals";
import { HOME_LAYOUT } from "../constants/homeLayout";
import { shapeNetwork } from "../components/explore/NetworkChart";

import { ScoreTicker } from "../components/home/ScoreTicker";
import { HighlightedVizCard } from "../components/home/HighlightedVizCard";
import { AirYardsCard } from "../components/home/AirYardsCard";
import { TeamLandscapeCard } from "../components/home/TeamLandscapeCard";
import { RecordBookCard } from "../components/home/RecordBookCard";
import { FINISH_LIMITS, FINISH_POSITIONS, WeeklyFinishesCard } from "../components/home/WeeklyFinishesCard";
import { HeadToHeadCard, matchupMetrics } from "../components/home/HeadToHeadCard";
import { ExpectedActualCard } from "../components/home/ExpectedActualCard";
import { MATCHUP_POSITIONS, MatchupsCard } from "../components/home/MatchupsCard";
import { EnvironmentsCard } from "../components/home/EnvironmentsCard";
import { SlateCard } from "../components/home/SlateCard";
import { BandHeading } from "../components/home/BandHeading";
import { dateParts } from "../components/schedule/kickoff";
import { MyPlayersCard } from "../components/home/BoardCards";

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
  const { supportsScoring } = useMetrics();
  const pointsKey = supportsScoring ? "fantasy_points" : FANTASY_FALLBACK.fantasy_points;

  const [finishPosition, setFinishPosition] = useState(FINISH_POSITIONS[1]);

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
  const faceIds = EXPECTED_VS_ACTUAL.join(",");
  const { data: facePlayers } = useQuery({
    queryKey: ["players", faceIds],
    queryFn: () => getPlayers({ player_ids: faceIds, limit: 30 }),
    staleTime: Infinity,
  });
  const headshots = useMemo(
    () => Object.fromEntries((facePlayers?.data ?? []).map((row) => [row.player_id, row.headshot_url])),
    [facePlayers],
  );
  // --- Weekly finishes: the position's top scorers, week by week. The games floor is
  //     stated for a full season (9 of 18) and scaled to the weeks played. ---
  const minFinishGames = scaledMinGames(9, weeksPlayed(season, lastPlayed));
  const finishes = useWeeklyFinishes(
    useMemo(
      () => ({ season, position: finishPosition, scoring, min_games: minFinishGames, limit: FINISH_LIMITS[finishPosition] }),
      [season, finishPosition, scoring, minFinishGames],
    ),
    { enabled: Boolean(season) },
  );

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
    weeklyFinishes: (
      <WeeklyFinishesCard
        season={finishes.data?.season ?? season}
        scoring={scoring}
        league={leagueConfig}
        position={finishPosition}
        onPositionChange={setFinishPosition}
        minGames={minFinishGames}
        result={finishes.data}
        isLoading={finishes.isLoading}
        isError={finishes.isError}
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
