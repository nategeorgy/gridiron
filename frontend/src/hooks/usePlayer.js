// React Query hooks for player profile + game log.
import { useQuery } from "@tanstack/react-query";
import {
  getPlayer,
  getPlayerCareer,
  getPlayerGameLog,
  getPlayerTargetDepth,
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
 * carries VORP and the other query-time columns, which only exist on the scored rows —
 * re-aggregating raw stat lines cannot see them. That endpoint already scores the whole
 * league and then narrows, so the percentile pools stay the league at each position no
 * matter how few players are asked for.
 *
 * `include_unqualified` is on: this is a profile, and a player who missed most of the
 * season still has a page. He is scored against the pool without shaping it.
 */
export function usePlayerSeason({ playerIds, season, seasonType = "REG", scoring, league, percentiles, ranks }) {
  const ids = (playerIds ?? []).filter(Boolean);
  const key = ids.join(",");
  const metrics = (percentiles ?? []).join(",");
  // Positional ranks for the headline, read by the API from the same pools as the
  // percentiles — so "WR4" and the percentile beside it describe the same players.
  const ranked = (ranks ?? []).join(",");
  return useQuery({
    queryKey: ["player-season", key, season, seasonType, scoring, league, metrics, ranked],
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
