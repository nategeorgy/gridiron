// Player Comparison: up to five players side by side, each in any season.
//
// The stat table is the leaderboard's five tabs, filtered to the stats every compared
// position shares, with the leader of each row and the margin he leads by. Below it,
// charts chosen by position (components/explore/CompareVisuals.jsx), the week-by-week
// line and every weekly finish. The comparison is the URL (constants/compare.js), so a
// link reopens exactly these players, seasons, weeks and tab.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { Select } from "../components/ui/Select";
import { Segmented } from "../components/team/Segmented";
import { ScoringControl } from "../components/ScoringControl";
import { TimeframeFilter, formatWeeks } from "../components/TimeframeFilter";
import { ExportButton } from "../components/ExportButton";
import { PositionTag } from "../components/PositionTag";
import { FinishChip, finishTier } from "../components/player/FinishChip";
import { CardTitle, ChartState, Chips, ExploreHeader, Foot, Headshot, Swatch } from "../components/explore/common";
import { ChartTooltip, useChartTooltip } from "../components/explore/ChartTooltip";
import { ExportImageButton } from "../components/explore/ExportImageButton";
import { CompareVisuals } from "../components/explore/CompareVisuals";
import {
  COMPARE_EXAMPLES, MAX_COMPARED, WEEKLY_STATS, compareGroup, compareKind, formatCompared, parseCompared,
} from "../constants/compare";
import { LEADERBOARD_TABS, hasPreset, poolColumns, presetSections } from "../constants/leaderboards";
import { parseLeague } from "../constants/league";
import { scoringLabel } from "../constants/scoring";
import { usePlayersById } from "../hooks/useExplore";
import { useDebounce } from "../hooks/useDebounce";
import { useLeague } from "../hooks/useLeague";
import { useMetrics } from "../hooks/useMetrics";
import { usePlayerSearch } from "../hooks/usePlayerSearch";
import { useScoring } from "../hooks/useScoring";
import { useSeasons } from "../hooks/useSeasons";
import { useUrlState } from "../hooks/useUrlState";
import { getIntelligence } from "../services/insight";
import { getPlayerCareer, getPlayerGameLog } from "../services/players";
import { formatStat } from "../utils/format";
import { lastName, niceTicks, percentileColor, seriesColor } from "../utils/explore";

const TAB_IDS = LEADERBOARD_TABS.map((tab) => tab.id);

/** How far the leader is clear, on the stat's own scale. */
function marginText(value, format) {
  if (format === "pct") return `+${(value * 100).toFixed(1)}pp`;
  if (format === "int") return `+${Math.round(value).toLocaleString()}`;
  return `+${Number(value).toFixed(typeof format === "number" ? format : 2)}`;
}

function leaderOf(slots, id, metric) {
  const values = slots.filter((slot) => slot.row && slot.row[id] !== null && slot.row[id] !== undefined)
    .map((slot) => ({ slot, value: slot.row[id] }));
  if (values.length < 2) return null;
  const higher = metric?.higher_is_better !== false;
  values.sort((a, b) => (higher ? b.value - a.value : a.value - b.value));
  const tie = formatStat(values[0].value, metric?.format) === formatStat(values[1].value, metric?.format);
  return { slot: values[0].slot, margin: Math.abs(values[0].value - values[1].value), tie };
}

export function CompareView({ board }) {
  const { seasonOptions, currentSeason } = useSeasons();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useUrlState("tab", "fantasy", TAB_IDS);
  const [weeks, setWeeks] = useUrlState("weeks", "");
  const [weekly, setWeekly] = useUrlState("weekly", "fantasy_points", WEEKLY_STATS.map((entry) => entry.value));
  const [scoring, setScoring] = useScoring();
  const [leagueSpec] = useLeague();
  const leagueConfig = useMemo(() => parseLeague(leagueSpec), [leagueSpec]);
  const { metrics } = useMetrics();

  // No `players` at all opens on the receivers example; an empty one is an empty page.
  const raw = searchParams.get("players");
  const chosen = useMemo(
    () => (raw === null
      ? COMPARE_EXAMPLES[0].players.map((id) => ({ id, season: Number(currentSeason) }))
      : parseCompared(raw, currentSeason)),
    [raw, currentSeason],
  );
  const setChosen = (next) => {
    setSearchParams((previous) => {
      const params = new URLSearchParams(previous);
      params.set("players", formatCompared(next));
      return params;
    }, { replace: true });
  };

  const people = usePlayersById(chosen.map((slot) => slot.id));
  const positions = chosen.map((slot) => people[slot.id]?.position).filter(Boolean);
  const group = compareGroup(positions);
  const kind = compareKind(positions);

  const seasonsWanted = [...new Set(chosen.map((slot) => slot.season))];
  const seasonQueries = useQueries({
    queries: seasonsWanted.map((season) => {
      const ids = chosen.filter((slot) => slot.season === season).map((slot) => slot.id);
      const params = {
        season, ...(weeks ? { weeks } : {}), season_type: "REG", scoring, league: leagueSpec, player_ids: ids.join(","),
        include_unqualified: true, percentiles: poolColumns(group).join(","), ranks: "fantasy_points", limit: Math.max(ids.length, 1),
      };
      return { queryKey: ["intelligence", params], queryFn: () => getIntelligence(params), enabled: Boolean(ids.length) };
    }),
  });
  const rows = {};
  seasonQueries.forEach((query, index) => {
    for (const row of query.data?.data ?? []) rows[`${row.player_id}:${seasonsWanted[index]}`] = row;
  });
  const careerQueries = useQueries({
    queries: chosen.map((slot) => ({
      queryKey: ["player-career", slot.id, scoring, "REG"],
      queryFn: () => getPlayerCareer(slot.id, { scoring, season_type: "REG" }),
      staleTime: 10 * 60 * 1000,
    })),
  });
  const logQueries = useQueries({
    queries: chosen.map((slot) => ({
      queryKey: ["player-gamelog-season", slot.id, slot.season, scoring],
      queryFn: () => getPlayerGameLog(slot.id, { scoring, season: slot.season, season_type: "REG" }),
    })),
  });

  const slots = chosen.map((slot, index) => {
    const person = people[slot.id];
    const row = rows[`${slot.id}:${slot.season}`];
    const name = person?.name ?? row?.name ?? "";
    const repeated = chosen.filter((entry) => entry.id === slot.id).length > 1;
    return {
      ...slot,
      key: `${slot.id}:${slot.season}`,
      index,
      color: seriesColor(index),
      name,
      position: person?.position ?? row?.position,
      team: row?.team_abbreviation ?? person?.team_abbreviation,
      headshot_url: person?.headshot_url,
      label: `${lastName(name)}${repeated ? ` ${slot.season}` : ""}`,
      fullLabel: `${name}${repeated ? ` ${slot.season}` : ""}`,
      row,
      careerSeasons: (careerQueries[index].data?.data ?? []).map((entry) => entry.season),
      log: (logQueries[index].data?.data ?? []).filter((line) => line.season_type === "REG"),
    };
  });

  // A player added in a season he has no stats for moves to his most recent one.
  useEffect(() => {
    const next = chosen.map((slot, index) => {
      const seasons = slots[index].careerSeasons;
      return seasons.length && !seasons.includes(slot.season) ? { ...slot, season: seasons[0] } : slot;
    });
    if (next.some((slot, index) => slot.season !== chosen[index].season)) setChosen(next);
  }, [careerQueries.map((query) => query.dataUpdatedAt).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabs = LEADERBOARD_TABS.filter((entry) => hasPreset(group, entry.id));
  const activeTab = tabs.some((entry) => entry.id === tab) ? tab : "fantasy";
  const applies = (id) => {
    const scope = metrics[id]?.applies_to;
    return !scope || scope === "all" || positions.every((position) => scope.includes(position));
  };
  const sections = (presetSections(group, activeTab) ?? [])
    .map((section) => ({ ...section, columns: section.columns.filter(applies) }))
    .filter((section) => section.columns.length);

  const sameSeason = new Set(chosen.map((slot) => slot.season)).size === 1;
  const firstSeason = chosen[0]?.season ?? Number(currentSeason);
  const weeksLabel = weeks ? formatWeeks(weeks.split(",").map(Number)) : "Full season";
  const setSlotSeason = (index, season) => setChosen(chosen.map((slot, position) => (position === index ? { ...slot, season: Number(season) } : slot)));
  const removeSlot = (index) => setChosen(chosen.filter((_, position) => position !== index));
  const addPlayer = (player) => setChosen([...chosen, { id: player.player_id, season: Number(currentSeason) }].slice(0, MAX_COMPARED));
  const loadExample = (id) => setChosen(COMPARE_EXAMPLES.find((example) => example.id === id).players.map((player) => ({ id: player, season: Number(currentSeason) })));
  const loadingRows = seasonQueries.some((query) => query.isLoading);

  const csvColumns = [{ key: "stat", label: "Stat" }, ...slots.map((slot) => ({ key: slot.key, label: `${slot.fullLabel} (${slot.season})` }))];
  const csvRows = sections.flatMap((section) => section.columns.map((id) => ({
    stat: metrics[id]?.label ?? id,
    ...Object.fromEntries(slots.map((slot) => [slot.key, slot.row?.[id] ?? ""])),
  })));

  return (
    <div className="space-y-4">
      <ExploreHeader title={board.title} description={board.description}>
        <div className="flex items-center gap-2">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-faint">Examples</span>
          <Chips label="Examples" value={null} onChange={loadExample}
            options={COMPARE_EXAMPLES.map((example) => ({ value: example.id, label: example.label }))} />
        </div>
      </ExploreHeader>

      <div className="glass-card flex flex-wrap items-end gap-3 p-4">
        <Select label="Season for everyone" value={sameSeason ? String(firstSeason) : ""}
          onChange={(value) => value && setChosen(chosen.map((slot) => ({ ...slot, season: Number(value) })))}
          options={[...(sameSeason ? [] : [{ value: "", label: "Mixed" }]), ...seasonOptions]} />
        <TimeframeFilter weeks={weeks} season={firstSeason} onChange={setWeeks} />
        <ScoringControl scoring={scoring} onChange={setScoring} label="Scoring" bare />
        <div className="ml-auto flex items-end gap-2">
          <CopyLinkButton />
          <ExportButton filename={`second-level-compare-${activeTab}`} rows={csvRows} columns={csvColumns}
            context={[`Second Level: Player Comparison · ${LEADERBOARD_TABS.find((entry) => entry.id === activeTab)?.label}`, `${weeksLabel} · scoring: ${scoring}`]} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 min-[1100px]:grid-cols-5">
        {slots.map((slot) => (
          <PlayerCard key={slot.key} slot={slot} league={leagueConfig} weeksLabel={weeksLabel}
            onSeason={(season) => setSlotSeason(slot.index, season)} onRemove={() => removeSlot(slot.index)} />
        ))}
        {slots.length < MAX_COMPARED && <AddPlayerCard onAdd={addPlayer} />}
      </div>

      {slots.length > 0 && (
        <>
          <Segmented label="Stat tab" value={activeTab} onChange={setTab}
            options={tabs.map((entry) => ({ value: entry.id, label: entry.label }))} />
          <section className="glass-card min-w-0 p-4">
            <CardTitle title={LEADERBOARD_TABS.find((entry) => entry.id === activeTab)?.label}
              sub={new Set(positions).size > 1
                ? `Only stats that apply to ${[...new Set(positions)].join(", ")} alike. Percentiles are within each player's own position.`
                : `Percentile among ${positions[0] ?? ""}s that season beneath each value.`} />
            {loadingRows && !Object.keys(rows).length ? <ChartState isLoading height={320} /> : (
              <StatTable slots={slots} sections={sections} metrics={metrics} />
            )}
          </section>

          <CompareVisuals slots={slots} kind={kind} weeks={weeks} scoring={scoring} league={leagueSpec} metrics={metrics} />

          <WeeklyCard slots={slots} weeks={weeks} stat={weekly} onStat={setWeekly} />
          <FinishesCard slots={slots} weeks={weeks} league={leagueConfig} scoring={scoring} />
        </>
      )}
    </div>
  );
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className="btn-ghost px-3 py-2 text-sm transition hover:!text-accent"
      onClick={() => navigator.clipboard?.writeText(window.location.href).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      })}>
      {copied ? "Link copied" : "Copy link"}
    </button>
  );
}

function MiniStat({ label, children }) {
  return (
    <div className="min-w-0 rounded-lg bg-surface-2 px-2 py-1.5">
      <div className="text-[9.5px] font-bold uppercase tracking-[0.07em] text-faint">{label}</div>
      <div className="stat-num text-sm font-semibold text-fg">{children}</div>
    </div>
  );
}

function PlayerCard({ slot, league, weeksLabel, onSeason, onRemove }) {
  const seasons = slot.careerSeasons.length ? slot.careerSeasons : [slot.season];
  return (
    <section className="glass-card relative grid content-start gap-2.5 p-3">
      <button type="button" onClick={onRemove} aria-label={`Remove ${slot.name}`}
        className="absolute right-2 top-2 rounded-md px-1.5 text-base leading-none text-faint transition hover:bg-surface-2 hover:text-fg">×</button>
      <div className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-2.5 pr-4">
        <Headshot url={slot.headshot_url} name={slot.name} size={52} ring={slot.color} />
        <div className="min-w-0">
          <Link to={`/players/${slot.id}`} className="flex items-center gap-1.5 text-sm font-bold leading-tight tracking-tight text-fg hover:text-accent">
            <Swatch color={slot.color} />
            <span className="truncate">{slot.name || "Loading…"}</span>
          </Link>
          <div className="stat-num mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-faint">
            <PositionTag position={slot.position} variant="quiet" />
            {slot.team}
            <select value={slot.season} onChange={(event) => onSeason(event.target.value)} aria-label={`Season for ${slot.name}`}
              className="glass-input px-1.5 py-0.5 text-[11.5px]">
              {seasons.map((season) => <option key={season} value={season} style={{ background: "var(--surface-solid)" }}>{season}</option>)}
            </select>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <MiniStat label="FPTS">{formatStat(slot.row?.fantasy_points, 1)}</MiniStat>
        <MiniStat label="FPPG">{formatStat(slot.row?.fantasy_ppg, 1)}</MiniStat>
        <MiniStat label="Finish">
          {slot.row?.ranks?.fantasy_points ? <FinishChip rank={slot.row.ranks.fantasy_points} position={slot.position} league={league} /> : "—"}
        </MiniStat>
      </div>
      <div className="stat-num text-[11px] text-faint">
        {slot.row ? `${slot.row.games_played} games · ${slot.season} · ${weeksLabel}` : `No ${slot.season} stats in these weeks`}
      </div>
    </section>
  );
}

function AddPlayerCard({ onAdd }) {
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

/** Every stat on the tab, each player's value and percentile, and who leads it by how much. */
function StatTable({ slots, sections, metrics }) {
  const led = new Map(slots.map((slot) => [slot.key, 0]));
  const body = sections.map((section) => ({
    ...section,
    lines: section.columns.map((id) => {
      const metric = metrics[id];
      const leader = leaderOf(slots, id, metric);
      if (leader && !leader.tie) led.set(leader.slot.key, led.get(leader.slot.key) + 1);
      return { id, metric, leader };
    }),
  }));
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className="px-2 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.05em] text-faint">Stat</th>
              {slots.map((slot) => (
                <th key={slot.key} className="px-2 py-1.5 text-center">
                  <span className="inline-flex items-center gap-2">
                    <Swatch color={slot.color} />
                    <Headshot url={slot.headshot_url} name={slot.name} size={30} ring={slot.color} />
                    <span className="grid text-left leading-tight">
                      <b className="text-[12.5px] font-bold text-fg">{lastName(slot.name)}</b>
                      <small className="stat-num text-[11px] font-medium text-faint">{slot.season}</small>
                    </span>
                  </span>
                </th>
              ))}
              <th className="px-2 py-1.5 text-center text-[10.5px] font-semibold uppercase tracking-[0.05em] text-faint">Leads by</th>
            </tr>
          </thead>
          <tbody>
            {body.map((section) => [
              section.name ? (
                <tr key={`section-${section.name}`}>
                  <td colSpan={slots.length + 2} className="px-2 pb-1 pt-3.5 text-left text-[11px] font-bold text-fg">{section.name}</td>
                </tr>
              ) : null,
              ...section.lines.map(({ id, metric, leader }) => (
                <tr key={id}>
                  <td className="border-t border-line px-2 py-1.5 text-left text-muted" title={metric?.description}>{metric?.label ?? id}</td>
                  {slots.map((slot) => {
                    const value = slot.row?.[id];
                    const percentile = slot.row?.percentiles?.[id];
                    const wins = leader && !leader.tie && leader.slot.key === slot.key;
                    return (
                      <td key={slot.key} className={`border-t border-line px-2 py-1.5 text-center ${leader && !wins ? "text-muted" : ""}`}
                        style={wins ? { background: `color-mix(in srgb, ${slot.color} 13%, transparent)` } : undefined}>
                        <span className="stat-num inline-flex flex-col items-center leading-tight">
                          {wins ? <b className="text-fg">{formatStat(value, metric?.format)}</b> : formatStat(value, metric?.format)}
                          <small className="text-[10px] font-semibold" style={{ color: percentileColor(percentile) }}>{percentile ?? ""}</small>
                        </span>
                      </td>
                    );
                  })}
                  <td className="border-t border-line px-2 py-1.5 text-center">
                    {!leader ? <span className="text-faint">—</span> : leader.tie ? (
                      <span className="inline-flex rounded-full border border-edge bg-surface-2 px-3 py-0.5 text-xs text-muted">Tie</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full py-[3px] pl-[3px] pr-3 text-xs"
                        style={{
                          background: `color-mix(in srgb, ${leader.slot.color} 18%, var(--surface-2))`,
                          border: `1px solid color-mix(in srgb, ${leader.slot.color} 65%, transparent)`,
                        }}>
                        <Headshot url={leader.slot.headshot_url} name={leader.slot.name} size={24} ring={leader.slot.color} />
                        <b className="font-bold text-fg">{leader.slot.label}</b>
                        <span className="stat-num font-bold text-fg">{marginText(leader.margin, metric?.format)}</span>
                      </span>
                    )}
                  </td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
        <span>Categories led on this tab:</span>
        {slots.map((slot) => (
          <span key={slot.key} className="inline-flex items-center gap-1.5">
            <Swatch color={slot.color} />
            {slot.label}
            <b className="stat-num text-fg">{led.get(slot.key)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

// --- week by week -----------------------------------------------------------------------------

function weekRange(slots, weeks) {
  if (weeks) return weeks.split(",").map(Number).sort((a, b) => a - b);
  const last = Math.max(1, ...slots.flatMap((slot) => slot.log.map((line) => line.week)));
  return Array.from({ length: last }, (_, index) => index + 1);
}

function WeeklyChart({ slots, weeks, stat, tip }) {
  const option = WEEKLY_STATS.find((entry) => entry.value === stat) ?? WEEKLY_STATS[0];
  const shown = weekRange(slots, weeks);
  const shownSet = new Set(shown);
  const first = shown[0] ?? 1;
  const last = shown[shown.length - 1] ?? 18;
  const series = slots.map((slot) => ({
    slot,
    points: slot.log.filter((line) => shownSet.has(line.week) && line[stat] !== null && line[stat] !== undefined)
      .map((line) => ({ week: line.week, value: line[stat], line })).sort((a, b) => a.week - b.week),
  }));
  const width = 1180;
  const height = 300;
  const margin = { left: 44, right: 110, top: 14, bottom: 30 };
  const most = Math.max(1e-9, ...series.flatMap((entry) => entry.points.map((point) => point.value)));
  const ticks = niceTicks(0, most * 1.05, 5);
  const top = Math.max(ticks[ticks.length - 1] ?? most, most * 1.05);
  const X = (week) => margin.left + ((week - first) / Math.max(1, last - first)) * (width - margin.left - margin.right);
  const Y = (value) => height - margin.bottom - (value / top) * (height - margin.top - margin.bottom);
  const tickText = (value) => (option.format === "pct" ? `${Math.round(value * 100)}%` : formatStat(value, Number.isInteger(value) ? "int" : 1));
  const ends = series.filter((entry) => entry.points.length).map((entry) => {
    const end = entry.points[entry.points.length - 1];
    return { slot: entry.slot, x: X(end.week), y: Y(end.value) };
  }).sort((a, b) => a.y - b.y);
  for (let index = 1; index < ends.length; index += 1) {
    if (ends[index].y - ends[index - 1].y < 14) ends[index].y = ends[index - 1].y + 14;
  }
  const [hover, setHover] = useState(null);
  const onMove = (event) => {
    const box = event.currentTarget.ownerSVGElement.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * width;
    const week = Math.max(first, Math.min(last, Math.round(first + ((x - margin.left) / (width - margin.left - margin.right)) * (last - first))));
    setHover(week);
    tip?.show(event, (
      <div>
        <b>Week {week}</b>
        <table className="mt-1 w-full">
          <tbody>
            {series.map(({ slot, points }) => {
              const point = points.find((entry) => entry.week === week);
              return (
                <tr key={slot.key}>
                  <td className="pr-3 text-left text-muted"><span className="inline-flex items-center gap-1.5"><Swatch color={slot.color} size={8} />{slot.label}</span></td>
                  <td className="stat-num text-right">{point ? `${formatStat(point.value, option.format)} · ${point.line.opponent_abbreviation ?? ""}` : "no game"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    ));
  };
  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${option.label} by week`}>
      {ticks.map((tick) => (
        <g key={tick}>
          <line className="grid" x1={margin.left} x2={width - margin.right} y1={Y(tick)} y2={Y(tick)} />
          <text className="axis-t" x={margin.left - 8} y={Y(tick) + 3.5} textAnchor="end">{tickText(tick)}</text>
        </g>
      ))}
      {shown.map((week) => <text key={week} className="axis-t" x={X(week)} y={height - 10} textAnchor="middle">{week}</text>)}
      {series.map(({ slot, points }) => {
        let path = "";
        let previous = null;
        for (const point of points) {
          const index = shown.indexOf(point.week);
          path += `${previous !== null && index === previous + 1 ? "L" : "M"} ${X(point.week)} ${Y(point.value)} `;
          previous = index;
        }
        return (
          <g key={slot.key}>
            <path d={path} fill="none" stroke={slot.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {points.map((point) => (
              <circle key={point.week} cx={X(point.week)} cy={Y(point.value)} r={3.5} fill={slot.color} stroke="var(--surface-solid)" strokeWidth={1.5} />
            ))}
          </g>
        );
      })}
      {ends.map((end) => (
        <g key={end.slot.key}>
          <line x1={end.x + 5} x2={width - margin.right + 6} y1={end.y} y2={end.y} stroke={end.slot.color} strokeWidth={1} opacity={0.35} />
          <text x={width - margin.right + 10} y={end.y + 4} style={{ fontSize: 11.5, fontWeight: 600, fill: "var(--fg)" }}>{end.slot.label}</text>
        </g>
      ))}
      {tip && hover !== null && <line x1={X(hover)} x2={X(hover)} y1={margin.top} y2={height - margin.bottom} stroke="var(--plot-rule)" opacity={0.8} />}
      {tip && (
        <rect x={margin.left - 10} y={margin.top} width={width - margin.left - margin.right + 20} height={height - margin.top - margin.bottom}
          fill="transparent" onMouseMove={onMove} onMouseLeave={() => { setHover(null); tip.hide(); }} />
      )}
    </svg>
  );
}

function WeeklyCard({ slots, weeks, stat, onStat }) {
  const tip = useChartTooltip();
  const option = WEEKLY_STATS.find((entry) => entry.value === stat) ?? WEEKLY_STATS[0];
  const loading = slots.some((slot) => !slot.log.length && slot.row);
  return (
    <section className="glass-card min-w-0 p-4">
      <CardTitle title="Week by week">
        <Select value={stat} onChange={onStat} options={WEEKLY_STATS.map(({ value, label }) => ({ value, label }))} />
        <ExportImageButton title={`${option.label} by week`} subtitle={slots.map((slot) => slot.fullLabel).join(" · ")}
          render={() => <WeeklyChart slots={slots} weeks={weeks} stat={stat} />} sizes={["fit", "wide"]} />
      </CardTitle>
      {loading ? <ChartState isLoading height={260} /> : (
        <div className="overflow-x-auto"><div className="min-w-[720px]"><WeeklyChart slots={slots} weeks={weeks} stat={stat} tip={tip} /></div></div>
      )}
      <Foot>Gaps are weeks without a game. Across seasons, each line runs over its own season's weeks.</Foot>
      <ChartTooltip tip={tip} />
    </section>
  );
}

function FinishesCard({ slots, weeks, league, scoring }) {
  const shown = weekRange(slots, weeks);
  const template = `150px repeat(${shown.length}, minmax(24px, 1fr)) 64px 64px`;
  return (
    <section className="glass-card min-w-0 p-4">
      <CardTitle title="Weekly finishes" sub={`Rank at the position each week, in ${scoringLabel(scoring)}. Coloured by how a 12-team league starts that position.`} />
      <div className="overflow-x-auto">
        <div className="stat-num grid gap-[3px] text-[10.5px]" style={{ minWidth: 260 + shown.length * 30 }}>
          <div className="grid items-center gap-[3px]" style={{ gridTemplateColumns: template }}>
            <div />
            {shown.map((week) => <div key={week} className="text-center text-[10px] text-faint">{week}</div>)}
            <div className="text-center text-[10px] text-faint">Top 12</div>
            <div className="text-center text-[10px] text-faint">Top 24</div>
          </div>
          {slots.map((slot) => {
            const byWeek = new Map(slot.log.map((line) => [line.week, line]));
            let top12 = 0;
            let top24 = 0;
            const cells = shown.map((week) => {
              const line = byWeek.get(week);
              if (!line || !line.position_rank) {
                return <div key={week} className="grid h-[26px] place-items-center rounded-md text-faint" style={{ background: "color-mix(in srgb, var(--fg) 4%, transparent)" }}>·</div>;
              }
              if (line.position_rank <= 12) top12 += 1;
              if (line.position_rank <= 24) top24 += 1;
              const tier = finishTier(line.position_rank, slot.position, league);
              return (
                <div key={week} className="grid h-[26px] place-items-center rounded-md font-semibold"
                  style={{ background: tier.background, color: tier.color }}
                  title={`${slot.name}, Week ${week}: ${slot.position}${line.position_rank} · ${formatStat(line.fantasy_points, 1)} points vs ${line.opponent_abbreviation ?? ""}`}>
                  {line.position_rank}
                </div>
              );
            });
            return (
              <div key={slot.key} className="grid items-center gap-[3px]" style={{ gridTemplateColumns: template }}>
                <div className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap font-sans text-xs font-semibold text-fg">
                  <Swatch color={slot.color} />
                  {lastName(slot.name)}
                  {slots.filter((other) => other.id === slot.id).length > 1 && <span className="stat-num text-faint">{slot.season}</span>}
                </div>
                {cells}
                <div className="text-center text-xs font-bold text-fg">{top12}</div>
                <div className="text-center text-xs font-bold text-fg">{top24}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
