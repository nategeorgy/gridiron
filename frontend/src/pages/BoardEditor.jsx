// The ranking board editor (M9) — drag your own board into the order you believe.
//
// **A board is current state, not an accumulation.** Editing is reordering, and
// removing a player means he is simply not on the board any more — so the whole
// ordering is the unit of change, saved wholesale. That is why there is no per-row
// save and no rank field anywhere in the payload: position in the list *is* the rank,
// and a second representation would be something to disagree with.
//
// Its own route rather than a modal, so a half-built board is a URL you can come back
// to (and share with yourself on another device) rather than something that dies with
// the page.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useDebounce } from "../hooks/useDebounce";
import { usePlayerSearch } from "../hooks/usePlayerSearch";
import { useRankingBoard, useRankingBoards } from "../hooks/useRankings";
import { useAuth } from "../hooks/useAuth";

/** Move an item within an array, returning a new array. */
function moveEntry(entries, from, to) {
  const next = [...entries];
  const clamped = Math.max(0, Math.min(next.length - 1, to));
  const [moved] = next.splice(from, 1);
  next.splice(clamped, 0, moved);
  return next;
}

function PositionChip({ position }) {
  return (
    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-faint">
      {position}
    </span>
  );
}

/** Search-and-add. Adds to the bottom, which is where an afterthought belongs. */
function AddPlayer({ onAdd, existing }) {
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 250);
  const { data, isFetching } = usePlayerSearch(debounced);

  const results = (data?.data ?? [])
    .filter((player) => !existing.has(player.player_id))
    .slice(0, 8);

  return (
    <div className="glass-card p-4">
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
          Add a player
        </span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name…"
          className="glass-input w-full px-3 py-2 text-sm"
        />
      </label>
      {debounced && (
        <div className="mt-2 space-y-1">
          {isFetching && <p className="text-xs text-faint">Searching…</p>}
          {!isFetching && results.length === 0 && (
            <p className="text-xs text-faint">
              No one new by that name — anyone already on the board is hidden here.
            </p>
          )}
          {results.map((player) => (
            <button
              key={player.player_id}
              type="button"
              onClick={() => {
                onAdd(player);
                setQuery("");
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-surface-2"
            >
              <span className="font-medium text-fg">{player.name}</span>
              <PositionChip position={player.position} />
              <span className="stat-num text-xs text-muted">
                {player.team_abbreviation ?? "FA"}
              </span>
              <span className="ml-auto text-xs text-accent">Add to bottom</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function BoardEditor() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const { isSignedIn } = useAuth();
  const { data: board, isLoading, isError } = useRankingBoard(boardId);
  const { replaceEntries, updateBoard, deleteBoard, isSaving, error } = useRankingBoards();

  const [entries, setEntries] = useState([]);
  const [name, setName] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const dragIndex = useRef(null);

  // Seed local state once the board arrives, and re-seed if the user navigates to a
  // different board without unmounting.
  useEffect(() => {
    if (!board) return;
    setEntries(board.entries);
    setName(board.name);
    setDirty(false);
  }, [board?.board_id, board?.updated_at]);

  const existing = useMemo(
    () => new Set(entries.map((entry) => entry.player_id)),
    [entries],
  );

  function update(next) {
    setEntries(next);
    setDirty(true);
    setSaved(false);
  }

  function onDrop(targetIndex) {
    if (dragIndex.current === null || dragIndex.current === targetIndex) return;
    update(moveEntry(entries, dragIndex.current, targetIndex));
    dragIndex.current = null;
  }

  function moveTo(index, rank) {
    const target = Number(rank);
    if (!Number.isFinite(target)) return;
    update(moveEntry(entries, index, target - 1));
  }

  function setTier(index, value) {
    const tier = value === "" ? null : Number(value);
    update(
      entries.map((entry, position) =>
        position === index ? { ...entry, tier } : entry,
      ),
    );
  }

  async function save() {
    await replaceEntries({
      boardId,
      entries: entries.map((entry) => ({
        player_id: entry.player_id,
        tier: entry.tier ?? null,
        note: entry.note ?? null,
      })),
    });
    if (name.trim() && name.trim() !== board?.name) {
      await updateBoard({ boardId, name: name.trim() });
    }
    setDirty(false);
    setSaved(true);
  }

  async function remove() {
    await deleteBoard(boardId);
    navigate("/draft/rankings");
  }

  if (!isSignedIn) {
    return (
      <p className="glass-card p-6 text-sm text-muted">
        Boards of your own live with your account. Everything else on{" "}
        <Link to="/draft/rankings" className="text-accent hover:underline">Rankings</Link>{" "}
        works signed out.
      </p>
    );
  }
  if (isLoading) return <p className="glass-card p-6 text-sm text-muted">Loading…</p>;
  if (isError || !board) {
    return (
      <p className="glass-card p-6 text-sm text-muted">
        That board doesn&apos;t exist, or isn&apos;t yours.{" "}
        <Link to="/draft/rankings" className="text-accent hover:underline">Back to Rankings</Link>
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent">
            Draft · Board editor
          </div>
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setDirty(true);
            }}
            maxLength={60}
            aria-label="Board name"
            className="glass-input mt-1 px-3 py-1.5 text-xl font-bold tracking-tight text-fg"
          />
          <p className="mt-1 text-sm text-muted">
            {entries.length} players
            {board.seeded_from && <> · started from {board.seeded_from}</>}
            {board.origin === "upload" && <> · uploaded</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/draft/rankings?source=board:${boardId}`}
            className="glass-pill px-3 py-1.5 text-sm"
          >
            View as a board
          </Link>
          <button
            type="button"
            onClick={remove}
            className="glass-pill px-3 py-1.5 text-sm !text-neg"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || isSaving}
            className="glass-pill px-3 py-1.5 text-sm !text-accent disabled:opacity-50"
          >
            {isSaving ? "Saving…" : dirty ? "Save board" : saved ? "Saved" : "Saved"}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-neg">
          {error?.response?.data?.detail ?? "Could not save the board."}
        </p>
      )}

      <p className="max-w-3xl text-xs leading-relaxed text-muted">
        Drag a row to move it, or type a number in the <span className="stat-num">#</span>{" "}
        box to send a player straight to that spot. Tiers are yours to draw — they mark
        the players you would be equally happy with, which is the read that actually
        matters when your pick arrives.
      </p>

      <AddPlayer
        existing={existing}
        onAdd={(player) =>
          update([
            ...entries,
            {
              player_id: player.player_id,
              name: player.name,
              position: player.position,
              team_abbreviation: player.team_abbreviation,
              tier: null,
              note: null,
            },
          ])
        }
      />

      <div className="glass-card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-faint">
              <th className="px-3 py-3 text-right">#</th>
              <th className="px-3 py-3">Player</th>
              <th className="px-3 py-3">Team</th>
              <th className="px-3 py-3 text-right">Tier</th>
              <th className="px-3 py-3 text-right">Move</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted">
                  Nobody on this board yet — search above to add someone.
                </td>
              </tr>
            )}
            {entries.map((entry, index) => (
              <tr
                key={entry.player_id}
                draggable
                onDragStart={() => {
                  dragIndex.current = index;
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => onDrop(index)}
                className="cursor-grab border-b border-line last:border-0 hover:bg-surface-2"
              >
                <td className="stat-num px-3 py-2 text-right text-faint">
                  <input
                    type="number"
                    min={1}
                    max={entries.length}
                    defaultValue={index + 1}
                    key={`${entry.player_id}-${index}`}
                    onBlur={(event) => moveTo(index, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.target.blur();
                    }}
                    aria-label={`Rank for ${entry.name}`}
                    className="glass-input w-14 px-1.5 py-1 text-right text-xs"
                  />
                </td>
                <td className="px-3 py-2 font-medium">
                  <Link
                    to={`/players/${entry.player_id}`}
                    className="text-fg hover:text-accent hover:underline"
                  >
                    {entry.name}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <span className="stat-num text-xs text-muted">
                    {entry.team_abbreviation ?? "FA"}
                  </span>
                  <span className="ml-2">
                    <PositionChip position={entry.position} />
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={entry.tier ?? ""}
                    onChange={(event) => setTier(index, event.target.value)}
                    aria-label={`Tier for ${entry.name}`}
                    className="glass-input w-14 px-1.5 py-1 text-right text-xs"
                  />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => update(moveEntry(entries, index, index - 1))}
                    disabled={index === 0}
                    aria-label={`Move ${entry.name} up`}
                    className="rounded px-1.5 py-0.5 text-muted transition hover:text-accent disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => update(moveEntry(entries, index, index + 1))}
                    disabled={index === entries.length - 1}
                    aria-label={`Move ${entry.name} down`}
                    className="rounded px-1.5 py-0.5 text-muted transition hover:text-accent disabled:opacity-30"
                  >
                    ↓
                  </button>
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() =>
                      update(entries.filter((_, position) => position !== index))
                    }
                    aria-label={`Remove ${entry.name}`}
                    className="rounded px-1.5 py-0.5 text-faint transition hover:text-neg"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dirty && (
        <p className="text-xs text-accent">
          Unsaved changes. Nothing is stored until you save the board.
        </p>
      )}
    </div>
  );
}
