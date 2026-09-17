// The career, one row per season, with each season's finish among the position (M13).
//
// **The finish is the point.** "1,412 yards" is a fact; "WR4" is what a manager
// remembers a season as, and it is the column that makes a career readable at a glance.
// It is re-ranked in the caller's scoring by the API, so a superflex or TE-premium
// league sees its own history rather than someone else's PPR one.
//
// Columns after the Fantasy block are position-specific (`constants/playerPage.js`)
// and render under a spanning header, the same grouping language the boards use.
import { formatStat } from "../../utils/format";
import { isMetricAvailable } from "../../utils/availability";
import { StatTooltip, useStatTooltip } from "../StatTooltip";
import { FinishChip } from "./FinishChip";
import { metricTip } from "./metricTip";

export function CareerTable({ seasons, position, groups, metrics, league, activeSeason, onSelectSeason, isLoading }) {
  const tooltip = useStatTooltip();
  const columns = groups.flatMap((group) => group.columns);
  const starts = new Set(groups.map((group) => group.columns[0]));

  return (
    <section className="glass-card px-4 pb-3 pt-3">
      <h2 className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-faint">
        Career · among {position}s, in your scoring
      </h2>

      {isLoading ? (
        <div className="space-y-1.5 py-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-6 animate-pulse rounded bg-surface-2/70" />
          ))}
        </div>
      ) : seasons.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted">No regular-season history for this player.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left">
            <thead>
              <tr className="text-[9.5px] uppercase tracking-[0.08em] text-fg">
                <th colSpan={6} className="border-b-2 border-edge px-2 pb-0.5 pt-1 font-bold">
                  Fantasy
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
                {["Season", "Team", "G", "Pts", "PPG", "Finish"].map((head, index) => (
                  <th
                    key={head}
                    className={`whitespace-nowrap px-2 py-1 font-semibold ${index === 0 ? "text-left" : "text-right"}`}
                  >
                    {head}
                  </th>
                ))}
                {columns.map((column) => (
                  <th
                    key={column}
                    className={`whitespace-nowrap px-2 py-1 text-right font-semibold ${starts.has(column) ? "border-l border-line" : ""}`}
                    onMouseEnter={(event) =>
                      tooltip.show(event.currentTarget, metricTip(metrics[column], column, null))
                    }
                    onMouseLeave={tooltip.hide}
                  >
                    {metrics[column]?.short ?? column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {seasons.map((season) => {
                const selected = season.season === activeSeason;
                return (
                  <tr
                    key={season.season}
                    className={`border-b border-line last:border-0 ${selected ? "bg-[color:color-mix(in_srgb,var(--accent)_7%,transparent)]" : "hover:bg-surface-2"}`}
                  >
                    <td className="px-2 py-1">
                      {/* Clicking a season drives the rest of the page — the career
                          table doubles as the season picker. */}
                      <button
                        type="button"
                        onClick={() => onSelectSeason?.(season.season)}
                        className={`stat-num text-[12.5px] transition hover:text-accent ${selected ? "font-bold text-fg" : "text-fg"}`}
                      >
                        {season.season}
                      </button>
                    </td>
                    <td className="stat-num px-2 py-1 text-right text-[12.5px] text-muted">
                      {season.team_abbreviation ?? "—"}
                      {season.teams_played_for > 1 && (
                        <span className="ml-1 text-[10px] text-faint" title={`Played for ${season.teams_played_for} teams`}>
                          +{season.teams_played_for - 1}
                        </span>
                      )}
                    </td>
                    <td className="stat-num px-2 py-1 text-right text-[12.5px] text-muted">{season.games_played}</td>
                    <td className="stat-num px-2 py-1 text-right text-[12.5px] font-semibold text-fg">
                      {formatStat(season.fantasy_points, 1)}
                    </td>
                    <td className="stat-num px-2 py-1 text-right text-[12.5px] font-semibold text-fg">
                      {formatStat(season.fantasy_ppg, 1)}
                    </td>
                    <td className="px-2 py-1 text-right">
                      <FinishChip
                        rank={season.position_rank}
                        position={position}
                        league={league}
                        detail={`of ${season.pool_size} on total points · ${
                          season.position_rank_ppg == null
                            ? `not enough games to rank on PPG (needed ${season.min_games})`
                            : `${position}${season.position_rank_ppg} on points per game, of ${season.ppg_pool_size} qualified`
                        }`}
                      />
                    </td>
                    {columns.map((column) => {
                      const metric = metrics[column] ?? {};
                      const available = isMetricAvailable(metric, season.season);
                      return (
                        <td
                          key={column}
                          className={`stat-num px-2 py-1 text-right text-[12.5px] ${available ? "text-fg" : "text-faint"} ${starts.has(column) ? "border-l border-line" : ""}`}
                        >
                          {available ? formatStat(season[column], metric.format) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-1.5 text-[10.5px] text-faint">
        Finish is the rank in total points among {position}s that season, coloured by how deep
        your {league.teams}-team league starts the position. Hover one for the tier and the
        points-per-game finish.
      </p>
      <StatTooltip tip={tooltip.tip} />
    </section>
  );
}
