// League-context state, stateless-first (spine C) — the same pattern as useScoring:
// the URL query param is the source of truth (so an Insight view is shareable), with
// localStorage as the persisted default across visits.
import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { DEFAULT_LEAGUE } from "../constants/league";

const STORAGE_KEY = "gridiron.league";

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function useLeague() {
  const [searchParams, setSearchParams] = useSearchParams();
  const league = searchParams.get("league") || readStored() || DEFAULT_LEAGUE;

  const setLeague = useCallback(
    (spec) => {
      const next = spec || DEFAULT_LEAGUE;
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore storage failures (private mode, etc.)
      }
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          // Keep the default out of the URL to stay clean; it still resolves to 12-team.
          if (next === DEFAULT_LEAGUE) params.delete("league");
          else params.set("league", next);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return [league, setLeague];
}
