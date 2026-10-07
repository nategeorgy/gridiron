// React Router's useSearchParams, with a setter that builds on the live URL.
//
// The router's own setter hands an updater the search params *from the last render*.
// So two writes in one click both start from the same old query string, and the second
// overwrites the first: Scatter's question chip set `q`, then cleared `pin` from a copy
// that had no `q`, and the page never moved. Every control that changes one thing and
// resets another (a season that clears the weeks, a team that clears the picked player)
// did nothing at all.
//
// BrowserRouter writes window.location synchronously on every navigate, so reading it
// here sees each earlier write in the same tick, and any number of writes compose.
// Every hook and page that writes the query string goes through this one.
import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

export function useLiveSearchParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const setLive = useCallback(
    (nextOrUpdater, options) => {
      const next =
        typeof nextOrUpdater === "function"
          ? nextOrUpdater(new URLSearchParams(window.location.search))
          : nextOrUpdater;
      setSearchParams(next, options);
    },
    [setSearchParams],
  );

  return [searchParams, setLive];
}
