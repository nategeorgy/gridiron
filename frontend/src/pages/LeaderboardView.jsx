// Generalized leaderboard, driven by a board config (see constants/boards.js).
// Every /fantasy/* and /nfl/* route renders this with a different board.
// Fantasy boards show the league-scoring editor and scoring-aware columns; NFL
// boards show raw stats with the same filters (season / week / position / type).
import { useMemo, useState } from "react";
import { Select } from "../components/ui/Select";
import { ScoringControl } from "../components/ScoringControl";
import { StatTable, TablePager } from "../components/StatTable";
import { ExportButton } from "../components/ExportButton";
import { WatchlistToggle, useWatchlistFilter } from "../components/WatchlistToggle";
import { TeamFilter } from "../components/TeamFilter";
import { TimeframeFilter } from "../components/TimeframeFilter";
import { SaveViewButton } from "../components/SaveViewButton";
import { buildBoardExport } from "../utils/csv";
import { useLeaderboard } from "../hooks/useLeaderboard";
import { useScoring } from "../hooks/useScoring";
import { useUrlState } from "../hooks/useUrlState";
import { useMetrics } from "../hooks/useMetrics";
import { useSeasons } from "../hooks/useSeasons";
import { AvailabilityNotice } from "../components/AvailabilityNotice";
import {
  firstAvailableColumn,
  isMetricAvailable,
  unavailableColumns,
} from "../utils/availability";
import { POSITIONS, SEASON_TYPES, weekOptions } from "../constants";

const PAGE_SIZE = 50;

// Fixed-PPR equivalents used on fantasy boards when the backend can't score yet
// (e.g. a deploy window). Both exist on the old and new backend.
const FANTASY_FALLBACK = { fantasy_points: "fantasy_points_ppr", fantasy_ppg: "fantasy_ppg_ppr" };

// Columns whose sign carries the meaning, so they're tinted positive/negative.
const SIGNED_COLUMNS = ["fantasy_points_over_expected", "epa", "rushing_epa", "receiving_epa", "cpoe"];

export function LeaderboardView({ board }) {
  // Filters live in the URL so a board link carries its view — shareable, and what
  // makes a saved view (M5) store something more than a bare path.
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
  const { metrics, supportsScoring } = useMetrics();
  const watchlist = useWatchlistFilter();

  // Scoring-aware ids fall back to their fixed-PPR column when the backend can't
  // score them; on NFL boards there are no scoring-aware columns, so this is a no-op.
  const toBackendMetric = (key) =>
    (board.scoring && !supportsScoring && FANTASY_FALLBACK[key]) || key;

  const columns = board.columns;

  // Coverage deepens over the 1999-onwards range (M8), so a board's columns are not
  // all answerable in every season. Sorting by one that isn't returns a page of
  // dashes in arbitrary order, so the sort falls back and AvailabilityNotice says so.
  const sortMetric = firstAvailableColumn(columns, metrics, season, metric);
  const sortFellBack = sortMetric !== metric;

  const params = useMemo(
    () => ({
      season: Number(season),
      ...(weeks ? { weeks } : {}),
      ...(!weeks && lastWeeks ? { last_weeks: Number(lastWeeks) } : {}),
      season_type: seasonType,
      ...(position ? { position } : {}),
      metric: toBackendMetric(sortMetric),
      ...(board.scoring ? { scoring } : {}),
      ...(team ? { team } : {}),
      order: "desc",
      ...watchlist.params,
      // Percentiles are computed over the whole position pool for the season, so this
      // list only says which columns to rank — never who to rank them against.
      ...(board.percentileColumns?.length
        ? { percentiles: board.percentileColumns.join(",") }
        : {}),
      limit: PAGE_SIZE,
      offset,
    }),
    // watchlist.params is derived from the favorites list, so its serialised form is
    // the dependency — the object identity changes on every render.
    [
      season, lastWeeks, weeks, position, seasonType, team, sortMetric, scoring,
      offset, supportsScoring, board, watchlist.params.player_ids,
    ],
  );

  const { data, isLoading, isError, error, isPlaceholderData } = useLeaderboard(params);

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;

  const withReset = (setter) => (value) => {
    setter(value);
    setOffset(0);
  };

  const sortByColumn = (key) => {
    // A header for a column with no data this season is inert rather than misleading.
    if (!isMetricAvailable({ id: key, ...(metrics[key] ?? {}) }, season)) return;
    setMetric(key);
    setOffset(0);
  };

  const changeScoring = (spec) => {
    setScoring(spec);
    setOffset(0);
  };

  // CSV of the page currently on screen, with its filters recorded in the header.
  const exportData = useMemo(
    () => buildBoardExport(rows, columns, metrics, toBackendMetric),
    [rows, columns, metrics, supportsScoring, board],
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">{board.title}</h1>
        <p className="mt-1 text-sm text-muted">{board.description}</p>
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
            filename={`gridironiq-${board.id}-${season}${weeks ? `-wk${weeks.replace(/,/g, "-")}` : ""}`}
            rows={exportData.rows}
            columns={exportData.columns}
            context={[
              `GridironIQ — ${board.title}`,
              `${season} ${seasonType}${
                weeks ? ` · weeks ${weeks}` : lastWeeks ? ` · last ${lastWeeks}` : " · full season"
              }${position ? ` · ${position}` : ""}${team ? ` · ${team}` : ""}`,
              `sorted by ${metrics[sortMetric]?.label ?? sortMetric}${board.scoring ? ` · scoring: ${scoring}` : ""}`,
            ]}
          />
        </div>
      </div>

      {board.scoring && supportsScoring && <ScoringControl scoring={scoring} onChange={changeScoring} />}

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
        columnKey={toBackendMetric}
        signedColumns={board.signed ?? SIGNED_COLUMNS}
        unavailableColumns={unavailableColumns(columns, metrics, season).map((m) => m.id)}
        isLoading={isLoading}
        isError={isError}
        error={error}
        dimmed={isPlaceholderData}
      />

      <TablePager offset={offset} pageSize={PAGE_SIZE} total={total} onOffsetChange={setOffset} />
    </div>
  );
}
