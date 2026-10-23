// Floor and ceiling (October 2026): under the player card's weekly finish.
//
// How his weeks spread across five finish bands, and his best, median and worst game. It
// fills the left column of the card, which from lg runs shorter than the percentile list
// beside it, and it was picked over seven other season sections tried in its place
// (points against expected, usage by week, Insight scores, recent form, the schedule,
// his share of the team's work, and where his points come from).
//
// The bands are the finish chips' own (`FINISH_BANDS` in FinishChip.jsx, set per position
// by Nate), so the bar and the weekly chips above it count every week the same way.
import { BAND_FILLS, finishBand, finishBands } from "./FinishChip";
import { weekSlots } from "./PlayerCard";
import { tint } from "./cardParts";

/** "vs SF" or "@ SF". A game id ends with the home team's code. */
function where(game) {
  const home = game.team_abbreviation && game.game_id?.endsWith(`_${game.team_abbreviation}`);
  return `${home ? "vs" : "@"} ${game.opponent_abbreviation}`;
}

export function FloorCeiling({ log, lastWeek, position }) {
  const games = weekSlots(log, lastWeek).filter(({ game }) => game?.row_kind === "played" && game.position_rank != null);
  if (!games.length) return null;
  const bands = finishBands(position).map((band, index) => ({
    ...band,
    fill: BAND_FILLS[index],
    count: games.filter(({ game }) => finishBand(game.position_rank, position) === index).length,
  }));
  const byPoints = [...games].sort((a, b) => b.game.fantasy_points - a.game.fantasy_points);
  const marks = [
    ["Best", byPoints[0]],
    ["Median", byPoints[Math.floor((byPoints.length - 1) / 2)]],
    ["Worst", byPoints[byPoints.length - 1]],
  ];

  return (
    <div>
      <h3 className="mb-3 text-[13px] font-bold text-fg">Floor and ceiling</h3>
      <div className="flex h-3 overflow-hidden rounded-full">
        {bands.map((band) =>
          band.count ? (
            <i key={band.label} className="block h-full" style={{ width: `${(band.count / games.length) * 100}%`, background: band.fill }} />
          ) : null,
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        {bands.map((band) => (
          <span key={band.label} className="flex items-center gap-1.5">
            <i className="block h-2.5 w-2.5 rounded-sm" style={{ background: band.fill }} />
            {band.label}
            <span className="stat-num font-bold text-fg">{band.count}</span>
          </span>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {marks.map(([label, { week, game }]) => (
          <div key={label} className="min-w-0 rounded-xl px-3 py-2" style={{ background: tint(5) }}>
            {/* "Best", not "Best week", on a phone: a third of its width wraps the longer label. */}
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
              {label}
              <span className="hidden sm:inline"> week</span>
            </div>
            <div className="stat-num mt-0.5 text-[20px] font-extrabold text-fg">{game.fantasy_points.toFixed(1)}</div>
            <div className="text-[11px] text-muted sm:truncate">
              W{week} {where(game)}
              <span className="hidden sm:inline"> · </span>
              <span className="block sm:inline">
                {position}
                {game.position_rank}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
