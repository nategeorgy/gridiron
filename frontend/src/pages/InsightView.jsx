// Generalized Insight board (M3), driven by a board config (see constants/boards.js).
// Every /insight/* route renders this with a different board.
//
// Unlike the leaderboard, these numbers are *relative*: each score ranks a player
// against their position pool, so the page always states what the pool was (window,
// games threshold, replacement level) rather than presenting a bare number.
import { useMemo, useState } from "react";
import { Select } from "../components/ui/Select";
import { LeagueSettings } from "../components/LeagueSettings";
import { StatTable, TablePager } from "../components/StatTable";
import { TeamFilter } from "../components/TeamFilter";
import { TimeframeFilter } from "../components/TimeframeFilter";
import { ExportButton } from "../components/ExportButton";
import { WatchlistToggle, useWatchlistFilter } from "../components/WatchlistToggle";
import { SaveViewButton } from "../components/SaveViewButton";
import { buildBoardExport } from "../utils/csv";
import { useIntelligence } from "../hooks/useInsight";
import { useScoring } from "../hooks/useScoring";
import { useLeague } from "../hooks/useLeague";
import { useMetrics } from "../hooks/useMetrics";
import { useUrlState } from "../hooks/useUrlState";
import { useSeasons } from "../hooks/useSeasons";
import { AvailabilityNotice } from "../components/AvailabilityNotice";
import {
  firstAvailableColumn,
  isMetricAvailable,
  unavailableColumns,
} from "../utils/availability";
import { POSITIONS, SEASON_TYPES } from "../constants";

const PAGE_SIZE = 50;

export function InsightView({ board }) {
  // URL-backed for the same reasons as the leaderboard: shareable links and saved
  // views that actually carry a view.
  const { seasonOptions, currentSeason } = useSeasons();
  const [season, setSeason] = useUrlState("season", String(currentSeason));
  const [lastWeeks, setLastWeeks] = useUrlState("last_weeks", "");
  const [weeks, setWeeks] = useUrlState("weeks", "");
  const [urlPosition, setPosition] = useUrlState("position", board.defaultPosition ?? "");
  // A board declaring `fixedPosition` is *about* that position, so the filter is
  // neither shown nor read from the URL — a stale ?position= from another board
  // would otherwise render an empty passing table with no visible cause.
  const position = board.fixedPosition ?? urlPosition;
  const [seasonType, setSeasonType] = useUrlState("type", "REG");
  const [team, setTeam] = useUrlState("team", "");
  const [metric, setMetric] = useUrlState("metric", board.defaultSort, board.columns);
  const [offset, setOffset] = useState(0);
  const [scoring, setScoring] = useScoring();
  const [league, setLeague] = useLeague();
  const { metrics } = useMetrics();
  const watchlist = useWatchlistFilter();

  const columns = board.columns;

  // The Insight scores are not uniformly available across the 1999-onwards range
  // (M8): everything built on expected points starts in 2009, because before then the
  // expected model has no usable receiving side. Ranking by one of those in 2001
  // returns a page of nulls in arbitrary order, so the sort falls back and the notice
  // below says which columns the season cannot answer.
  const sortMetric = firstAvailableColumn(columns, metrics, season, metric);
  const sortFellBack = sortMetric !== metric;

  const params = useMemo(
    () => ({
      season: Number(season),
      ...(weeks ? { weeks } : {}),
      ...(!weeks && lastWeeks ? { last_weeks: Number(lastWeeks) } : {}),
      season_type: seasonType,
      ...(position ? { position } : {}),
      metric: sortMetric,
      scoring,
      league,
      order: "desc",
      // Both narrow the output only — scores and percentiles stay relative to the
      // full position pool.
      ...watchlist.params,
      ...(team ? { team } : {}),
      ...(board.percentileColumns?.length
        ? { percentiles: board.percentileColumns.join(",") }
        : {}),
      limit: PAGE_SIZE,
      offset,
    }),
    [
      season, lastWeeks, weeks, position, seasonType, team, sortMetric, scoring,
      league, offset, board, watchlist.params.player_ids,
    ],
  );

  const { data, isLoading, isError, error, isPlaceholderData } = useIntelligence(params);

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const window = data?.window;

  // A header for a column with no data this season is inert rather than misleading.
  const sortByColumn = (key) => {
    if (!isMetricAvailable({ id: key, ...(metrics[key] ?? {}) }, season)) return;
    setMetric(key);
    setOffset(0);
  };

  const withReset = (setter) => (value) => {
    setter(value);
    setOffset(0);
  };

  // CSV of the page currently on screen, with its filters recorded in the header.
  const exportData = useMemo(() => buildBoardExport(rows, columns, metrics), [rows, columns, metrics]);

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent">Insight</div>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-fg">{board.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">{board.description}</p>
      </div>

      <div className="glass-card flex flex-wrap gap-3 p-4">
        <Select label="Season" value={season} onChange={withReset(setSeason)} options={seasonOptions} />
        <TimeframeFilter
          lastWeeks={lastWeeks}
          weeks={weeks}
          onChange={({ lastWeeks: next, weeks: nextWeeks }) => {
            setLastWeeks(next);
            setWeeks(nextWeeks);
            setOffset(0);
          }}
        />
        {!board.fixedPosition && (
          <Select
            label="Position"
            value={position}
            onChange={withReset(setPosition)}
            options={POSITIONS}
          />
        )}
        <Select label="Type" value={seasonType} onChange={withReset(setSeasonType)} options={SEASON_TYPES} />
        <TeamFilter value={team} onChange={withReset(setTeam)} />
        <WatchlistToggle filter={watchlist} onChange={() => setOffset(0)} />
        <div className="ml-auto flex items-end gap-2">
          <SaveViewButton defaultName={board.title} />
          <ExportButton
            filename={`gridironiq-${board.id}-${season}`}
            rows={exportData.rows}
            columns={exportData.columns}
            context={[
              `GridironIQ — ${board.title}`,
              `${season} ${seasonType}${lastWeeks ? ` · last ${lastWeeks} played weeks` : " · full season"}${position ? ` · ${position}` : ""}`,
              `sorted by ${metrics[sortMetric]?.label ?? sortMetric} · scoring: ${scoring} · league: ${league}`,
              "Scores are percentiles within each player's position pool, not absolute values.",
            ]}
          />
        </div>
      </div>

        <LeagueSettings
          scoring={scoring}
          onScoringChange={withReset(setScoring)}
          league={league}
          onLeagueChange={withReset(setLeague)}
          replacement={data?.replacement}
        />

      {board.lede && (
        <p className="max-w-3xl text-xs leading-relaxed text-muted">{board.lede}</p>
      )}

      <AvailabilityNotice
        columns={columns}
        metrics={metrics}
        season={season}
        sortFallback={sortFellBack ? (metrics[sortMetric]?.label ?? sortMetric) : null}
      />

      <StatTable
        columns={columns}
        sections={board.sections}
        rows={rows}
        metrics={metrics}
        sortMetric={sortMetric}
        onSort={sortByColumn}
        offset={offset}
        signedColumns={board.signed ?? []}
        unavailableColumns={unavailableColumns(columns, metrics, season).map((m) => m.id)}
        isLoading={isLoading}
        isError={isError}
        error={error}
        dimmed={isPlaceholderData}
        emptyMessage="No players met the games threshold for this window."
      />

      {window && (
        <p className="text-[11px] leading-relaxed text-faint">
          Ranked over{" "}
          <span className="text-muted">
            {window.last_weeks
              ? `the last ${window.last_weeks} played weeks (weeks ${window.week_from}–${window.week_to})`
              : `the full ${window.season} season (weeks ${window.week_from}–${window.week_to})`}
          </span>
          , among players with at least{" "}
          <span className="text-muted">{data.min_games} games</span> in that window — every
          score is a percentile within a player's own position pool. Scores that lean on
          expected points are model estimates (nflverse ffopportunity), not projections.
        </p>
      )}

      <TablePager offset={offset} pageSize={PAGE_SIZE} total={total} onOffsetChange={setOffset} />
    </div>
  );
}
