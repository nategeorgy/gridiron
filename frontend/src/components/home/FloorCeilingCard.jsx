// Floor and Ceiling (October 2026, replacing Expected vs Actual): every game the top
// FLEX scorers have played, on one points scale, sorted by their typical week.
//
// A season's points per game hides the question a manager is asking on Sunday morning:
// is this a player who scores 18 every week, or one who scores 40 and then 6? Each dot
// is one game, the tick is the median, and the band runs from worst to best.
//
// The rows are chosen by points per game and then ordered by median game, so the list is
// the league's best scorers and the order says who is safest among them. Byes and missed
// games are simply absent: neither is a game the player scored in.
//
// The data is the Weekly Finishes endpoint's (`position=FLEX`, `sort=ppg`), which already
// carries each game's points in the reader's scoring and his finish at his own position.
import { Link } from "react-router-dom";

import { Card, CardHead, CardLink, CardState } from "./primitives";
import { Headshot } from "../explore/common";
import { PositionTag } from "../PositionTag";
import { formatStat } from "../../utils/format";
import { scoringLabel } from "../../constants/scoring";

// One line a player from sm up. On a phone the strip drops to its own line under the
// name, where it gets the card's width: beside the name it had about 110px, and a
// player's six games sat on top of each other.
const ROW =
  "grid grid-cols-[34px_minmax(0,1fr)_52px] items-center gap-x-2.5 sm:grid-cols-[34px_minmax(0,150px)_minmax(0,1fr)_52px_52px_52px]";
const STRIP_CELL = "col-span-2 col-start-2 row-start-2 sm:col-span-1 sm:col-start-3 sm:row-start-1";

const positionColor = (position) => `var(--position-${String(position).toLowerCase()}, var(--muted))`;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Each row's games, worst, median and best, ordered by median game. */
function shape(rows) {
  return rows
    .map((row) => {
      const games = Object.entries(row.points)
        .map(([week, points]) => ({ week: Number(week), points, finish: row.finishes[week] }))
        .sort((a, b) => a.week - b.week);
      const values = games.map((game) => game.points);
      return { ...row, games, low: Math.min(...values), high: Math.max(...values), median: median(values) };
    })
    .filter((row) => row.games.length)
    .sort((a, b) => b.median - a.median || b.fantasy_ppg - a.fantasy_ppg);
}

/** The points scale: zero to the best game, rounded up to 5, with a tick every 10. */
function scaleFor(rows) {
  const best = Math.max(0, ...rows.map((row) => row.high));
  const top = Math.max(30, Math.ceil(best / 5) * 5);
  const ticks = [];
  for (let tick = 0; tick <= top; tick += 10) ticks.push(tick);
  return { top, ticks, at: (points) => `${(Math.max(0, points) / top) * 100}%` };
}

function Strip({ row, scale }) {
  const color = positionColor(row.position);
  return (
    <div
      className="relative h-[30px]"
      role="img"
      aria-label={`${row.name}: worst ${formatStat(row.low, 1)}, median ${formatStat(row.median, 1)}, best ${formatStat(row.high, 1)} over ${row.games.length} games`}
    >
      {scale.ticks.map((tick) => (
        <span key={tick} className="absolute inset-y-0.5 w-px bg-line" style={{ left: scale.at(tick) }} />
      ))}
      <span
        className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
        style={{
          left: scale.at(row.low),
          width: `calc(${scale.at(row.high)} - ${scale.at(row.low)})`,
          background: `color-mix(in srgb, ${color} 24%, transparent)`,
        }}
      />
      {row.games.map((game) => (
        <span
          key={game.week}
          title={`Week ${game.week}: ${formatStat(game.points, 1)} points, ${row.position}${game.finish}`}
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: scale.at(game.points), background: color, boxShadow: "0 0 0 1.5px var(--surface-solid)" }}
        />
      ))}
      <span
        className="absolute top-1 h-[22px] w-0.5 -translate-x-1/2 rounded-full bg-fg"
        style={{ left: scale.at(row.median) }}
      />
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3.5 text-[10.5px] text-muted">
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-muted" />
        One game
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-0.5 rounded-full bg-fg" />
        Median
      </span>
    </div>
  );
}

/**
 * @param result    the `/stats/weekly-finishes?position=FLEX&sort=ppg` response
 * @param minGames  the games floor the request used, stated under the title
 */
export function FloorCeilingCard({ season, scoring, minGames, result, isLoading, isError }) {
  const rows = shape(result?.data ?? []);
  const scale = scaleFor(rows);
  const value = "stat-num text-right text-[12px]";

  return (
    <Card>
      <CardHead
        title="Floor and Ceiling"
        sub={`${season} · ${scoringLabel(scoring)} · top ${rows.length || 14} by PPG, ${minGames}+ games`}
      >
        <Legend />
      </CardHead>

      <CardState isLoading={isLoading} isError={isError} isEmpty={!rows.length} empty="No games yet this season." rows={8} />

      {rows.length > 0 && (
        <div>
          <div className={`${ROW} pb-1 text-[9.5px] font-bold uppercase tracking-[0.08em] text-faint`}>
            <span />
            <span>Player</span>
            <div className={`relative h-3.5 ${STRIP_CELL}`}>
              {scale.ticks.map((tick) => (
                <span
                  key={tick}
                  className="stat-num absolute -translate-x-1/2 text-[9.5px] font-medium normal-case tracking-normal"
                  style={{ left: scale.at(tick) }}
                >
                  {tick}
                </span>
              ))}
            </div>
            <span className="hidden text-right sm:block">Worst</span>
            <span className="text-right">Median</span>
            <span className="hidden text-right sm:block">Best</span>
          </div>

          {rows.map((row) => (
            <div key={row.player_id} className={`${ROW} border-t border-line py-1.5 sm:h-[37px] sm:py-0`}>
              <span className="row-span-2 flex sm:row-span-1">
                <Headshot
                  url={row.headshot_url}
                  name={row.name}
                  size={34}
                  style={{ border: `2px solid ${positionColor(row.position)}` }}
                />
              </span>
              {/* One line on a phone, where the strip below already makes the row two. */}
              <span className="flex min-w-0 items-baseline gap-1.5 leading-tight sm:block">
                <Link
                  to={`/players/${row.player_id}`}
                  className="min-w-0 truncate text-[13px] font-semibold text-fg hover:text-accent sm:block"
                >
                  {row.name}
                </Link>
                <span className="shrink-0 whitespace-nowrap text-[10.5px] text-faint">
                  <PositionTag position={row.position} variant="quiet" className="mr-1" />
                  {row.team}
                </span>
              </span>
              <div className={STRIP_CELL}>
                <Strip row={row} scale={scale} />
              </div>
              <span className={`${value} hidden text-muted sm:block`}>{formatStat(row.low, 1)}</span>
              <span className={`${value} font-semibold text-fg`}>{formatStat(row.median, 1)}</span>
              <span className={`${value} hidden text-muted sm:block`}>{formatStat(row.high, 1)}</span>
            </div>
          ))}

          <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
            Sorted by median game. The shaded band runs from worst game to best; byes and missed games are left out.
          </p>
        </div>
      )}
      <CardLink to="/leaderboards/fantasy">Fantasy leaderboard</CardLink>
    </Card>
  );
}
