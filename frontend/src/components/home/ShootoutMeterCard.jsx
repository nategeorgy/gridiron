// Shootout Meter (November 2026, replacing the Tale of the Tape in the Week N Preview):
// the coming week's slate on one scale, each game a line between its two teams' implied
// totals, sorted by the game total.
//
// Picked from the Highlighted Viz mockups (https://claude.ai/artifact/CqRY3SnwR5uVxknMFBetas,
// option 14). Everything comes with the scoreboard's `next` window, which already carries
// the lines and implied totals the slate draws, so the card costs no request of its own.
// An implied total is derived at query time from the spread and the total (`app/vegas.py`).
//
// A game already played (Thursday night, once it is in) keeps its row, with the final
// score where the total was, so the week reads whole. A game with no line yet is left
// off and counted under the chart: an unpriced game is a state, not a low total.
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { Card, CardHead, CardLink, CardState } from "./primitives";
import { gameColors } from "../game/colors";
import { useElementWidth } from "../../hooks/useElementWidth";
import { formatStat } from "../../utils/format";

const ROW = 34;

/** Kickoff as the league quotes it: always Eastern. */
function kickoff(game) {
  const day = new Date(`${game.game_date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" });
  if (!game.kickoff_time) return day;
  const [hours, minutes] = game.kickoff_time.split(":").map(Number);
  return `${day} ${((hours + 11) % 12) + 1}:${String(minutes).padStart(2, "0")}`;
}

function Meter({ games, teams, width }) {
  const navigate = useNavigate();
  const narrow = width < 470;
  const m = { l: narrow ? 6 : 62, r: narrow ? 44 : 56, t: 22, b: 6 };
  const height = m.t + games.length * ROW + m.b;
  const implieds = games.flatMap((game) => [game.away_implied, game.home_implied]);
  const lo = Math.floor(Math.min(...implieds) - 1.5);
  const hi = Math.ceil(Math.max(...implieds) + 1.5);
  const x = (value) => m.l + 18 + ((value - lo) / (hi - lo)) * (width - m.l - m.r - 36);
  const average = implieds.reduce((sum, value) => sum + value, 0) / implieds.length;
  const step = hi - lo > 14 ? 4 : 2;
  const ticks = [];
  for (let tick = Math.ceil(lo / step) * step; tick <= hi; tick += step) ticks.push(tick);
  const logoSize = narrow ? 18 : 21;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block overflow-visible" role="img"
      aria-label="Each game's implied team totals, sorted by the game total">
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={x(tick)} x2={x(tick)} y1={m.t - 4} y2={height - m.b} stroke="var(--divider)" />
          <text x={x(tick)} y={m.t - 9} textAnchor="middle" className="stat-num" fontSize="10" fill="var(--faint)">{tick}</text>
        </g>
      ))}
      <line x1={x(average)} x2={x(average)} y1={m.t - 4} y2={height - m.b} stroke="var(--plot-rule)" strokeDasharray="4 4" />

      {games.map((game, i) => {
        const y = m.t + i * ROW + ROW / 2;
        const away = teams[game.away_abbreviation], home = teams[game.home_abbreviation];
        const colors = gameColors(away, home);
        const favorite = game.home_implied >= game.away_implied ? "home" : "away";
        const sides = [["away", x(game.away_implied)], ["home", x(game.home_implied)]];
        return (
          <g key={game.game_id} className="cursor-pointer" opacity={game.played ? 0.55 : 1}
            onClick={() => navigate(`/games/${game.game_id}`)}>
            <title>{`${game.away_abbreviation} ${formatStat(game.away_implied, 1)}, ${game.home_abbreviation} ${formatStat(game.home_implied, 1)} implied · total ${game.total_line}`}</title>
            <rect x={0} y={y - ROW / 2 + 2} width={width} height={ROW - 4} rx={8}
              fill={i < 3 && !game.played ? "color-mix(in srgb, var(--pos) 7%, transparent)" : "transparent"} className="transition hover:fill-[color:var(--surface-2)]" />
            {!narrow && <text x={6} y={y} dy="0.35em" fontSize="10.5" fill="var(--faint)">{kickoff(game)}</text>}
            <line x1={sides[0][1]} x2={sides[1][1]} y1={y} y2={y} stroke="var(--muted)" strokeWidth="3" strokeLinecap="round" opacity="0.45" />
            {sides.map(([side, cx]) => {
              const r =(side === favorite ? logoSize : logoSize - 3) / 2 + 3;
              const otherX = side === "away" ? sides[1][1] : sides[0][1];
              const outward = cx >= otherX ? 1 : -1;
              return (
                <g key={side}>
                  <circle cx={cx} cy={y} r={r + 1} fill="var(--surface-solid)" stroke={colors[side]} strokeWidth="2" />
                  {game[`${side}_logo_url`] && (
                    <image href={game[`${side}_logo_url`]} x={cx - r + 3} y={y - r + 3} width={(r - 3) * 2} height={(r - 3) * 2} />
                  )}
                  <text x={cx + outward * (r + 5)} y={y} dy="0.35em" textAnchor={outward > 0 ? "start" : "end"} className="stat-num"
                    fontSize="10.5" fontWeight="700" fill="var(--fg)">
                    {formatStat(game[`${side}_implied`], 1)}
                  </text>
                </g>
              );
            })}
            <text x={width - 4} y={y} dy="0.35em" textAnchor="end" className="stat-num" fontSize={game.played ? 10.5 : 13} fontWeight="800" fill="var(--fg)">
              {game.played ? `${game.away_score}-${game.home_score}` : game.total_line}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * @param upcoming  the scoreboard's `next` window: { week, season, games }
 * @param teams     teams by abbreviation, for the game colours
 */
export function ShootoutMeterCard({ upcoming, teams, isLoading, isError }) {
  const [ref, width] = useElementWidth();
  const all = upcoming?.games ?? [];
  const games = useMemo(
    () => all.filter((game) => game.away_implied != null && game.home_implied != null)
      .sort((a, b) => (a.played - b.played) || (b.total_line - a.total_line)),
    [all],
  );
  const unpriced = all.length - games.length;

  return (
    <Card>
      <CardHead title="Shootout Meter" sub={upcoming ? `Week ${upcoming.week} · implied team totals from the lines` : undefined} />
      {games.length > 0 && <p className="-mt-1 mb-2 text-[12.5px] leading-snug text-muted">Dashed line represents the average.</p>}
      <CardState isLoading={isLoading} isError={isError} isEmpty={!games.length} empty="No lines for the coming week yet." rows={8} />
      <div ref={ref} className="min-w-0">
        {games.length > 0 && width > 0 && <Meter games={games} teams={teams} width={width} />}
      </div>
      {games.length > 0 && (
        <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
          Each game is a line between its two teams' implied totals; the bigger ring is the favourite, and the number on the right is the total.
          {games.some((game) => game.played) ? " Games already played show the final score." : ""}
          {unpriced ? ` ${unpriced} game${unpriced === 1 ? " has" : "s have"} no line yet.` : ""} Click a game for its preview.
        </p>
      )}
      <CardLink to={upcoming ? `/schedule/games?week=${upcoming.week}` : "/schedule/games"}>Week {upcoming?.week ?? ""} games</CardLink>
    </Card>
  );
}
