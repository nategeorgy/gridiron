// This season against last (round ten, "Both"): the two seasons' percentile profiles on
// one radar, and each stat as an arrow from last season's percentile to this one's, in the
// style of the tweet kit's risers and fallers card (C5): an open dot where he was and the
// arrowhead where he is, green for a rise and red for a fall. Beside it, the stat itself
// last season to this one, and the change in percentile points as a pill.
import { isAsIf } from "../../../utils/qualifiers";
import { ChartTooltip, useChartTooltip } from "../../explore/ChartTooltip";
import { Legend } from "../../explore/common";
import { forPosition } from "../../../constants/playerPage";
import { RADAR_STATS } from "../../../constants/playerTabs";
import { positionName } from "../cardParts";
import { PercentileRadar } from "./Radar";
import { statText } from "./CareerProfile";
import { Panel, lin, mix } from "./common";
import { useElementWidth } from "../../../hooks/useElementWidth";

const NOW = "var(--series-1)";
const THEN = "var(--series-2)";
const UP = "var(--pos)";
const DOWN = "var(--neg)";

/** Monospace text width at a font size, near enough for laying out a column. */
const monoWidth = (text, size) => text.length * size * 0.62;

/** The change as a tinted pill: up, down or level. */
function ChangePill({ cx, cy, change }) {
  const tone = change > 0 ? UP : change < 0 ? DOWN : null;
  const text = change > 0 ? `▲ ${change}` : change < 0 ? `▼ ${-change}` : "= 0";
  return (
    <g>
      <rect x={cx - 23} y={cy - 10} width="46" height="20" rx="6" fill={tone ? mix(tone, 16) : "color-mix(in srgb, var(--fg) 7%, transparent)"} />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="11" fontWeight="800" className="stat-num" fill={tone ? mix(tone, 72, "var(--fg)") : "var(--muted)"}>{text}</text>
    </g>
  );
}

/**
 * Each stat's percentile last season to this one, drawn like the risers and fallers card:
 * an open dot for last season, a line to this season with the arrowhead as its end. Each
 * stat is a band, the rows striped. Then the stat itself, last season to this one, and the
 * change in percentile points.
 */
function Arrows({ stats, now, then, metrics }) {
  const [ref, width] = useElementWidth();
  const rows = stats.filter((stat) => now.percentiles?.[stat.id] != null && then.percentiles?.[stat.id] != null);
  const raw = (stat) => [statText(metrics[stat.id], stat.id, then[stat.id]), statText(metrics[stat.id], stat.id, now[stat.id])];
  const narrow = width < 520;
  const labelW = narrow ? 104 : 124;
  const rawW = narrow ? 0 : Math.min(140, Math.max(78, ...rows.map((stat) => monoWidth(raw(stat).join(" → "), 11))) + 8);
  const pillW = 56;
  const rowH = narrow ? 42 : 36;
  const head = 24;
  const h = head + rows.length * rowH + 4;
  const x0 = labelW + 18;
  const x1 = width - pillW - rawW - 26;
  const x = lin(0, 100, x0, x1);

  return (
    <div ref={ref} className="min-w-0">
      {width > 0 && (
        <svg width={width} height={h} viewBox={`0 0 ${width} ${h}`} className="block" role="img" aria-label="Percentile change">
          {[0, 25, 50, 75, 100].map((tick) => (
            <g key={tick}>
              <line x1={x(tick)} x2={x(tick)} y1={head - 2} y2={h - 2} stroke="var(--divider)" />
              <text x={x(tick)} y={12} textAnchor="middle" fontSize="10" fill="var(--faint)" className="stat-num">{tick}</text>
            </g>
          ))}
          {!narrow && (
            <text x={width - pillW - 16} y={12} textAnchor="end" fontSize="9.5" fontWeight="700" fill="var(--faint)" letterSpacing="0.06em">
              {then.season} {"→"} {now.season}
            </text>
          )}
          <text x={width - pillW / 2 - 6} y={12} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="var(--faint)" letterSpacing="0.06em">CHANGE</text>
          {rows.map((stat, index) => {
            const a = then.percentiles[stat.id];
            const b = now.percentiles[stat.id];
            const change = b - a;
            const dir = Math.sign(change);
            const cy = head + index * rowH + rowH / 2;
            const xa = x(a);
            // A move too short to draw still gets a visible arrow; the numbers say how far.
            const xb = dir === 0 ? xa : Math.abs(x(b) - xa) >= 18 ? x(b) : xa + dir * 18;
            const tone = dir > 0 ? UP : DOWN;
            const ink = mix(tone, 80, "var(--fg)");
            const [rawThen, rawNow] = raw(stat);
            const asIf = (row) => (isAsIf(row, stat.id) ? ", as if qualified" : "");
            const hover = `${stat.label}: ${then.season} ${rawThen} (${a} percentile${asIf(then)}), ${now.season} ${rawNow} (${b} percentile${asIf(now)})`;
            return (
              <g key={stat.id}>
                <title>{hover}</title>
                <rect x="0" y={cy - rowH / 2 + 1.5} width={width} height={rowH - 3} rx="9" fill={`color-mix(in srgb, var(--fg) ${index % 2 ? 2.5 : 4.5}%, transparent)`} />
                <line x1={x(0)} x2={x(100)} y1={cy} y2={cy} stroke="color-mix(in srgb, var(--fg) 9%, transparent)" strokeWidth="4" strokeLinecap="round" />
                <text x={12} y={narrow ? cy - 2 : cy + 4} fontSize="12" fontWeight="650" fill="var(--fg)">{stat.label}</text>
                {narrow && (
                  <text x={12} y={cy + 12} fontSize="10" className="stat-num" fill="var(--faint)">
                    {rawThen} {"→"} <tspan fill="var(--fg)" fontWeight="700">{rawNow}</tspan>
                  </text>
                )}
                {dir !== 0 && (
                  <>
                    <line x1={xa} x2={xb - dir * 8} y1={cy} y2={cy} stroke={ink} strokeWidth="3" strokeLinecap="round" />
                    <path d={`M${xb},${cy}L${xb - dir * 11},${cy - 6.5}L${xb - dir * 11},${cy + 6.5}Z`} fill={ink} />
                    <circle cx={xa} cy={cy} r="4.8" fill="var(--surface-solid)" stroke="var(--muted)" strokeWidth="2.2" />
                  </>
                )}
                {dir === 0 && (
                  <>
                    <circle cx={xa} cy={cy} r="5" fill="var(--muted)" />
                  </>
                )}
                {!narrow && (
                  <text x={width - pillW - 16} y={cy + 4} textAnchor="end" fontSize="11" className="stat-num" fill="var(--faint)">
                    {rawThen} {"→"} <tspan fill="var(--fg)" fontWeight="700">{rawNow}</tspan>
                  </text>
                )}
                <ChangePill cx={width - pillW / 2 - 6} cy={cy} change={change} />
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

export function VsLastSeason({ page, detail }) {
  const { position, metrics, season, player } = page;
  const tip = useChartTooltip();
  const seasons = detail.data?.data ?? [];
  const now = seasons.find((entry) => entry.season === season);
  const then = seasons.find((entry) => entry.season < season);
  if (detail.isLoading) return <section className="glass-card h-96 animate-pulse" />;
  if (!now || !then) return null;
  const stats = forPosition(RADAR_STATS, position);
  return (
    <Panel
      title={`${now.season} against ${then.season}`}
      sub={`The radar for the shape, the arrows beside it for the detail. Percentiles among qualified ${positionName(position)}; hover any stat for both seasons`}
    >
      <div className="grid items-center gap-x-6 gap-y-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <PercentileRadar
          stats={stats}
          players={[
            { name: `${player.name} ${now.season}`, color: NOW, row: now },
            { name: `${player.name} ${then.season}`, color: THEN, row: then },
          ]}
          metrics={metrics}
          tip={tip}
          width={500}
          height={420}
          radius={130}
        />
        <Arrows stats={stats} now={now} then={then} metrics={metrics} />
      </div>
      <ChartTooltip tip={tip} />
      <Legend items={[
        { key: "then", color: THEN, label: String(then.season), round: true },
        { key: "now", color: NOW, label: String(now.season), round: true },
      ]}>
        <span className="inline-flex items-center gap-1.5" style={{ color: "var(--pos)" }}>▶ Better</span>
        <span className="inline-flex items-center gap-1.5" style={{ color: "var(--neg)" }}>◀ Worse</span>
      </Legend>
    </Panel>
  );
}
