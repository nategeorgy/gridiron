// Where an offense throws, drawn on a field: one band per depth downfield, coloured by
// how often the team throws there against the league (green is the most). Each band
// carries the share of throws, and EPA per attempt with its own rank.
import { PASS_DEPTHS } from "../../constants/teamStats";
import { ordinal } from "../../utils/format";
import { useElementWidth } from "../../hooks/useElementWidth";
import { formatTeamStat, rankFill, rankStroke, rankText } from "../../utils/teamStats";

const MONO = "'JetBrains Mono', monospace";

// Downfield is up. Piecewise so the five-yard band behind the line still has room.
const BREAKS = [[35, 0], [20, 112], [10, 204], [0, 296], [-5, 360]];
function fieldY(top) {
  return (yards) => {
    for (let i = 1; i < BREAKS.length; i += 1) {
      const [a, ya] = BREAKS[i - 1], [b, yb] = BREAKS[i];
      if (yards >= b) return top + ya + ((a - yards) / (a - b)) * (yb - ya);
    }
    return top + 360;
  };
}

// The field is drawn at its card's own width, so its labels keep their size: a fixed
// 460-wide box scaled into a game page's quarter-width card set them at 7 to 11px. Below
// COMPACT the labels stack down each band instead of running across it. Wider than WIDE
// (a team page's half-width card) the box scales up as it always did.
const WIDE = 460, NARROW = 300, COMPACT = 440;

function Band({ zone, row, top, bottom, x0, x1, maxShare, compact }) {
  const h = bottom - top;
  const barWidth = x1 - x0 - 32, barY = bottom - 10;
  const shareText = formatTeamStat(row.share, "pct1");
  const epaText = formatTeamStat(row.epa, "sgn2");
  const left = x0 + 14, right = x1 - 14;
  const ty = h > 50 ? top + h / 2 - 6 : top + h / 2 - 2;   // the wide layout's first line
  return (
    <g>
      <rect x={x0 + 3} y={top + 3} width={x1 - x0 - 6} height={h - 6} rx="8" fill={rankFill(row.share_rank, row.share_teams, 38)} stroke={rankStroke(row.share_rank, row.share_teams)} strokeOpacity="0.5">
        <title>{`${zone.name}: ${row.plays} throws, ${formatTeamStat(row.share, "pct1")} of throws (${ordinal(row.share_rank)} most), ${formatTeamStat(row.completions, "pct1")} completed, ${formatTeamStat(row.epa, "sgn2")} EPA per attempt`}</title>
      </rect>
      {compact ? (
        <>
          <text x={left} y={top + 17} fontSize="13" fontWeight="700" fill="var(--fg)">{zone.name}</text>
          <text x={left} y={top + 31} fontSize="11" fill="var(--muted)">{zone.range}</text>
          <text x={right} y={top + 17} textAnchor="end" fontSize="14" fontWeight="700" fill="var(--fg)" fontFamily={MONO}>{shareText}</text>
          <text x={right} y={top + 31} textAnchor="end" fontSize="11" fill="var(--muted)">{`of throws · ${ordinal(row.share_rank)}`}</text>
          <text x={right} y={Math.min(top + 50, bottom - 17)} textAnchor="end" fontSize="11" fill="var(--muted)">
            <tspan fontSize="12.5" fontWeight="700" fontFamily={MONO} fill={rankText(row.epa_rank, row.epa_teams)}>{epaText}</tspan>
            {` EPA/att${row.epa_rank ? ` · ${ordinal(row.epa_rank)}` : ""}`}
          </text>
        </>
      ) : (
        <>
          <text x={left + 2} y={ty} fontSize="13" fontWeight="700" fill="var(--fg)">{zone.name}</text>
          <text x={left + 2} y={ty + 15} fontSize="11" fill="var(--muted)">{zone.range}</text>
          <text x={(x0 + x1) / 2 + 6} y={ty} textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--fg)" fontFamily={MONO}>{shareText}</text>
          <text x={(x0 + x1) / 2 + 6} y={ty + 15} textAnchor="middle" fontSize="11" fill="var(--muted)">{`of throws · ${ordinal(row.share_rank)} · lg ${formatTeamStat(row.league_share, "pct1")}`}</text>
          <text x={right - 2} y={ty} textAnchor="end" fontSize="13" fontWeight="700" fill={rankText(row.epa_rank, row.epa_teams)} fontFamily={MONO}>{epaText}</text>
          <text x={right - 2} y={ty + 15} textAnchor="end" fontSize="11" fill="var(--muted)">{`EPA/att${row.epa_rank ? ` · ${ordinal(row.epa_rank)}` : ""}`}</text>
        </>
      )}
      <rect x={x0 + 16} y={barY} width={barWidth} height="3" rx="1.5" fill="color-mix(in srgb, var(--fg) 10%, transparent)" />
      <rect x={x0 + 16} y={barY} width={barWidth * ((row.share ?? 0) / maxShare)} height="3" rx="1.5" fill="color-mix(in srgb, var(--fg) 55%, transparent)" />
      <rect x={x0 + 16 + barWidth * ((row.league_share ?? 0) / maxShare) - 1} y={barY - 3} width="2" height="9" fill="var(--plot-rule)" />
    </g>
  );
}

export function PassDepthField({ depth, weeksLabel }) {
  const [frame, measured] = useElementWidth();
  const byKey = Object.fromEntries((depth ?? []).map((row) => [row.key, row]));
  const W = Math.max(NARROW, Math.min(WIDE, measured || WIDE));
  const compact = W < COMPACT;
  const H = 380, x0 = 44, x1 = W - 8, Y = fieldY(10);
  const maxShare = Math.max(...(depth ?? []).map((row) => Math.max(row.share ?? 0, row.league_share ?? 0)), 0.01);
  const lines = [];
  for (let yards = -5; yards <= 35; yards += 5) lines.push(yards);
  return (
    <section className="glass-card p-4">
      <h2 className="text-[15px] font-semibold tracking-tight text-fg">Passing by depth</h2>
      <p className="mb-2 text-[11.5px] text-faint">{weeksLabel}</p>
      <div ref={frame}>
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Passing by depth on a field">
          <rect x={x0} y={Y(35)} width={x1 - x0} height={Y(-5) - Y(35)} rx="10" fill="color-mix(in srgb, var(--series-3) 12%, transparent)" />
          {lines.map((yards) => (
            <line key={yards} x1={x0} x2={x1} y1={Y(yards)} y2={Y(yards)} stroke={`color-mix(in srgb, var(--fg) ${yards % 10 === 0 ? 14 : 7}%, transparent)`} />
          ))}
          {[0, 10, 20, 30].map((yards) => (
            <text key={yards} x={x0 - 8} y={Y(yards) + 3} textAnchor="end" fontSize="10.5" fontWeight={yards === 0 ? 700 : 500} fill={yards === 0 ? "var(--accent)" : "var(--muted)"}>{yards === 0 ? "LOS" : `+${yards}`}</text>
          ))}
          {PASS_DEPTHS.map((zone) => {
            const row = byKey[zone.key];
            if (!row) return null;
            return <Band key={zone.key} zone={zone} row={row} top={Y(zone.to)} bottom={Y(zone.from)} x0={x0} x1={x1} maxShare={maxShare} compact={compact} />;
          })}
          <line x1={x0} x2={x1} y1={Y(0)} y2={Y(0)} stroke="var(--accent)" strokeWidth="2" opacity="0.75" />
        </svg>
      </div>
      <p className="mt-1 text-[11px] text-faint">Color represents how often they throw to that depth, green is more often, red is less often (compared to league average). EPA data on throws to that depth on the right.</p>
    </section>
  );
}
