// A piece of view state that lives in the URL query string.
//
// The boards previously kept their filters in `useState`, which meant a board link
// carried none of them: sharing "/fantasy/leaders" sent the recipient to the default
// view, and a saved view (M5) stored a path with nothing in it. Spine C's premise —
// that a view is completely described by its URL — was true for the Explore tools and
// not for the 17 boards. This hook closes that gap.
//
// Defaults are kept *out* of the URL so a clean view has a clean address bar, exactly
// like useScoring/useLeague do with PPR and 12-team.
import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * @param key       query-string parameter name
 * @param fallback  value used when the param is absent (never written to the URL)
 * @param allowed   optional whitelist; a value outside it falls back, so a param
 *                  carried over from another board can't wedge the view or send the
 *                  API a metric this board does not have
 */
export function useUrlState(key, fallback, allowed = null) {
  const [searchParams, setSearchParams] = useSearchParams();

  const raw = searchParams.get(key);
  const value = raw !== null && (!allowed || allowed.includes(raw)) ? raw : fallback;

  const setValue = useCallback(
    (next) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next === fallback || next === "" || next === null || next === undefined) {
            params.delete(key);
          } else {
            params.set(key, String(next));
          }
          return params;
        },
        { replace: true },
      );
    },
    [key, fallback, setSearchParams],
  );

  return [value, setValue];
}
