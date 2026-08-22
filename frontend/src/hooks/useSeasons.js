// The seasons a board may offer, and the one it should open on.
//
// This used to be `SEASONS[0]` — a hardcoded array whose first element was the
// current season on the day someone typed it. Every board defaulted to it, so the
// first September of a new season the whole app would have opened on last year while
// the games people cared about were being played.
//
// The list now comes from the database (/seasons), seeded with a calendar-derived
// fallback so the first render is never an empty dropdown — the same pattern
// useMetrics uses for the metric registry.
//
// `statsOnly` (default) hides seasons that exist on the schedule but have no player
// stats yet. A season is published months before kickoff, so between spring and
// September there is always one that would render an empty board.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSeasons } from "../services/seasons";
import { FALLBACK_SEASONS, fallbackCurrentSeason } from "../constants";

export function useSeasons({ statsOnly = true } = {}) {
  const { data } = useQuery({
    queryKey: ["seasons"],
    queryFn: getSeasons,
    staleTime: Infinity,
    retry: 1,
  });

  return useMemo(() => {
    const entries = Array.isArray(data?.data) ? data.data : null;
    const seasons = entries
      ? entries.filter((entry) => !statsOnly || entry.has_stats).map((entry) => entry.season)
      : FALLBACK_SEASONS;

    // The served current season is the newest one with stats; a board showing every
    // season (the schedule-shaped ones) still opens on that rather than on a season
    // nobody has played.
    const currentSeason = data?.current_season ?? seasons[0] ?? fallbackCurrentSeason();

    return {
      seasons,
      currentSeason,
      seasonOptions: seasons.map((year) => ({ value: String(year), label: String(year) })),
    };
  }, [data, statsOnly]);
}
