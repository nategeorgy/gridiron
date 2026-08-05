// Keeps localStorage and the account's active league profile coherent. Mounted once,
// in the app shell.
//
// Two directions, each running at most once per situation:
//
// 1. **localStorage → account, on first sign-in.** Someone who spent ten minutes
//    entering their league's scoring before deciding to sign up should not lose it.
//    Guarded on the account having *zero* profiles, so it runs once and can never
//    overwrite real profiles when the same user signs in from another browser.
//
// 2. **account → localStorage, whenever the active profile changes.** This makes
//    localStorage a warm cache of the active profile, which is what lets useScoring
//    and useLeague resolve correctly on first paint instead of flashing the previous
//    device's setup while the profile query is still in flight.
import { useEffect, useRef } from "react";
import { DEFAULT_LEAGUE } from "../constants/league";
import { DEFAULT_SCORING } from "../constants/scoring";
import {
  LEAGUE_STORAGE_KEY,
  SCORING_STORAGE_KEY,
  readStored,
  writeStored,
} from "../constants/storage";
import { useLeagueProfiles } from "./useAccount";
import { useAuth } from "./useAuth";

/** The name given to a profile created from pre-account localStorage state. */
export const MIGRATED_PROFILE_NAME = "My League";

export function useProfileSync() {
  const { isSignedIn } = useAuth();
  const { profiles, activeProfile, isLoading, createProfile } = useLeagueProfiles();
  // One attempt per mount. Without this the effect would re-fire on every render
  // between the POST and the refetch, creating duplicate profiles.
  const migrationAttempted = useRef(false);

  // 1. localStorage → account, once, on first sign-in with no profiles yet.
  useEffect(() => {
    if (!isSignedIn || isLoading || migrationAttempted.current) return;
    if (profiles.length > 0) return;

    const storedScoring = readStored(SCORING_STORAGE_KEY);
    const storedLeague = readStored(LEAGUE_STORAGE_KEY);
    // Nothing worth migrating if they never touched either editor.
    const hasCustomState =
      (storedScoring && storedScoring !== DEFAULT_SCORING) ||
      (storedLeague && storedLeague !== DEFAULT_LEAGUE);
    if (!hasCustomState) return;

    migrationAttempted.current = true;
    createProfile({
      name: MIGRATED_PROFILE_NAME,
      scoring_spec: storedScoring || DEFAULT_SCORING,
      league_spec: storedLeague || DEFAULT_LEAGUE,
      activate: true,
    }).catch(() => {
      // A name collision or a transient failure is not worth interrupting the user
      // over — their localStorage state is untouched and still resolves normally.
    });
  }, [isSignedIn, isLoading, profiles.length, createProfile]);

  // 2. account → localStorage, so the next cold start paints the right setup.
  useEffect(() => {
    if (!activeProfile) return;
    writeStored(SCORING_STORAGE_KEY, activeProfile.scoring_spec);
    writeStored(LEAGUE_STORAGE_KEY, activeProfile.league_spec);
  }, [activeProfile]);
}
