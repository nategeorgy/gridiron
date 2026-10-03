// Header search: type a name, pick a player, jump to their profile.
//
// Two shapes. `header` is the fixed-width box in the desktop nav. `row` fills the phone
// search row under the header (Layout): focused on open, and `onDone` closes the row
// once a player is picked or Escape is pressed.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDebounce } from "../hooks/useDebounce";
import { usePlayerSearch } from "../hooks/usePlayerSearch";

export function SearchBox({ variant = "header", onDone }) {
  const row = variant === "row";
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  const debounced = useDebounce(query, 250);
  const { data, isFetching } = usePlayerSearch(debounced);
  const results = data?.data ?? [];

  // Close the dropdown when clicking outside the search box.
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectPlayer = (playerId) => {
    navigate(`/players/${playerId}`);
    setQuery("");
    setOpen(false);
    onDone?.();
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      setOpen(false);
      onDone?.();
    }
    if (event.key === "Enter" && results.length > 0) selectPlayer(results[0].player_id);
  };

  const showDropdown = open && debounced.trim().length >= 2;

  // The header box steps down with the window so the desktop nav fits on one line from
  // 1024px, where it first appears: there, with the Sign in button, it ends 16px short of
  // the edge, and the old 192px box would have run 4px past it.
  return (
    <div ref={containerRef} className={row ? "relative w-full" : "relative w-40 min-[1080px]:w-48 xl:w-64"}>
      <input
        type={row ? "search" : "text"}
        autoFocus={row}
        aria-label="Search players"
        enterKeyHint="go"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Search players…"
        className={`glass-input w-full px-3 ${row ? "py-2.5" : "py-1.5"} text-sm`}
      />

      {showDropdown && (
        <div className="glass-popover absolute right-0 z-30 mt-1 w-full overflow-hidden">
          {results.length === 0 ? (
            <div className="px-3 py-2.5 text-sm text-faint">
              {isFetching ? "Searching…" : "No players found"}
            </div>
          ) : (
            results.map((player) => (
              <button
                key={player.player_id}
                onClick={() => selectPlayer(player.player_id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-surface-2"
              >
                <span className="truncate font-medium text-fg">{player.name}</span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 font-semibold text-accent">
                    {player.position}
                  </span>
                  <span className="stat-num">{player.team_abbreviation ?? "FA"}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
