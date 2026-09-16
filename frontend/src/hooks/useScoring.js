// League-scoring state. Stateless-first (spine C):
//
//     URL query param  >  localStorage  >  PPR
//
// The URL winning is load-bearing. A link shared with `?scoring=std` must show *that*
// scoring to whoever opens it, or every shared link silently lies — and shareability
// was the whole point of building this stateless first.
//
// The account used to sit between the URL and localStorage, supplying the active
// league profile's spec. Profiles were cut before launch, so the layer is gone and
// scoring is once again a purely anonymous, per-browser preference.
//
// Every value is normalised through `normalizeScoring`, so a custom spec left in an
// old link or in a returning visitor's localStorage resolves to its bare preset
// rather than to a scoring the picker cannot display.
import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { DEFAULT_SCORING, normalizeScoring } from "../constants/scoring";
import { SCORING_STORAGE_KEY, readStored, writeStored } from "../constants/storage";

export function useScoring() {
  const [searchParams, setSearchParams] = useSearchParams();

  const scoring = normalizeScoring(
    searchParams.get("scoring") || readStored(SCORING_STORAGE_KEY) || DEFAULT_SCORING,
  );

  const setScoring = useCallback(
    (spec) => {
      const next = normalizeScoring(spec);
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

  return [scoring, setScoring];
}
