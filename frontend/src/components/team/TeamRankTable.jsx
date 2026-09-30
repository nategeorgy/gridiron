// Pace, tendencies and personnel for the offense: value, rank of 32 (rank 1 is the
// most) and the league average. No defense column: how a team lines up is a question
// about the team with the ball.
import { TEAM_STAT_LABEL, TEAM_TABLE_GROUPS } from "../../constants/teamStats";
import { ordinal } from "../../utils/format";
import { formatTeamStat, personnelLagWeek, rankedCount, rankFill } from "../../utils/teamStats";

export function TeamRankTable({ board, abbreviation, weeksLabel, season }) {
  const metrics = Object.fromEntries((board?.metrics ?? []).map((metric) => [metric.id, metric]));
  const values = board?.values ?? {};
  const lagWeek = personnelLagWeek(board?.personnel_through_week, board?.weeks);
  return (
    <section className="glass-card p-4">
      <h2 className="text-[15px] font-semibold tracking-tight text-fg">Pace, tendencies and personnel</h2>
      <p className="text-[11.5px] text-faint">{weeksLabel}</p>
      <table className="mt-3 w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">
            <th className="px-2 pb-1 text-left">Stat</th>
            <th className="px-2 pb-1 text-right">Offense</th>
            <th className="px-2 pb-1 text-center">Rank</th>
            <th className="px-2 pb-1 text-right">League</th>
          </tr>
        </thead>
        <tbody>
          {TEAM_TABLE_GROUPS.map((group) => [
            <tr key={group.name}>
              <td colSpan={4} className="border-t-2 px-2 pb-1 pt-3 text-[11px] font-bold uppercase tracking-[0.08em] text-fg" style={{ borderColor: "var(--border-strong)" }}>{group.name}</td>
            </tr>,
            ...group.rows.map((id) => {
              const metric = metrics[id];
              const mine = values[id]?.o?.[abbreviation];
              const count = rankedCount(board, id, "o");
              const unavailable = metric?.first_season && season < metric.first_season;
              return (
                <tr key={id} className="border-t border-line">
                  <td className="cursor-help px-2 py-1.5 text-muted" title={metric ? `${metric.label_o}${metric.desc ? `. ${metric.desc}` : ""}` : ""}>
                    {TEAM_STAT_LABEL[id] ?? metric?.short}
                    {unavailable && <span className="ml-1.5 text-[10.5px] text-faint">from {metric.first_season}</span>}
                  </td>
                  <td className="stat-num px-2 py-1.5 text-right text-fg">{formatTeamStat(mine?.[0], metric?.fmt)}</td>
                  <td className="stat-num w-14 px-2 py-1.5 text-center text-[11.5px] font-bold text-fg" style={{ background: rankFill(mine?.[1], count, 52) }}>
                    {mine ? ordinal(mine[1]) : "—"}
                  </td>
                  <td className="stat-num px-2 py-1.5 text-right text-faint">{formatTeamStat(values[id]?.o_mean, metric?.fmt)}</td>
                </tr>
              );
            }),
          ])}
        </tbody>
      </table>
      <p className="mt-2.5 text-[11px] text-faint">Personnel is the share of the offense's plays in each grouping{lagWeek ? `, through Week ${lagWeek}` : ""}.</p>
    </section>
  );
}
