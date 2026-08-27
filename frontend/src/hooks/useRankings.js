// React Query hooks over the draft API (M9).
//
// Two halves with different auth stories, deliberately kept in one file because the
// Rankings page reads from both: the *board* queries are public and run signed out,
// while the *board-management* mutations require an account and are disabled without
// one. A signed-out visitor therefore fires no request that would 401.
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  createRankingBoard,
  deleteRankingBoard,
  getDraftSources,
  getMockDrafts,
  getRankingBoard,
  getRankingBoards,
  getRankings,
  importRankingBoard,
  replaceBoardEntries,
  updateRankingBoard,
} from "../services/draft";
import { useAuth } from "./useAuth";

/** The boards this caller may pick — public globals plus their own. */
export function useDraftSources(params, options = {}) {
  return useQuery({
    queryKey: ["draft-sources", params],
    queryFn: () => getDraftSources(params),
    ...options,
  });
}

/** One board's rows, with our valuation columns. */
export function useRankings(params, options = {}) {
  return useQuery({
    queryKey: ["rankings", params],
    queryFn: () => getRankings(params),
    placeholderData: keepPreviousData,
    ...options,
  });
}

/**
 * The user's own boards and the mutations that change them.
 *
 * Keyed under ["account", …] like every other owned resource, so useAuth drops the
 * whole subtree on sign-out. `draft-sources` is invalidated alongside, because a new
 * board has to appear in the board switcher immediately — that is where it is used.
 */
export function useRankingBoards() {
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["account"] });
    queryClient.invalidateQueries({ queryKey: ["draft-sources"] });
    queryClient.invalidateQueries({ queryKey: ["rankings"] });
  };

  const query = useQuery({
    queryKey: ["account", "ranking-boards"],
    queryFn: getRankingBoards,
    enabled: isSignedIn,
  });

  const create = useMutation({ mutationFn: createRankingBoard, onSuccess: invalidate });
  const update = useMutation({
    mutationFn: ({ boardId, ...payload }) => updateRankingBoard(boardId, payload),
    onSuccess: invalidate,
  });
  const replace = useMutation({
    mutationFn: ({ boardId, entries }) => replaceBoardEntries(boardId, entries),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: deleteRankingBoard, onSuccess: invalidate });
  const importCsv = useMutation({ mutationFn: importRankingBoard, onSuccess: invalidate });

  return {
    boards: query.data ?? [],
    isLoading: query.isLoading,
    createBoard: create.mutateAsync,
    updateBoard: update.mutateAsync,
    replaceEntries: replace.mutateAsync,
    deleteBoard: remove.mutateAsync,
    importBoard: importCsv.mutateAsync,
    isImporting: importCsv.isPending,
    isSaving: create.isPending || update.isPending || replace.isPending,
    // Surfaced so a dialog can show "you already have a board with that name"
    // rather than failing silently.
    error: create.error || update.error || replace.error || remove.error || importCsv.error || null,
  };
}

/** One board with its players — the editor's source of truth. */
export function useRankingBoard(boardId) {
  const { isSignedIn } = useAuth();
  return useQuery({
    queryKey: ["account", "ranking-board", boardId],
    queryFn: () => getRankingBoard(boardId),
    enabled: Boolean(isSignedIn && boardId),
  });
}

/** The user's finished mocks. */
export function useMockDrafts() {
  const { isSignedIn } = useAuth();
  return useQuery({
    queryKey: ["account", "mock-drafts"],
    queryFn: getMockDrafts,
    enabled: isSignedIn,
  });
}
