// localStorage keys for the state hooks.
//
// Kept in one place because the value written here is also the value a *returning*
// visitor is shown before any query resolves, so the key and the hook that owns it
// have to agree exactly. League profiles used to mirror into these too; profiles
// were cut before launch, so a scoring preset is now per-browser and nothing else.
export const SCORING_STORAGE_KEY = "gridiron.scoring";

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
