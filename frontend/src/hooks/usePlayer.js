// React Query hooks for player profile + game log.
import { useQuery } from "@tanstack/react-query";
import {
  getPlayer,
  getPlayerByQuarterback,
  getPlayerCareer,
  getPlayerCarries,
  getPlayerGameLog,
  getPlayerIndex,
  getPlayerNextGame,
  getPlayerRoutes,
  getPlayerSplits,
  getPlayerTargetDepth,
  getPlayerWeeklyRanks,
} from "../services/players";
import { getIntelligence } from "../services/insight";

export function usePlayer(playerId) {
  return useQuery({
    queryKey: ["player", playerId],
    queryFn: () => getPlayer(playerId),
    enabled: Boolean(playerId),
  });
}

// `scoring` is the active league-scoring spec: the backend uses it to set
// fantasy_points and expected_fantasy_points on every stat line, so the game log is
// in the user's own scoring (M1 spine A). It is part of the query key so switching
// scoring refetches.
export function usePlayerGameLog(playerId, scoring) {
  return useQuery({
    queryKey: ["player-gamelog", playerId, scoring],
    queryFn: () => getPlayerGameLog(playerId, scoring ? { scoring } : {}),
    enabled: Boolean(playerId),
  });
}

// Season-by-season career with each season's finish among the player's position (M13).
// Scoring-aware: the finishes are re-ranked in the caller's league, so it is in the key.
export function usePlayerCareer(playerId, scoring, seasonType = "REG") {
  return useQuery({
    queryKey: ["player-career", playerId, scoring, seasonType],
    queryFn: () => getPlayerCareer(playerId, { scoring, season_type: seasonType }),
    enabled: Boolean(playerId),
  });
}

/**
 * One or two players' season rows, with a percentile for every requested metric (M13).
 *
 * Served by `/stats/intelligence` rather than the leaderboard because the Fantasy board
 * carries the query-time columns, which only exist on the scored rows —
 * re-aggregating raw stat lines cannot see them. That endpoint already scores the whole
 * league and then narrows, so the percentile pools stay the league at each position no
 * matter how few players are asked for.
 *
 * `include_unqualified` is on: this is a profile, and a player who missed most of the
 * season still has a page. He is scored against the pool without shaping it.
 *
 * `weeks` (an explicit set, "1,2,6") narrows the season, as the home page's featured
 * head-to-head does; the ranks and percentiles are then for those weeks.
 */
export function usePlayerSeason({ playerIds, season, seasonType = "REG", scoring, league, percentiles, ranks, weeks }) {
  const ids = (playerIds ?? []).filter(Boolean);
  const key = ids.join(",");
  const metrics = (percentiles ?? []).join(",");
  // Positional ranks for the headline, read by the API from the same pools as the
  // percentiles — so "WR4" and the percentile beside it describe the same players.
  const ranked = (ranks ?? []).join(",");
  return useQuery({
    queryKey: ["player-season", key, season, seasonType, scoring, league, metrics, ranked, weeks],
    queryFn: () =>
      getIntelligence({
        season,
        season_type: seasonType,
        scoring,
        league,
        player_ids: key,
        percentiles: metrics,
        ranks: ranked,
        include_unqualified: true,
        limit: Math.max(ids.length, 1),
        ...(weeks ? { weeks } : {}),
      }),
    enabled: Boolean(key && season),
  });
}

// Targets bucketed by pass depth for one season (M4). Not scoring-aware — these are
// counted events, not fantasy points — so scoring is deliberately not in the key.
export function usePlayerTargetDepth(playerId, season, seasonType = "REG") {
  return useQuery({
    queryKey: ["player-target-depth", playerId, season, seasonType],
    queryFn: () =>
      getPlayerTargetDepth(playerId, { season, season_type: seasonType }),
    enabled: Boolean(playerId && season),
  });
}

// --- The tabbed player page (November 2026) ---------------------------------------------
// Each tab asks only for what it draws, so a reader who never opens Splits never pays for
// it. Everything scoring-aware carries the spec in its key.

export function usePlayerWeeklyRanks(playerId, season, stats, scoring) {
  const list = (stats ?? []).join(",");
  return useQuery({
    queryKey: ["player-weekly-ranks", playerId, season, list, scoring],
    queryFn: () => getPlayerWeeklyRanks(playerId, { season, stats: list, scoring }),
    enabled: Boolean(playerId && season && list),
  });
}

export function usePlayerByQuarterback(playerId, scoring, { enabled = true } = {}) {
  return useQuery({
    queryKey: ["player-by-qb", playerId, scoring],
    queryFn: () => getPlayerByQuarterback(playerId, { scoring }),
    enabled: Boolean(playerId) && enabled,
  });
}

export function usePlayerSplits(playerId, season, scoring) {
  return useQuery({
    queryKey: ["player-splits", playerId, season, scoring],
    queryFn: () => getPlayerSplits(playerId, { season, scoring }),
    enabled: Boolean(playerId && season),
  });
}

export function usePlayerNextGame(playerId, scoring) {
  return useQuery({
    queryKey: ["player-next-game", playerId, scoring],
    queryFn: () => getPlayerNextGame(playerId, { scoring }),
    enabled: Boolean(playerId),
  });
}

export function usePlayerCarries(playerId, season, { enabled = true } = {}) {
  return useQuery({
    queryKey: ["player-carries", playerId, season],
    queryFn: () => getPlayerCarries(playerId, { season }),
    enabled: Boolean(playerId && season) && enabled,
  });
}

export function usePlayerRoutes(playerId, role, season) {
  return useQuery({
    queryKey: ["player-routes", playerId, role, season ?? "newest"],
    queryFn: () => getPlayerRoutes(playerId, { role, ...(season ? { season } : {}) }),
    enabled: Boolean(playerId),
  });
}

/**
 * Career seasons with each season's percentile in `percentiles` and, per season, the
 * position's pooled rate and Nth-best value for each of `lines` (the dashed lines on the
 * game charts). A separate key from `usePlayerCareer`, which the career table reads plain.
 */
export function usePlayerCareerDetail(playerId, scoring, { percentiles = [], lines = [], lineRank } = {}) {
  const pct = percentiles.join(",");
  const ln = lines.join(",");
  return useQuery({
    queryKey: ["player-career-detail", playerId, scoring, pct, ln, lineRank],
    queryFn: () => getPlayerCareer(playerId, { scoring, percentiles: pct, lines: ln, ...(lineRank ? { line_rank: lineRank } : {}) }),
    enabled: Boolean(playerId),
  });
}

/** The dashboard's search index: fetched once, searched in the browser. */
export function usePlayerIndex(scoring) {
  return useQuery({
    queryKey: ["player-index", scoring],
    queryFn: () => getPlayerIndex({ scoring }),
    staleTime: 10 * 60 * 1000,
  });
}
