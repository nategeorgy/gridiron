// Team stats where the defense is worth showing: each row is the stat for all 32 teams
// on offense (left) and defense (right), better to the right, this team's rank on the
// badge.
import { TEAM_STAT_LABEL, TEAM_STRIP_GROUPS } from "../../constants/teamStats";
import { formatTeamStat } from "../../utils/teamStats";
import { StatStrip } from "./StatStrip";

function rowTitle(metric) {
  if (!metric) return "";
  if (metric.single) return `${metric.label}${metric.desc ? `. ${metric.desc}` : ""}`;
  return `Offense: ${metric.label_o}. Defense: ${metric.label_d}.${metric.desc ? ` ${metric.desc}` : ""}`;
}

export function TeamStatStrips({ board, abbreviation, weeksLabel }) {
  const metrics = Object.fromEntries((board?.metrics ?? []).map((metric) => [metric.id, metric]));
  const values = board?.values ?? {};
  const cell = (id, side) => {
    const metric = metrics[id];
    return {
      strip: <StatStrip values={values[id]?.[side]} team={abbreviation} better={metric?.better?.[side] ?? 1} format={metric?.fmt} width={230} height={24} />,
      value: formatTeamStat(values[id]?.[side]?.[abbreviation]?.[0], metric?.fmt),
    };
  };
  const grid = "grid grid-cols-[minmax(0,1fr)_62px_148px_62px_minmax(0,1fr)] items-center gap-2";

  return (
    <section className="glass-card p-4">
      <h2 className="text-[15px] font-semibold tracking-tight text-fg">Team stats</h2>
      <p className="text-[11.5px] text-faint">{weeksLabel} {"·"} each line is all 32 teams, better to the right, the badge is the rank</p>
      <div className={`${grid} mt-3 pb-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint`}>
        <span className="col-span-2 text-right">Offense</span><span /><span className="col-span-2">Defense</span>
      </div>
      {TEAM_STRIP_GROUPS.map((group) => (
        <div key={group.name}>
          <h3 className="mb-1 mt-3.5 text-center text-[11.5px] font-bold uppercase tracking-[0.06em] text-fg">{group.name}</h3>
          {group.rows.map((id) => {
            const metric = metrics[id];
            const o = cell(id, "o");
            const d = metric?.single ? null : cell(id, "d");
            return (
              <div key={id} className={`${grid} py-px`}>
                <div>{o.strip}</div>
                <div className="stat-num text-right text-sm font-semibold text-fg">{o.value}</div>
                <div className="cursor-help text-center text-xs text-muted" title={rowTitle(metric)}>{TEAM_STAT_LABEL[id] ?? metric?.short}</div>
                <div className="stat-num text-left text-sm font-semibold text-fg">{d?.value}</div>
                <div>{d?.strip}</div>
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
