// Career arc (rounds eight to ten, "Columns"): every game of his career as a dot, one
// column per season, on the game chart's stats and fixed axes. A bar marks his median
// game and a box the middle half of his games; the dashed line is that season's WR24 (or
// the position average), so a season sitting above it was a good one.
import { useMemo, useState } from "react";
import { usePhone } from "../../../hooks/useMediaQuery";
import { usePlayerCareerDetail } from "../../../hooks/usePlayer";
import { ChartTooltip, hoverProps, useChartTooltip } from "../../explore/ChartTooltip";
import { Chips, Legend } from "../../explore/common";
import { forPosition } from "../../../constants/playerPage";
import { GAME_CHART, combineGames, formatGameStat, gameStat, gameStatValue, lineMetrics, lineName } from "../../../constants/playerTabs";
import { Panel, clamp, lin } from "./common";

// One hue per season, cyan through violet, so neighbouring seasons read apart.
const shade = (index, count) => `oklch(0.7 0.15 ${Math.round(205 + (count === 1 ? 50 : (index / (count - 1)) * 95))})`;

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

/** Dots stacked sideways out from the column's centre as they collide. */
function swarm(items, r) {
  const placed = [];
  const gap = (2 * r + 0.8) ** 2;
  [...items].sort((a, b) => a.py - b.py).forEach((item) => {
    for (let k = 0; ; k += 1) {
      const dx = k === 0 ? 0 : Math.ceil(k / 2) * (r * 1.9) * (k % 2 ? 1 : -1);
      if (placed.every((p) => Math.abs(p.py - item.py) > 2 * r + 1 || (p.dx - dx) ** 2 + (p.py - item.py) ** 2 >= gap)) {
        item.dx = dx;
        placed.push(item);
        break;
      }
    }
  });
  return items;
}

export function CareerArc({ page }) {
  const { playerId, position, scoring, allGames, careerSeasons } = page;
  const phone = usePhone();
  const tip = useChartTooltip();
  const config = forPosition(GAME_CHART, position);
  const [statKey, setStatKey] = useState("ppg");
  const key = config.stats.includes(statKey) ? statKey : "ppg";
  const stat = gameStat(position, key);
  const kind = config.lines[key];
  const F = (value) => formatGameStat(stat, value);
  const detail = usePlayerCareerDetail(playerId, scoring, { lines: lineMetrics(position), lineRank: config.rank });
  const refs = useMemo(() => {
    const out = {};
    for (const entry of detail.data?.data ?? []) out[entry.season] = entry.lines?.[stat.metric]?.[kind] ?? null;
    return out;
  }, [detail.data, stat.metric, kind]);
  const teamOf = Object.fromEntries(careerSeasons.map((entry) => [entry.season, entry.team_abbreviation]));

  const columns = useMemo(() => {
    const seasons = [...new Set(allGames.filter((game) => game.season_type === "REG").map((game) => game.season))].sort();
    return seasons
      .map((season) => {
        const games = allGames.filter((game) => game.season === season && game.season_type === "REG").sort((a, b) => a.week - b.week);
        return { season, all: games, games: games.map((game) => ({ game, v: gameStatValue(stat, game) })).filter((entry) => entry.v != null && Number.isFinite(entry.v)) };
      })
      .filter((column) => column.games.length);
  }, [allGames, stat]);

  const n = columns.length;
  const w = phone ? 440 : 1040;
  const h = phone ? 360 : 420;
  const L = 46, R = phone ? 12 : 70, T = 46, B = 54;
  const colW = (w - L - R) / Math.max(1, n);
  const [d0, d1] = stat.axis;
  const y = lin(d0, d1, h - B, T);
  const yc = (value) => clamp(y(value), T, h - B);

  // The largest dot that keeps every season's swarm inside its column.
  let r = phone ? 4.2 : 6.6;
  for (; r > 2; r -= 0.3) {
    columns.forEach((column) => { column.dots = swarm(column.games.map((entry) => ({ ...entry, py: yc(entry.v) })), r); });
    if (columns.every((column) => Math.max(...column.dots.map((dot) => Math.abs(dot.dx))) + r <= colW * 0.44)) break;
  }
  const last = columns[columns.length - 1];
  const lastRef = last ? refs[last.season] : null;

  return (
    <Panel title="Career arc" sub="Every career game, a column per season: the median game, and a box around the middle half of the games. Hover a dot for the game">
      <div className="mb-3">
        <Chips options={config.stats.map((id) => ({ value: id, label: gameStat(position, id).pill }))} value={key} onChange={setStatKey} label="Stat" />
      </div>
      {!n ? (
        <p className="py-10 text-center text-sm text-muted">No games with {stat.label.toLowerCase()}.</p>
      ) : (
        <svg viewBox={`0 0 ${w} ${h}`} className="block h-auto w-full" role="img" aria-label="Career arc">
          {stat.ticks.map((tick) => (
            <g key={tick}>
              <line x1={L} x2={w - R} y1={y(tick)} y2={y(tick)} stroke="var(--divider)" />
              <text x={L - 8} y={y(tick) + 3.5} textAnchor="end" fontSize="10" fill="var(--faint)" className="stat-num">{F(tick).replace(/\.0+$/, "")}</text>
            </g>
          ))}
          {d0 < 0 && d1 > 0 && <line x1={L} x2={w - R} y1={y(0)} y2={y(0)} stroke="var(--plot-rule)" strokeOpacity="0.45" />}
          {columns.map((column, index) => {
            const cx = L + colW * (index + 0.5);
            const color = shade(index, n);
            const values = column.games.map((entry) => entry.v).sort((a, b) => a - b);
            const q1 = quantile(values, 0.25);
            const md = quantile(values, 0.5);
            const q3 = quantile(values, 0.75);
            const spread = Math.max(...column.dots.map((dot) => Math.abs(dot.dx))) + r;
            const bw = Math.min(colW * 0.86, Math.max(spread * 2 + 14, 36));
            const seasonValue = combineGames(stat, column.all);
            const ref = refs[column.season];
            const top = yc(q3);
            const bottom = yc(q1);
            return (
              <g key={column.season}>
                {index > 0 && <line x1={L + colW * index} x2={L + colW * index} y1={T - 30} y2={h - B + 46} stroke="var(--divider)" strokeOpacity="0.5" />}
                {ref != null && (
                  <line x1={cx - colW * 0.46} x2={cx + colW * 0.46} y1={yc(ref)} y2={yc(ref)} stroke="var(--muted)" strokeOpacity="0.85" strokeDasharray="6 4" strokeWidth="1.4" />
                )}
                <rect
                  x={cx - bw / 2} y={top} width={bw} height={Math.max(2, bottom - top)} rx="9"
                  style={{ fill: color, stroke: color }} fillOpacity="0.16" strokeOpacity="0.45"
                  {...hoverProps(tip, (
                    <div>
                      <b className="text-fg">{column.season}</b>
                      <div className="text-muted">Median game {F(md)}</div>
                      <div className="text-muted">Middle half {F(q1)} to {F(q3)}</div>
                      <div className="text-muted">Season {F(seasonValue)} over {column.games.length} games</div>
                    </div>
                  ))}
                />
                {column.dots.map((dot) => {
                  const px = cx + dot.dx;
                  const over = dot.v > d1 ? 1 : dot.v < d0 ? -1 : 0;
                  const content = (
                    <div>
                      <b className="text-fg">{column.season} Week {dot.game.week}{dot.game.opponent_abbreviation ? ` vs ${dot.game.opponent_abbreviation}` : ""}</b>
                      <div className="text-muted">{F(dot.v)}{key === "ppg" ? " points" : ""}{key === "ppg" && dot.game.position_rank ? `, ${position}${dot.game.position_rank}` : ""}</div>
                    </div>
                  );
                  if (over) {
                    const ey = over > 0 ? T - 4 : h - B + 4;
                    return <path key={dot.game.game_id} d={`M${px - r},${ey + over * r * 1.4}L${px + r},${ey + over * r * 1.4}L${px},${ey}Z`} style={{ fill: color }} {...hoverProps(tip, content)} />;
                  }
                  return <circle key={dot.game.game_id} cx={px} cy={dot.py} r={r} style={{ fill: color }} fillOpacity="0.88" stroke="var(--surface-solid)" strokeWidth="1" {...hoverProps(tip, content)} />;
                })}
                <line x1={cx - bw / 2 + 2} x2={cx + bw / 2 - 2} y1={yc(md)} y2={yc(md)} stroke="var(--fg)" strokeWidth="3.2" strokeLinecap="round" pointerEvents="none" />
                <text x={cx} y={T - 22} textAnchor="middle" fontSize={phone ? 11 : 13} fontWeight="800" className="stat-num" style={{ fill: color }}>{F(md)}</text>
                <text x={cx} y={T - 9} textAnchor="middle" fontSize="9" fill="var(--faint)">median</text>
                <text x={cx} y={h - B + 20} textAnchor="middle" fontSize={phone ? 10.5 : 12} fontWeight="800" fill="var(--fg)" className="stat-num">
                  {phone ? `'${String(column.season).slice(2)}` : column.season}
                </text>
                {!phone && (
                  <text x={cx} y={h - B + 38} textAnchor="middle" fontSize="10" fill="var(--faint)" className="stat-num">
                    {teamOf[column.season] ? `${teamOf[column.season]} · ` : ""}{column.games.length} G
                  </text>
                )}
              </g>
            );
          })}
          {lastRef != null && !phone && (
            <text x={w - R + 8} y={yc(lastRef) + 3.5} fontSize="10.5" fontWeight="700" fill="var(--muted)" className="stat-num">
              {lineName(position, kind, config.rank, true)} {F(lastRef)}
            </text>
          )}
        </svg>
      )}
      <ChartTooltip tip={tip} />
      <Legend items={[{ key: "dot", color: shade(0, 2), label: "One game, a colour per season", round: true }]}>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-[3px] w-4 rounded" style={{ background: "var(--fg)" }} />Median game</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-3 w-4 rounded" style={{ background: "color-mix(in srgb, var(--fg) 14%, transparent)" }} />Middle half of games</span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block w-[18px] border-t-[1.5px] border-dashed" style={{ borderColor: "var(--muted)" }} />
          {lineName(position, kind, config.rank)} that season
        </span>
      </Legend>
    </Panel>
  );
}
