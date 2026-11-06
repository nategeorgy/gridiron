// A back's (or a quarterback's) designed runs: the run fan through the line, and how his
// runs end beside every back's, with every carry by yards gained under it.
import { usePlayerRuns } from "../../../hooks/useExplore";
import { usePlayerCarries } from "../../../hooks/usePlayer";
import { ChartTooltip, hoverProps, useChartTooltip } from "../../explore/ChartTooltip";
import { ClipDef, SvgHeadshot, useClipId } from "../../explore/SvgHeadshot";
import { Legend } from "../../explore/common";
import { lastName } from "../../../utils/explore";
import { ringColors } from "../cardParts";
import { Panel, lin, mix } from "./common";

// Lanes left to right, as nflfastR names them, and the gap each runs through.
const LANES = [
  ["le", "L end"], ["lt", "L tackle"], ["lg", "L guard"], ["mid", "Middle"], ["rg", "R guard"], ["rt", "R tackle"], ["re", "R end"],
];
const BLOCKERS = ["TE", "LT", "LG", "C", "RG", "RT", "TE"];
const BLOCK_X = [95, 175, 255, 320, 385, 465, 545];
const LANE_X = [40, 135, 215, 320, 425, 505, 600];

export const RUN_OUTCOMES = [
  { key: "stuffed", label: "Stuffed", sub: "0 or less", color: "var(--neg)" },
  { key: "short", label: "Short", sub: "1-3 yards", color: "var(--warn)" },
  { key: "medium", label: "Medium", sub: "4-9 yards", color: "var(--series-1)" },
  { key: "explosive", label: "Explosive", sub: "10+ yards", color: "var(--series-3)" },
];

function shares(outcomes) {
  const total = RUN_OUTCOMES.reduce((sum, outcome) => sum + (outcomes?.[outcome.key] ?? 0), 0) || 1;
  return Object.fromEntries(RUN_OUTCOMES.map((outcome) => [outcome.key, (outcomes?.[outcome.key] ?? 0) / total]));
}

export function RunFan({ page }) {
  const { playerId, player, position, season, team } = page;
  const { data, isLoading } = usePlayerRuns(playerId, { season });
  const tip = useChartTooltip();
  const clipId = useClipId();
  const [ring] = ringColors(team);
  const title = position === "QB" ? "Designed runs by lane" : "Running by lane";
  if (isLoading) return <section className="glass-card h-[420px] animate-pulse p-5" />;
  if (!data?.carries) {
    return <Panel title={title}><p className="py-10 text-center text-sm text-muted">No designed runs this season.</p></Panel>;
  }
  const byLane = Object.fromEntries(data.lanes.map((lane) => [lane.lane, lane]));
  const average = Object.fromEntries((data.average?.lanes ?? []).map((lane) => [lane.lane, lane]));
  const overall = data.average?.carries ? data.average.yards / data.average.carries : 0;
  const total = data.lanes.reduce((sum, lane) => sum + lane.carries, 0) || 1;
  const w = 640, h = 330, bx = w / 2, by = 300, los = 170;
  return (
    <Panel title={title} sub={`${data.carries} designed runs. Line width is the share of runs in that lane; the number is yards per carry against every back's average in that lane`}>
      <svg viewBox={`0 0 ${w} ${h}`} className="block h-auto w-full" role="img" aria-label={title}>
        <defs><ClipDef id={clipId} /></defs>
        <rect x="0" y="0" width={w} height={los} rx="12" fill={mix("var(--series-3)", 6)} />
        <line x1="10" x2={w - 10} y1={los} y2={los} stroke="var(--plot-rule)" strokeWidth="2" />
        {LANES.map(([key, name], index) => {
          const lane = byLane[key] ?? { carries: 0, yards: 0 };
          const avg = average[key];
          const ypc = lane.carries ? lane.yards / lane.carries : 0;
          const avgYpc = avg?.carries ? avg.yards / avg.carries : overall;
          const diff = ypc - avgYpc;
          const color = diff >= 0
            ? mix("var(--pos)", Math.min(90, 45 + diff * 18), "var(--surface-solid)")
            : mix("var(--neg)", Math.min(90, 45 - diff * 18), "var(--surface-solid)");
          const tx = LANE_X[index], ty = 52;
          return (
            <g key={key}>
              {lane.carries > 0 && (
                <path
                  d={`M${bx},${by - 14} Q${(bx + tx) / 2},${los + 30} ${tx},${ty + 18}`}
                  fill="none"
                  style={{ stroke: color }}
                  strokeWidth={(3 + (lane.carries / total) * 36).toFixed(1)}
                  strokeLinecap="round"
                  opacity="0.9"
                  {...hoverProps(tip, <div><b className="text-fg">{name}</b><div className="text-muted">{lane.carries} carries, {ypc.toFixed(1)} a carry</div><div className="text-muted">Every back: {avgYpc.toFixed(1)}</div></div>)}
                />
              )}
              <text x={tx} y={ty - 8} textAnchor="middle" fontSize="15" fontWeight="800" fill="var(--fg)" className="stat-num">{lane.carries ? ypc.toFixed(1) : "-"}</text>
              <text x={tx} y={ty + 6} textAnchor="middle" fontSize="9.5" fill="var(--faint)" className="stat-num">avg {avgYpc.toFixed(1)}</text>
              <text x={tx} y="18" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="var(--muted)">{name}</text>
              <text x={tx} y={ty + 30} textAnchor="middle" fontSize="10.5" fontWeight="800" fill="var(--fg)" className="stat-num">{lane.carries}</text>
            </g>
          );
        })}
        {BLOCKERS.map((label, index) => (
          <g key={index}>
            <rect x={BLOCK_X[index] - 17} y={los + 8} width="34" height="20" rx="6" fill="var(--surface-solid)" stroke="var(--border)" />
            <text x={BLOCK_X[index]} y={los + 22} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="var(--muted)">{label}</text>
          </g>
        ))}
        <g transform={`translate(${bx},${by - 6})`}>
          <SvgHeadshot url={player.headshot_url} name={player.name} r={15} ring={ring} clipId={clipId} />
        </g>
      </svg>
      <ChartTooltip tip={tip} />
      <Legend items={[
        { key: "up", color: mix("var(--pos)", 70, "var(--surface-solid)"), label: "Above the RB average" },
        { key: "down", color: mix("var(--neg)", 70, "var(--surface-solid)"), label: "Below" },
      ]} />
    </Panel>
  );
}

function CarryHistogram({ data, position }) {
  const tip = useChartTooltip();
  const mine = data.mine.map((count) => count / (data.carries || 1));
  const league = data.league.map((count) => count / (data.league_carries || 1));
  const top = Math.ceil((Math.max(...mine, ...league) * 1.1) / 0.05) * 0.05 || 0.05;
  const w = 520, h = 212, L = 36, R = 6, T = 10, B = 26;
  const bw = (w - L - R) / data.bins.length;
  const y = lin(0, top, h - B, T);
  const ticks = Array.from({ length: 5 }, (_, index) => (top / 4) * index);
  const colorOf = (index) => RUN_OUTCOMES[index <= 1 ? 0 : index <= 3 ? 1 : index <= 5 ? 2 : 3].color;
  return (
    <>
      <div className="mb-1.5 mt-4 text-[10.5px] font-bold uppercase tracking-[0.12em] text-faint">Every carry by yards gained · white line is every {position}</div>
      <svg viewBox={`0 0 ${w} ${h}`} className="mx-auto block h-auto w-full" style={{ maxWidth: w }} role="img" aria-label="Carries by yards gained">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={L} x2={w - R} y1={y(tick)} y2={y(tick)} stroke="var(--divider)" />
            <text x={L - 6} y={y(tick) + 3.5} textAnchor="end" fontSize="10" fill="var(--faint)" className="stat-num">{Math.round(tick * 100)}%</text>
          </g>
        ))}
        {data.bins.map((bin, index) => {
          const x0 = L + index * bw;
          const color = colorOf(index);
          return (
            <g key={bin} {...hoverProps(tip, <div><b className="text-fg">{bin} yards</b><div className="text-muted">{data.mine[index]} carries, {Math.round(mine[index] * 100)}%</div><div className="text-muted">Every {position}: {Math.round(league[index] * 100)}%</div></div>)}>
              <rect x={x0 + bw * 0.16} y={y(mine[index])} width={bw * 0.68} height={Math.max(0, y(0) - y(mine[index]))} rx="5" style={{ fill: mix(color, 34), stroke: mix(color, 60) }} />
              <line x1={x0 + bw * 0.08} x2={x0 + bw * 0.92} y1={y(league[index])} y2={y(league[index])} stroke="var(--fg)" strokeWidth="2.2" strokeLinecap="round" />
              <text x={x0 + bw / 2} y={h - B + 16} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="var(--faint)">{bin}</text>
            </g>
          );
        })}
      </svg>
      <ChartTooltip tip={tip} />
    </>
  );
}

export function RunEnds({ page }) {
  const { playerId, player, season, position } = page;
  const runs = usePlayerRuns(playerId, { season });
  const carries = usePlayerCarries(playerId, season);
  const data = runs.data;
  if (runs.isLoading) return <section className="glass-card h-[420px] animate-pulse p-5" />;
  if (!data?.carries) return null;
  const mine = shares(data.outcomes);
  const average = shares(data.average?.outcomes ?? sumOutcomes(data.average?.lanes));
  const bar = (source, name) => (
    <div className="my-1.5 grid grid-cols-[84px_minmax(0,1fr)] items-center gap-3">
      <span className="truncate text-[12.5px] font-bold text-fg">{name}</span>
      <div className="flex h-[30px] gap-1">
        {RUN_OUTCOMES.map((outcome) => (
          <div
            key={outcome.key}
            className="grid min-w-[4px] place-items-center overflow-hidden rounded-[9px] border"
            style={{ flex: `${source[outcome.key]} 0 0`, background: mix(outcome.color, 30), borderColor: mix(outcome.color, 55) }}
          >
            <span className="stat-num text-[11.5px] font-extrabold" style={{ color: mix(outcome.color, 45, "var(--fg)") }}>
              {source[outcome.key] >= 0.08 ? `${Math.round(source[outcome.key] * 100)}%` : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <Panel
      title="How runs end"
      sub={`${season} · ${data.carries} designed runs, ${Math.round((data.successes / data.carries) * 100)}% successful, ${data.first_downs} first downs`}
      className="h-full"
    >
      {bar(mine, lastName(player.name))}
      {bar(average, `Every ${position === "QB" ? "RB" : position}`)}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {RUN_OUTCOMES.map((outcome) => {
          const diff = mine[outcome.key] - average[outcome.key];
          const good = outcome.key === "stuffed" || outcome.key === "short" ? diff < 0 : diff > 0;
          return (
            <div key={outcome.key} className="rounded-xl px-2.5 py-2" style={{ borderTop: `3px solid ${outcome.color}`, background: "color-mix(in srgb, var(--fg) 4%, transparent)" }}>
              <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-faint">{outcome.label}</div>
              <div className="text-[10.5px] text-faint">{outcome.sub}</div>
              <div className="stat-num mt-1 text-[18px] font-extrabold text-fg">{Math.round(mine[outcome.key] * 100)}%</div>
              <div className="stat-num text-[11px] font-bold" style={{ color: Math.abs(diff) < 0.015 ? "var(--muted)" : good ? "var(--pos)" : "var(--neg)" }}>
                {diff >= 0 ? "+" : ""}{Math.round(diff * 100)} vs avg
              </div>
            </div>
          );
        })}
      </div>
      {carries.data?.available && carries.data.carries > 0 && <CarryHistogram data={carries.data} position={position === "QB" ? "RB" : position} />}
    </Panel>
  );
}

function sumOutcomes(lanes) {
  if (!lanes) return {};
  return RUN_OUTCOMES.reduce((out, outcome) => ({ ...out, [outcome.key]: lanes.reduce((sum, lane) => sum + (lane[outcome.key] ?? 0), 0) }), {});
}
