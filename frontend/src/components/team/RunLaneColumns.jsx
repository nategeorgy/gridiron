// Where an offense runs: one column per lane across the line, left end to right end.
// Column height is the share of designed runs (the dashed tick is the league); colour
// and the numbers under each lane are EPA per run and its rank.
import { RUN_GROUPS, RUN_LANES } from "../../constants/teamStats";
import { ordinal } from "../../utils/format";
import { formatTeamStat, rankFill, rankInk, rankStroke, rankText } from "../../utils/teamStats";
import { RankChip } from "./RankChip";

export function RunLaneColumns({ lanes, groups, weeksLabel }) {
  const byKey = Object.fromEntries((lanes ?? []).map((row) => [row.key, row]));
  const W = 460, H = 250, base = 176;
  const maxShare = Math.max(...(lanes ?? []).map((row) => Math.max(row.share ?? 0, row.league_share ?? 0)), 0.05);
  return (
    <section className="glass-card p-4">
      <h2 className="text-[15px] font-semibold tracking-tight text-fg">Running by direction</h2>
      <p className="mb-2 text-[11.5px] text-faint">{weeksLabel} {"·"} designed runs</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Share of designed runs by lane">
        <line x1="20" x2={W - 20} y1={base} y2={base} stroke="var(--border-strong)" />
        {RUN_LANES.map((lane) => {
          const row = byKey[lane.key];
          if (!row) return null;
          const h = ((row.share ?? 0) / maxShare) * 128, lh = ((row.league_share ?? 0) / maxShare) * 128;
          const [first, second] = lane.name.split(" ");
          return (
            <g key={lane.key}>
              <rect x={lane.x - 19} y={base - h} width="38" height={h} rx="6" fill={`color-mix(in srgb, ${rankFill(row.epa_rank, row.epa_teams, 70)}, color-mix(in srgb, var(--fg) 10%, transparent))`} stroke={rankStroke(row.epa_rank, row.epa_teams)}>
                <title>{`${lane.name}: ${row.plays} runs, ${formatTeamStat(row.yards, "num2")} yards per carry, ${formatTeamStat(row.successes, "pct0")} success, ${formatTeamStat(row.epa, "sgn2")} EPA per run`}</title>
              </rect>
              <line x1={lane.x - 25} x2={lane.x + 25} y1={base - lh} y2={base - lh} stroke="var(--plot-rule)" strokeWidth="1.5" strokeDasharray="3 2" />
              <text x={lane.x} y={base - h - 8} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--fg)" fontFamily="'JetBrains Mono', monospace">{formatTeamStat(row.share, "pct0")}</text>
              <text x={lane.x} y={base + 16} textAnchor="middle" fontSize="10.5" fill="var(--muted)">{first}</text>
              <text x={lane.x} y={base + 29} textAnchor="middle" fontSize="10.5" fill="var(--muted)">{second ?? ""}</text>
              <text x={lane.x} y={base + 48} textAnchor="middle" fontSize="11" fontWeight="600" fill={rankText(row.epa_rank, row.epa_teams)} fontFamily="'JetBrains Mono', monospace">{formatTeamStat(row.epa, "sgn2")}</text>
              <text x={lane.x} y={base + 61} textAnchor="middle" fontSize="9.5" fill={rankInk(row.epa_rank, row.epa_teams)}>{row.epa_rank ? ordinal(row.epa_rank) : ""}</text>
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-[11px] text-faint">Column: share of designed runs, dashed tick is the league. Color and the numbers below represent EPA per run and rank.</p>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        {RUN_GROUPS.map((group) => {
          const row = (groups ?? []).find((entry) => entry.key === group.key);
          return (
            <div key={group.key} className="grid gap-0.5 rounded-xl border border-line px-2.5 py-2" style={{ background: "color-mix(in srgb, var(--fg) 4%, transparent)" }}>
              <b className="text-xs text-fg">{group.name} <span className="text-[10.5px] font-normal text-faint">{group.hint}</span></b>
              <span className="flex items-center gap-1.5">
                <span className="stat-num text-[15px] font-semibold" style={{ color: rankText(row?.epa_rank, row?.epa_teams) }}>{formatTeamStat(row?.epa, "sgn2")}</span>
                <RankChip rank={row?.epa_rank} of={row?.epa_teams} />
              </span>
              <small className="stat-num text-[10.5px] text-faint">{formatTeamStat(row?.share, "pct1")} of runs</small>
              <small className="stat-num text-[10.5px] text-faint">League {formatTeamStat(row?.league_share, "pct1")}</small>
            </div>
          );
        })}
      </div>
    </section>
  );
}
