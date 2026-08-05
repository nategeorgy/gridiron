// React Query hooks over the account API.
//
// All of them key off ["account", ...] so useAuth can drop the whole subtree on any
// auth change. Each is disabled when signed out, so a signed-out visitor never fires
// a request that would 401 — signed-out is a normal state, not a failure.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addFavorite,
  createLeagueProfile,
  createSavedView,
  deleteLeagueProfile,
  deleteSavedView,
  getAccount,
  getFavorites,
  getLeagueProfiles,
  getSavedViews,
  removeFavorite,
  updateLeagueProfile,
  updateSavedView,
} from "../services/account";
import { useAuth } from "./useAuth";

/** The signed-in user plus counts of what they have saved. */
export function useAccount() {
  const { isSignedIn } = useAuth();
  return useQuery({
    queryKey: ["account", "summary"],
    queryFn: getAccount,
    enabled: isSignedIn,
  });
}

// --- League profiles ---

/** The user's league profiles and the mutations that change them. */
export function useLeagueProfiles() {
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["account"] });

  const query = useQuery({
    queryKey: ["account", "league-profiles"],
    queryFn: getLeagueProfiles,
    enabled: isSignedIn,
  });

  const create = useMutation({ mutationFn: createLeagueProfile, onSuccess: invalidate });
  const update = useMutation({
    mutationFn: ({ profileId, ...payload }) => updateLeagueProfile(profileId, payload),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: deleteLeagueProfile, onSuccess: invalidate });

  const profiles = query.data ?? [];
  return {
    profiles,
    activeProfile: profiles.find((profile) => profile.is_active) ?? null,
    isLoading: query.isLoading,
    createProfile: create.mutateAsync,
    updateProfile: update.mutateAsync,
    deleteProfile: remove.mutateAsync,
    // Surfaced so the editor can show a duplicate-name or invalid-spec message
    // rather than failing silently.
    error: create.error || update.error || remove.error || null,
  };
}

// --- Favorites ---

/** The watchlist, with a membership test and an optimistic toggle. */
export function useFavorites() {
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["account", "favorites"],
    queryFn: getFavorites,
    enabled: isSignedIn,
  });

  const favorites = query.data ?? [];
  const favoriteIds = new Set(favorites.map((favorite) => favorite.player.player_id));

  const toggle = useMutation({
    mutationFn: ({ playerId, next }) =>
      next ? addFavorite(playerId) : removeFavorite(playerId),
    // Optimistic: a star has to feel instant, and the failure mode (a rolled-back
    // star) is visible and harmless.
    onMutate: async ({ playerId, next }) => {
      await queryClient.cancelQueries({ queryKey: ["account", "favorites"] });
      const previous = queryClient.getQueryData(["account", "favorites"]);
      queryClient.setQueryData(["account", "favorites"], (current = []) =>
        next
          ? current
          : current.filter((favorite) => favorite.player.player_id !== playerId),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(["account", "favorites"], context?.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["account"] }),
  });

  return {
    favorites,
    favoriteIds,
    isLoading: query.isLoading,
    isFavorite: (playerId) => favoriteIds.has(playerId),
    toggleFavorite: (playerId, next) => toggle.mutateAsync({ playerId, next }),
  };
}

// --- Saved views ---

/** The user's saved views and the mutations that change them. */
export function useSavedViews() {
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["account"] });

  const query = useQuery({
    queryKey: ["account", "saved-views"],
    queryFn: getSavedViews,
    enabled: isSignedIn,
  });

  const create = useMutation({ mutationFn: createSavedView, onSuccess: invalidate });
  const update = useMutation({
    mutationFn: ({ viewId, ...payload }) => updateSavedView(viewId, payload),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: deleteSavedView, onSuccess: invalidate });

  return {
    views: query.data ?? [],
    isLoading: query.isLoading,
    createView: create.mutateAsync,
    updateView: update.mutateAsync,
    deleteView: remove.mutateAsync,
    error: create.error || update.error || remove.error || null,
  };
}
