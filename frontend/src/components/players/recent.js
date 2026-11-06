// Players the reader opened lately, newest first, for the Player Dashboard's search.
// Per browser and nothing more: a convenience, so it lives in localStorage and every read
// and write survives storage being blocked.
const KEY = "second-level:recent-players";
const LIMIT = 6;

export function recentlyViewed() {
  try {
    const list = JSON.parse(window.localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list.filter((id) => typeof id === "string").slice(0, LIMIT) : [];
  } catch {
    return [];
  }
}

export function rememberViewed(playerId) {
  try {
    const next = [playerId, ...recentlyViewed().filter((id) => id !== playerId)].slice(0, LIMIT);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked (a private window): the list just stays empty.
  }
}
