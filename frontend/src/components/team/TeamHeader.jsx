// The top of a team page: logo, name, record and division place, the season's coaching
// staff, the next game with its line, and the team's EPA per play against all 32 teams.
import { formatStat, ordinal } from "../../utils/format";
import { formatTeamStat } from "../../utils/teamStats";
import { StatStrip } from "./StatStrip";

const names = (list) => (list?.length ? list.map(([name]) => name).join(", then ") : null);

function spreadLabel(abbreviation, spread) {
  if (spread === null || spread === undefined) return null;
  if (spread === 0) return `${abbreviation} PK`;
  const size = Math.abs(spread) % 1 ? Math.abs(spread).toFixed(1) : Math.abs(spread).toFixed(0);
  return spread > 0 ? `${abbreviation} −${size}` : `${abbreviation} +${size}`;
}

export function TeamHeader({ team, board, season, weeksLabel, place, record, staff, nextGame, logos }) {
  const nick = team.name?.split(" ").pop();
  const city = team.name?.slice(0, -(nick?.length ?? 0)).trim();
  const values = board?.values ?? {};
  const rows = [
    ["NET", "net_epa", "o"],
    ["OFF", "epa", "o"],
    ["DEF", "epa", "d"],
  ];
  return (
    <section
      className="glass-card grid grid-cols-1 gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center"
      style={{ backgroundImage: team.color ? `radial-gradient(70% 140% at 0% 0%, color-mix(in srgb, ${team.color} 16%, transparent), transparent 70%)` : undefined }}
    >
      <div>
        <div className="flex items-center gap-4">
          {team.logo_url && <img src={team.logo_url} alt="" className="h-[88px] w-[88px] flex-none object-contain drop-shadow-lg" />}
          <div>
            <div className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">{city}</div>
            <h1 className="text-[36px] font-bold leading-none tracking-tight text-fg">{nick}</h1>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[13px] text-muted">
              <span>{team.division}</span>
              {record && <b className="stat-num text-lg text-fg">{record}</b>}
              <span>{season}{place ? ` · ${ordinal(place)} in division` : ""}</span>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-fg">
          {[["HC", staff?.head_coach], ["OC", staff?.offensive_coordinator], ["DC", staff?.defensive_coordinator]].map(([role, people]) => (
            <div key={role}>
              <span className="mr-1.5 font-mono text-[10.5px] tracking-wider text-faint">{role}</span>
              {names(people) ?? <i className="text-faint">None listed</i>}
            </div>
          ))}
        </div>
        {nextGame ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2 text-[13px]" style={{ background: "color-mix(in srgb, var(--fg) 5%, transparent)" }}>
            <span className="text-xs text-muted">Next</span>
            <b>Week {nextGame.week}</b>
            <span className="text-faint">{"·"}</span>
            <span>{new Date(`${nextGame.game_date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
            <span>{nextGame.is_home ? "vs" : "at"}</span>
            {logos?.[nextGame.opponent] && <img src={logos[nextGame.opponent]} alt="" className="h-5 w-5 object-contain" />}
            <b>{nextGame.opponent}</b>
            <span className="flex-1" />
            {nextGame.team_spread !== null && nextGame.team_spread !== undefined && (
              <span className="glass-pill px-2.5 py-0.5 text-xs text-fg">Line <b className="stat-num">{spreadLabel(team.abbreviation, nextGame.team_spread)}</b></span>
            )}
            {nextGame.total_line !== null && nextGame.total_line !== undefined && (
              <span className="glass-pill px-2.5 py-0.5 text-xs text-fg">Total <b className="stat-num">{nextGame.total_line}</b></span>
            )}
            {nextGame.implied_total !== null && nextGame.implied_total !== undefined ? (
              <span className="glass-pill px-2.5 py-0.5 text-xs text-fg">Implied <b className="stat-num">{formatStat(nextGame.implied_total, 1)}</b></span>
            ) : (
              <span className="glass-pill px-2.5 py-0.5 text-xs text-faint">No line yet</span>
            )}
          </div>
        ) : record ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-[13px]" style={{ background: "color-mix(in srgb, var(--fg) 5%, transparent)" }}>
            <span className="text-xs text-muted">Final</span>
            <b className="stat-num">{record}</b>
            {place && <span className="text-muted">{"·"} {ordinal(place)} in the {team.division}</span>}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-line p-4" style={{ background: "color-mix(in srgb, var(--surface-solid) 55%, transparent)" }}>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">Team EPA per play</span>
          <span className="text-[11.5px] text-faint">{weeksLabel} {"·"} {season}</span>
        </div>
        {rows.map(([label, id, side]) => {
          const mine = values[id]?.[side]?.[team.abbreviation];
          return (
            <div key={label} className="grid grid-cols-[38px_minmax(0,1fr)_62px] items-center gap-2.5 py-0.5">
              <span className="font-mono text-[11px] tracking-wider text-muted">{label}</span>
              <StatStrip values={values[id]?.[side]} team={team.abbreviation} better={side === "d" ? -1 : 1} format="sgn2" width={330} height={30} />
              <span className="stat-num text-right text-[19px] font-semibold text-fg">{formatTeamStat(mine?.[0], "sgn2")}</span>
            </div>
          );
        })}
        <div className="mt-1 flex flex-wrap gap-x-4 text-[11px] text-faint">
          <span>Dots are all 32 teams, better to the right</span>
          <span>Line: league average</span>
        </div>
      </div>
    </section>
  );
}
