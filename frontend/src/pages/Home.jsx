// Command Center: the app's home (rebuilt October 2026 as "Option C").
//
// Five bands, top to bottom (constants/homeLayout.js):
//
//   1. the week's scores as a ticker, then the Highlighted Viz of the Week, a large
//      Explore chart;
//   2. the featured game recap: targets and carries beside every possession;
//   3. the week's players: the watchlist and Floor and Ceiling on the left, a
//      reader-picked Head to Head on the right;
//   4. Weekly Finishes, through the coming week, beside the record book;
//   5. the Week N Preview: the slate, then matchups by position and the featured game's
//      tale of the tape.
//
// **Two seasons are in play from January to September.** The fantasy cards describe the
// last season *played*; the ticker and the week-ahead cards describe the schedule, which
// runs a year ahead. Every card names its own season rather than the page claiming one.
import { cloneElement, useMemo, useState } from "react";

import { useGame, useGamePreview, useGameRecap, useScoreboard } from "../hooks/useGames";
import { useIntelligence } from "../hooks/useInsight";
import { useNetwork, usePlayersById } from "../hooks/useExplore";
import { usePlayerSeason } from "../hooks/usePlayer";
import { useSos } from "../hooks/useDraftBoard";
import { useWeeklyFinishes } from "../hooks/useWeeklyFinishes";
import { useTeamsList } from "../hooks/useTeamStats";
import { useAuth } from "../hooks/useAuth";
import { useFavorites } from "../hooks/useAccount";
import { useScoring } from "../hooks/useScoring";
import { ScoringPill } from "../components/ScoringPill";
import { useLeague } from "../hooks/useLeague";
import { useMetrics } from "../hooks/useMetrics";
import { useSeasons } from "../hooks/useSeasons";
import { useUrlState } from "../hooks/useUrlState";
import { scaledMinGames, weeksPlayed } from "../utils/qualify";
import { FEATURED_GAMES, FEATURED_MATCHUP, HIGHLIGHTED_VIZ, RECORD_BOOK, SIGNALS_SEASON } from "../constants/signals";
import { HOME_LAYOUT } from "../constants/homeLayout";
import { shapeNetwork } from "../components/explore/NetworkChart";

import { ScoreTicker } from "../components/home/ScoreTicker";
import { HighlightedVizCard } from "../components/home/HighlightedVizCard";
import { PossessionsCard, TaleOfTheTapeCard, TargetsAndCarriesCard } from "../components/home/FeaturedGameCards";
import { RecordBookCard } from "../components/home/RecordBookCard";
import { FINISH_LIMITS, FINISH_POSITIONS, WeeklyFinishesCard } from "../components/home/WeeklyFinishesCard";
import { HeadToHeadCard } from "../components/home/HeadToHeadCard";
import { cardPercentileColumns, cardRankColumns } from "../constants/playerPage";
import { FloorCeilingCard } from "../components/home/FloorCeilingCard";
import { MATCHUP_POSITIONS, MatchupsCard } from "../components/home/MatchupsCard";
import { SlateCard } from "../components/home/SlateCard";
import { BandHeading } from "../components/home/BandHeading";
import { dateParts } from "../components/schedule/kickoff";
import { MyPlayersCard } from "../components/home/BoardCards";

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

/**
 * A featured game: the pick while it is one of `games` (the scoreboard's last or next
 * week), and otherwise the game `fallback` chooses from them.
 */
function featuredGame(pick, games, fallback) {
  if (!games?.length) return undefined;
  if (games.some((game) => game.game_id === pick)) return pick;
  return fallback(games)?.game_id;
}
const closestFinish = (games) =>
  games.filter((game) => game.played).sort((a, b) => Math.abs(a.home_score - a.away_score) - Math.abs(b.home_score - b.away_score))[0];
const biggestTotal = (games) => [...games].sort((a, b) => (b.total_line ?? -1) - (a.total_line ?? -1))[0];

export function Home() {
  const [scoring, setScoring] = useScoring();
  const [league] = useLeague();
  const { currentSeason: season } = useSeasons();
  const { metrics, supportsScoring } = useMetrics();
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

  // --- The featured games: a recap of one just played and a preview of one coming up.
  //     Every request is one the game page makes, so opening the game is a cache hit. ---
  const recapId = featuredGame(FEATURED_GAMES.recap, lastPlayed?.games, closestFinish);
  const previewId = featuredGame(FEATURED_GAMES.preview, upcoming?.games, biggestTotal);
  const recapGame = useGame(recapId);
  const recap = useGameRecap(recapId, scoring);
  const previewGame = useGame(previewId);
  const preview = useGamePreview(previewId, scoring);
  const recapLoading = scoreboard.isLoading || recapGame.isLoading || recap.isLoading;
  const recapError = scoreboard.isError || recapGame.isError || recap.isError;

  // --- Floor and Ceiling: every game of the top FLEX scorers by points per game. The
  //     games floor is stated for a full season (12 of 18) and scaled to the weeks played.
  const minRangeGames = scaledMinGames(12, weeksPlayed(season, lastPlayed));
  const ranges = useWeeklyFinishes(
    useMemo(
      () => ({ season, position: "FLEX", scoring, min_games: minRangeGames, limit: 14, sort: "ppg" }),
      [season, scoring, minRangeGames],
    ),
    { enabled: Boolean(season) },
  );

  // --- Weekly finishes: the position's top scorers by total points, week by week. The games floor is
  //     stated for a full season (9 of 18) and scaled to the weeks played. ---
  const minFinishGames = scaledMinGames(9, weeksPlayed(season, lastPlayed));
  const finishes = useWeeklyFinishes(
    useMemo(
      () => ({
        season,
        position: finishPosition,
        scoring,
        min_games: minFinishGames,
        limit: FINISH_LIMITS[finishPosition],
        sort: "total",
      }),
      [season, finishPosition, scoring, minFinishGames],
    ),
    { enabled: Boolean(season) },
  );

  // --- Head to Head: the reader's pair rides in the URL, so a matchup is shareable. Its
  //     rows follow the first player's position, which the request has to know before it
  //     asks, so it waits for the players' positions. The player page's request, for two. ---
  const [pairText, setPairText] = useUrlState("h2h", FEATURED_MATCHUP.players.join(","));
  const pair = useMemo(() => {
    const [first = "", second = ""] = pairText.split(",").map((id) => id.trim());
    return [first, second];
  }, [pairText]);
  const pairPeople = usePlayersById(pair.filter(Boolean));
  const pairPosition = pairPeople[pair[0]]?.position;
  // The featured pair's weeks belong to that pair: a matchup the reader builds covers
  // the season.
  const featuredPair = pair.join(",") === FEATURED_MATCHUP.players.join(",");
  const matchupWeeks = featuredPair ? FEATURED_MATCHUP.weeks : undefined;
  const matchup = usePlayerSeason({
    playerIds: pairPosition ? pair : [],
    season: SIGNALS_SEASON,
    scoring,
    league,
    percentiles: pairPosition ? cardPercentileColumns(pairPosition) : [],
    ranks: pairPosition ? cardRankColumns(pairPosition) : [],
    weeks: matchupWeeks,
  });

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
  const teamsByAbbreviation = useMemo(
    () => Object.fromEntries((teamsList.data ?? []).map((team) => [team.abbreviation, team])),
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
    targetsAndCarries: (
      <TargetsAndCarriesCard game={recapGame.data} recap={recap.data} isLoading={recapLoading} isError={recapError} />
    ),
    possessions: (
      <PossessionsCard game={recapGame.data} recap={recap.data} isLoading={recapLoading} isError={recapError} />
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
    floorCeiling: (
      <FloorCeilingCard
        season={ranges.data?.season ?? season}
        scoring={scoring}
        minGames={minRangeGames}
        result={ranges.data}
        isLoading={ranges.isLoading}
        isError={ranges.isError}
      />
    ),
    headToHead: (
      <HeadToHeadCard
        caption={featuredPair ? FEATURED_MATCHUP.caption : String(SIGNALS_SEASON)}
        ids={pair}
        position={pairPosition}
        result={matchup.data}
        people={pairPeople}
        teams={teamsByAbbreviation}
        season={SIGNALS_SEASON}
        scoring={scoring}
        metrics={metrics}
        isLoading={!pairPosition || matchup.isLoading}
        isError={matchup.isError}
        onChange={(next) => setPairText(next.join(","))}
      />
    ),
    weeklyFinishes: (
      <WeeklyFinishesCard
        season={finishes.data?.season ?? season}
        scoring={scoring}
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
    taleOfTheTape: (
      <TaleOfTheTapeCard
        game={previewGame.data}
        preview={preview.data}
        isLoading={scoreboard.isLoading || previewGame.isLoading || preview.isLoading}
        isError={scoreboard.isError || previewGame.isError || preview.isError}
      />
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
