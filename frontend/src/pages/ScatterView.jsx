// Scatter: one question at a time, every qualified player at a position answering it.
//
// The questions are curated per position (constants/scatters.js): two metrics chosen
// at random usually make a meaningless cloud. The data is the leaderboard's own
// (/stats/intelligence), so a timeframe re-aggregates exactly as the boards do, and each
// tooltip's percentile is the same one the leaderboard prints under that value.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Select } from "../components/ui/Select";
import { FilterBar, summarize } from "../components/ui/FilterBar";
import { Segmented } from "../components/team/Segmented";
import { ScoringControl } from "../components/ScoringControl";
import { TimeframeFilter, formatWeeks } from "../components/TimeframeFilter";
import { ExportButton } from "../components/ExportButton";
import { ExportImageButton } from "../components/explore/ExportImageButton";
import { ChartTooltip, TipCard, useChartTooltip } from "../components/explore/ChartTooltip";
import { ChartState, Chips, ExploreHeader, Field, Headshot, PlayerLine, Toggle } from "../components/explore/common";
import { ScatterPlot } from "../components/explore/ScatterPlot";
import { SCATTER_POSITIONS, SCATTER_PRESETS, scatterPreset } from "../constants/scatters";
import { useHeadshots } from "../hooks/useExplore";
import { useIntelligence } from "../hooks/useInsight";
import { useLeague } from "../hooks/useLeague";
import { useMetrics } from "../hooks/useMetrics";
import { useScoring } from "../hooks/useScoring";
import { useSeasons } from "../hooks/useSeasons";
import { useUrlState } from "../hooks/useUrlState";
import { usePhone } from "../hooks/useMediaQuery";
import { formatStat } from "../utils/format";
import { scoringLabel } from "../constants/scoring";
import { percentileColor } from "../utils/explore";

const CAPS = [
  { value: "25", label: "Top 25" },
  { value: "50", label: "Top 50" },
  { value: "100", label: "Top 100" },
  { value: "all", label: "Every qualified player" },
];

export function ScatterView({ board }) {
  const phone = usePhone();
  const { seasonOptions, currentSeason } = useSeasons();
  const [position, setPosition] = useUrlState("pos", "WR", SCATTER_POSITIONS);
  const [presetId, setPresetId] = useUrlState("q", SCATTER_PRESETS[position][0].id);
  const [season, setSeason] = useUrlState("season", String(currentSeason));
  const [weeks, setWeeks] = useUrlState("weeks", "");
  const [cap, setCap] = useUrlState("players", "50", CAPS.map((option) => option.value));
  const [display, setDisplay] = useUrlState("display", "heads", ["heads", "dots"]);
  const [namesOff, setNamesOff] = useUrlState("names", "", ["off"]);
  const [view, setView] = useUrlState("view", "chart", ["chart", "table"]);
  const [pinned, setPinned] = useUrlState("pin", "");
  const [find, setFind] = useState("");
  const [scoring, setScoring] = useScoring();
  const [league] = useLeague();
  const { metrics } = useMetrics();
  const tip = useChartTooltip();

  const preset = scatterPreset(position, presetId);
  const axisIds = [preset.x, preset.y, ...(preset.size ? [preset.size] : [])];
  const params = useMemo(() => ({
    season: Number(season),
    ...(weeks ? { weeks } : {}),
    season_type: "REG",
    positions: position,
    metric: "fantasy_points",
    order: "desc",
    scoring,
    league,
    limit: 200,
    percentiles: axisIds.join(","),
  }), [season, weeks, position, scoring, league, axisIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data, isLoading, isError, isPlaceholderData } = useIntelligence(params);

  const pool = useMemo(
    () => (data?.data ?? []).filter((row) => row[preset.x] !== null && row[preset.x] !== undefined && row[preset.y] !== null && row[preset.y] !== undefined),
    [data, preset.x, preset.y],
  );
  const shownRows = cap === "all" ? pool : pool.slice(0, Number(cap));
  const headshots = useHeadshots(shownRows.map((row) => row.player_id));
  const points = useMemo(() => shownRows.map((row, index) => ({
    id: row.player_id,
    name: row.name,
    position: row.position,
    team: row.team_abbreviation,
    games: row.games_played,
    headshot_url: headshots[row.player_id],
    x: row[preset.x],
    y: row[preset.y],
    z: preset.size ? row[preset.size] : null,
    rank: index + 1,
    percentiles: row.percentiles ?? {},
  })), [shownRows, headshots, preset]); // eslint-disable-line react-hooks/exhaustive-deps

  const needle = find.trim().toLowerCase();
  const lit = useMemo(() => {
    const ids = new Set(needle.length >= 2 ? points.filter((point) => point.name.toLowerCase().includes(needle)).map((point) => point.id) : []);
    if (pinned && ids.size) ids.add(pinned);
    return ids;
  }, [points, needle, pinned]);

  const xMetric = metrics[preset.x];
  const yMetric = metrics[preset.y];
  const sizeMetric = preset.size ? metrics[preset.size] : null;
  const label = (id) => metrics[id]?.label ?? id;
  const when = `${season} · ${weeks ? formatWeeks(weeks.split(",").map(Number)) : "Full season"}`;
  const pin = points.find((point) => point.id === pinned);

  const tipFor = (point) => (
    <TipCard
      player={point}
      sub={`${point.position} · ${point.team} · ${point.games} games`}
      rows={axisIds.map((id) => [label(id), formatStat(point[id === preset.x ? "x" : id === preset.y ? "y" : "z"], metrics[id]?.format), point.percentiles[id] ?? null])}
      note={`Percentile among ${position}s${weeks ? " in these weeks" : ""}, right. Click to pin.`}
    />
  );

  const plot = (forExport = false) => (
    <ScatterPlot
      compact={phone && !forExport}
      points={points}
      xMetric={xMetric}
      yMetric={yMetric}
      sizeMetric={sizeMetric}
      identity={preset.identity}
      corners={preset.corners}
      display={display}
      labels={forExport || !namesOff || display === "dots"}
      always={pinned ? [pinned] : []}
      lit={forExport ? null : lit}
      tip={forExport ? undefined : tip}
      tipFor={tipFor}
      onPick={forExport ? undefined : (point) => setPinned(pinned === point.id ? "" : point.id)}
    />
  );

  const pickPosition = (value) => {
    setPosition(value);
    setPresetId(SCATTER_PRESETS[value][0].id);
    setPinned("");
  };

  return (
    <div className="space-y-4">
      <ExploreHeader title={board.title} description={board.description} />

      {/* On a phone the position stays out of the fold: it decides which questions exist. */}
      <FilterBar
        className="flex flex-wrap items-end gap-3 p-4"
        summary={summarize(when, CAPS.find((entry) => entry.value === cap)?.label, scoringLabel(scoring))}
        footer={
          <div className="flex items-center gap-3 border-t border-line px-4 py-2.5 md:hidden">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-faint">Position</span>
            <Segmented label="Position" value={position} onChange={pickPosition}
              options={SCATTER_POSITIONS.map((value) => ({ value, label: value }))} />
          </div>
        }
      >
        <div className="max-md:hidden">
          <Field label="Position">
            <Segmented label="Position" value={position} onChange={pickPosition}
              options={SCATTER_POSITIONS.map((value) => ({ value, label: value }))} />
          </Field>
        </div>
        <Select label="Season" value={season} onChange={(value) => { setSeason(value); setWeeks(""); setPinned(""); }} options={seasonOptions} />
        <TimeframeFilter weeks={weeks} season={season} onChange={(value) => { setWeeks(value); setPinned(""); }} />
        <Select label="Players" value={cap} onChange={setCap} options={CAPS} />
        <ScoringControl scoring={scoring} onChange={setScoring} label="Scoring" bare />
        <div className="ml-auto">
          <ExportButton
            filename={`second-level-scatter-${preset.id}-${season}`}
            rows={points.map((point) => ({ rank: point.rank, name: point.name, position: point.position, team: point.team, games: point.games, x: point.x, y: point.y, z: point.z }))}
            columns={[
              { key: "rank", label: "Rank" }, { key: "name", label: "Player" }, { key: "position", label: "Position" },
              { key: "team", label: "Team" }, { key: "games", label: "Games" }, { key: "x", label: label(preset.x) },
              { key: "y", label: label(preset.y) }, ...(preset.size ? [{ key: "z", label: label(preset.size) }] : []),
            ]}
            context={[`Second Level: ${preset.question}`, `${position}s · ${when} · scoring: ${scoring}`]}
          />
        </div>
      </FilterBar>

      <div className="glass-card grid gap-2.5 px-4 py-3">
        <Chips label="Questions" value={preset.id} onChange={(value) => { setPresetId(value); setPinned(""); }}
          options={SCATTER_PRESETS[position].map((entry) => ({ value: entry.id, label: entry.label, hint: entry.question }))} />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Segmented label="Marks" value={display} onChange={setDisplay}
            options={[{ value: "heads", label: "Headshots" }, { value: "dots", label: "Dots" }]} />
          <Toggle checked={!namesOff} onChange={(checked) => setNamesOff(checked ? "" : "off")}>Name the outliers</Toggle>
        </div>
      </div>

      <section className={`glass-card p-4 transition ${isPlaceholderData ? "opacity-70" : ""}`}>
        <div className="mb-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-fg">{preset.question}</h2>
            <div className="stat-num mt-0.5 text-[11.5px] text-faint">
              {label(preset.x)} (x) · {label(preset.y)} (y){preset.size ? ` · size: ${label(preset.size)}` : ""}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input value={find} onChange={(event) => setFind(event.target.value)} list="scatter-names" placeholder="Highlight a player"
              className="glass-input w-[190px] px-3 py-1.5 text-sm" />
            <datalist id="scatter-names">{points.map((point) => <option key={point.id} value={point.name} />)}</datalist>
            <Segmented label="View" value={view} onChange={setView}
              options={[{ value: "chart", label: "Chart" }, { value: "table", label: "Table" }]} />
            <ExportImageButton
              title={preset.question}
              subtitle={`${label(preset.x)} vs ${label(preset.y)} · ${cap === "all" ? `all ${pool.length}` : `top ${points.length}`} ${position}s by fantasy points · ${when}`}
              render={() => plot(true)}
              disabled={!points.length}
            />
          </div>
        </div>

        {pin && (
          <div className="mb-2 flex flex-wrap items-center gap-2.5 rounded-xl border border-edge bg-surface-2 px-3 py-2 text-xs">
            <Headshot url={pin.headshot_url} name={pin.name} size={30} ring={`var(--position-${pin.position.toLowerCase()})`} />
            <div className="min-w-0 flex-1">
              <b className="text-fg">{pin.name}</b> <span className="stat-num text-faint">{pin.position} · {pin.team}</span>
              <div className="stat-num text-[11.5px] text-muted">
                {metrics[preset.x]?.short ?? preset.x} {formatStat(pin.x, xMetric?.format)} · {metrics[preset.y]?.short ?? preset.y} {formatStat(pin.y, yMetric?.format)}
                {preset.size ? ` · ${metrics[preset.size]?.short ?? preset.size} ${formatStat(pin.z, sizeMetric?.format)}` : ""}
              </div>
            </div>
            <div className="flex gap-1.5">
              <Link to={`/explore/compare?players=${pin.id}:${season}`} className="btn-ghost px-3 py-1.5 text-xs hover:!text-accent">Add to Compare</Link>
              <Link to={`/players/${pin.id}`} className="btn-ghost px-3 py-1.5 text-xs hover:!text-accent">Player page</Link>
              <button type="button" onClick={() => setPinned("")} className="btn-ghost px-3 py-1.5 text-xs hover:!text-accent">Clear</button>
            </div>
          </div>
        )}

        {isLoading || isError || !points.length ? (
          <ChartState isLoading={isLoading} isError={isError} isEmpty={!points.length} height={520}
            empty="No qualified players in those weeks yet." />
        ) : view === "chart" ? (
          plot()
        ) : (
          <ScatterTable points={points} preset={preset} metrics={metrics} />
        )}

        {data && (
          <p className="mt-2 text-[11px] text-faint">
            {cap === "all" ? `All ${pool.length}` : `The ${points.length} with the most fantasy points of ${pool.length}`} qualified {position}s
            ({data.min_games}+ games), {when}. Percentiles are within the position.
          </p>
        )}
      </section>
      <ChartTooltip tip={tip} />
    </div>
  );
}

/** The same points as a table, tall enough to read without the page scrolling under it. */
function ScatterTable({ points, preset, metrics }) {
  const rows = [...points].sort((a, b) => b.y - a.y);
  const cell = (id, value, percentile) => (
    <td className="px-2 py-1.5 text-right">
      <span className="stat-num inline-flex flex-col items-end leading-tight">
        {formatStat(value, metrics[id]?.format)}
        <small className="text-[10px] font-semibold" style={{ color: percentileColor(percentile) }}>{percentile ?? ""}</small>
      </span>
    </td>
  );
  return (
    <div className="max-h-[min(80vh,920px)] overflow-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead className="sticky top-0 z-[1]" style={{ background: "var(--surface-solid)" }}>
          <tr className="text-[10px] font-bold uppercase tracking-[0.07em] text-faint">
            <th className="w-8 px-2 pb-2 text-left">#</th>
            <th className="px-2 pb-2 text-left">Player</th>
            <th className="px-2 pb-2 text-right">G</th>
            <th className="px-2 pb-2 text-right">{metrics[preset.x]?.short ?? preset.x}</th>
            <th className="px-2 pb-2 text-right text-fg">{metrics[preset.y]?.short ?? preset.y} ↓</th>
            {preset.size && <th className="px-2 pb-2 text-right">{metrics[preset.size]?.short ?? preset.size}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((point, index) => (
            <tr key={point.id} className="border-t border-line">
              <td className="stat-num px-2 py-1.5 text-xs text-faint">{index + 1}</td>
              <td className="px-2 py-1.5">
                <Link to={`/players/${point.id}`} className="hover:text-accent"><PlayerLine player={point} size={24} /></Link>
              </td>
              <td className="stat-num px-2 py-1.5 text-right">{point.games}</td>
              {cell(preset.x, point.x, point.percentiles[preset.x])}
              {cell(preset.y, point.y, point.percentiles[preset.y])}
              {preset.size && cell(preset.size, point.z, point.percentiles[preset.size])}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
