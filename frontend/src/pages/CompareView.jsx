// Player Comparison: up to five players side by side, each in any season.
//
// Rebuilt in November 2026 on the player page's look (options H1, V1-V3, W1 and W2): team
// banners for the players (components/compare/CompareBanners.jsx), their percentile profile
// as pizzas, one radar and strips, three cards (CompareProfiles.jsx), the stat table on the leaderboard's
// tabs as the leaderboard turned on its side (option S4, CompareTable.jsx), filtered to the
// stats every compared position shares, then rolling lines and the weekly finishes on the finish bands
// (WeekByWeek.jsx), and the charts chosen by position (components/explore/CompareVisuals.jsx).
// The comparison is the URL (constants/compare.js), so a link reopens exactly these
// players, seasons, weeks, tab, sort and views.
import { useEffect, useMemo, useState } from "react";
import { useLiveSearchParams } from "../hooks/useLiveSearchParams";
import { useQueries } from "@tanstack/react-query";
import { Select } from "../components/ui/Select";
import { FilterBar, summarize } from "../components/ui/FilterBar";
import { ScrollRow } from "../components/ui/ScrollRow";
import { Segmented } from "../components/team/Segmented";
import { ScoringControl } from "../components/ScoringControl";
import { TimeframeFilter, formatWeeks } from "../components/TimeframeFilter";
import { ExportButton } from "../components/ExportButton";
import { CardTitle, ChartState, Chips, ExploreHeader } from "../components/explore/common";
import { CompareVisuals } from "../components/explore/CompareVisuals";
import { AddPlayerCard, BannerCard } from "../components/compare/CompareBanners";
import { CompareProfiles } from "../components/compare/CompareProfiles";
import { CompareTable } from "../components/compare/CompareTable";
import { FinishesCard, RollingCard, WINDOWS } from "../components/compare/WeekByWeek";
import {
  COMPARE_EXAMPLES, MAX_COMPARED, WEEKLY_STATS, compareGroup, compareKind, formatCompared, parseCompared,
} from "../constants/compare";
import { LEADERBOARD_TABS, hasPreset, poolColumns, presetSections } from "../constants/leaderboards";
import { forPosition } from "../constants/playerPage";
import { PIZZA_STATS, RADAR_STATS } from "../constants/playerTabs";
import { scoringLabel } from "../constants/scoring";
import { usePlayersById } from "../hooks/useExplore";
import { useLeague } from "../hooks/useLeague";
import { useMetrics } from "../hooks/useMetrics";
import { useTeamsList } from "../hooks/useTeamStats";
import { useScoring } from "../hooks/useScoring";
import { useSeasons } from "../hooks/useSeasons";
import { useUrlState } from "../hooks/useUrlState";
import { getIntelligence } from "../services/insight";
import { getPlayerCareer, getPlayerGameLog } from "../services/players";
import { lastName, seriesColor } from "../utils/explore";

const TAB_IDS = LEADERBOARD_TABS.map((tab) => tab.id);

export function CompareView({ board }) {
  const { seasonOptions, currentSeason } = useSeasons();
  const [searchParams, setSearchParams] = useLiveSearchParams();
  const [tab, setTab] = useUrlState("tab", "fantasy", TAB_IDS);
  const [weeks, setWeeks] = useUrlState("weeks", "");
  const [weekly, setWeekly] = useUrlState("weekly", "fantasy_points", WEEKLY_STATS.map((entry) => entry.value));
  const [window_, setWindow] = useUrlState("window", "todate", WINDOWS.map((entry) => entry.value));
  const [sort, setSort] = useUrlState("sort", "");
  const [order, setOrder] = useUrlState("order", "desc", ["desc", "asc"]);
  const teamsList = useTeamsList();
  const teams = useMemo(() => Object.fromEntries((teamsList.data ?? []).map((team) => [team.abbreviation, team])), [teamsList.data]);
  const [scoring, setScoring] = useScoring();
  const [leagueSpec] = useLeague();
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

  // Every stat a tab can show, plus the profile's: the radar's and the pizzas' for each
  // position here (a pizza is drawn on its own player's position's slices).
  const ranked = [...new Set([
    ...poolColumns(group),
    ...[...new Set(positions)].flatMap((position) => [...forPosition(RADAR_STATS, position), ...forPosition(PIZZA_STATS, position)].map((stat) => stat.id)),
  ])];
  const seasonsWanted = [...new Set(chosen.map((slot) => slot.season))];
  const seasonQueries = useQueries({
    queries: seasonsWanted.map((season) => {
      const ids = chosen.filter((slot) => slot.season === season).map((slot) => slot.id);
      const params = {
        season, ...(weeks ? { weeks } : {}), season_type: "REG", scoring, league: leagueSpec, player_ids: ids.join(","),
        include_unqualified: true, percentiles: ranked.join(","), ranks: "fantasy_points,fantasy_ppg", limit: Math.max(ids.length, 1),
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
      jersey: person?.jersey_number ?? null,
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

  // The table's sort: a header sorts high to low, then low to high; unsorted follows the
  // tab's first column, which is also where a sort on another tab's column falls back.
  const tabColumns = sections.flatMap((section) => section.columns);
  const sortBy = (id) => {
    const current = tabColumns.includes(sort) ? sort : tabColumns[0];
    if (id === current) setOrder(order === "desc" ? "asc" : "desc");
    else {
      setSort(id);
      setOrder("desc");
    }
  };

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
        <div className="flex min-w-0 max-w-full items-center gap-2">
          <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-faint">Examples</span>
          <Chips label="Examples" value={null} onChange={loadExample} scroll
            options={COMPARE_EXAMPLES.map((example) => ({ value: example.id, label: example.label }))} />
        </div>
      </ExploreHeader>

      <FilterBar
        className="flex flex-wrap items-end gap-3 p-4"
        summary={summarize(sameSeason ? String(firstSeason) : "Mixed seasons", weeksLabel, scoringLabel(scoring))}
      >
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
      </FilterBar>

      <div className="grid gap-3 sm:grid-cols-2 min-[1100px]:grid-cols-5">
        {slots.map((slot) => (
          <BannerCard key={slot.key} slot={slot} team={teams[slot.team]} weeksLabel={weeksLabel}
            onSeason={(season) => setSlotSeason(slot.index, season)} onRemove={() => removeSlot(slot.index)} />
        ))}
        {slots.length < MAX_COMPARED && <AddPlayerCard onAdd={addPlayer} />}
      </div>

      {slots.length > 0 && (
        <>
          {loadingRows && !Object.keys(rows).length
            ? <section className="glass-card h-[420px] animate-pulse" />
            : <CompareProfiles slots={slots} metrics={metrics} />}

          <ScrollRow className="max-w-full">
            <div className="inline-flex md:block">
              <Segmented label="Stat tab" value={activeTab} onChange={setTab}
                options={tabs.map((entry) => ({ value: entry.id, label: entry.label }))} />
            </div>
          </ScrollRow>
          <section className="glass-card min-w-0 p-4">
            <CardTitle title={LEADERBOARD_TABS.find((entry) => entry.id === activeTab)?.label}
              sub={new Set(positions).size > 1
                ? `Only stats that apply to ${[...new Set(positions)].join(", ")} alike. Percentiles are within each player's own position. Click a header to sort.`
                : `Percentile among ${positions[0] ?? ""}s that season beneath each value. Click a header to sort.`} />
            {loadingRows && !Object.keys(rows).length ? <ChartState isLoading height={320} /> : (
              <CompareTable slots={slots} sections={sections} metrics={metrics} sort={sort} order={order} onSort={sortBy} />
            )}
          </section>

          <RollingCard slots={slots} weeks={weeks} stat={weekly} onStat={setWeekly} window={window_} onWindow={setWindow} />
          <FinishesCard slots={slots} weeks={weeks} scoring={scoring} />

          <CompareVisuals slots={slots} kind={kind} weeks={weeks} scoring={scoring} league={leagueSpec} metrics={metrics} />
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
