// React Query hooks for the team pages and team leaderboards.
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getActiveTeams, getTeam, getTeamBreakdown, getTeamStats } from "../services/teams";
import { getLeaderboard } from "../services/stats";
import { getPlayers } from "../services/players";

/** Every team metric for every team (both sides, with ranks). One request per season,
 *  week window and scoring; tabs and columns are cut from it without refetching. */
export function useTeamStats(params, { enabled = true } = {}) {
  return useQuery({
    queryKey: ["team-stats", params],
    queryFn: () => getTeamStats(params),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** One team's trend, pass depth, run lanes, personnel and staff. */
export function useTeamBreakdown(teamId, params) {
  return useQuery({
    queryKey: ["team-breakdown", teamId, params],
    queryFn: () => getTeamBreakdown(teamId, params),
    enabled: Boolean(teamId),
    placeholderData: keepPreviousData,
  });
}

/** The 32 teams, for the Teams menu and the Team Pages index. */
export function useTeamsList() {
  return useQuery({ queryKey: ["teams", "active"], queryFn: getActiveTeams, staleTime: 60 * 60 * 1000 });
}

/** Everyone who played for a team in a window, from the player leaderboard filtered to
 *  that team, with headshots joined on (the leaderboard rows do not carry them). */
export function useTeamPlayers({ season, weeks, abbreviation, scoring }) {
  return useQuery({
    queryKey: ["team-players", season, weeks, abbreviation, scoring],
    queryFn: async () => {
      const board = await getLeaderboard({ season, weeks: weeks || undefined, team: abbreviation, scoring, metric: "fantasy_points", limit: 200 });
      const rows = board.data ?? [];
      if (!rows.length) return rows;
      const people = await getPlayers({ player_ids: rows.map((row) => row.player_id).join(","), limit: 200 });
      const heads = Object.fromEntries((people.data ?? []).map((person) => [person.player_id, person.headshot_url]));
      return rows.map((row) => ({ ...row, headshot_url: heads[row.player_id] ?? null }));
    },
    enabled: Boolean(season && abbreviation),
    placeholderData: keepPreviousData,
  });
}

/** One team's record, fixtures with lines, strength of schedule and depth chart (M6.2). */
export function useTeam(teamId, params) {
  return useQuery({
    queryKey: ["team", teamId, params],
    queryFn: () => getTeam(teamId, params),
    enabled: Boolean(teamId),
    placeholderData: keepPreviousData,
  });
}
