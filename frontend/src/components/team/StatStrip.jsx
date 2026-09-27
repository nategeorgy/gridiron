// All 32 teams on one line for one stat, with this team as a badge carrying its rank.
//
// Oriented so better is always to the right (a stat with no better direction puts the
// higher value on the right), so a row reads the same way whatever it measures. The
// other teams are small dots nudged apart vertically where they would overlap, and the
// line through the middle is the league average.
//
// `domain` fixes the scale (several strips sharing one axis); `raw` ignores direction.
import { useMemo } from "react";
import { formatTeamStat, rankSolid, rankStroke } from "../../utils/teamStats";

export function StatStrip({ values, team, better = 1, format, width = 230, height = 24, logos = null, domain = null, raw = false, gridTicks = null }) {
  const layout = useMemo(() => {
    const entries = Object.entries(values ?? {}).map(([abbreviation, [value, rank]]) => ({ abbreviation, value, rank }));
    if (!entries.length) return null;
    const dir = raw ? 1 : better === -1 ? -1 : 1;
    let lo = domain ? domain[0] : Math.min(...entries.map((e) => e.value));
    let hi = domain ? domain[1] : Math.max(...entries.map((e) => e.value));
    if (lo === hi) { lo -= 1; hi += 1; }
    if (!domain) { const pad = (hi - lo) * 0.05; lo -= pad; hi += pad; }
    const px = logos ? 14 : 11;
    const x = (v) => {
      const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
      return px + (dir === -1 ? 1 - t : t) * (width - 2 * px);
    };
    const cy = height / 2, r = logos ? 9 : 2.7, minD = logos ? 14 : 5.4, step = logos ? 6 : 2.9, room = cy - r - 1;
    const placed = [];
    for (const e of entries.map((entry) => ({ ...entry, x: x(entry.value) })).sort((a, b) => a.x - b.x)) {
      if (e.abbreviation === team) continue;
      let y = cy;
      for (let k = 0; k < 16; k += 1) {
        const offset = k === 0 ? 0 : Math.ceil(k / 2) * step * (k % 2 ? -1 : 1);
        if (Math.abs(offset) > room) continue;
        if (!placed.some((q) => Math.abs(q.x - e.x) < minD && Math.abs(q.y - (cy + offset)) < minD)) { y = cy + offset; break; }
      }
      placed.push({ ...e, y });
    }
    const mean = entries.reduce((sum, e) => sum + e.value, 0) / entries.length;
    return { entries, placed, x, cy, r, room, mean, me: entries.find((e) => e.abbreviation === team), n: entries.length };
  }, [values, team, better, width, height, logos, domain, raw]);

  if (!layout) return <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" />;
  const { placed, x, cy, r, room, mean, me, n } = layout;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full overflow-visible" role="img">
      {gridTicks
        ? gridTicks.map((t) => <line key={t} x1={x(t)} x2={x(t)} y1="1" y2={height - 1} stroke="var(--divider)" />)
        : <line x1={11} x2={width - 11} y1={cy} y2={cy} stroke="var(--divider)" />}
      <line x1={x(mean)} x2={x(mean)} y1={cy - room - 1} y2={cy + room + 1} stroke="var(--plot-rule)" strokeWidth="1.5" opacity="0.55">
        <title>League average {formatTeamStat(mean, format)}</title>
      </line>
      {placed.map((p) =>
        logos ? (
          <image key={p.abbreviation} href={logos[p.abbreviation]} x={p.x - r} y={p.y - r} width={2 * r} height={2 * r} opacity="0.78">
            <title>{`${p.abbreviation} ${formatTeamStat(p.value, format)}`}</title>
          </image>
        ) : (
          <circle key={p.abbreviation} cx={p.x} cy={p.y} r={r} fill="color-mix(in srgb, var(--fg) 26%, transparent)">
            <title>{`${p.abbreviation} ${formatTeamStat(p.value, format)}`}</title>
          </circle>
        ),
      )}
      {me && (
        logos ? (
          <g>
            <circle cx={x(me.value)} cy={cy} r={r + 5} fill="none" stroke="var(--accent)" strokeWidth="2" />
            <image href={logos[team]} x={x(me.value) - r - 3} y={cy - r - 3} width={2 * r + 6} height={2 * r + 6} />
          </g>
        ) : (
          <g>
            <circle cx={x(me.value)} cy={cy} r="9.5" fill={rankSolid(me.rank, n)} stroke={rankStroke(me.rank, n)} strokeWidth="1.4" />
            <text x={x(me.value)} y={cy + 3.4} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="var(--fg)">{me.rank}</text>
            <title>{`${team} ${formatTeamStat(me.value, format)}, rank ${me.rank} of ${n}`}</title>
          </g>
        )
      )}
    </svg>
  );
}
