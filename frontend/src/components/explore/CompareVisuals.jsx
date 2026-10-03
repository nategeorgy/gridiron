// Player Comparison's charts, chosen by the positions being compared.
//
//   receivers (WR/TE)  the scatter, where they're targeted, depth mix + air-yard curves
//   backs              the scatter, run lanes, how each carry ended
//   quarterbacks       the scatter, where they throw, EPA per attempt by depth
//   mixed              where they're targeted (the one chart every position shares)
//
// Every chart takes the page's timeframe, and every one exports as an image. A combined
// export places each player's chart inside one SVG through the charts' `nested` prop.
import { useQueries } from "@tanstack/react-query";
import { Segmented } from "../team/Segmented";
import { ExportImageButton } from "./ExportImageButton";
import { ChartTooltip, TipCard, hoverProps, useChartTooltip } from "./ChartTooltip";
import { CardTitle, ChartState, Chips, Foot, Legend, Swatch } from "./common";
import { ClipDef, SvgHeadshot, useClipId } from "./SvgHeadshot";
import { ScatterPlot } from "./ScatterPlot";
import { EveryTargetField, EveryTargetLegend, HeatField, HeatLegend, ZonesChart, chartRoot } from "./TargetField";
import { SCATTER_PRESETS, scatterPreset } from "../../constants/scatters";
import { useIntelligence } from "../../hooks/useInsight";
import { useUrlState } from "../../hooks/useUrlState";
import { usePhone } from "../../hooks/useMediaQuery";
import { getPlayerRuns, getPlayerTargets } from "../../services/explore";
import { formatStat } from "../../utils/format";
import {
  DEPTHS, DEPTH_COLORS, airYardDensity, airYardHistogram, niceTicks, sideHistograms, signed, zoneCounts,
} from "../../utils/explore";

const TITLES = {
  receivers: ["Receiving profile", "Charts for receivers and tight ends."],
  backs: ["Rushing profile", "Charts for running backs."],
  quarterbacks: ["Passing profile", "Charts for quarterbacks."],
  mixed: ["Where they're targeted", "Mixed positions share one chart: where each player's targets went."],
};

/**
 * @param slots  compared players: { key, id, season, color, label, fullLabel, name, position, headshot_url, row }
 */
export function CompareVisuals({ slots, kind, weeks, scoring, league, metrics }) {
  const role = kind === "quarterbacks" ? "passer" : "receiver";
  const targetQueries = useQueries({
    queries: slots.map((slot) => ({
      queryKey: ["explore-player-targets", slot.id, { season: slot.season, weeks: weeks || undefined, role }],
      queryFn: () => getPlayerTargets(slot.id, { season: slot.season, weeks: weeks || undefined, role }),
      enabled: kind !== "backs" && kind !== "none",
    })),
  });
  const runQueries = useQueries({
    queries: slots.map((slot) => ({
      queryKey: ["explore-player-runs", slot.id, { season: slot.season, weeks: weeks || undefined }],
      queryFn: () => getPlayerRuns(slot.id, { season: slot.season, weeks: weeks || undefined }),
      enabled: kind === "backs",
    })),
  });
  if (kind === "none") return null;
  const targets = targetQueries.map((query) => query.data);
  const runs = runQueries.map((query) => query.data);
  const loading = (kind === "backs" ? runQueries : targetQueries).some((query) => query.isLoading);
  const [title, blurb] = TITLES[kind];

  return (
    <div className="grid gap-4">
      <div className="mt-1">
        <h2 className="text-lg font-bold tracking-tight text-fg">{title}</h2>
        <p className="text-sm text-muted">{blurb}</p>
      </div>
      {kind !== "mixed" && <CompareScatter slots={slots} kind={kind} weeks={weeks} scoring={scoring} league={league} metrics={metrics} />}
      {kind !== "backs" && <TargetMaps slots={slots} targets={targets} passer={kind === "quarterbacks"} loading={loading} />}
      {kind === "receivers" && <DepthCard slots={slots} targets={targets} loading={loading} />}
      {kind === "backs" && <RunLanes slots={slots} runs={runs} loading={loading} />}
      {kind === "backs" && <CarryOutcomes slots={slots} runs={runs} loading={loading} />}
      {kind === "quarterbacks" && <EpaByDepth slots={slots} targets={targets} loading={loading} />}
    </div>
  );
}

// --- the scatter ---------------------------------------------------------------------------

function CompareScatter({ slots, kind, weeks, scoring, league, metrics }) {
  const positions = [...new Set(slots.map((slot) => slot.position))];
  const presetPosition = kind === "receivers" ? (positions.every((position) => position === "TE") ? "TE" : "WR")
    : kind === "backs" ? "RB" : "QB";
  const [presetId, setPresetId] = useUrlState("scatter", SCATTER_PRESETS[presetPosition][0].id);
  const preset = scatterPreset(presetPosition, presetId);
  const tip = useChartTooltip();
  const phone = usePhone();
  const season = slots[0].season;
  // The league behind them: the 60 with the most fantasy points at their positions, as on
  // the Scatter page, so a one-target outlier cannot stretch the axes.
  const { data: pool } = useIntelligence({
    season, ...(weeks ? { weeks } : {}), season_type: "REG", positions: positions.join(","),
    metric: "fantasy_points", order: "desc", scoring, league, limit: 200,
  });
  const present = (row) => row && row[preset.x] !== null && row[preset.x] !== undefined && row[preset.y] !== null && row[preset.y] !== undefined;
  const compared = new Set(slots.map((slot) => `${slot.id}:${slot.season}`));
  const context = (pool?.data ?? [])
    .filter((row) => !compared.has(`${row.player_id}:${season}`) && present(row))
    .slice(0, 60)
    .map((row) => ({ x: row[preset.x], y: row[preset.y] }));
  const points = slots.filter((slot) => present(slot.row)).map((slot, index) => ({
    id: slot.key, name: slot.name, position: slot.position, headshot_url: slot.headshot_url, rank: index + 1,
    x: slot.row[preset.x], y: slot.row[preset.y], ring: slot.color, label: slot.label, slot,
  }));
  const when = `${season} · ${weeks ? "selected weeks" : "full season"}`;
  const tipFor = (point) => (
    <TipCard player={point} sub={`${point.position} · ${point.slot.season}`}
      rows={[preset.x, preset.y].map((id) => [metrics[id]?.label ?? id, formatStat(point.slot.row[id], metrics[id]?.format), point.slot.row.percentiles?.[id] ?? null])} />
  );
  const plot = (forExport = false) => (
    <ScatterPlot points={points} context={context} xMetric={metrics[preset.x]} yMetric={metrics[preset.y]}
      identity={preset.identity} corners={preset.corners} display="heads" fixedRadius={20} labels outliers={false}
      always={points.map((point) => point.id)} height={520} tip={forExport ? undefined : tip} tipFor={tipFor}
      compact={phone && !forExport} />
  );
  return (
    <section className="glass-card p-4">
      <CardTitle title="On the scatter">
        <ExportImageButton title={preset.question}
          subtitle={`${slots.map((slot) => slot.label).join(", ")} against the top 60 ${positions.join("/")}s · ${when}`}
          render={() => plot(true)} disabled={!points.length} />
      </CardTitle>
      <div className="mb-2">
        <Chips label="Questions" value={preset.id} onChange={setPresetId}
          options={SCATTER_PRESETS[presetPosition].map((entry) => ({ value: entry.id, label: entry.label, hint: entry.question }))} />
      </div>
      <p className="mb-1 text-xs text-muted">{preset.question} Faint dots are the 60 {positions.join("/")}s with the most fantasy points, {when}.</p>
      {points.length ? plot() : <ChartState isEmpty empty="No values for this question yet." height={320} />}
      <ChartTooltip tip={tip} />
    </section>
  );
}

// --- where they're targeted / where they throw -----------------------------------------------

function TargetMaps({ slots, targets, passer, loading }) {
  const [mode, setMode] = useUrlState("map", "heat", ["heat", "dots", "zones"]);
  const noun = passer ? "throws" : "targets";
  const items = slots.map((slot, index) => ({ slot, data: targets[index] })).filter(({ data }) => data && data.targets.length >= 5);
  const chart = (data, nested) => {
    if (mode === "dots") return <EveryTargetField targets={data.targets} adot={data.summary.adot} label={`Every ${passer ? "throw" : "target"}`} nested={nested} />;
    if (mode === "zones") {
      const { zones, caught } = zoneCounts(data.targets);
      return <ZonesChart zones={zones} caught={caught} noun={passer ? "att" : "tgt"} nested={nested} />;
    }
    return <HeatField heat={sideHistograms(data.targets)} adot={data.summary.adot} label="Heatmap" nested={nested} />;
  };
  const describe = (data) => `${data.summary.targets} ${noun} · aDOT ${data.summary.adot?.toFixed(1) ?? "—"}`;
  const combined = () => {
    const cell = 420;
    return (
      <svg className="chart" viewBox={`0 0 ${items.length * cell} 530`}>
        {items.map(({ slot, data }, index) => (
          <g key={slot.key}>
            <circle cx={index * cell + 16} cy={22} r={6} fill={slot.color} />
            <text x={index * cell + 28} y={27} style={{ fontSize: 16, fontWeight: 700, fill: "var(--fg)" }}>{slot.fullLabel}</text>
            <text x={index * cell + 28} y={45} className="mono" style={{ fontSize: 12, fill: "var(--muted)" }}>{describe(data)}</text>
            {chart(data, { x: index * cell, y: 56, width: cell - 10, height: 470 })}
          </g>
        ))}
      </svg>
    );
  };
  const title = passer ? "Where they throw" : "Where they're targeted";
  const modeName = { heat: "heatmaps", dots: passer ? "every throw" : "every target", zones: "zones" }[mode];
  return (
    <section className="glass-card p-4">
      <CardTitle title={title}>
        <Segmented label="Map" value={mode} onChange={setMode}
          options={[{ value: "heat", label: "Heatmap" }, { value: "dots", label: passer ? "Every throw" : "Every target" }, { value: "zones", label: "Zones" }]} />
        <ExportImageButton title={`${title}: ${modeName}`} subtitle={items.map(({ slot }) => slot.label).join(" · ")}
          render={combined} sizes={["fit", "wide"]} disabled={!items.length} />
      </CardTitle>
      {loading ? <ChartState isLoading height={360} /> : !items.length ? (
        <ChartState isEmpty empty={`Too few ${noun} to map in this selection.`} />
      ) : (
        <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {items.map(({ slot, data }) => (
            <div key={slot.key} className="min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <Swatch color={slot.color} />
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-fg">{slot.fullLabel}</div>
                  <div className="stat-num text-[11px] text-faint">
                    {describe(data)} · {data.summary.charted ? Math.round((data.summary.depth[3] / data.summary.charted) * 100) : 0}% deep
                  </div>
                </div>
              </div>
              {chart(data)}
            </div>
          ))}
        </div>
      )}
      {mode === "dots" && items.length > 0 && <div className="mt-2"><EveryTargetLegend /></div>}
      {mode === "heat" && items.length > 0 && <div className="mt-2"><HeatLegend /></div>}
      <Foot>
        {passer
          ? "Every targeted throw. Throwaways and spikes have no target, so they are left out."
          : "Depth is air yards; side is the left, middle or right third play-by-play records."}
      </Foot>
    </section>
  );
}

// --- receivers: depth mix and air-yard curves -------------------------------------------------

function DepthBars({ rows, nested }) {
  const width = 620;
  const rowHeight = 34;
  const height = rows.length * rowHeight + 8;
  const barLeft = 150;
  const barWidth = 300;
  return (
    <svg {...chartRoot(nested, `0 0 ${width} ${height}`, "Depth of target mix")}>
      {rows.map(({ slot, summary }, index) => {
        const y = index * rowHeight + 6;
        let x = barLeft;
        return (
          <g key={slot.key}>
            <circle cx={8} cy={y + 11} r={5} fill={slot.color} />
            <text x={20} y={y + 15} style={{ fontSize: 13, fontWeight: 600, fill: "var(--fg)" }}>{slot.label}</text>
            {summary.depth.map((count, depth) => {
              const segment = (count / summary.charted) * barWidth;
              const rect = segment > 0 ? (
                <rect key={depth} x={x + (depth ? 1 : 0)} y={y + 3} width={Math.max(0, segment - 2)} height={16} rx={3} fill={DEPTH_COLORS[depth]} />
              ) : null;
              x += segment;
              return rect;
            })}
            <text x={barLeft + barWidth + 12} y={y + 15} className="mono" style={{ fontSize: 12.5, fill: "var(--fg)" }}>
              {summary.adot?.toFixed(1) ?? "—"} aDOT
            </text>
            <text x={width - 4} y={y + 15} textAnchor="end" className="mono" style={{ fontSize: 12.5, fill: "var(--muted)" }}>
              {Math.round((summary.depth[3] / summary.charted) * 100)}% deep
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function DepthCurves({ rows, nested }) {
  const width = 620;
  const height = 250;
  const margin = { left: 34, right: 12, top: 12, bottom: 30 };
  const curves = rows.map(({ targets }) => airYardDensity(airYardHistogram(targets)));
  const max = Math.max(1e-9, ...curves.flat());
  const X = (yards) => margin.left + ((yards + 10) / 50) * (width - margin.left - margin.right);
  const Y = (value) => height - margin.bottom - (value / max) * (height - margin.top - margin.bottom);
  return (
    <svg {...chartRoot(nested, `0 0 ${width} ${height}`, "Air yards per target, overlaid")}>
      {[-10, 0, 10, 20, 30, 40].map((yards) => (
        <g key={yards}>
          <line className="grid" x1={X(yards)} x2={X(yards)} y1={margin.top} y2={height - margin.bottom}
            style={yards === 0 ? { stroke: "var(--plot-rule)" } : undefined} />
          <text className="axis-t" x={X(yards)} y={height - margin.bottom + 15} textAnchor="middle">
            {yards === 0 ? "LOS" : yards > 0 ? `+${yards}` : yards}
          </text>
        </g>
      ))}
      <text className="axis-t" x={width - margin.right} y={height - 2} textAnchor="end">air yards</text>
      {rows.map(({ slot, summary }, index) => {
        const line = curves[index].map((value, step) => `${step ? "L" : "M"} ${X(step - 10).toFixed(1)} ${Y(value).toFixed(1)}`).join(" ");
        return (
          <g key={slot.key}>
            <path d={`${line} L ${X(40)} ${Y(0)} L ${X(-10)} ${Y(0)} Z`} fill={slot.color} opacity={0.1} />
            <path d={line} fill="none" stroke={slot.color} strokeWidth={2} />
            {summary.adot !== null && (
              <path d={`M ${X(Math.max(-10, Math.min(40, summary.adot)))} ${height - margin.bottom} l -5 8 l 10 0 Z`} fill={slot.color} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

function DepthCard({ slots, targets, loading }) {
  const rows = slots.map((slot, index) => ({ slot, summary: targets[index]?.summary, targets: targets[index]?.targets }))
    .filter(({ summary }) => summary && summary.charted);
  const combined = () => {
    const barsHeight = rows.length * 34 + 8;
    return (
      <svg className="chart" viewBox={`0 0 620 ${barsHeight + 270}`}>
        <DepthBars rows={rows} nested={{ x: 0, y: 0, width: 620, height: barsHeight }} />
        <DepthCurves rows={rows} nested={{ x: 0, y: barsHeight + 16, width: 620, height: 250 }} />
      </svg>
    );
  };
  return (
    <section className="glass-card p-4">
      <CardTitle title="Depth of target">
        <ExportImageButton title="Depth of target" subtitle={rows.map(({ slot }) => slot.label).join(" · ")}
          render={combined} sizes={["fit", "square"]} disabled={!rows.length} />
      </CardTitle>
      <div className="mb-2">
        <Legend items={DEPTHS.map((depth, index) => ({ key: depth.key, color: DEPTH_COLORS[index], label: `${depth.short} ${depth.range}`, size: 12 }))} />
      </div>
      {loading ? <ChartState isLoading height={260} /> : !rows.length ? <ChartState isEmpty /> : (
        <div className="grid items-start gap-4 min-[900px]:grid-cols-2">
          <DepthBars rows={rows} />
          <div>
            <DepthCurves rows={rows} />
            <Legend items={rows.map(({ slot }) => ({ key: slot.key, color: slot.color, label: slot.label, round: true }))}>
              <span>Triangles mark each aDOT</span>
            </Legend>
          </div>
        </div>
      )}
    </section>
  );
}

// --- backs: run lanes and carry outcomes --------------------------------------------------------

const LANE_SHORT = ["LE", "LT", "LG", "Mid", "RG", "RT", "RE"];
const LANE_NAMES = ["Left end", "Left tackle", "Left guard", "Middle", "Right guard", "Right tackle", "Right end"];
const LANE_X = [34, 78, 120, 165, 210, 252, 296];

function laned(run) {
  return run.lanes.reduce((sum, lane) => sum + lane.carries, 0);
}

function LaneChart({ slot, run, maxShare, tip, nested }) {
  const width = 330;
  const height = 230;
  const line = 150;
  const total = laned(run) || 1;
  return (
    <svg {...chartRoot(nested, `0 0 ${width} ${height}`, `${slot.name} carries by run lane`)}>
      <line x1={8} x2={width - 8} y1={line} y2={line} stroke="var(--plot-rule)" strokeWidth={1.5} />
      {[99, 132, 165, 198, 231].map((x) => (
        <rect key={x} x={x - 11} y={line + 6} width={22} height={16} rx={4} fill="color-mix(in srgb, var(--fg) 14%, transparent)" />
      ))}
      {[58, 272].map((x) => (
        <rect key={x} x={x - 9} y={line + 6} width={18} height={16} rx={4} fill="color-mix(in srgb, var(--fg) 7%, transparent)" />
      ))}
      {run.lanes.map((lane, index) => {
        const share = lane.carries / total;
        const barHeight = (share / (maxShare || 1)) * 118;
        const perCarry = lane.carries ? lane.yards / lane.carries : null;
        const tone = perCarry === null ? "var(--faint)" : perCarry >= 4.5 ? "color-mix(in srgb, var(--pos) 70%, var(--fg))"
          : perCarry < 3.5 ? "color-mix(in srgb, var(--neg) 70%, var(--fg))" : "var(--muted)";
        return (
          <g key={lane.lane}>
            <rect x={LANE_X[index] - 13} y={line - barHeight} width={26} height={Math.max(0, barHeight)} rx={4} fill={slot.color} opacity={0.85}
              {...(tip ? hoverProps(tip, () => (
                <div>
                  <b>{slot.name}: {LANE_NAMES[index]}</b>
                  <div className="stat-num mt-0.5 text-muted">
                    {lane.carries} carries ({(share * 100).toFixed(0)}%) · {perCarry === null ? "—" : perCarry.toFixed(1)} yds per carry · {lane.carries ? Math.round((lane.successes / lane.carries) * 100) : 0}% success
                  </div>
                </div>
              )) : {})} />
            <text x={LANE_X[index]} y={line - barHeight - 6} textAnchor="middle" className="mono" style={{ fontSize: 11, fontWeight: 600, fill: "var(--fg)" }}>
              {Math.round(share * 100)}%
            </text>
            <text x={LANE_X[index]} y={line + 38} textAnchor="middle" style={{ fontSize: 10.5, fontWeight: 700, fill: "var(--muted)" }}>{LANE_SHORT[index]}</text>
            <text x={LANE_X[index]} y={line + 53} textAnchor="middle" className="mono" style={{ fontSize: 10.5, fill: tone }}>
              {perCarry === null ? "—" : perCarry.toFixed(1)}
            </text>
          </g>
        );
      })}
      <text x={8} y={height - 4} style={{ fontSize: 10, fill: "var(--faint)" }}>Share of carries above, yards per carry below</text>
    </svg>
  );
}

function RunLanes({ slots, runs, loading }) {
  const tip = useChartTooltip();
  const rows = slots.map((slot, index) => ({ slot, run: runs[index] })).filter(({ run }) => run && laned(run));
  const maxShare = Math.max(0.01, ...rows.flatMap(({ run }) => run.lanes.map((lane) => lane.carries / laned(run))));
  const perCarry = (run) => (run.carries ? (run.yards / run.carries).toFixed(1) : "—");
  const combined = () => {
    const cell = 350;
    return (
      <svg className="chart" viewBox={`0 0 ${rows.length * cell} 280`}>
        {rows.map(({ slot, run }, index) => (
          <g key={slot.key}>
            <circle cx={index * cell + 14} cy={20} r={6} fill={slot.color} />
            <text x={index * cell + 26} y={25} style={{ fontSize: 16, fontWeight: 700, fill: "var(--fg)" }}>{slot.label}</text>
            <text x={index * cell + 26} y={43} className="mono" style={{ fontSize: 12, fill: "var(--muted)" }}>
              {run.carries} designed runs · {perCarry(run)} per carry
            </text>
            <LaneChart slot={slot} run={run} maxShare={maxShare} nested={{ x: index * cell, y: 50, width: 330, height: 230 }} />
          </g>
        ))}
      </svg>
    );
  };
  return (
    <section className="glass-card p-4">
      <CardTitle title="Run lanes">
        <ExportImageButton title="Run lanes: where each back carries it" subtitle={rows.map(({ slot }) => slot.label).join(" · ")}
          render={combined} sizes={["fit", "wide"]} disabled={!rows.length} />
      </CardTitle>
      {loading ? <ChartState isLoading height={260} /> : !rows.length ? <ChartState isEmpty empty="No designed runs in this selection." /> : (
        <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          {rows.map(({ slot, run }) => (
            <div key={slot.key} className="min-w-0">
              <div className="mb-0.5 flex items-center gap-2">
                <Swatch color={slot.color} />
                <div>
                  <div className="text-[13px] font-semibold text-fg">{slot.label}</div>
                  <div className="stat-num text-[11px] text-faint">{run.carries} designed runs · {perCarry(run)} yds per carry</div>
                </div>
              </div>
              <LaneChart slot={slot} run={run} maxShare={maxShare} tip={tip} />
            </div>
          ))}
        </div>
      )}
      <Foot>Designed runs only (scrambles and kneels left out). Lanes come from play-by-play's run direction and gap: end, tackle, guard or middle.</Foot>
      <ChartTooltip tip={tip} />
    </section>
  );
}

const OUTCOMES = [
  { key: "stuffed", label: "Stuffed", note: "0 or less", color: "color-mix(in srgb, var(--neg) 62%, var(--surface-solid))" },
  { key: "short", label: "1–3 yds", color: "color-mix(in srgb, var(--fg) 24%, var(--surface-solid))" },
  { key: "medium", label: "4–9 yds", color: "color-mix(in srgb, var(--pos) 42%, var(--surface-solid))" },
  { key: "explosive", label: "10+ yds", color: "var(--pos)" },
];

function OutcomeRows({ rows, tip, nested }) {
  const width = 1200;
  const rowHeight = 44;
  const height = rows.length * rowHeight + 34;
  const barLeft = 200;
  const barWidth = 700;
  const heading = (x, text, anchor = "start") => (
    <text x={x} y={16} textAnchor={anchor} style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.04em", fill: "var(--faint)" }}>{text}</text>
  );
  return (
    <svg {...chartRoot(nested, `0 0 ${width} ${height}`, "How each carry ended")}>
      {heading(barLeft, "SHARE OF DESIGNED RUNS")}
      {heading(1050, "YDS BEFORE CONTACT", "end")}
      {heading(1188, "YDS AFTER CONTACT", "end")}
      {rows.map(({ slot, run }, index) => {
        const y = 30 + index * rowHeight;
        let x = barLeft;
        return (
          <g key={slot.key}>
            <circle cx={10} cy={y + 13} r={6} fill={slot.color} />
            <text x={24} y={y + 18} style={{ fontSize: 15, fontWeight: 600, fill: "var(--fg)" }}>{slot.label}</text>
            {OUTCOMES.map((outcome, step) => {
              const count = run.outcomes[outcome.key];
              const segment = (count / run.carries) * barWidth;
              const left = x;
              x += segment;
              if (segment <= 0) return null;
              return (
                <g key={outcome.key}>
                  <rect x={left + (step ? 1 : 0)} y={y + 2} width={Math.max(0, segment - 2)} height={24} rx={4} fill={outcome.color}
                    {...(tip ? hoverProps(tip, () => (
                      <div>
                        <b>{slot.name}: {outcome.label}</b>
                        <div className="stat-num mt-0.5 text-muted">{count} of {run.carries} designed runs ({Math.round((count / run.carries) * 100)}%)</div>
                      </div>
                    )) : {})} />
                  {segment > 40 && (
                    <text x={left + segment / 2} y={y + 19} textAnchor="middle" className="mono"
                      style={{ fontSize: 13, fontWeight: 600, fill: step === 3 ? "var(--surface-solid)" : "var(--fg)", pointerEvents: "none" }}>
                      {Math.round((count / run.carries) * 100)}%
                    </text>
                  )}
                </g>
              );
            })}
            {[[1050, slot.row?.rush_ybc_per_att], [1188, slot.row?.rush_yac_per_att]].map(([textX, value]) => (
              <text key={textX} x={textX} y={y + 19} textAnchor="end" className="mono" style={{ fontSize: 15, fill: "var(--fg)" }}>
                {value === null || value === undefined ? "—" : value.toFixed(2)}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function CarryOutcomes({ slots, runs, loading }) {
  const tip = useChartTooltip();
  const rows = slots.map((slot, index) => ({ slot, run: runs[index] })).filter(({ run }) => run && run.carries);
  return (
    <section className="glass-card p-4">
      <CardTitle title="How each carry ended">
        <ExportImageButton title="How each carry ended" subtitle={rows.map(({ slot }) => slot.label).join(" · ")}
          render={() => <OutcomeRows rows={rows} />} sizes={["fit", "wide"]} disabled={!rows.length} />
      </CardTitle>
      <div className="mb-2">
        <Legend items={OUTCOMES.map((outcome) => ({ key: outcome.key, color: outcome.color, label: outcome.note ? `${outcome.label} (${outcome.note})` : outcome.label, size: 12 }))} />
      </div>
      {loading ? <ChartState isLoading height={200} /> : !rows.length ? <ChartState isEmpty empty="No designed runs in this selection." /> : (
        <div className="overflow-x-auto"><div className="min-w-[760px]"><OutcomeRows rows={rows} tip={tip} /></div></div>
      )}
      <Foot>Yards gained on each designed run, from play-by-play. Yards before and after contact are per carry, from Pro Football Reference charting (2018 on).</Foot>
      <ChartTooltip tip={tip} />
    </section>
  );
}

// --- quarterbacks: EPA per attempt by depth ------------------------------------------------------

const epaAt = (summary, depth) => (summary.depth[depth] ? summary.depth_epa[depth] / summary.depth[depth] : null);
const shareAt = (summary, depth) => summary.depth[depth] / (summary.charted || 1);

/**
 * One row per depth, deep at the top: each quarterback's face on a shared EPA axis, the
 * league average as a tick, and the numbers in a column per quarterback on the right.
 */
function EpaDotPlot({ rows, league, tip }) {
  const clipId = useClipId();
  const count = rows.length;
  const columnWidth = 64;
  const width = 1180;
  const left = 190;
  const right = width - count * columnWidth - 28;
  const top = 58;
  const rowHeight = 84;
  const height = top + rowHeight * 4 + 26;
  const values = rows.flatMap(({ summary }) => [0, 1, 2, 3].map((depth) => epaAt(summary, depth)).filter((value) => value !== null));
  const leagueValues = league.filter((value) => value !== null);
  const lo = Math.min(-0.3, ...values, ...leagueValues) - 0.08;
  const hi = Math.max(0.9, ...values, ...leagueValues) + 0.08;
  const X = (value) => left + ((value - lo) / (hi - lo)) * (right - left);
  const compact = (value) => signed(value, 2).replace("+0.", "+.").replace("−0.", "−.");
  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="EPA per attempt by depth">
      <defs><ClipDef id={clipId} /></defs>
      {niceTicks(lo, hi, 7).map((tick) => (
        <g key={tick}>
          <line x1={X(tick)} x2={X(tick)} y1={top - 6} y2={top + rowHeight * 4}
            stroke={Math.abs(tick) < 1e-9 ? "var(--plot-rule)" : "var(--divider)"} strokeWidth={Math.abs(tick) < 1e-9 ? 1.5 : 1} />
          <text className="axis-t" x={X(tick)} y={top + rowHeight * 4 + 18} textAnchor="middle">{tick > 0 ? "+" : ""}{tick.toFixed(1)}</text>
        </g>
      ))}
      <text className="axis-t" x={right} y={top - 14} textAnchor="end">EPA per attempt →</text>
      {rows.map(({ slot }, index) => {
        const cx = right + 28 + index * columnWidth + columnWidth / 2;
        return (
          <g key={slot.key}>
            <g transform={`translate(${cx} ${top - 30})`}>
              <SvgHeadshot url={slot.headshot_url} name={slot.name} r={13} ring={slot.color} ringWidth={2.5} clipId={clipId} />
            </g>
            <text x={cx} y={top - 4} textAnchor="middle" style={{ fontSize: 11, fontWeight: 600, fill: "var(--fg)" }}>{slot.label}</text>
          </g>
        );
      })}
      {[3, 2, 1, 0].map((depth, rowIndex) => {
        const rowTop = top + rowIndex * rowHeight;
        const cy = rowTop + rowHeight / 2;
        const marks = rows.map(({ slot, summary }) => ({ slot, summary, value: epaAt(summary, depth) }))
          .filter((mark) => mark.value !== null).sort((a, b) => a.value - b.value);
        let lastX = -1e9;
        let flip = 0;
        return (
          <g key={depth}>
            {rowIndex % 2 === 0 && <rect x={8} y={rowTop} width={width - 16} height={rowHeight} rx={10} fill="color-mix(in srgb, var(--fg) 3%, transparent)" />}
            <text x={20} y={cy - 6} style={{ fontSize: 15, fontWeight: 700, fill: "var(--fg)" }}>{DEPTHS[depth].short}</text>
            <text x={20} y={cy + 12} className="mono" style={{ fontSize: 12, fill: "var(--faint)" }}>
              {DEPTHS[depth].range} · league {signed(league[depth], 2)}
            </text>
            <line x1={left} x2={right} y1={cy} y2={cy} stroke="var(--divider)" />
            {league[depth] !== null && (
              <line x1={X(league[depth])} x2={X(league[depth])} y1={cy - 26} y2={cy + 26} stroke="var(--fg)" strokeWidth={2.5} opacity={0.55} strokeLinecap="round" />
            )}
            {rowIndex === 0 && league[depth] !== null && (
              <text x={X(league[depth])} y={rowTop + 11} textAnchor="middle" style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", fill: "var(--muted)" }}>LEAGUE</text>
            )}
            {marks.map((mark) => {
              const x = X(mark.value);
              let offset = 0;
              if (x - lastX < 36) {
                flip = flip ? 0 : 1;
                offset = flip ? -18 : 18;
              } else {
                flip = 0;
              }
              lastX = x;
              return (
                <g key={mark.slot.key} transform={`translate(${x} ${cy + offset})`}
                  {...(tip ? hoverProps(tip, () => (
                    <div>
                      <b>{mark.slot.name}: {DEPTHS[depth].label} ({DEPTHS[depth].range})</b>
                      <div className="stat-num mt-0.5 text-muted">
                        {signed(mark.value, 2)} EPA per attempt on {mark.summary.depth[depth]} throws ({Math.round(shareAt(mark.summary, depth) * 100)}% of his)
                      </div>
                      <div className="stat-num text-muted">League {signed(league[depth], 2)}</div>
                    </div>
                  )) : {})}>
                  <SvgHeadshot url={mark.slot.headshot_url} name={mark.slot.name} r={16} ring={mark.slot.color} ringWidth={3} clipId={clipId} />
                </g>
              );
            })}
            {rows.map(({ slot, summary }, index) => {
              const cx = right + 28 + index * columnWidth + columnWidth / 2;
              const value = epaAt(summary, depth);
              const color = value === null ? "var(--faint)" : league[depth] !== null && value >= league[depth]
                ? "color-mix(in srgb, var(--pos) 60%, var(--fg))" : "color-mix(in srgb, var(--neg) 60%, var(--fg))";
              return (
                <g key={slot.key}>
                  <text x={cx} y={cy - 2} textAnchor="middle" className="mono" style={{ fontSize: 15, fontWeight: 700, fill: color }}>
                    {value === null ? "—" : compact(value)}
                  </text>
                  <text x={cx} y={cy + 16} textAnchor="middle" className="mono" style={{ fontSize: 11, fill: "var(--faint)" }}>
                    {Math.round(shareAt(summary, depth) * 100)}%
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
      <text x={right + 28} y={height - 6} style={{ fontSize: 10.5, fill: "var(--faint)" }}>EPA per attempt, then share of his throws</text>
    </svg>
  );
}

function EpaByDepth({ slots, targets, loading }) {
  const tip = useChartTooltip();
  const rows = slots.map((slot, index) => ({ slot, summary: targets[index]?.summary, average: targets[index]?.average }))
    .filter(({ summary }) => summary && summary.charted);
  const league = rows[0]?.average?.depth_epa_per_target ?? [null, null, null, null];
  return (
    <section className="glass-card p-4">
      <CardTitle title="EPA per attempt by depth">
        <ExportImageButton title="EPA per attempt by depth" subtitle={rows.map(({ slot }) => slot.label).join(" · ")}
          render={() => <EpaDotPlot rows={rows} league={league} />} sizes={["fit", "wide"]} disabled={!rows.length} />
      </CardTitle>
      {loading ? <ChartState isLoading height={380} /> : !rows.length ? <ChartState isEmpty /> : (
        <div className="overflow-x-auto"><div className="min-w-[720px]"><EpaDotPlot rows={rows} league={league} tip={tip} /></div></div>
      )}
      <Foot>The tick is the league average at that depth. Targeted throws only; throwaways and spikes have no target.</Foot>
      <ChartTooltip tip={tip} />
    </section>
  );
}
