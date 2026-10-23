// Head to Head on the Command Center: two players the reader picks, side by side.
//
// The body is the player page's head-to-head (`components/player/HeadToHead.jsx`, the
// tweet kit's D6 card, October 2026): the headline numbers with each one's finish at the
// position, then the percentile rows, the better number bold. It replaced the radar and
// the margin table here and on the player page together, so a matchup reads the same on
// both.
import { useEffect, useRef, useState } from "react";
import { Card, CardHead, CardLink, CardState } from "./primitives";
import { HeadToHead } from "../player/HeadToHead";
import { useDebounce } from "../../hooks/useDebounce";
import { usePlayerSearch } from "../../hooks/usePlayerSearch";

const SKILL = ["QB", "RB", "WR", "TE"];

/**
 * Search for one side of the matchup. The second player is held to the first one's
 * position, because every row is a percentile within a position pool (the player page's
 * picker makes the same call, for the same reason).
 */
function PlayerPicker({ slot, position, current, onPick }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const debounced = useDebounce(query, 250);
  const { data, isFetching } = usePlayerSearch(debounced);
  const results = (data?.data ?? []).filter(
    (player) => (position ? player.position === position : SKILL.includes(player.position)) && player.player_id !== current,
  );

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const choose = (player) => {
    onPick(player);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative min-w-0">
      <input
        id={`h2h-pick-${slot}`}
        type="text"
        value={query}
        aria-label={position ? `Search ${position}s` : "Search players"}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "Enter" && results.length > 0) choose(results[0]);
        }}
        placeholder={position ? `Change ${position}…` : "Change player…"}
        className="glass-input w-full px-3 py-1.5 text-[12.5px]"
      />
      {open && debounced.trim().length >= 2 && (
        <div className="glass-popover absolute z-30 mt-1 w-full overflow-hidden">
          {isFetching && results.length === 0 && <div className="px-3 py-2 text-xs text-muted">Searching…</div>}
          {!isFetching && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted">No {position ? `${position}s` : "players"} found.</div>
          )}
          {results.map((player) => (
            <button
              key={player.player_id}
              type="button"
              onClick={() => choose(player)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-surface-2"
            >
              <span className="truncate text-fg">{player.name}</span>
              <span className="stat-num flex-none text-xs text-faint">
                {player.position} {"·"} {player.team_abbreviation ?? "FA"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Head to Head with the pair chosen by the reader (October 2026).
 *
 * @param ids      the two player ids, from the page's `?h2h=` (a missing second id is a
 *                 half-built matchup, shown as a prompt rather than an error)
 * @param position the first player's position, which the second is held to
 * @param result   the pair's `/stats/intelligence` response, with ranks and percentiles
 * @param people   the two players' records, for their headshots (season rows carry none)
 * @param teams    the teams list keyed by abbreviation, for names and ring colours
 * @param onChange receives the new pair of ids
 */
export function HeadToHeadCard({ caption, ids, position, result, people, teams, season, scoring, metrics, isLoading, isError, onChange }) {
  const byId = Object.fromEntries((result?.data ?? []).map((player) => [player.player_id, player]));
  const players = ids
    .map((id) => byId[id] && { ...byId[id], headshot_url: people?.[id]?.headshot_url })
    .filter(Boolean);
  const ready = players.length === 2;

  const pickFirst = (player) => {
    // A new position empties the second slot: the old opponent would be measured in a
    // different pool, so the card asks for one at the new position instead.
    const second = player.position === position ? ids[1] : "";
    onChange([player.player_id, second === player.player_id ? "" : second]);
  };
  const pickSecond = (player) => onChange([ids[0], player.player_id]);
  const compareLink = `/explore/compare?players=${ids.filter(Boolean).join(",")}`;

  return (
    <Card>
      <CardHead title="Head to Head" sub={caption} />

      <div className="mb-4 grid grid-cols-2 gap-2">
        <PlayerPicker slot="first" position={null} current={ids[1]} onPick={pickFirst} />
        <PlayerPicker slot="second" position={position} current={ids[0]} onPick={pickSecond} />
      </div>

      {!ids[1] ? (
        <p className="py-8 text-center text-xs text-muted">
          Pick a second {position ?? "player"} to compare with {people?.[ids[0]]?.name ?? "the first"}.
        </p>
      ) : (
        <CardState isLoading={isLoading} isError={isError} isEmpty={!ready} empty="Couldn't load this matchup." rows={6} />
      )}

      {ready && (
        <HeadToHead
          players={players}
          teams={teams}
          position={position}
          season={season}
          scoring={scoring}
          metrics={metrics}
          compact
        />
      )}
      <CardLink to={compareLink}>Open in Player Comparison</CardLink>
    </Card>
  );
}
