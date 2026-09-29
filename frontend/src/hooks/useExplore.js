// React Query hooks for the Explore tab.
//
// useScatter and useCompare are the M4 endpoints the home page still reads; the rest
// serve the Explore pages and the target maps on player and team pages. None of the
// play-level data depends on scoring, so scoring is never part of those keys.
import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getCompare, getScatter } from "../services/stats";
import { getPlayers } from "../services/players";
import {
  getNetwork,
  getPassers,
  getPlayerRuns,
  getPlayerTargets,
  getQueryFields,
  getTargetBoard,
  getTeamTargets,
  runQuery,
} from "../services/explore";

export function useScatter(params, options = {}) {
  return useQuery({
    queryKey: ["scatter", params],
    queryFn: () => getScatter(params),
    placeholderData: keepPreviousData,
    ...options,
  });
}

// `players` is a comma-separated id list; the query is disabled until at least one
// player is picked, so an empty comparison never hits the API.
export function useCompare(params) {
  return useQuery({
    queryKey: ["compare", params],
    queryFn: () => getCompare(params),
    enabled: Boolean(params.players),
    placeholderData: keepPreviousData,
  });
}

/** Passers with a network in a season. */
export function usePassers(params) {
  return useQuery({
    queryKey: ["explore-passers", params],
    queryFn: () => getPassers(params),
    enabled: Boolean(params.season),
    staleTime: 10 * 60 * 1000,
  });
}

/** One quarterback's passing network. */
export function useNetwork(params, options = {}) {
  return useQuery({
    queryKey: ["explore-network", params],
    queryFn: () => getNetwork(params),
    enabled: Boolean(params.passer_id && params.season),
    placeholderData: keepPreviousData,
    ...options,
  });
}

/** The Target Analysis board. */
export function useTargetBoard(params) {
  return useQuery({
    queryKey: ["explore-targets", params],
    queryFn: () => getTargetBoard(params),
    enabled: Boolean(params.season),
    placeholderData: keepPreviousData,
  });
}

/** Every target one player drew or threw. */
export function usePlayerTargets(playerId, params, options = {}) {
  return useQuery({
    queryKey: ["explore-player-targets", playerId, params],
    queryFn: () => getPlayerTargets(playerId, params),
    enabled: Boolean(playerId && params.season),
    ...options,
  });
}

/** Every target a team threw. */
export function useTeamTargets(teamId, params, options = {}) {
  return useQuery({
    queryKey: ["explore-team-targets", teamId, params],
    queryFn: () => getTeamTargets(teamId, params),
    enabled: Boolean(teamId && params.season),
    ...options,
  });
}

/** One back's run lanes and carry outcomes. */
export function usePlayerRuns(playerId, params, options = {}) {
  return useQuery({
    queryKey: ["explore-player-runs", playerId, params],
    queryFn: () => getPlayerRuns(playerId, params),
    enabled: Boolean(playerId && params.season),
    ...options,
  });
}

/** The Query Builder's field catalogue. It changes only with a deploy. */
export function useQueryFields() {
  return useQuery({
    queryKey: ["explore-query-fields"],
    queryFn: getQueryFields,
    staleTime: 60 * 60 * 1000,
  });
}

/** One Query Builder search. */
export function useQuerySearch(params, options = {}) {
  return useQuery({
    queryKey: ["explore-query", params],
    queryFn: () => runQuery(params),
    placeholderData: keepPreviousData,
    ...options,
  });
}

/**
 * Players' names, positions, teams and headshots, as { player_id: row }. A season row
 * from /stats/intelligence is an aggregate and carries no image, so a chart of faces
 * asks for them separately, in one call (the endpoint takes up to 200 ids).
 */
export function usePlayersById(ids) {
  const key = [...new Set((ids ?? []).filter(Boolean))].sort().slice(0, 200).join(",");
  const { data } = useQuery({
    queryKey: ["players-by-id", key],
    queryFn: () => getPlayers({ player_ids: key, limit: 200 }),
    enabled: Boolean(key),
    staleTime: 60 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
  return useMemo(() => Object.fromEntries((data?.data ?? []).map((row) => [row.player_id, row])), [data]);
}

/** Headshot URLs for a set of players, as { player_id: url }. */
export function useHeadshots(ids) {
  const players = usePlayersById(ids);
  return useMemo(() => Object.fromEntries(Object.entries(players).map(([id, row]) => [id, row.headshot_url])), [players]);
}
