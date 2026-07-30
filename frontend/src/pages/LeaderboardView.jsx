// Generalized leaderboard, driven by a board config (see constants/boards.js).
// Every /fantasy/* and /nfl/* route renders this with a different board.
// Fantasy boards show the league-scoring editor and scoring-aware columns; NFL
// boards show raw stats with the same filters (season / week / position / type).
import { useMemo, useState } from "react";
import { Select } from "../components/ui/Select";
import { ScoringControl } from "../components/ScoringControl";
import { StatTable, TablePager } from "../components/StatTable";
import { useLeaderboard } from "../hooks/useLeaderboard";
import { useScoring } from "../hooks/useScoring";
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
  const [season, setSeason] = useState(String(SEASONS[0]));
  const [week, setWeek] = useState("");
  const [position, setPosition] = useState(board.defaultPosition);
  const [seasonType, setSeasonType] = useState("REG");
  const [metric, setMetric] = useState(board.defaultSort);
  const [offset, setOffset] = useState(0);
  const [scoring, setScoring] = useScoring();
  const { metrics, supportsScoring } = useMetrics();

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
      limit: PAGE_SIZE,
      offset,
    }),
    [season, week, position, seasonType, metric, scoring, offset, supportsScoring, board],
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
