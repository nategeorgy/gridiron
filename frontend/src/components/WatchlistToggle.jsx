// "Watchlist only" filter for the ranked boards.
//
// Disabled rather than hidden when the user has starred nobody, so the feature is
// discoverable from the boards themselves; hidden entirely when signed out.
//
// The filter is applied server-side (the `player_ids` param), so it composes with
// sort, pagination, and totals instead of trimming an already-paged result.
import { useAuth } from "../hooks/useAuth";
import { useFavorites } from "../hooks/useAccount";
import { useUrlState } from "../hooks/useUrlState";

/** State + the query param for the watchlist filter. Pair with <WatchlistToggle />. */
export function useWatchlistFilter() {
  const { isSignedIn } = useAuth();
  const { favorites } = useFavorites();
  // In the URL like every other board filter, so a saved view remembers it. The
  // player ids themselves are never put in the URL — they are the user's data, and
  // the list is resolved from the account on load.
  const [raw, setRaw] = useUrlState("watchlist", "");
  const enabled = raw === "1";
  const setEnabled = (next) => setRaw(next ? "1" : "");

  const ids = favorites.map((favorite) => favorite.player.player_id);
  // An empty list cannot be expressed as a filter (the API reads a blank param as
  // "no filter"), so the toggle is unavailable until something is starred.
  const active = isSignedIn && enabled && ids.length > 0;

  return {
    available: isSignedIn,
    hasFavorites: ids.length > 0,
    enabled,
    setEnabled,
    params: active ? { player_ids: ids.join(",") } : {},
  };
}

export function WatchlistToggle({ filter, onChange }) {
  if (!filter.available) return null;

  const disabled = !filter.hasFavorites;

  return (
    <label className="flex items-end pb-0.5">
      <button
        type="button"
        disabled={disabled}
        title={disabled ? "Star a player to use this filter" : "Show only your watchlist"}
        aria-pressed={filter.enabled}
        onClick={() => {
          const next = !filter.enabled;
          filter.setEnabled(next);
          onChange?.(next);
        }}
        className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition ${
          filter.enabled && !disabled
            ? "glass-pill !text-accent"
            : "btn-ghost text-muted hover:!text-accent"
        } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
      >
        <svg
          viewBox="0 0 20 20"
          className="h-3.5 w-3.5"
          fill={filter.enabled && !disabled ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        >
          <path d="M10 2.5l2.35 4.76 5.25.76-3.8 3.7.9 5.23L10 14.48l-4.7 2.47.9-5.23-3.8-3.7 5.25-.76L10 2.5z" />
        </svg>
        Watchlist
      </button>
    </label>
  );
}
