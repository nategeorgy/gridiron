// Draft API calls (M9): ranking boards, and grading a mock draft.
//
// The public calls here work signed out. The `/me/ranking-boards` calls do not —
// saving a board of your own is the same class of thing as a favorite or a saved
// view — but *reading* every consensus board is open, which is what keeps accounts a
// persistence layer rather than a gate.
import { api } from "./api";

/**
 * The boards this caller may pick: the public global sources, plus their own when
 * signed in. Params: league, ranking_type?, week?.
 * Returns { data: [{ id, label, kind, description, attribution }], season, week, context }.
 */
export async function getDraftSources(params) {
  const { data } = await api.get("/draft/sources", { params });
  return data;
}

/**
 * One board's players, with our valuation beside the board's own order.
 * Params: source, season? (the valuation season), week?, ranking_type?, scoring,
 * league, position?, sort, order, limit, offset, player_ids?.
 */
export async function getRankings(params) {
  const { data } = await api.get("/draft/rankings", { params });
  return data;
}

/**
 * Grade a finished mock. Payload: { scoring, league, teams: [{ draft_slot,
 * player_ids }], picks?, bot_source? }. Needs no account.
 */
export async function gradeMockDraft(payload) {
  const { data } = await api.post("/draft/mock-grade", payload);
  return data;
}

// --- The user's own boards ---

/** List the user's ranking boards, most recently edited first. */
export async function getRankingBoards() {
  const { data } = await api.get("/me/ranking-boards");
  return data;
}

/** One board with its players, in order. */
export async function getRankingBoard(boardId) {
  const { data } = await api.get(`/me/ranking-boards/${boardId}`);
  return data;
}

/** Create a board. `payload` is { name, ranking_type?, seeded_from?, entries }. */
export async function createRankingBoard(payload) {
  const { data } = await api.post("/me/ranking-boards", payload);
  return data;
}

/** Rename or re-type a board. */
export async function updateRankingBoard(boardId, payload) {
  const { data } = await api.patch(`/me/ranking-boards/${boardId}`, payload);
  return data;
}

/**
 * Replace a board's players. Position in `entries` is the rank — there is no rank
 * field, so the ordering the editor holds is the only source of truth.
 */
export async function replaceBoardEntries(boardId, entries) {
  const { data } = await api.put(`/me/ranking-boards/${boardId}/entries`, { entries });
  return data;
}

/** Delete a board. */
export async function deleteRankingBoard(boardId) {
  await api.delete(`/me/ranking-boards/${boardId}`);
}

/**
 * Import a CSV as a new board. `payload` is { name, ranking_type?, content } where
 * content is the file's text — read in the browser and posted as JSON, since a
 * ranking board is a few tens of kilobytes at most.
 * Returns { board, matched, unmatched, out_of_scope, total_rows }.
 */
export async function importRankingBoard(payload) {
  const { data } = await api.post("/me/ranking-boards/import", payload);
  return data;
}

// --- Mock draft history ---

/** The user's finished mocks, newest first. */
export async function getMockDrafts() {
  const { data } = await api.get("/me/mock-drafts");
  return data;
}

/** Save a finished mock to the user's history. */
export async function createMockDraft(payload) {
  const { data } = await api.post("/me/mock-drafts", payload);
  return data;
}

/** Delete a saved mock. */
export async function deleteMockDraft(mockId) {
  await api.delete(`/me/mock-drafts/${mockId}`);
}
