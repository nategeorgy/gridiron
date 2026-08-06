// League-scoring state. Stateless-first (spine C) with the account as one more
// fallback layer, never as an override:
//
//     URL query param  >  active league profile  >  localStorage  >  PPR
//
// The URL winning over the account is load-bearing. A link shared with
// `?scoring=ppr:te_rec=1.5` must show *that* league to whoever opens it, signed in
// or not — otherwise every shared link silently lies, and shareability was the whole
// point of building this stateless first. useProfileSync mirrors the active profile
// into localStorage, so a signed-in user's first paint is already right and there is
// no flash while the profile query resolves.
import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { DEFAULT_SCORING } from "../constants/scoring";
import { SCORING_STORAGE_KEY, readStored, writeStored } from "../constants/storage";
import { useLeagueProfiles } from "./useAccount";

export function useScoring() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeProfile } = useLeagueProfiles();

  const fromUrl = searchParams.get("scoring");
  const scoring =
    fromUrl ||
    activeProfile?.scoring_spec ||
    readStored(SCORING_STORAGE_KEY) ||
    DEFAULT_SCORING;

  const setScoring = useCallback(
    (spec) => {
      const next = spec || DEFAULT_SCORING;
      writeStored(SCORING_STORAGE_KEY, next);
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          // Keep the default out of the URL to stay clean; it still resolves to PPR.
          if (next === DEFAULT_SCORING) params.delete("scoring");
          else params.set("scoring", next);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // True when the URL is overriding a signed-in user's own profile — what the
  // "viewing a shared setup" affordance keys off.
  const isOverridingProfile = Boolean(
    fromUrl && activeProfile && fromUrl !== activeProfile.scoring_spec,
  );

  return [scoring, setScoring, { isOverridingProfile, activeProfile }];
}
