// Player picker for the comparison builder (M4): search by name, click to add, up to
// a cap. Selected players show as removable chips coloured to match their line on the
// charts, so the legend and the chips agree without anyone having to check.
import { useEffect, useRef, useState } from "react";
import { useDebounce } from "../hooks/useDebounce";
import { usePlayerSearch } from "../hooks/usePlayerSearch";
import { SERIES_COLORS } from "./charts/CompareTrendChart";

export function PlayerPicker({ selected, onAdd, onRemove, max = 5 }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const debounced = useDebounce(query, 250);
  const { data, isFetching } = usePlayerSearch(debounced);
  const results = (data?.data ?? []).filter(
    (player) => !selected.some((chosen) => chosen.player_id === player.player_id),
  );

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const full = selected.length >= max;

  const addPlayer = (player) => {
    if (full) return;
    onAdd(player);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="glass-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Players</span>
        {selected.map((player, index) => (
          <span
            key={player.player_id}
            className="flex items-center gap-2 rounded-full border border-edge bg-surface-2 px-3 py-1 text-xs"
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }}
            />
            <span className="font-semibold text-fg">{player.name}</span>
            <span className="stat-num text-faint">{player.position}</span>
            <button
              type="button"
              onClick={() => onRemove(player.player_id)}
              className="text-faint transition hover:text-neg"
              aria-label={`Remove ${player.name}`}
            >
              ×
            </button>
          </span>
        ))}
        {selected.length === 0 && (
          <span className="text-xs text-faint">Search below to add up to {max} players.</span>
        )}
      </div>

      <div ref={containerRef} className="relative mt-3 max-w-sm">
        <input
          type="text"
          value={query}
          disabled={full}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            if (event.key === "Enter" && results.length > 0) addPlayer(results[0]);
          }}
          placeholder={full ? `Maximum ${max} players` : "Add a player…"}
          className="glass-input w-full px-3 py-2 text-sm disabled:opacity-50"
        />

        {open && debounced.trim().length >= 2 && (
          <div className="glass-popover absolute z-30 mt-1 w-full overflow-hidden">
            {isFetching && results.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted">Searching…</div>
            )}
            {!isFetching && results.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted">No players found.</div>
            )}
            {results.map((player) => (
              <button
                key={player.player_id}
                type="button"
                onClick={() => addPlayer(player)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition hover:bg-surface-2"
              >
                <span className="text-fg">{player.name}</span>
                <span className="stat-num text-xs text-faint">
                  {player.position} · {player.team_abbreviation ?? "FA"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
