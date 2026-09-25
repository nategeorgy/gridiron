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
// Edit Columns update the table live without a round trip per tick.
import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Select } from "../components/ui/Select";
import { ScoringControl } from "../components/ScoringControl";
import { StatTable, TablePager } from "../components/StatTable";
import { ExportButton } from "../components/ExportButton";
import { WatchlistToggle, useWatchlistFilter } from "../components/WatchlistToggle";
import { TeamFilter } from "../components/TeamFilter";
import { TimeframeFilter } from "../components/TimeframeFilter";
import { SaveViewButton } from "../components/SaveViewButton";
import { AvailabilityNotice } from "../components/AvailabilityNotice";
import { ColumnEditor } from "../components/leaderboard/ColumnEditor";
import { LeaderboardTabs } from "../components/leaderboard/LeaderboardTabs";
import { PositionGroupPicker } from "../components/leaderboard/PositionGroupPicker";
import { buildBoardExport } from "../utils/csv";
import { useIntelligence } from "../hooks/useInsight";
import { useScoring } from "../hooks/useScoring";
import { useLeague } from "../hooks/useLeague";
import { useUrlState } from "../hooks/useUrlState";
import { useMetrics } from "../hooks/useMetrics";
import { useSeasons } from "../hooks/useSeasons";
import { firstAvailableColumn, isMetricAvailable, unavailableColumns } from "../utils/availability";
import { SEASON_TYPES } from "../constants";
import {
  CUSTOM_TAB,
  DEFAULT_GROUP,
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

  // A new tab, group or filter is a new board: back to the first page.
  useEffect(() => setOffset(0), [tab, group, season, weeks, seasonType, team, sortMetric]);

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
      order: "desc",
      ...watchlist.params,
      ...(team ? { team } : {}),
      percentiles: pool.join(","),
      limit: PAGE_SIZE,
      offset,
    }),
    [season, weeks, seasonType, group, sortMetric, scoring, league, team, pool, offset, watchlist.params.player_ids],
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
  // own default order.
  const hrefFor = (id) => `/leaderboards/${id}${withParams({ metric: null })}`;

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
    navigate(`/leaderboards/custom${withParams({ cols: columns.join(","), metric: null })}`);
    setEditorOpen(true);
  };

  const customCount = rawCols === null ? 0 : parseColumns(rawCols).filter((id) => pool.includes(id)).length;

  const sortByColumn = (key) => {
    // A header for a column with no data this season is inert rather than misleading.
    if (!isMetricAvailable({ id: key, ...(metrics[key] ?? {}) }, season)) return;
    setMetric(key);
  };

  // --- Page ------------------------------------------------------------------------------

  const groupLabel = groupFor(group).label;
  const title = isCustom ? CUSTOM_TAB.label : tabLabel(tab);
  const description = isCustom
    ? CUSTOM_TAB.description
    : LEADERBOARD_TABS.find((entry) => entry.id === tab)?.description;
  const mixed = groupFor(group).positions.length > 1;

  const exportData = useMemo(() => buildBoardExport(rows, columns, metrics), [rows, columns, metrics]);

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent">Leaderboards</div>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <LeaderboardTabs
          active={tab}
          hrefFor={hrefFor}
          isAvailable={(id) => id === CUSTOM_TAB.id || hasPreset(group, id)}
          customCount={customCount}
          onStartCustom={startCustom}
        />
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={editorOpen}
          className="ml-auto inline-flex items-center gap-2 rounded-full border bg-surface-2 px-4 py-1.5 text-[13px] font-semibold text-fg transition hover:text-accent"
          style={{ borderColor: "color-mix(in srgb, var(--accent) 55%, transparent)" }}
        >
          <EditIcon />
          Edit Columns
        </button>
      </div>

      <div className="glass-card flex flex-wrap gap-3 p-4">
        <PositionGroupPicker value={group} onChange={changeGroup} />
        <Select label="Season" value={season} onChange={setSeason} options={seasonOptions} />
        <TimeframeFilter weeks={weeks} season={season} seasonType={seasonType} onChange={setWeeks} />
        <Select label="Type" value={seasonType} onChange={setSeasonType} options={SEASON_TYPES} />
        <TeamFilter value={team} onChange={setTeam} />
        {supportsScoring && <ScoringControl scoring={scoring} onChange={setScoring} label="Scoring" bare />}
        <WatchlistToggle filter={watchlist} onChange={() => setOffset(0)} />
        <div className="ml-auto flex items-end gap-2">
          <SaveViewButton defaultName={`${title} · ${groupLabel}`} />
          <ExportButton
            filename={`second-level-${tab}-${group === "all" ? "all" : group.replace(/,/g, "-").toLowerCase()}-${season}${weeks ? `-wk${weeks.replace(/,/g, "-")}` : ""}`}
            rows={exportData.rows}
            columns={exportData.columns}
            context={[
              `Second Level: ${title} · ${groupLabel}`,
              `${season} ${seasonType}${weeks ? ` · weeks ${weeks}` : " · full season"}${team ? ` · ${team}` : ""}`,
              `sorted by ${metrics[sortMetric]?.label ?? sortMetric} · scoring: ${scoring}`,
            ]}
          />
        </div>
      </div>

      <AvailabilityNotice
        columns={columns}
        metrics={metrics}
        season={season}
        sortFallback={sortFellBack ? (metrics[sortMetric]?.label ?? sortMetric) : null}
      />

      {columns.length ? (
        <StatTable
          columns={columns}
          sections={sections}
          rows={rows}
          metrics={metrics}
          sortMetric={sortMetric}
          onSort={sortByColumn}
          offset={offset}
          unavailableColumns={unavailableColumns(columns, metrics, season).map((entry) => entry.id)}
          isLoading={isLoading}
          isError={isError}
          error={error}
          dimmed={isPlaceholderData}
          emptyMessage="No players met the games threshold for these filters."
        />
      ) : (
        <div className="glass-card p-8 text-center text-sm text-muted">
          No columns on this board.{" "}
          <button type="button" onClick={() => setEditorOpen(true)} className="font-semibold text-accent hover:underline">
            Edit Columns
          </button>{" "}
          to pick some stats.
        </div>
      )}

      {data && columns.length > 0 && (
        <p className="text-[11px] leading-relaxed text-faint">
          Players with at least{" "}
          <span className="text-muted">
            {data.min_games} game{data.min_games === 1 ? "" : "s"}
          </span>
          . Percentiles are within each player's own position.
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
