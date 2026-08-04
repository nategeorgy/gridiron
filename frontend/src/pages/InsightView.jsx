// Generalized Insight board (M3), driven by a board config (see constants/boards.js).
// Every /insight/* route renders this with a different board.
//
// Unlike the leaderboard, these numbers are *relative*: each score ranks a player
// against their position pool, so the page always states what the pool was (window,
// games threshold, replacement level) rather than presenting a bare number.
import { useMemo, useState } from "react";
import { Select } from "../components/ui/Select";
import { ScoringControl } from "../components/ScoringControl";
import { LeagueControl } from "../components/LeagueControl";
import { StatTable, TablePager } from "../components/StatTable";
import { ExportButton } from "../components/ExportButton";
import { buildBoardExport } from "../utils/csv";
import { useIntelligence } from "../hooks/useInsight";
import { useScoring } from "../hooks/useScoring";
import { useLeague } from "../hooks/useLeague";
import { useMetrics } from "../hooks/useMetrics";
import { INSIGHT_TIMEFRAMES, POSITIONS, SEASONS, SEASON_TYPES } from "../constants";

const PAGE_SIZE = 50;
const seasonOptions = SEASONS.map((year) => ({ value: String(year), label: String(year) }));

export function InsightView({ board }) {
  const [season, setSeason] = useState(String(SEASONS[0]));
  const [lastWeeks, setLastWeeks] = useState("");
  const [position, setPosition] = useState(board.defaultPosition);
  const [seasonType, setSeasonType] = useState("REG");
  const [metric, setMetric] = useState(board.defaultSort);
  const [offset, setOffset] = useState(0);
  const [scoring, setScoring] = useScoring();
  const [league, setLeague] = useLeague();
  const { metrics } = useMetrics();

  const params = useMemo(
    () => ({
      season: Number(season),
      ...(lastWeeks ? { last_weeks: Number(lastWeeks) } : {}),
      season_type: seasonType,
      ...(position ? { position } : {}),
      metric,
      scoring,
      league,
      order: "desc",
      limit: PAGE_SIZE,
      offset,
    }),
    [season, lastWeeks, position, seasonType, metric, scoring, league, offset],
  );

  const { data, isLoading, isError, error, isPlaceholderData } = useIntelligence(params);

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const window = data?.window;
  const columns = board.columns;
  const sortOptions = columns.map((key) => ({ value: key, label: metrics[key]?.label ?? key }));

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
        <Select
          label="Timeframe"
          value={lastWeeks}
          onChange={withReset(setLastWeeks)}
          options={INSIGHT_TIMEFRAMES}
        />
        <Select label="Position" value={position} onChange={withReset(setPosition)} options={POSITIONS} />
        <Select label="Type" value={seasonType} onChange={withReset(setSeasonType)} options={SEASON_TYPES} />
        <Select label="Sort by" value={metric} onChange={withReset(setMetric)} options={sortOptions} />
        <div className="ml-auto flex items-end">
          <ExportButton
            filename={`gridironiq-${board.id}-${season}`}
            rows={exportData.rows}
            columns={exportData.columns}
            context={[
              `GridironIQ — ${board.title}`,
              `${season} ${seasonType}${lastWeeks ? ` · last ${lastWeeks} played weeks` : " · full season"}${position ? ` · ${position}` : ""}`,
              `sorted by ${metrics[metric]?.label ?? metric} · scoring: ${scoring} · league: ${league}`,
              "Scores are percentiles within each player's position pool, not absolute values.",
            ]}
          />
        </div>
      </div>

      {/* Scoring and league sit side by side: both are "what league am I in?", and
          these scores need both answers before they mean anything. */}
      <div className="grid items-start gap-3 lg:grid-cols-2">
        <ScoringControl scoring={scoring} onChange={withReset(setScoring)} />
        <LeagueControl league={league} onChange={withReset(setLeague)} replacement={data?.replacement} />
      </div>

      {board.lede && (
        <p className="max-w-3xl text-xs leading-relaxed text-muted">{board.lede}</p>
      )}

      <StatTable
        columns={columns}
        rows={rows}
        metrics={metrics}
        sortMetric={metric}
        onSort={withReset(setMetric)}
        offset={offset}
        signedColumns={board.signed ?? []}
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
