// Percentile strips (November 2026, option V3): each stat as a track from 0 to 100 with
// every player's face at their percentile, and the numbers at the end of the row.
//
// Two to five players, on Player Comparison and on the player page's Compare tab. With
// two, the row ends in both numbers, each in its player's colour and the better one bold
// (the radar's rule); with more, in the best number and whose it is. Faces that would
// overlap step above and below the track rather than hide each other.
//
// "Better" is the higher percentile: percentiles are direction-corrected on the server, so
// it is also right for interceptions and drops, and it compares players across seasons.
import { usePhone } from "../../hooks/useMediaQuery";
import { isAsIf } from "../../utils/qualifiers";
import { ChartTooltip, hoverProps, useChartTooltip } from "../explore/ChartTooltip";
import { ClipDef, SvgHeadshot, useClipId } from "../explore/SvgHeadshot";
import { teamText } from "../game/colors";
import { statText } from "./page/Radar";

const LANES = [0, -15, 15, -27, 27];

/**
 * @param stats   [{ id, label }]
 * @param players [{ key, name, short, color, headshot, row }]
 */
export function PercentileStrips({ stats, players, metrics }) {
  const phone = usePhone();
  const tip = useChartTooltip();
  const clipId = useClipId();
  const pair = players.length <= 2;
  const shown = stats.filter((stat) => players.some((player) => player.row?.percentiles?.[stat.id] != null));
  if (!shown.length) return <p className="py-10 text-center text-xs text-muted">No ranked stats to show.</p>;

  const width = phone ? 640 : 1100;
  const labelWidth = phone ? 104 : 150;
  const endWidth = phone ? 132 : 190;
  const rowHeight = players.length > 3 ? 76 : 60;
  const top = 26;
  const height = top + shown.length * rowHeight + 6;
  const x0 = labelWidth;
  const x1 = width - endWidth;
  const x = (percentile) => x0 + ((x1 - x0) * percentile) / 100;
  const faceR = players.length > 3 ? 11.5 : 13;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" style={{ minWidth: phone ? 560 : 760 }} role="img" aria-label="Percentile strips">
        <defs><ClipDef id={clipId} /></defs>
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line x1={x(tick)} x2={x(tick)} y1={top - 6} y2={height - 4} stroke="var(--divider)" />
            <text x={x(tick)} y={12} textAnchor="middle" fontSize="10" fill="var(--faint)" className="stat-num">{tick}</text>
          </g>
        ))}
        <text x={width - 8} y={12} textAnchor="end" fontSize="9.5" fontWeight="700" letterSpacing="1" fill="var(--faint)">
          {pair ? "NUMBERS" : `BEST OF THE ${players.length === 3 ? "THREE" : players.length === 4 ? "FOUR" : "FIVE"}`}
        </text>
        {shown.map((stat, index) => {
          const cy = top + index * rowHeight + rowHeight / 2;
          const placed = players
            .filter((player) => player.row?.percentiles?.[stat.id] != null)
            .map((player) => ({ player, percentile: player.row.percentiles[stat.id], px: x(player.row.percentiles[stat.id]), dy: 0 }))
            .sort((a, b) => a.px - b.px);
          // Each face takes the first lane (on the track, above, below) clear of those placed.
          placed.forEach((entry, at) => {
            entry.dy = LANES.find((dy) => placed.slice(0, at).every((other) => Math.hypot(other.px - entry.px, other.dy - dy) >= faceR * 2 - 1)) ?? 0;
          });
          const ranked = [...placed].sort((a, b) => b.percentile - a.percentile);
          const lead = ranked.length > 1 && ranked[0].percentile !== ranked[1].percentile ? ranked[0].player : null;
          const label = metrics?.[stat.id]?.label ?? stat.label;
          return (
            <g key={stat.id}>
              <rect x="0" y={cy - rowHeight / 2 + 2} width={width} height={rowHeight - 4} rx="10"
                fill={`color-mix(in srgb, var(--fg) ${index % 2 ? 2.5 : 4.5}%, transparent)`} />
              <line x1={x(0)} x2={x(100)} y1={cy} y2={cy} stroke="color-mix(in srgb, var(--fg) 10%, transparent)" strokeWidth="4" strokeLinecap="round" />
              <text x="12" y={cy + 4} fontSize={phone ? 11.5 : 12.5} fontWeight="650" fill="var(--fg)">{stat.label}</text>
              {placed.map(({ player, percentile, px, dy }) => {
                const open = isAsIf(player.row, stat.id);
                const content = (
                  <div>
                    <div className="font-semibold text-fg">{player.name}</div>
                    <div className="mt-1 text-muted">{label}: <b className="stat-num text-fg">{statText(metrics, stat.id, player.row?.[stat.id])}</b></div>
                    <div className="text-muted">{percentile} percentile{open ? ", as if qualified" : ""}</div>
                  </div>
                );
                return (
                  <g key={player.key} transform={`translate(${px.toFixed(1)},${(cy + dy).toFixed(1)})`} {...hoverProps(tip, content)}>
                    <SvgHeadshot url={player.headshot} name={player.name} r={faceR} ring={player.color} ringWidth={open ? 1.6 : 2.4} clipId={clipId} />
                    {open && <circle r={faceR + 3} fill="none" stroke={player.color} strokeWidth="1.4" strokeDasharray="3 2.2" />}
                  </g>
                );
              })}
              {pair ? (
                <text x={width - 12} y={cy + 4} textAnchor="end" fontSize="12.5" className="stat-num">
                  {players.map((player, which) => (
                    <tspan key={player.key}>
                      {which ? <tspan fill="var(--faint)" fontWeight="400"> · </tspan> : null}
                      <tspan style={{ fill: teamText(player.color) }} fontWeight={lead === player ? 800 : 500}>
                        {statText(metrics, stat.id, player.row?.[stat.id])}
                      </tspan>
                    </tspan>
                  ))}
                </text>
              ) : lead ? (
                <text x={width - 12} y={cy + 4} textAnchor="end" fontSize="12" fontWeight="750" className="stat-num" style={{ fill: teamText(lead.color) }}>
                  {lead.short} {statText(metrics, stat.id, lead.row?.[stat.id])}
                </text>
              ) : (
                <text x={width - 12} y={cy + 4} textAnchor="end" fontSize="12" fill="var(--faint)">Tie</text>
              )}
            </g>
          );
        })}
      </svg>
      <ChartTooltip tip={tip} />
    </div>
  );
}
