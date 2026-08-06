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
import { SaveViewButton } from "../components/SaveViewButton";
import { buildBoardExport } from "../utils/csv";
import { useLeaderboard } from "../hooks/useLeaderboard";
import { useScoring } from "../hooks/useScoring";
import { useUrlState } from "../hooks/useUrlState";
import { useMetrics } from "../hooks/useMetrics";
import { POSITIONS, SEASONS, SEASON_TYPES, WEEKS } from "../constants";

const PAGE_SIZE = 50;
const seasonOptions = SEASONS.map((year) => ({ value: String(year), label: String(year) }));

// Fixed-PPR equivalents used on fantasy boards when the backend can't score yet
// (e.g. a deploy window). Both exist on the old and new backend.
const FANTASY_FALLBACK = { fantasy_points: "fantasy_points_ppr", fantasy_ppg: "fantasy_ppg_ppr" };

// Columns whose sign carries the meaning, so they're tinted positive/negative.
const SIGNED_COLUMNS = ["fantasy_points_over_expected", "epa", "rushing_epa", "receiving_epa", "cpoe"];

export function LeaderboardView({ board }) {
  // Filters live in the URL so a board link carries its view — shareable, and what
  // makes a saved view (M5) store something more than a bare path.
  const [season, setSeason] = useUrlState("season", String(SEASONS[0]));
  const [week, setWeek] = useUrlState("week", "");
  const [position, setPosition] = useUrlState("position", board.defaultPosition ?? "");
  const [seasonType, setSeasonType] = useUrlState("type", "REG");
  const [metric, setMetric] = useUrlState("metric", board.defaultSort, board.columns);
  const [offset, setOffset] = useState(0);
  const [scoring, setScoring] = useScoring();
  const { metrics, supportsScoring } = useMetrics();
  const watchlist = useWatchlistFilter();

  // Scoring-aware ids fall back to their fixed-PPR column when the backend can't
  // score them; on NFL boards there are no scoring-aware columns, so this is a no-op.
  const toBackendMetric = (key) =>
    (board.scoring && !supportsScoring && FANTASY_FALLBACK[key]) || key;

  const params = useMemo(
    () => ({
      season: Number(season),
      ...(week ? { week: Number(week) } : {}),
      season_type: seasonType,
      ...(position ? { position } : {}),
      metric: toBackendMetric(metric),
      ...(board.scoring ? { scoring } : {}),
      order: "desc",
      ...watchlist.params,
      limit: PAGE_SIZE,
      offset,
    }),
    // watchlist.params is derived from the favorites list, so its serialised form is
    // the dependency — the object identity changes on every render.
    [
      season, week, position, seasonType, metric, scoring, offset, supportsScoring,
      board, watchlist.params.player_ids,
    ],
  );

  const { data, isLoading, isError, error, isPlaceholderData } = useLeaderboard(params);

  const columns = board.columns;
  const sortOptions = columns.map((key) => ({ value: key, label: metrics[key]?.label ?? key }));
  const rows = data?.data ?? [];
  const total = data?.total ?? 0;

  const withReset = (setter) => (value) => {
    setter(value);
    setOffset(0);
  };

  const sortByColumn = (key) => {
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
        <Select label="Timeframe" value={week} onChange={withReset(setWeek)} options={WEEKS} />
        <Select label="Position" value={position} onChange={withReset(setPosition)} options={POSITIONS} />
        <Select label="Type" value={seasonType} onChange={withReset(setSeasonType)} options={SEASON_TYPES} />
        <Select label="Sort by" value={metric} onChange={withReset(setMetric)} options={sortOptions} />
        <WatchlistToggle filter={watchlist} onChange={() => setOffset(0)} />
        <div className="ml-auto flex items-end gap-2">
          <SaveViewButton defaultName={board.title} />
          <ExportButton
            filename={`gridironiq-${board.id}-${season}${week ? `-wk${week}` : ""}`}
            rows={exportData.rows}
            columns={exportData.columns}
            context={[
              `GridironIQ — ${board.title}`,
              `${season} ${seasonType}${week ? ` · week ${week}` : " · full season"}${position ? ` · ${position}` : ""}`,
              `sorted by ${metrics[metric]?.label ?? metric}${board.scoring ? ` · scoring: ${scoring}` : ""}`,
            ]}
          />
        </div>
      </div>

      {board.scoring && supportsScoring && <ScoringControl scoring={scoring} onChange={changeScoring} />}

      <StatTable
        columns={columns}
        rows={rows}
        metrics={metrics}
        sortMetric={metric}
        onSort={sortByColumn}
        offset={offset}
        columnKey={toBackendMetric}
        signedColumns={SIGNED_COLUMNS}
        isLoading={isLoading}
        isError={isError}
        error={error}
        dimmed={isPlaceholderData}
      />

      <TablePager offset={offset} pageSize={PAGE_SIZE} total={total} onOffsetChange={setOffset} />
    </div>
  );
}
