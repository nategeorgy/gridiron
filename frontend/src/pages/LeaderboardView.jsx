// Player Leaderboards: /leaderboards/:tab. One page for every player board (September
// 2026, replacing M12's fourteen).
//
// The tab is the question (Fantasy, Usage, Efficiency, Expected, Tracking, or Custom)
// and the position group is a control on the page. Both, and a custom column list, live
// in the URL, so a saved view (M5) or a shared link carries the whole board. The route
// renders this one component for every tab, so switching tabs keeps the instance and
// with it the open Edit Columns panel.
//
// ⚠️ A column change must never cost a request. Rows already carry every stat, and the
// percentile request names every stat the position GROUP has rather than the columns on
// screen, so the query depends on the group, season and scoring only. That is what lets
// Edit Columns update the table live without a round trip per tick. The same holds for
// the Display menu: ranks are asked for alongside percentiles, so switching what the
// cells show never refetches.
//
// The page is laid out as the "Table toolbar" mockup picked in November 2026: tabs with
// the saved views beside them, one row of label-less filter pills, then a card holding
// the table and its own toolbar (Filter, Display, Edit Columns, Export). Stat filters
// (`where=`) and the sort direction (`order=`) are in the URL like everything else. Every
// board opens with the Qualified chip on (`minimum=off` removes it): only players at their
// position's minimum per team game, the same bar that decides who the rate percentiles
// are ranked among (backend app/qualifiers.py).
import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { FilterBar, summarize } from "../components/ui/FilterBar";
import { PillSelect } from "../components/ui/PillSelect";
import { StatTable, TablePager } from "../components/StatTable";
import { ExportButton } from "../components/ExportButton";
import { WatchlistToggle, useWatchlistFilter } from "../components/WatchlistToggle";
import { TeamFilter } from "../components/TeamFilter";
import { TimeframeFilter, formatWeeks } from "../components/TimeframeFilter";
import { DEFAULT_SCORING, SCORING_PRESET_OPTIONS, normalizeScoring, scoringLabel } from "../constants/scoring";
import { AvailabilityNotice } from "../components/AvailabilityNotice";
import { BoardViews } from "../components/leaderboard/BoardViews";
import { ColumnEditor } from "../components/leaderboard/ColumnEditor";
import { DisplayMenu, PercentileLegend } from "../components/leaderboard/DisplayMenu";
import { LeaderboardTabs } from "../components/leaderboard/LeaderboardTabs";
import { PositionGroupPicker } from "../components/leaderboard/PositionGroupPicker";
import { StatFilter, filterLabel, parseWhere, writeWhere } from "../components/leaderboard/StatFilter";
import { useLiveSearchParams } from "../hooks/useLiveSearchParams";
import { DEFAULT_DISPLAY, DISPLAY_IDS, displayMode } from "../constants/boardDisplay";
import { buildBoardExport } from "../utils/csv";
import { useIntelligence } from "../hooks/useInsight";
import { useScoring } from "../hooks/useScoring";
import { useLeague } from "../hooks/useLeague";
import { useUrlState } from "../hooks/useUrlState";
import { useMetrics } from "../hooks/useMetrics";
import { rulesFor } from "../utils/qualifiers";
import { useSeasons } from "../hooks/useSeasons";
import { firstAvailableColumn, isMetricAvailable, unavailableColumns, unavailableReason } from "../utils/availability";
import { SEASON_TYPES } from "../constants";
import {
  CUSTOM_TAB,
  DEFAULT_GROUP,
  FILTER_STATS,
  FILTER_STAT_IDS,
  GROUP_VALUES,
  LEADERBOARD_TABS,
  TAB_IDS,
  customSections,
  defaultSort,
  groupFor,
  hasPreset,
  parseColumns,
  poolColumns,
  presetColumns,
  presetSections,
} from "../constants/leaderboards";

const PAGE_SIZE = 50;

const tabLabel = (id) => (LEADERBOARD_TABS.find((tab) => tab.id === id) ?? CUSTOM_TAB).label;
const sameList = (a, b) => a.length === b.length && a.every((entry, index) => entry === b[index]);

function EditIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
      <path d="M6 2.5v11M10.5 2.5v11" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M8 2.5v8M4.5 7.5L8 11l3.5-3.5M3 13.5h10" />
    </svg>
  );
}

// The table card's toolbar buttons: quiet until hovered, so the Filter button and the
// Display menu lead.
const TOOL_BUTTON =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold text-fg transition hover:bg-surface-2 hover:text-accent disabled:opacity-40";

export function LeaderboardView() {
  const { tab: tabParam } = useParams();
  if (!TAB_IDS.includes(tabParam)) return <Navigate to="/leaderboards/fantasy" replace />;
  return <Leaderboard tab={tabParam} />;
}

function Leaderboard({ tab }) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const [searchParams] = useSearchParams();
  const { seasonOptions, currentSeason } = useSeasons();
  const [season, setSeason] = useUrlState("season", String(currentSeason));
  const [weeks, setWeeks] = useUrlState("weeks", "");
  const [group] = useUrlState("positions", DEFAULT_GROUP, GROUP_VALUES);
  const [seasonType, setSeasonType] = useUrlState("type", "REG");
  const [team, setTeam] = useUrlState("team", "");
  const [order, setOrder] = useUrlState("order", "desc", ["asc", "desc"]);
  const [display, setDisplay] = useUrlState("display", DEFAULT_DISPLAY, DISPLAY_IDS);
  const [minimum, setMinimum] = useUrlState("minimum", "on", ["on", "off"]);
  const [, setLiveParams] = useLiveSearchParams();
  const [offset, setOffset] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [scoring, setScoring] = useScoring();
  const [league] = useLeague();
  const { metrics, supportsScoring } = useMetrics();
  const watchlist = useWatchlistFilter();

  const isCustom = tab === CUSTOM_TAB.id;

  // The preset a custom board started from, for "Reset to Usage". Kept for the session
  // rather than in the URL: a custom link reopened later resets to Fantasy.
  const [origin, setOrigin] = useState(isCustom ? "fantasy" : tab);
  useEffect(() => {
    if (!isCustom) setOrigin(tab);
  }, [tab, isCustom]);

  // All has no Tracking preset. Landing on that pair (an old link, a group switch)
  // moves to Fantasy rather than rendering a board with no columns.
  const presetMissing = !isCustom && !hasPreset(group, tab);

  // `cols` is read raw, not through useUrlState, because absent and empty mean different
  // things: absent is "no custom board yet" and empty is "the user cleared every column".
  const rawCols = searchParams.get("cols");
  const pool = useMemo(() => poolColumns(group), [group]);
  const customCols = useMemo(() => {
    if (rawCols === null) return presetColumns(group, "fantasy");
    const inPool = new Set(pool);
    return parseColumns(rawCols).filter((id) => inPool.has(id));
  }, [rawCols, pool, group]);

  const sections = isCustom
    ? customSections(group, customCols, origin)
    : presetSections(group, presetMissing ? "fantasy" : tab);
  const columns = sections.flatMap((entry) => entry.columns);

  // A custom board keeps the order of the preset it came from while that column is still
  // on it, so the first edit does not re-sort the table under you.
  const originSort = defaultSort(group, origin);
  const [metric, setMetric] = useUrlState(
    "metric",
    isCustom
      ? (columns.includes(originSort) ? originSort : (columns[0] ?? "fantasy_points"))
      : defaultSort(group, tab),
    columns,
  );
  // Coverage deepens over the seasons we hold (M8), so a column may have no data in the
  // selected season. Sorting by one returns dashes in arbitrary order, so the sort falls
  // back and AvailabilityNotice says so.
  const sortMetric = columns.length ? firstAvailableColumn(columns, metrics, season, metric) : metric;
  const sortFellBack = sortMetric !== metric;

  useEffect(() => {
    if (presetMissing) navigate(`/leaderboards/fantasy${search}`, { replace: true });
  }, [presetMissing, navigate, search]);

  // Stat filters. Only the Filter's own stats are read from `where`.
  const rawWhere = searchParams.get("where");
  const filters = useMemo(
    () => parseWhere(rawWhere).filter((entry) => FILTER_STAT_IDS.includes(entry.metric)),
    [rawWhere],
  );
  // A filter on a stat the season has no data for (snaps before 2013) would empty the
  // board, so it stays on screen, dimmed with the reason, and is not sent.
  const inactive = Object.fromEntries(
    filters
      .filter((entry) => metrics[entry.metric] && !isMetricAvailable({ id: entry.metric, ...metrics[entry.metric] }, season))
      .map((entry) => [entry.metric, unavailableReason({ id: entry.metric, ...metrics[entry.metric] }, season)]),
  );
  const applied = filters.filter((entry) => !inactive[entry.metric]);
  const whereParam = writeWhere(applied);
  // No filters is no `where` at all.
  const setFilters = (next) => {
    const text = writeWhere(next);
    setLiveParams(
      (previous) => {
        const params = new URLSearchParams(previous);
        if (!text) params.delete("where");
        else params.set("where", text);
        return params;
      },
      { replace: true },
    );
  };
  const qualifiedOnly = minimum !== "off";

  // A new tab, group or filter is a new board: back to the first page.
  useEffect(() => setOffset(0), [tab, group, season, weeks, seasonType, team, sortMetric, order, whereParam, qualifiedOnly]);

  // Every stat the group has, not the columns on screen. See the note at the top.
  const params = useMemo(
    () => ({
      season: Number(season),
      ...(weeks ? { weeks } : {}),
      season_type: seasonType,
      ...(group !== "all" ? { positions: groupFor(group).positions.join(",") } : {}),
      metric: sortMetric,
      scoring,
      league,
      order,
      ...watchlist.params,
      ...(team ? { team } : {}),
      ...(whereParam ? { where: whereParam } : {}),
      ...(qualifiedOnly ? { require_minimum: true } : {}),
      percentiles: pool.join(","),
      ranks: pool.join(","),
      limit: PAGE_SIZE,
      offset,
    }),
    [season, weeks, seasonType, group, sortMetric, order, scoring, league, team, whereParam, qualifiedOnly, pool, offset, watchlist.params.player_ids],
  );

  const { data, isLoading, isError, error, isPlaceholderData } = useIntelligence(params);
  const rows = data?.data ?? [];
  const total = data?.total ?? 0;

  // --- Navigation: tabs, group, and the column editor --------------------------------

  /** The current query string with some keys changed; null deletes a key. */
  const withParams = (changes) => {
    const next = new URLSearchParams(search);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === undefined) next.delete(key);
      else next.set(key, value);
    }
    const text = next.toString();
    return text ? `?${text}` : "";
  };

  // A tab link keeps the group and filters, and drops the sort: each tab opens on its
  // own default order, high to low.
  const hrefFor = (id) => `/leaderboards/${id}${withParams({ metric: null, order: null })}`;

  const changeGroup = (value) => {
    const query = withParams({ positions: value === DEFAULT_GROUP ? null : value });
    const target = !isCustom && !hasPreset(value, tab) ? "fantasy" : tab;
    navigate(`/leaderboards/${target}${query}`, { replace: target === tab });
  };

  // Every edit is live. A list identical to the preset it came from is that preset
  // again, not a custom board that happens to match it.
  const changeColumns = (next) => {
    if (sameList(next, presetColumns(group, origin))) {
      navigate(`/leaderboards/${origin}${withParams({ cols: null })}`, { replace: true });
    } else {
      navigate(`/leaderboards/custom${withParams({ cols: next.join(",") })}`, { replace: true });
    }
  };

  const resetColumns = () => navigate(`/leaderboards/${origin}${withParams({ cols: null })}`, { replace: true });

  // The Custom tab with no custom board yet starts one from what is on screen, and opens
  // the editor on it: there is nothing to look at on a custom board nobody has made.
  const startCustom = () => {
    navigate(`/leaderboards/custom${withParams({ cols: columns.join(","), metric: null, order: null })}`);
    setEditorOpen(true);
  };

  const customCount = rawCols === null ? 0 : parseColumns(rawCols).filter((id) => pool.includes(id)).length;

  // The first click sorts high to low, a second click on the same column low to high.
  const sortByColumn = (key) => {
    // A header for a column with no data this season is inert rather than misleading.
    if (!isMetricAvailable({ id: key, ...(metrics[key] ?? {}) }, season)) return;
    if (key === sortMetric) {
      setOrder((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setMetric(key);
      setOrder("desc");
    }
  };

  // --- Page ------------------------------------------------------------------------------

  const groupLabel = groupFor(group).label;
  const title = isCustom ? CUSTOM_TAB.label : tabLabel(tab);
  const description = isCustom
    ? CUSTOM_TAB.description
    : LEADERBOARD_TABS.find((entry) => entry.id === tab)?.description;
  const mixed = groupFor(group).positions.length > 1;

  const exportData = useMemo(() => buildBoardExport(rows, columns, metrics), [rows, columns, metrics]);

  const scoringValue = normalizeScoring(scoring);
  const exportName = `second-level-${tab}-${group === "all" ? "all" : group.replace(/,/g, "-").toLowerCase()}-${season}${weeks ? `-wk${weeks.replace(/,/g, "-")}` : ""}`;
  const viewSummary = summarize(
    title,
    groupLabel,
    season,
    weeks ? formatWeeks(weeks.split(",").map(Number)) : "Full season",
    team,
    displayMode(display).label,
    `sorted by ${metrics[sortMetric]?.short ?? sortMetric} ${order === "asc" ? "\u2191" : "\u2193"}`,
    qualifiedOnly ? "Qualified" : "All players",
    applied.map((entry) => filterLabel(entry, FILTER_STATS)),
  );
  const minimumText = `${rulesFor(groupFor(group).positions, data?.minimums)} per team game`;

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent">Leaderboards</div>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
      </div>

      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="w-full min-w-0 md:w-auto md:flex-1">
          <LeaderboardTabs
            variant="underline"
            active={tab}
            hrefFor={hrefFor}
            isAvailable={(id) => id === CUSTOM_TAB.id || hasPreset(group, id)}
            customCount={customCount}
            onStartCustom={startCustom}
          />
        </div>
        <BoardViews defaultName={`${title} \u00b7 ${groupLabel}`} summary={viewSummary} />
      </div>

      {/* One row of pills, no card, from md up; folded to a summary on a phone. */}
      <FilterBar
        plain
        className="flex flex-wrap items-center gap-2 max-md:p-4"
        summary={summarize(
          groupLabel,
          season,
          weeks ? formatWeeks(weeks.split(",").map(Number)) : "Full season",
          seasonType === "POST" && "Playoffs",
          team,
          supportsScoring && scoringLabel(scoring),
        )}
      >
        <PositionGroupPicker value={group} onChange={changeGroup} bare />
        <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-line md:block" />
        <PillSelect label="Season" value={season} onChange={setSeason} options={seasonOptions} changed={season !== String(currentSeason)} />
        <TimeframeFilter variant="pill" weeks={weeks} season={season} seasonType={seasonType} onChange={setWeeks} />
        <PillSelect label="Type" value={seasonType} onChange={setSeasonType} options={SEASON_TYPES} changed={seasonType !== "REG"} />
        <TeamFilter variant="pill" value={team} onChange={setTeam} />
        {supportsScoring && (
          <PillSelect label="Scoring" value={scoringValue} onChange={setScoring} options={SCORING_PRESET_OPTIONS} changed={scoringValue !== DEFAULT_SCORING} />
        )}
        <WatchlistToggle filter={watchlist} onChange={() => setOffset(0)} />
      </FilterBar>

      <AvailabilityNotice
        columns={columns}
        metrics={metrics}
        season={season}
        sortFallback={sortFellBack ? (metrics[sortMetric]?.label ?? sortMetric) : null}
      />

      <div className="glass-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          <StatFilter
            filters={filters}
            onChange={setFilters}
            stats={FILTER_STATS}
            inactive={inactive}
            qualified={{ on: qualifiedOnly, onChange: (on) => setMinimum(on ? "on" : "off"), title: minimumText }}
          />
          <span className="flex-1" />
          <DisplayMenu value={display} onChange={setDisplay} />
          <PercentileLegend mode={display} />
          <span aria-hidden="true" className="mx-0.5 h-6 w-px bg-line" />
          <button
            type="button"
            onClick={() => setEditorOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={editorOpen}
            className={TOOL_BUTTON}
          >
            <EditIcon />
            <span className="max-sm:hidden">Edit Columns</span>
            <span className="sm:hidden">Columns</span>
          </button>
          <ExportButton
            filename={exportName}
            rows={exportData.rows}
            columns={exportData.columns}
            label={
              <>
                <DownloadIcon />
                <span className="max-sm:hidden">Export</span>
              </>
            }
            className={TOOL_BUTTON}
            context={[
              `Second Level: ${title} · ${groupLabel}`,
              `${season} ${seasonType}${weeks ? ` · weeks ${weeks}` : " · full season"}${team ? ` · ${team}` : ""}`,
              `sorted by ${metrics[sortMetric]?.label ?? sortMetric}${order === "asc" ? ", low to high" : ""} · scoring: ${scoring}`,
              ...(applied.length ? [`filters: ${applied.map((entry) => filterLabel(entry, FILTER_STATS)).join(", ")}`] : []),
              qualifiedOnly ? `qualified: ${minimumText}` : "all players, qualified or not",
            ]}
          />
        </div>

        {columns.length ? (
          <StatTable
            bare
            columns={columns}
            sections={sections}
            rows={rows}
            metrics={metrics}
            sortMetric={sortMetric}
            sortOrder={order}
            onSort={sortByColumn}
            offset={offset}
            display={display}
            rankPools={data?.percentiles?.rank_pools}
            filteredColumns={applied.map((entry) => entry.metric)}
            unavailableColumns={unavailableColumns(columns, metrics, season).map((entry) => entry.id)}
            isLoading={isLoading}
            isError={isError}
            error={error}
            dimmed={isPlaceholderData}
            emptyMessage={
              applied.length || qualifiedOnly
                ? "No players match these filters."
                : "No players met the games threshold for these filters."
            }
          />
        ) : (
          <div className="p-8 text-center text-sm text-muted">
            No columns on this board.{" "}
            <button type="button" onClick={() => setEditorOpen(true)} className="font-semibold text-accent hover:underline">
              Edit Columns
            </button>{" "}
            to pick some stats.
          </div>
        )}
      </div>

      {data && columns.length > 0 && (
        <p className="text-[11px] leading-relaxed text-faint">
          Players with at least{" "}
          <span className="text-muted">
            {data.min_games} game{data.min_games === 1 ? "" : "s"}
          </span>
          {qualifiedOnly && (
            <>
              {" "}and <span className="text-muted">{minimumText}</span>
            </>
          )}
          . Percentiles and ranks are within each player's own position, with 100 and #1 the best.
          Rates (and a few shares) are ranked among qualified players only
          {qualifiedOnly ? "." : "; a dashed cell shows where a player below the minimum would rank."}
          {mixed ? " A dash means the stat does not apply to that player's position, or has no data." : ""}
        </p>
      )}

      {columns.length > 0 && (
        <TablePager offset={offset} pageSize={PAGE_SIZE} total={total} onOffsetChange={setOffset} />
      )}

      <ColumnEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        group={group}
        sections={sections}
        onChange={changeColumns}
        onReset={resetColumns}
        resetLabel={`Reset to ${tabLabel(origin)}`}
        initialTab={isCustom ? origin : tab}
        metrics={metrics}
      />
    </div>
  );
}
