// League-scoring state, stateless-first (spine C): the URL query param is the
// source of truth (so views are shareable), with localStorage as the persisted
// default across visits. Falls back to PPR.
import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { DEFAULT_SCORING } from "../constants/scoring";

const STORAGE_KEY = "gridiron.scoring";

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function useScoring() {
  const [searchParams, setSearchParams] = useSearchParams();
  const scoring = searchParams.get("scoring") || readStored() || DEFAULT_SCORING;

  const setScoring = useCallback(
    (spec) => {
      const next = spec || DEFAULT_SCORING;
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore storage failures (private mode, etc.)
      }
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
