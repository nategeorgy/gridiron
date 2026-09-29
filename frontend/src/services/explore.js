// Explore API calls: passing networks, target maps, run lanes and the Query Builder.
// See backend/app/routers/explore.py for every parameter.
import { api } from "./api";

/** Passers with a network that season, by team. Params: season, season_type. */
export async function getPassers(params) {
  const { data } = await api.get("/explore/passers", { params });
  return data;
}

/** One quarterback's targets by receiver. Params: passer_id, season, season_type, weeks, situation, team. */
export async function getNetwork(params) {
  const { data } = await api.get("/explore/network", { params });
  return data;
}

/** Every receiver's depth, side and air-yard profile, plus position averages. */
export async function getTargetBoard(params) {
  const { data } = await api.get("/explore/targets", { params });
  return data;
}

/** Every target one player drew (role "receiver") or threw (role "passer"). */
export async function getPlayerTargets(playerId, params) {
  const { data } = await api.get(`/explore/players/${playerId}/targets`, { params });
  return data;
}

/** Every target a team threw. */
export async function getTeamTargets(teamId, params) {
  const { data } = await api.get(`/explore/teams/${teamId}/targets`, { params });
  return data;
}

/** One back's designed runs by lane and how each carry ended. */
export async function getPlayerRuns(playerId, params) {
  const { data } = await api.get(`/explore/players/${playerId}/runs`, { params });
  return data;
}

/** The Query Builder's searchable stats. */
export async function getQueryFields() {
  const { data } = await api.get("/explore/query/fields");
  return data;
}

/** One Query Builder search. */
export async function runQuery(params) {
  const { data } = await api.get("/explore/query", { params });
  return data;
}
