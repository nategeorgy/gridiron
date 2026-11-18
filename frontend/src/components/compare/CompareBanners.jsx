// Player Comparison's header (November 2026, option H1): the player page's team banner in
// miniature, one card per player. Team colours behind, the jersey number faint across the
// corner, the role label, then PPG and points each with their finish at the position.
//
// The ring round each face is the player's series colour, the colour that player draws in
// on every chart below, so the banner doubles as the page's legend. The banner itself is in
// team colours (`ringColors`, which swaps a navy that would vanish on the dark theme).
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useDebounce } from "../../hooks/useDebounce";
import { usePlayerSearch } from "../../hooks/usePlayerSearch";
import { roleLabel } from "../../constants/playerTabs";
import { formatStat } from "../../utils/format";
import { Headshot } from "../explore/common";
import { PositionTag } from "../PositionTag";
import { FinishChip } from "../player/FinishChip";
import { ringColors } from "../player/cardParts";

const mix = (color, amount) => `color-mix(in srgb, ${color} ${amount}%, transparent)`;

function Tile({ label, children }) {
  return (
    <div className="min-w-0 px-2.5 py-2">
      <div className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-faint">{label}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

export function BannerCard({ slot, team, weeksLabel, onSeason, onRemove }) {
  const [band] = ringColors(team);
  const seasons = slot.careerSeasons.length ? slot.careerSeasons : [slot.season];
  const role = slot.row ? roleLabel(slot.position, slot.row) : null;
  return (
    <section className="glass-card relative grid content-start overflow-hidden p-0">
      <div className="relative overflow-hidden px-3 pb-3 pt-3.5"
        style={{ background: `linear-gradient(125deg, ${mix(band, 62)}, ${mix(band, 22)} 55%, transparent 92%)` }}>
        {slot.jersey != null && (
          <span aria-hidden="true" className="stat-num pointer-events-none absolute -top-3 right-7 select-none text-[64px] font-extrabold leading-none opacity-10">
            {slot.jersey}
          </span>
        )}
        <button type="button" onClick={onRemove} aria-label={`Remove ${slot.name}`}
          className="absolute right-1.5 top-1.5 z-10 rounded-md px-1.5 text-base leading-none text-muted transition hover:bg-surface-2 hover:text-fg">×</button>
        <div className="relative flex min-w-0 items-center gap-3 pr-4">
          <Headshot url={slot.headshot_url} name={slot.name} size={56}
            style={{ boxShadow: `0 0 0 2.5px ${slot.color}`, background: "var(--surface-2)" }} />
          <div className="min-w-0">
            <Link to={`/players/${slot.id}`} className="block truncate text-[14.5px] font-extrabold leading-tight tracking-tight text-fg hover:text-accent">
              {slot.name || "Loading…"}
            </Link>
            <div className="stat-num mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-fg">
              {team?.logo_url && <img src={team.logo_url} alt="" className="h-4 w-4 object-contain" />}
              {slot.team}
              <PositionTag position={slot.position} variant="quiet" />
              <select value={slot.season} onChange={(event) => onSeason(event.target.value)} aria-label={`Season for ${slot.name}`}
                className="glass-input px-1.5 py-0.5 text-[11.5px]">
                {seasons.map((season) => <option key={season} value={season} style={{ background: "var(--surface-solid)" }}>{season}</option>)}
              </select>
            </div>
          </div>
        </div>
        {role && (
          <span title={role[1]} className="relative mt-2.5 inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold text-fg"
            style={{ background: "color-mix(in srgb, var(--surface-solid) 70%, transparent)", border: "1px solid var(--line)" }}>
            {role[0]}
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 divide-x divide-line border-t border-line">
        <Tile label="PPG">
          <b className="stat-num text-[15px] font-extrabold text-fg">{formatStat(slot.row?.fantasy_ppg, 1)}</b>
          {slot.row?.ranks?.fantasy_ppg ? <FinishChip rank={slot.row.ranks.fantasy_ppg} position={slot.position} /> : null}
        </Tile>
        <Tile label="Points">
          <b className="stat-num text-[15px] font-extrabold text-fg">{formatStat(slot.row?.fantasy_points, 1)}</b>
          {slot.row?.ranks?.fantasy_points ? <FinishChip rank={slot.row.ranks.fantasy_points} position={slot.position} /> : null}
        </Tile>
        <Tile label="Games">
          <b className="stat-num text-[15px] font-extrabold text-fg">{slot.row?.games_played ?? "-"}</b>
        </Tile>
      </div>
      <div className="stat-num border-t border-line px-3 py-1.5 text-[11px] text-faint">
        {slot.row ? `${slot.season} · ${weeksLabel}` : `No ${slot.season} stats in these weeks`}
      </div>
    </section>
  );
}

export function AddPlayerCard({ onAdd }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const input = useRef(null);
  const debounced = useDebounce(query, 250);
  const { data, isFetching } = usePlayerSearch(debounced);
  const results = (data?.data ?? []).filter((player) => ["QB", "RB", "WR", "TE"].includes(player.position)).slice(0, 8);
  const choose = (player) => {
    onAdd(player);
    setQuery("");
    setOpen(false);
  };
  return (
    <section className="relative grid min-h-[150px] cursor-text place-items-center content-center gap-1.5 rounded-[20px] border border-dashed border-edge p-3 text-center text-[12.5px] text-muted"
      onClick={() => input.current?.focus()}>
      <b className="text-2xl font-normal leading-none text-faint">+</b>
      <div>Add a player</div>
      <input ref={input} value={query} onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} onKeyDown={(event) => event.key === "Enter" && results[0] && choose(results[0])}
        placeholder="Search players" className="glass-input w-full px-2.5 py-1.5 text-sm" />
      {open && debounced.trim().length >= 2 && (
        <div className="glass-popover absolute left-3 right-3 top-full z-30 mt-1 overflow-hidden text-left">
          {isFetching && !results.length && <div className="px-3 py-2 text-xs text-muted">Searching…</div>}
          {!isFetching && !results.length && <div className="px-3 py-2 text-xs text-muted">No players found.</div>}
          {results.map((player) => (
            <button key={player.player_id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(player)}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm transition hover:bg-surface-2">
              <Headshot url={player.headshot_url} name={player.name} size={22} />
              <span className="flex-1 truncate text-fg">{player.name}</span>
              <span className="stat-num text-xs text-faint">{player.position} · {player.team_abbreviation ?? "FA"}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
