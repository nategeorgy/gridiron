// localStorage keys shared by the state hooks and the profile sync.
//
// Kept in one place because two things write them: the scoring/league editors (a
// signed-out user's only persistence) and useProfileSync (which mirrors the active
// league profile into them so a signed-in user's first paint is already correct).
export const SCORING_STORAGE_KEY = "gridiron.scoring";
export const LEAGUE_STORAGE_KEY = "gridiron.league";

/** Read a key, tolerating storage being unavailable (private mode, etc.). */
export function readStored(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Write a key, ignoring storage failures. */
export function writeStored(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage failures (private mode, quota, etc.)
  }
}
