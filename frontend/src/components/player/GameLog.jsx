// One row per game, grouped by phase (M13).
//
// The lead block — week, opponent, points, snap share, and where those points finished
// among the position that week — is the same for every position: it is the "did he play,
// and did it matter" question, which nobody asks differently for a quarterback. What follows is position-specific (`constants/playerPage.js`) under a
// spanning header, the same grouping language the career table and the boards use.
//
// Deliberately **not** driven by the season-stat tabs above it. A game log is the
// receipts; re-cutting its columns every time someone glances at a different stat group
// would mean the one stable table on the page moves under them.
import { formatSigned, formatStat } from "../../utils/format";
import { isMetricAvailable } from "../../utils/availability";
import { StatTooltip, useStatTooltip } from "../StatTooltip";
import { columnEntry, gameValue } from "../../constants/playerPage";
import { FinishChip } from "./FinishChip";
import { metricTip } from "./metricTip";

// A game's rush yards over expected is negative as often as not; the sign is the point.
const SIGNED = new Set(["ngs_rush_yards_over_expected"]);

export function GameLog({ games, groups, metrics, position, league, season, isLoading }) {
  const tooltip = useStatTooltip();
  const columns = groups.flatMap((group, groupIndex) =>
    group.columns.map((entry, columnIndex) => ({
      ...columnEntry(entry),
      sectionStart: columnIndex === 0,
      key: `${groupIndex}-${columnIndex}`,
    })),
  );

  return (
    <section className="glass-card px-0 pb-2 pt-3">
      <h2 className="mb-1 px-4 text-sm font-semibold tracking-tight text-fg">
        Game Log
        <span className="ml-2 text-[11px] font-medium text-faint">
          {season} regular season · fantasy points in your scoring
        </span>
      </h2>

      {isLoading ? (
        <div className="space-y-1.5 px-4 py-2" aria-busy="true">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-6 animate-pulse rounded bg-surface-2/70" />
          ))}
        </div>
      ) : games.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted">No games played this season.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="text-[9.5px] uppercase tracking-[0.08em] text-fg">
                <th colSpan={5} className="border-b-2 border-edge px-2 pb-0.5 pt-1 pl-4 font-bold">
                  Game
                </th>
                {groups.map((group) => (
                  <th
                    key={group.name}
                    colSpan={group.columns.length}
                    className="border-b-2 border-l border-edge px-2 pb-0.5 pt-1 font-bold"
                  >
                    {group.name}
                  </th>
                ))}
              </tr>
              <tr className="border-b border-line text-[9.5px] uppercase tracking-[0.06em] text-faint">
                <th className="px-2 py-1 pl-4 text-right font-semibold">WK</th>
                <th className="px-2 py-1 text-left font-semibold">Opp</th>
                <th className="px-2 py-1 text-right font-semibold">Pts</th>
                <th
                  className="whitespace-nowrap px-2 py-1 text-right font-semibold"
                  title={`Where the week's fantasy points finished among every ${position} with a stat line, in your scoring`}
                >
                  Finish
                </th>
                <th className="px-2 py-1 text-right font-semibold">Snap%</th>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className={`whitespace-nowrap px-2 py-1 text-right font-semibold last:pr-4 ${column.sectionStart ? "border-l border-line" : ""}`}
                    onMouseEnter={(event) =>
                      tooltip.show(event.currentTarget, metricTip(metrics[column.id], column.id, season))
                    }
                    onMouseLeave={tooltip.hide}
                  >
                    {column.label ?? metrics[column.id]?.short ?? column.id}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {games.map((game) => (
                <tr key={game.game_id} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="stat-num px-2 py-1 pl-4 text-right text-[12.5px] text-muted">{game.week}</td>
                  <td className="stat-num px-2 py-1 text-[12.5px] text-muted">
                    {game.opponent_abbreviation ?? "—"}
                  </td>
                  <td className="stat-num px-2 py-1 text-right text-[12.5px] font-semibold text-fg">
                    {formatStat(game.fantasy_points, 1)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1 text-right">
                    <FinishChip
                      rank={game.position_rank}
                      position={position}
                      league={league}
                      detail={`of ${game.pool_size} ${position}s that week`}
                    />
                  </td>
                  <td className="stat-num px-2 py-1 text-right text-[12.5px] text-muted">
                    {formatStat(game.snap_share, "pct")}
                  </td>
                  {columns.map((column) => {
                    const metric = metrics[column.id] ?? {};
                    const available = isMetricAvailable(metric, season);
                    const value = gameValue(game, column.id);
                    return (
                      <td
                        key={column.key}
                        className={`stat-num px-2 py-1 text-right text-[12.5px] last:pr-4 ${available ? "text-fg" : "text-faint"} ${column.sectionStart ? "border-l border-line" : ""}`}
                      >
                        {!available
                          ? "—"
                          : SIGNED.has(column.id)
                            ? formatSigned(value, metric.format)
                            : formatStat(value, metric.format)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <StatTooltip tip={tooltip.tip} />
    </section>
  );
}
