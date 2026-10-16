// The top of a game page: both teams, then the score by quarter (a finished game) or the
// kickoff and the implied team totals (an upcoming one), and a line of context beneath:
// when and where, the line and how it landed, rest, and the market's view.
import { Link } from "react-router-dom";
import { dateParts, formatKickoff, slotOf } from "../schedule/kickoff";
import { formatStat } from "../../utils/format";
import { inkOn } from "./colors";

// nflverse's roof values, as a reader would say them.
const ROOFS = { outdoors: "Outdoors", dome: "Dome", closed: "Roof closed", open: "Roof open" };

const percent = (value) => (value === null || value === undefined ? "—" : `${Math.round(value * 100)}%`);
const moneyline = (value) => (value > 0 ? `+${value}` : `−${Math.abs(value)}`);

function spreadText(game) {
  if (game.spread_line === null || game.spread_line === undefined) return null;
  if (!game.favorite) return "Pick'em";
  const size = Math.abs(game.spread_line);
  return `${game.favorite} −${size % 1 ? size.toFixed(1) : size.toFixed(0)}`;
}

function nickname(name) {
  return name?.split(" ").pop() ?? "";
}

function city(name) {
  const nick = nickname(name);
  return name?.slice(0, -(nick.length)).trim() ?? "";
}

function TeamSide({ team, side, played, won, implied }) {
  const home = side === "home";
  return (
    <div className={`flex min-w-0 items-center gap-3 sm:gap-4 ${home ? "flex-row-reverse text-right" : ""}`}>
      {team.logo_url && <img src={team.logo_url} alt="" className="h-12 w-12 flex-none object-contain sm:h-[72px] sm:w-[72px]" />}
      <div className="min-w-0">
        <div className="truncate text-[11px] font-semibold text-faint sm:text-xs">
          {city(team.name)}{team.record ? ` · ${team.record}` : ""}
        </div>
        <Link to={`/teams/${team.team_id}`} className="block truncate text-lg font-bold tracking-tight text-fg transition hover:text-accent sm:text-[22px]">
          {nickname(team.name)}
        </Link>
      </div>
      <span
        className={`stat-num ${home ? "mr-auto" : "ml-auto"} ${played ? "text-[34px] sm:text-[52px]" : "text-[22px] sm:text-[30px]"} font-bold leading-none tracking-tight ${
          played ? (won ? "text-fg" : "text-faint") : "text-muted"
        }`}
        title={played ? undefined : "Implied team total"}
      >
        {played ? team.score : formatStat(implied, 1)}
      </span>
    </div>
  );
}

function Linescore({ game }) {
  const periods = game.periods ?? [];
  if (!periods.length) return null;
  return (
    <table className="stat-num border-collapse text-[12.5px]">
      <thead>
        <tr>
          <th />
          {periods.map((period) => <th key={period} className="px-2 pb-1 text-center text-[10px] font-semibold tracking-wide text-faint">{period}</th>)}
          <th className="px-2 pb-1 text-center text-[10px] font-semibold tracking-wide text-faint">T</th>
        </tr>
      </thead>
      <tbody>
        {["away", "home"].map((side) => (
          <tr key={side}>
            <td className="pr-2 font-sans font-bold text-fg">{game[side].abbreviation}</td>
            {game[side].linescore.map((points, index) => <td key={index} className="px-2 py-0.5 text-center text-fg">{points}</td>)}
            <td className="px-2 py-0.5 text-center font-extrabold text-fg">{game[side].score}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ImpliedBar({ game, colors }) {
  const away = game.away_implied, home = game.home_implied;
  if (away === null || away === undefined) return <span className="text-xs text-faint">No line yet</span>;
  const share = (away / (away + home)) * 100;
  return (
    <div className="w-full">
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
        <span style={{ width: `${share}%`, background: colors.away }} />
        <span className="flex-1" style={{ background: colors.home }} />
      </div>
      <div className="stat-num mt-1.5 flex justify-between text-[11.5px]">
        <span><b className="text-fg">{formatStat(away, 1)}</b> <span className="text-faint">{game.away.abbreviation}</span></span>
        <span className="text-faint">o/u {formatStat(game.total_line, 1)}</span>
        <span><span className="text-faint">{game.home.abbreviation}</span> <b className="text-fg">{formatStat(home, 1)}</b></span>
      </div>
    </div>
  );
}

export function GameHeader({ game, colors }) {
  const played = game.played;
  const parts = dateParts(game.game_date);
  const slot = slotOf(game);
  const prime = ["Thursday Night", "Sunday Night", "Monday Night", "Wednesday Night"].includes(slot);
  const result = game.line_result;
  const awayWon = played && game.away.score > game.home.score;
  const homeWon = played && game.home.score > game.away.score;
  const meta = [
    `${parts ? `${parts.dow} ${parts.mon} ${parts.day}` : ""}${game.kickoff_time ? ` · ${formatKickoff(game.kickoff_time)}` : ""}${prime ? ` · ${slot}` : ""}`,
    [game.stadium, ROOFS[game.roof] ?? null, game.surface ? (game.surface === "grass" ? "Grass" : "Turf") : null].filter(Boolean).join(" · "),
  ];

  return (
    <section className="glass-card overflow-hidden">
      <div className="grid grid-cols-1 items-center gap-4 p-4 sm:p-6 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-6">
        <TeamSide team={game.away} side="away" played={played} won={awayWon} implied={game.away_implied} />
        <div className="order-first flex flex-col items-center gap-2 md:order-none md:min-w-[300px]">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
            {played ? (game.overtime ? "Final · OT" : "Final") : game.week_label}
          </span>
          {played ? (
            <Linescore game={game} />
          ) : (
            <>
              <span className="text-[15px] font-bold text-fg">{parts ? `${parts.dow}, ${parts.mon} ${parts.day}` : ""}{game.kickoff_time ? ` · ${formatKickoff(game.kickoff_time)}` : ""}</span>
              <ImpliedBar game={game} colors={colors} />
              {spreadText(game) && <span className="text-xs text-faint">{spreadText(game)} · implied team totals</span>}
            </>
          )}
        </div>
        <TeamSide team={game.home} side="home" played={played} won={homeWon} implied={game.home_implied} />
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 border-t border-line px-4 py-3 text-[12px] text-muted sm:px-6">
        {played && <span className="font-semibold text-fg">{game.week_label}</span>}
        {meta.filter(Boolean).map((text) => <span key={text}>{text}</span>)}
        {played && spreadText(game) && (
          <span>Line <b className="text-fg">{spreadText(game)}</b>{result ? ` · ${result.covered ? `${result.covered} covered` : "push"}` : ""}</span>
        )}
        {played && game.total_line != null && result && (
          <span>Total <b className="text-fg">{formatStat(game.total_line, 1)}</b> · {result.over_under === "push" ? "push" : `${result.over_under === "over" ? "Over" : "Under"} (${result.total_points})`}</span>
        )}
        {played && game.pregame_home_wp != null && (
          <span>Pregame win chance <b className="text-fg">{game.home.abbreviation} {percent(game.pregame_home_wp)}</b></span>
        )}
        {!played && (game.away.rest_days || game.home.rest_days) && (
          <span>Rest <b className="text-fg">{game.away.abbreviation} {game.away.rest_days ?? "—"} days</b> · <b className="text-fg">{game.home.abbreviation} {game.home.rest_days ?? "—"} days</b></span>
        )}
        {!played && game.home_moneyline != null && (
          <span>Moneyline {game.away.abbreviation} {moneyline(game.away_moneyline)} · {game.home.abbreviation} {moneyline(game.home_moneyline)}</span>
        )}
        {!played && game.home_win_chance != null && (
          <span>Win chance <b className="text-fg">{game.home.abbreviation} {percent(game.home_win_chance)}</b></span>
        )}
      </div>
    </section>
  );
}

/** A team's colour swatch with its abbreviation, for chart legends. */
export function TeamKey({ teams }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted">
      {teams.map(({ abbreviation, color }) => (
        <span key={abbreviation} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />
          {abbreviation}
        </span>
      ))}
    </div>
  );
}

/** A small chip in a team's colour, for "who" in a dense row. */
export function TeamChip({ abbreviation, color }) {
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-bold leading-none" style={{ background: color, color: inkOn(color) }}>
      {abbreviation}
    </span>
  );
}
