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
//
// It covers the whole season rather than the games already played: `buildSeasonLog`
// below merges his stat lines onto his team's fixture list, so a week still to come is a
// row of dashes and the bye is a greyed row in its place.
import { formatSigned, formatStat } from "../../utils/format";
import { isMetricAvailable } from "../../utils/availability";
import { StatTooltip, useStatTooltip } from "../StatTooltip";
import { columnEntry, gameValue } from "../../constants/playerPage";
import { FinishChip } from "./FinishChip";
import { metricTip } from "./metricTip";

// A game's rush yards over expected is negative as often as not; the sign is the point.
const SIGNED = new Set(["ngs_rush_yards_over_expected"]);

/**
 * The season's whole slate, not only the weeks with a stat line: every fixture his team
 * has, in week order, with the bye inserted where the schedule skips a week.
 *
 * A log that stops at the last game played answers what happened and says nothing about
 * what is left, which is half of what a manager opens a player page for in October. So a
 * week still to come is a row of dashes, and the bye is a row of its own rather than a
 * gap, because it is the one week on the schedule that has to be planned around.
 *
 * A fixture already played with no stat line reads the same way, which is correct: he
 * was inactive, or not on the roster yet. Games he played for a previous team are kept
 * even though they are absent from this team's fixture list, so a mid-season trade shows
 * both halves of his season.
 *
 * @param {Object[]} statLines  his game log for the season, week ascending
 * @param {Object[]} fixtures   `/games` for (season, his team), any order
 * @param {number|undefined} teamId  the team the fixtures belong to
 */
export function buildSeasonLog(statLines, fixtures, teamId) {
  if (!fixtures?.length) return statLines;

  const byGame = new Map(statLines.map((line) => [line.game_id, line]));
  const byWeek = new Map(fixtures.map((fixture) => [fixture.week, fixture]));
  const lastWeek = Math.max(...fixtures.map((fixture) => fixture.week ?? 0));

  const rows = [];
  for (let week = 1; week <= lastWeek; week += 1) {
    const fixture = byWeek.get(week);
    if (!fixture) {
      rows.push({ row_kind: "bye", week });
      continue;
    }
    const line = byGame.get(fixture.game_id);
    if (line) {
      rows.push({ ...line, row_kind: "played" });
      continue;
    }
    const home = fixture.home_team_id === teamId;
    rows.push({
      row_kind: "scheduled",
      week,
      game_id: fixture.game_id,
      opponent_abbreviation: home ? fixture.away_abbreviation : fixture.home_abbreviation,
    });
  }

  const covered = new Set(rows.map((row) => row.game_id));
  for (const line of statLines) {
    if (!covered.has(line.game_id)) rows.push({ ...line, row_kind: "played" });
  }
  return rows.sort((a, b) => a.week - b.week);
}

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
        <p className="px-4 py-6 text-center text-xs text-muted">No games this season.</p>
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
              {games.map((game) => {
                const kind = game.row_kind ?? "played";
                const bye = kind === "bye";
                return (
                  <tr
                    key={game.game_id ?? `bye-${game.week}`}
                    className={`border-b border-line last:border-0 ${
                      bye ? "text-faint opacity-60" : "hover:bg-surface-2"
                    }`}
                  >
                    <td
                      className={`stat-num px-2 py-1 pl-4 text-right text-[12.5px] ${bye ? "" : "text-muted"}`}
                    >
                      {game.week}
                    </td>
                    <td className={`stat-num px-2 py-1 text-[12.5px] ${bye ? "" : "text-muted"}`}>
                      {bye ? "BYE" : game.opponent_abbreviation ?? "—"}
                    </td>
                    {kind === "played" ? (
                      <>
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
                      </>
                    ) : (
                      // Nothing was measured, so nothing is stated: a dash in every
                      // column rather than a short row, which would break the grid, or a
                      // zero, which would be a claim about a game nobody has played.
                      <>
                        <td className="stat-num px-2 py-1 text-right text-[12.5px] text-faint">—</td>
                        <td className="stat-num px-2 py-1 text-right text-[12.5px] text-faint">—</td>
                        <td className="stat-num px-2 py-1 text-right text-[12.5px] text-faint">—</td>
                        {columns.map((column) => (
                          <td
                            key={column.key}
                            className={`stat-num px-2 py-1 text-right text-[12.5px] text-faint last:pr-4 ${column.sectionStart ? "border-l border-line" : ""}`}
                          >
                            —
                          </td>
                        ))}
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <StatTooltip tip={tooltip.tip} />
    </section>
  );
}
