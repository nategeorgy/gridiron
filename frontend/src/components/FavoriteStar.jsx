// The star that puts a player on the watchlist. Optimistic — a star has to feel
// instant, and a rolled-back star is visible and harmless.
//
// Hidden entirely when signed out rather than shown-and-disabled: a control that
// exists only to reveal you are not signed in is noise on a product where nothing
// is gated.
import { useAuth } from "../hooks/useAuth";
import { useFavorites } from "../hooks/useAccount";

export function FavoriteStar({ playerId, size = "h-4 w-4", className = "" }) {
  const { isSignedIn } = useAuth();
  const { isFavorite, toggleFavorite } = useFavorites();

  if (!isSignedIn || !playerId) return null;

  const active = isFavorite(playerId);

  return (
    <button
      type="button"
      aria-label={active ? "Remove from watchlist" : "Add to watchlist"}
      aria-pressed={active}
      title={active ? "Remove from watchlist" : "Add to watchlist"}
      onClick={(event) => {
        // Rows are links; starring must not navigate.
        event.preventDefault();
        event.stopPropagation();
        toggleFavorite(playerId, !active).catch(() => {});
      }}
      className={`shrink-0 transition hover:scale-110 ${
        active ? "text-accent" : "text-faint hover:text-muted"
      } ${className}`}
    >
      <svg
        viewBox="0 0 20 20"
        className={size}
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      >
        <path d="M10 2.5l2.35 4.76 5.25.76-3.8 3.7.9 5.23L10 14.48l-4.7 2.47.9-5.23-3.8-3.7 5.25-.76L10 2.5z" />
      </svg>
    </button>
  );
}
