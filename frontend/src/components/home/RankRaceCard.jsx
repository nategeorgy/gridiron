// Rank Race (November 2026, replacing Floor and Ceiling): a position's leaders in season
// points, and where each one ranked after every week, as a bump chart.
//
// Picked from the Highlighted Viz mockups (https://claude.ai/artifact/JwXNiAPFvEZK37dUiuG4gY,
// option 6). Two lines tell the story on their own, with no sentence written over them:
// whoever has led longest (accent) and whoever has climbed furthest (blue). Hovering or
// tapping any other line follows him, and clicking keeps him in the spotlight until clicked
// again or the position changes.
//
// A week's rank counts everyone at the position who had played by then, not only the ten
// drawn (`app/rank_race.py`), so "WR87 in Week 3" is a real rank. Ranks past 24 sit on the
// "25+" row with the number still printed. The finish bands (`FINISH_BANDS`) are the grid
// lines, so WR12 and WR24 read as the lines a manager already thinks in.
//
// The chart draws at its measured width (`useElementWidth`), like the featured game cards,
// so it reads in the wide column at any width and on a phone.
import { useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Card, CardHead, CardLink, CardState, Tabs } from "./primitives";
import { FINISH_BANDS } from "../player/FinishChip";
import { useElementWidth } from "../../hooks/useElementWidth";
import { scoringLabel } from "../../constants/scoring";
import { formatStat } from "../../utils/format";
import { lastName } from "../../utils/explore";

export const RACE_POSITIONS = ["QB", "RB", "WR", "TE"];
export const RACE_LIMIT = 10;
const TABS = RACE_POSITIONS.map((value) => ({ value, label: value }));
const CAP = 25; // ranks past 24 share the bottom row
const HEIGHT = 430;
const LEADER = "var(--accent)";
const CLIMBER = "var(--series-1)";

/** Who has led since when, and who climbed furthest (worst rank before the last three weeks to now). */
export function raceStory(rows, weeks) {
  if (!rows.length || !weeks.length) return { leader: null, since: null, climb: null };
  const last = weeks.length - 1;
  const leader = rows[0];
  let since = last;
  while (since > 0 && leader.ranks[since - 1] === 1) since -= 1;
  const climb = rows.slice(1).map((row) => {
    const early = row.ranks.slice(0, Math.max(1, last - 2)).filter((rank) => rank != null);
    const worst = early.length ? Math.max(...early) : row.ranks[last];
    return { row, worst, week: weeks[row.ranks.indexOf(worst)], gain: worst - row.ranks[last] };
  }).sort((a, b) => b.gain - a.gain)[0];
  return { leader, since: weeks[since], climb: climb && climb.gain > 0 ? climb : null };
}

/** A smooth step between weeks: the line leaves each rank flat and arrives flat. */
function bumpPath(points) {
  return points.map(([x, y], i) => {
    if (!i) return `M${x},${y}`;
    const [px, py] = points[i - 1];
    const mid = (px + x) / 2;
    return `C${mid},${py} ${mid},${y} ${x},${y}`;
  }).join(" ");
}

function Chart({ rows, weeks, position, story, focusId, onHover, onPick, width }) {
  const clip = useId().replace(/:/g, "");
  const phone = width < 560;
  const m = { l: 42, r: phone ? 112 : 200, t: 12, b: 28 };
  const last = weeks.length - 1;
  const x = (i) => m.l + 12 + (last ? (i / last) * (width - m.r - m.l - 12) : 0);
  const y = (rank) => m.t + ((Math.min(rank, CAP) - 1) / (CAP - 1)) * (HEIGHT - m.t - m.b);
  const dotR = phone ? 6 : 8.5;

  const colorOf = (row) => (row === story.leader ? LEADER : row === story.climb?.row ? CLIMBER : "var(--muted)");
  const isStory = (row) => row === story.leader || row === story.climb?.row;
  const focus = rows.find((row) => row.player_id === focusId) || null;
  const opacity = (row) => (focus ? (row === focus ? 1 : 0.14) : isStory(row) ? 1 : 0.45);
  const stroke = (row) => (focus === row ? (isStory(row) ? colorOf(row) : "var(--fg)") : colorOf(row));

  // End labels, spaced so they never overlap, each tied back to its last dot.
  const ends = rows.map((row) => ({ row, ay: y(row.ranks[last] ?? CAP) })).sort((a, b) => a.ay - b.ay);
  const gap = Math.min(40, (HEIGHT - m.t - m.b + 20) / Math.max(1, ends.length));
  ends.forEach((end, i) => { end.y = Math.max(end.ay, i ? ends[i - 1].y + gap : m.t); });
  const over = ends.length ? ends[ends.length - 1].y - (HEIGHT - m.b) : 0;
  if (over > 0) ends.forEach((end) => { end.y -= over; });
  for (let i = ends.length - 2; i >= 0; i -= 1) ends[i].y = Math.min(ends[i].y, ends[i + 1].y - gap);
  const faceR = Math.min(phone ? 11 : 14, gap / 2 - 2);
  const lx = width - m.r + (phone ? 34 : 44);

  // Story lines draw last, and the focused line over everything.
  const order = [...rows].sort((a, b) => (a === focus) - (b === focus) || isStory(a) - isStory(b));
  const bands = [1, ...(FINISH_BANDS[position] || []).filter((band) => band < CAP)];

  return (
    <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} role="img" className="block overflow-visible"
      aria-label={`${position} rank in season points after every week`} onMouseLeave={() => onHover(null)}>
      {bands.map((band) => (
        <g key={band}>
          <line x1={m.l} x2={width - m.r + 14} y1={y(band)} y2={y(band)} stroke="var(--divider)" />
          <text x={m.l - 8} y={y(band)} dy="0.35em" textAnchor="end" className="stat-num" fontSize="10" fill="var(--faint)">{position}{band}</text>
        </g>
      ))}
      <rect x={m.l} y={y(CAP) - 10} width={width - m.r + 14 - m.l} height={20} rx={6} fill="color-mix(in srgb, var(--surface-2) 70%, transparent)" />
      <text x={m.l - 8} y={y(CAP)} dy="0.35em" textAnchor="end" className="stat-num" fontSize="10" fill="var(--faint)">{CAP}+</text>
      {weeks.map((week, i) => (
        <text key={week} x={x(i)} y={HEIGHT - 6} textAnchor="middle" className="stat-num" fontSize="10" fill="var(--faint)">W{week}</text>
      ))}

      {order.map((row) => {
        const points = row.ranks.map((rank, i) => (rank == null ? null : [x(i), y(rank)])).filter(Boolean);
        const color = stroke(row);
        const strong = isStory(row) || focus === row;
        return (
          <g key={row.player_id} opacity={opacity(row)} style={{ transition: "opacity 150ms" }}>
            <path d={bumpPath(points)} fill="none" stroke={color} strokeWidth={strong ? 2.6 : 1.6} strokeLinecap="round" />
            {row.ranks.map((rank, i) => (rank == null ? null : (
              <g key={i}>
                <circle cx={x(i)} cy={y(rank)} r={strong ? dotR : dotR - 1.5} fill="var(--surface-solid)" stroke={color}
                  strokeWidth={strong ? 2 : 1.3} strokeDasharray={rank >= CAP ? "2 2" : undefined} />
                {!phone && (
                  <text x={x(i)} y={y(rank)} dy="0.35em" textAnchor="middle" className="stat-num"
                    fontSize={rank > 99 ? 6.5 : strong ? 8.5 : 7.5} fontWeight="700" fill={strong ? "var(--fg)" : "var(--muted)"}>
                    {rank}
                  </text>
                )}
              </g>
            )))}
            {/* A wide invisible stroke so a thin line is easy to hover. */}
            <path d={bumpPath(points)} fill="none" stroke="transparent" strokeWidth={14} className="cursor-pointer"
              onMouseEnter={() => onHover(row.player_id)} onClick={() => onPick(row.player_id)} />
          </g>
        );
      })}

      {ends.map(({ row, ay, y: ly }) => {
        const color = stroke(row);
        return (
          <g key={row.player_id} opacity={focus && focus !== row ? 0.35 : 1} className="cursor-pointer"
            onMouseEnter={() => onHover(row.player_id)} onClick={() => onPick(row.player_id)}>
            <path d={`M${x(last) + dotR + 2},${ay} C${x(last) + 22},${ay} ${lx - faceR - 18},${ly} ${lx - faceR - 3},${ly}`}
              fill="none" stroke={color} strokeWidth="1" opacity="0.7" />
            <clipPath id={`${clip}-${row.player_id}`}><circle cx={lx} cy={ly} r={faceR} /></clipPath>
            <circle cx={lx} cy={ly} r={faceR + 1} fill="var(--surface-2)" stroke={color} strokeWidth={isStory(row) || focus === row ? 2 : 1.2} />
            {row.headshot_url && (
              <image href={row.headshot_url} x={lx - faceR} y={ly - faceR} width={faceR * 2} height={faceR * 2}
                clipPath={`url(#${clip}-${row.player_id})`} preserveAspectRatio="xMidYMid slice" />
            )}
            <text x={lx + faceR + 7} y={ly - (phone ? 0 : 2)} dy={phone ? "0.35em" : 0} fontSize={phone ? 10.5 : 12} fontWeight="650" fill="var(--fg)">
              {phone ? lastName(row.name) : row.name}
            </text>
            {!phone && (
              <text x={lx + faceR + 7} y={ly + 11} fontSize="10" className="stat-num" fill="var(--muted)">
                {formatStat(row.fantasy_points, 1)} pts · {row.team}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * @param result   the `/stats/rank-race` response for `position`
 */
export function RankRaceCard({ season, scoring, position, onPositionChange, result, isLoading, isError }) {
  const [ref, width] = useElementWidth();
  const [hover, setHover] = useState(null);
  const [spot, setSpot] = useState(null); // { position, id }: a click keeps a player in focus
  const rows = useMemo(() => result?.data ?? [], [result]);
  const weeks = result?.weeks ?? [];
  const story = useMemo(() => raceStory(rows, weeks), [rows, weeks]);
  const spotId = spot?.position === position ? spot.id : null;
  const focusId = hover ?? spotId;
  const focus = rows.find((row) => row.player_id === focusId) || null;
  const ready = rows.length > 0 && weeks.length > 0;

  return (
    <Card>
      <CardHead title="Rank Race" sub={`${season} · ${scoringLabel(scoring)} · rank in season points after every week`}>
        <Tabs options={TABS} value={position} onChange={(next) => { setSpot(null); onPositionChange(next); }} label="Position" />
      </CardHead>

      <CardState isLoading={isLoading} isError={isError} isEmpty={!ready} empty="No games yet this season." rows={8} />
      <div ref={ref} className="min-w-0">
        {ready && width > 0 && (
          <Chart rows={rows} weeks={weeks} position={position} story={story} focusId={focusId} width={width}
            onHover={setHover} onPick={(id) => setSpot((now) => (now?.id === id && now.position === position ? null : { position, id }))} />
        )}
      </div>
      {ready && (
        <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
          The top {rows.length} now. Click a line to follow it{spotId ? <>; <Link to={`/players/${spotId}`} className="font-semibold text-muted hover:text-accent">open {lastName(focus?.name ?? "")}&apos;s page</Link></> : ""}.
        </p>
      )}
      <CardLink to={`/leaderboards/fantasy${position === "QB" ? "?positions=QB" : `?positions=${position}`}`}>Fantasy leaderboard</CardLink>
    </Card>
  );
}
