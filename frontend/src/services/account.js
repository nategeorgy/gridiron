// Account API calls (M5): favorites and saved views.
//
// The /me/league-profiles endpoints still exist on the backend but have no caller:
// profiles were cut from the product before launch. They are left standing rather
// than removed so reinstating them is a frontend change alone.
// Every one of these requires a signed-in user; the bearer token is attached by
// the interceptor in api.js.
import { api } from "./api";

/** The signed-in user plus counts of what they have saved. */
export async function getAccount() {
  const { data } = await api.get("/me");
  return data;
}

/** Delete the account and everything it owns. */
export async function deleteAccount() {
  await api.delete("/me");
}

// --- Favorites ---

/** The user's watchlist, hydrated with player detail. */
export async function getFavorites() {
  const { data } = await api.get("/me/favorites");
  return data;
}

/** Add a player to the watchlist. Idempotent. */
export async function addFavorite(playerId) {
  await api.put(`/me/favorites/${playerId}`);
}

/** Remove a player from the watchlist. Idempotent. */
export async function removeFavorite(playerId) {
  await api.delete(`/me/favorites/${playerId}`);
}

// --- Saved views ---

/** List saved views, most recently updated first. */
export async function getSavedViews() {
  const { data } = await api.get("/me/saved-views");
  return data;
}

/** Save a view. `payload` is { name, path, query }. */
export async function createSavedView(payload) {
  const { data } = await api.post("/me/saved-views", payload);
  return data;
}

/** Patch a saved view — rename, or re-point it at the current filters. */
export async function updateSavedView(viewId, payload) {
  const { data } = await api.patch(`/me/saved-views/${viewId}`, payload);
  return data;
}

/** Delete a saved view. */
export async function deleteSavedView(viewId) {
  await api.delete(`/me/saved-views/${viewId}`);
}
