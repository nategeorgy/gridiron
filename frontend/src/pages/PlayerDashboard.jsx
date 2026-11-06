// Player Dashboard (November 2026): find any player, then last week's leaders.
//
// Picked in round one ("Typeahead") and round two ("Spotlight" leaders). The search index
// is every quarterback, back, receiver and tight end since 2009, fetched once and searched
// in the browser, so a keystroke never waits on a request; equal matches list the more
// prominent player first (career points, doubled for anyone playing this season). An
// empty box shows the players this browser opened lately.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Headshot } from "../components/explore/common";
import { PositionTag } from "../components/PositionTag";
import { FinishChip } from "../components/player/FinishChip";
import { ringColors } from "../components/player/cardParts";
import { recentlyViewed } from "../components/players/recent";
import { usePlayerIndex } from "../hooks/usePlayer";
import { useScoring } from "../hooks/useScoring";
import { useTeamsList } from "../hooks/useTeamStats";
import { useQuery } from "@tanstack/react-query";
import { getWeekLeaders } from "../services/stats";
import { scoringLabel } from "../constants/scoring";
import { positionColor } from "../utils/explore";

const POSITIONS = [["QB", "Quarterbacks"], ["RB", "Running backs"], ["WR", "Receivers"], ["TE", "Tight ends"]];

const fold = (text) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, "");

function useIndexRows(scoring) {
  const query = usePlayerIndex(scoring);
  const rows = useMemo(() => {
    const data = query.data;
    if (!data) return [];
    const at = Object.fromEntries(data.fields.map((field, index) => [field, index]));
    return data.players.map((row) => ({
      player_id: row[at.player_id], name: row[at.name], position: row[at.position], team: row[at.team],
      first: row[at.first_season], last: row[at.last_season], games: row[at.games], ppg: row[at.ppg],
      rank: row[at.ppg_rank], finishes: row[at.finishes], career: row[at.career_points], headshot_url: row[at.headshot_url],
      folded: fold(row[at.name]),
    }));
  }, [query.data]);
  return { rows, weeks: query.data?.finish_weeks ?? [], season: query.data?.season, isLoading: query.isLoading };
}

function search(rows, text) {
  const needle = fold(text).trim();
  if (!needle) return [];
  const hits = [];
  for (const row of rows) {
    // A match at the start of any part of the name beats one inside it; within that, the
    // more prominent player first.
    const score = row.folded.split(" ").some((word) => word.startsWith(needle)) || row.folded.startsWith(needle) ? 0 : row.folded.includes(needle) ? 1 : -1;
    if (score >= 0) hits.push([score, -(row.career * (row.games > 0 ? 2 : 1)), row]);
  }
  return hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, 8).map((hit) => hit[2]);
}

function Highlight({ name, text }) {
  const needle = fold(text).trim();
  const at = needle ? fold(name).indexOf(needle) : -1;
  if (at < 0) return name;
  // fold() only drops characters, so walk the raw name to map the match back onto it.
  let count = 0;
  let start = -1;
  let end = -1;
  for (let i = 0; i < name.length; i += 1) {
    const piece = fold(name[i]);
    if (!piece) continue;
    if (count === at) start = i;
    count += piece.length;
    if (count === at + needle.length) {
      end = i + 1;
      break;
    }
  }
  if (start < 0 || end < 0) return name;
  return <>{name.slice(0, start)}<b className="text-accent">{name.slice(start, end)}</b>{name.slice(end)}</>;
}

function ResultRow({ row, text, active, season, weeks, teams, onOpen, onHover }) {
  const current = row.games > 0;
  const team = teams[row.team];
  const [ring] = ringColors(team);
  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onClick={onOpen}
      className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition ${active ? "bg-surface-2" : ""}`}
    >
      <Headshot url={row.headshot_url} name={row.name} className="h-[42px] w-[42px] shrink-0 rounded-full" style={{ border: `2px solid ${current ? ring : "var(--border)"}`, background: "var(--surface-2)" }} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold text-fg"><Highlight name={row.name} text={text} /></div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <PositionTag position={row.position} />
          {team?.logo_url && <img src={team.logo_url} alt="" className="h-4 w-4 object-contain" />}
          <span>{row.team}</span>
          <span>·</span>
          {current ? (
            <span className="stat-num">
              {season} · {row.games} G · <b className="text-fg">{row.ppg?.toFixed(1)}</b> PPG{row.rank ? ` · ${row.position}${row.rank}` : ""}
            </span>
          ) : (
            <span className="stat-num">{row.first === row.last ? row.first : `${row.first}-${row.last}`} · last with {row.team}</span>
          )}
        </div>
      </div>
      {current && row.finishes ? (
        <div className="hidden items-center gap-1 sm:flex">
          <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.1em] text-faint">W{weeks[0]}-{weeks[weeks.length - 1]}</span>
          {row.finishes.map((finish, index) => (
            finish ? <FinishChip key={index} rank={finish} position={row.position} /> : <span key={index} className="stat-num inline-block min-w-[42px] rounded-md px-1.5 py-px text-center text-[11.5px] text-faint" style={{ background: "color-mix(in srgb, var(--fg) 5%, transparent)" }}>-</span>
          ))}
        </div>
      ) : (
        !current && <span className="hidden rounded-full border border-line px-2 py-0.5 text-[10.5px] text-muted sm:inline">Past player</span>
      )}
    </button>
  );
}

function Search({ teams }) {
  const [scoring] = useScoring();
  const { rows, weeks, season, isLoading } = useIndexRows(scoring);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const box = useRef(null);
  const input = useRef(null);
  const byId = useMemo(() => Object.fromEntries(rows.map((row) => [row.player_id, row])), [rows]);
  const recent = useMemo(() => recentlyViewed().map((id) => byId[id]).filter(Boolean), [byId, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const hits = text.trim() ? search(rows, text) : recent;

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "/" && document.activeElement !== input.current && !/input|textarea|select/i.test(document.activeElement?.tagName ?? "")) {
        event.preventDefault();
        input.current?.focus();
      }
    };
    const onClick = (event) => {
      if (box.current && !box.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, []);

  const go = (row) => navigate(`/players/${row.player_id}`);
  const onKeyDown = (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const count = Math.max(1, hits.length);
      setActive((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + count) % count);
    } else if (event.key === "Enter" && hits[active]) {
      go(hits[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="pb-1 pt-6 text-center sm:pt-8">
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent">Players</div>
      <h1 className="mb-1.5 mt-2 text-[30px] font-extrabold tracking-tight text-fg sm:text-[36px]">Find a player</h1>
      <p className="mb-5 text-sm text-muted">Every quarterback, back, receiver and tight end since 2009</p>
      <div ref={box} className="relative mx-auto max-w-[680px] text-left">
        <div
          className="flex items-center gap-3 rounded-2xl border px-4 py-3.5 transition"
          style={{ background: "var(--surface-solid)", borderColor: open ? "color-mix(in srgb, var(--accent) 55%, transparent)" : "var(--border-strong)" }}
        >
          <span className="text-faint" aria-hidden="true">⌕</span>
          <input
            ref={input}
            value={text}
            onChange={(event) => { setText(event.target.value); setActive(0); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={isLoading ? "Loading players…" : "Search any player"}
            autoComplete="off"
            spellCheck="false"
            aria-label="Search any player"
            className="min-w-0 flex-1 bg-transparent text-[16px] text-fg outline-none placeholder:text-faint"
          />
          <span className="hidden rounded border border-line px-1.5 text-[11px] text-faint sm:inline">/</span>
        </div>
        {open && (
          <div className="absolute inset-x-0 top-full z-30 mt-2 rounded-2xl border p-2 shadow-xl" style={{ background: "var(--surface-solid)", borderColor: "var(--border-strong)" }}>
            {!text.trim() && <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-faint">Recently viewed</div>}
            {hits.length ? (
              hits.map((row, index) => (
                <ResultRow
                  key={row.player_id}
                  row={row}
                  text={text}
                  active={index === active}
                  season={season}
                  weeks={weeks}
                  teams={teams}
                  onOpen={() => go(row)}
                  onHover={() => setActive(index)}
                />
              ))
            ) : (
              <p className="px-3 py-3 text-sm text-muted">{text.trim() ? `No player matches "${text}".` : "Players you open will show here."}</p>
            )}
            {text.trim() && (
              <div className="flex justify-between gap-3 px-2.5 pb-1 pt-2 text-[11px] text-faint">
                <span className="hidden sm:inline">↑ ↓ to move, Enter to open, Esc to close</span>
                <span>{rows.length.toLocaleString()} players since 2009</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function statLine(position, row) {
  const n = (value) => value ?? 0;
  if (position === "QB") {
    const parts = [`${n(row.completions)}/${n(row.attempts)}, ${n(row.passing_yards)} yds`];
    if (row.passing_tds) parts.push(`${row.passing_tds} TD`);
    if (row.interceptions) parts.push(`${row.interceptions} INT`);
    const rush = row.carries ? ` · ${row.carries}-${n(row.rushing_yards)} rush${row.rushing_tds ? `, ${row.rushing_tds} TD` : ""}` : "";
    return parts.join(", ") + rush;
  }
  const receiving = `${n(row.receptions)}/${n(row.targets)}, ${n(row.receiving_yards)} yds${row.receiving_tds ? `, ${row.receiving_tds} TD` : ""}`;
  if (position === "RB") {
    const rushing = `${n(row.carries)}-${n(row.rushing_yards)}${row.rushing_tds ? `, ${row.rushing_tds} TD` : ""}`;
    return row.targets ? `${rushing} · ${n(row.receptions)}/${n(row.targets)}, ${n(row.receiving_yards)} rec${row.receiving_tds ? `, ${row.receiving_tds} TD` : ""}` : rushing;
  }
  return receiving;
}

function result(row) {
  const won = row.team_score > row.opponent_score ? "W" : row.team_score < row.opponent_score ? "L" : "T";
  return { won, score: `${row.team_score}-${row.opponent_score}` };
}

function Spotlight({ row, position, team, scoring }) {
  const [ring] = ringColors(team);
  const game = result(row);
  return (
    <Link
      to={`/players/${row.player_id}`}
      className="relative mx-2.5 block overflow-hidden rounded-[18px] border p-3.5 transition hover:brightness-110"
      style={{ background: `linear-gradient(145deg, color-mix(in srgb, ${ring} 48%, transparent), color-mix(in srgb, ${ring} 10%, transparent) 75%)`, borderColor: `color-mix(in srgb, ${ring} 40%, transparent)` }}
    >
      <span className="stat-num pointer-events-none absolute -top-3.5 right-2.5 text-[96px] font-extrabold leading-none opacity-[0.12]">1</span>
      <div className="relative flex items-center gap-3">
        <Headshot url={row.headshot_url} name={row.name} className="h-[74px] w-[74px] shrink-0 rounded-full" style={{ border: "2px solid var(--fg)", background: "var(--surface-2)" }} />
        <div className="min-w-0">
          <div className="text-[16px] font-extrabold leading-tight text-fg">{row.name}</div>
          <div className="mt-1 flex items-center gap-1.5 text-[11.5px] font-semibold text-fg">
            {team?.logo_url && <img src={team.logo_url} alt="" className="h-4 w-4 object-contain" />}
            {row.team} <span className="text-muted">{row.home ? "vs" : "@"} {row.opponent}</span>
          </div>
          <div className="stat-num mt-0.5 text-[11px] font-bold" style={{ color: game.won === "W" ? "var(--pos)" : game.won === "L" ? "var(--neg)" : "var(--muted)" }}>{game.won} {game.score}</div>
        </div>
      </div>
      <div className="relative mt-3 flex items-baseline gap-1.5">
        <span className="stat-num text-[34px] font-extrabold tracking-tight text-fg">{row.pts.toFixed(1)}</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-faint">{scoringLabel(scoring)}</span>
      </div>
      <div className="relative text-[12px] font-semibold text-fg">{statLine(position, row)}</div>
      <div className="relative mt-2.5 flex flex-wrap gap-1.5">
        <span className="rounded-full px-2 py-0.5 text-[10.5px] text-fg" style={{ background: "color-mix(in srgb, var(--surface-solid) 60%, transparent)" }}>Season {row.season_ppg.toFixed(1)} PPG</span>
        {row.snap_share != null && (
          <span className="rounded-full px-2 py-0.5 text-[10.5px] text-fg" style={{ background: "color-mix(in srgb, var(--surface-solid) 60%, transparent)" }}>Snaps {Math.round(row.snap_share * 100)}%</span>
        )}
      </div>
    </Link>
  );
}

function LeaderRow({ row, position, top, teams }) {
  const team = teams[row.team];
  const [ring] = ringColors(team);
  return (
    <Link to={`/players/${row.player_id}`} className="grid grid-cols-[18px_38px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl px-2 py-1.5 transition hover:bg-surface-2">
      <span className="stat-num text-xs font-bold text-faint">{row.rank}</span>
      <Headshot url={row.headshot_url} name={row.name} className="h-9 w-9 rounded-full" style={{ border: `2px solid ${ring}`, background: "var(--surface-2)" }} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <b className="truncate text-[13px] text-fg">{row.name}</b>
          {team?.logo_url && <img src={team.logo_url} alt="" className="h-3.5 w-3.5 shrink-0 object-contain" />}
        </div>
        <div className="truncate text-[11px] text-muted">{statLine(position, row)}</div>
        <div className="mt-1 h-1 rounded-full" style={{ background: "color-mix(in srgb, var(--fg) 8%, transparent)" }}>
          <i className="block h-1 rounded-full" style={{ width: `${(row.pts / top) * 100}%`, background: positionColor(position) }} />
        </div>
      </div>
      <div className="text-right">
        <div className="stat-num text-[15px] font-extrabold text-fg">{row.pts.toFixed(1)}</div>
        <div className="text-[10px] text-faint">{row.home ? "vs" : "@"} {row.opponent}</div>
      </div>
    </Link>
  );
}

function Leaders({ teams }) {
  const [scoring] = useScoring();
  const [all, setAll] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["week-leaders", scoring], queryFn: () => getWeekLeaders({ scoring, limit: 10 }) });
  if (isLoading) return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{POSITIONS.map(([position]) => <section key={position} className="glass-card h-[440px] animate-pulse" />)}</div>;
  if (!data) return null;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <h2 className="text-[19px] font-extrabold tracking-tight text-fg">Week {data.week} leaders</h2>
          <span className="text-xs text-muted">{scoringLabel(scoring)} points at each position. Click a player to open the player page</span>
        </div>
        <button type="button" onClick={() => setAll((value) => !value)} className="rounded-full border border-line px-3 py-1 text-xs text-muted transition hover:text-fg">
          {all ? "Top 5" : "Top 10"}
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {POSITIONS.map(([position, label]) => {
          const list = data.leaders[position] ?? [];
          if (!list.length) return null;
          return (
            <section key={position} className="glass-card overflow-hidden px-0 pb-2 pt-0">
              <div className="flex items-center justify-between px-4 pb-2.5 pt-3.5">
                <PositionTag position={position} />
                <span className="ml-2 flex-1 text-[14px] font-bold text-fg">{label}</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-faint">Week {data.week}</span>
              </div>
              <Spotlight row={list[0]} position={position} team={teams[list[0].team]} scoring={scoring} />
              <div className="px-1 pt-1.5">
                {list.slice(1, all ? 10 : 5).map((row) => <LeaderRow key={row.player_id} row={row} position={position} top={list[0].pts} teams={teams} />)}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function PlayerDashboard() {
  const teamsQuery = useTeamsList();
  const teams = useMemo(() => Object.fromEntries((teamsQuery.data ?? []).map((team) => [team.abbreviation, team])), [teamsQuery.data]);
  return (
    <div className="space-y-7">
      <Search teams={teams} />
      <Leaders teams={teams} />
    </div>
  );
}
