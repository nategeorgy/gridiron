// Pick one player to compare against (M13).
//
// Restricted to the subject's own position, because the comparison it feeds is
// position-relative: every axis is a percentile within a position pool, and a receiver's
// target share against a quarterback's is two different questions sharing an axis. The
// M4 comparison builder allows mixed positions and handles it by intersecting the
// metrics; this surface is the *matchup* view instead, so it keeps the pool constant.
import { useEffect, useRef, useState } from "react";
import { useDebounce } from "../../hooks/useDebounce";
import { usePlayerSearch } from "../../hooks/usePlayerSearch";
import { SIDES } from "./sides";

export function ComparePicker({ position, selected, onSelect, onClear }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const debounced = useDebounce(query, 250);
  const { data, isFetching } = usePlayerSearch(debounced);
  const results = (data?.data ?? []).filter(
    (player) => player.position === position && player.player_id !== selected?.player_id,
  );

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const choose = (player) => {
    onSelect(player);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">Compare with</span>

      {selected && (
        <span className="flex items-center gap-2 rounded-full border border-edge bg-surface-2 py-1 pl-2 pr-3 text-xs">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: SIDES[1].color }} />
          <span className="font-semibold text-fg">{selected.name}</span>
          <button
            type="button"
            onClick={onClear}
            aria-label={`Remove ${selected.name} from the comparison`}
            className="text-faint transition hover:text-fg"
          >
            ×
          </button>
        </span>
      )}

      <div ref={containerRef} className="relative w-56">
        <input
          type="text"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            if (event.key === "Enter" && results.length > 0) choose(results[0]);
          }}
          placeholder={selected ? "Change player…" : `Search ${position}s…`}
          className="glass-input w-full px-3 py-1.5 text-sm"
        />

        {open && debounced.trim().length >= 2 && (
          <div className="glass-popover absolute z-30 mt-1 w-full overflow-hidden">
            {isFetching && results.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted">Searching…</div>
            )}
            {!isFetching && results.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted">No {position}s found.</div>
            )}
            {results.map((player) => (
              <button
                key={player.player_id}
                type="button"
                onClick={() => choose(player)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition hover:bg-surface-2"
              >
                <span className="text-fg">{player.name}</span>
                <span className="stat-num text-xs text-faint">
                  {player.team_abbreviation ?? "FA"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
