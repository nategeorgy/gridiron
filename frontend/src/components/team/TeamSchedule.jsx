// The team's regular-season fixtures, with results or lines, and its fantasy strength
// of schedule by position above them.
import { Link } from "react-router-dom";
import { formatStat, ordinal } from "../../utils/format";

const POSITIONS = ["QB", "RB", "WR", "TE"];

// Easy is green, hard is red: the same scale the SOS grid uses.
function difficultyTint(difficulty) {
  if (difficulty === null || difficulty === undefined) return "transparent";
  const distance = Math.min(Math.abs(difficulty - 50) / 50, 1);
  return `color-mix(in srgb, var(${difficulty < 50 ? "--pos" : "--neg"}) ${Math.round(distance * 55)}%, transparent)`;
}

function spreadLabel(abbreviation, spread) {
  if (spread === null || spread === undefined) return null;
  if (spread === 0) return `${abbreviation} PK`;
  const size = Math.abs(spread) % 1 ? Math.abs(spread).toFixed(1) : Math.abs(spread).toFixed(0);
  return spread > 0 ? `${abbreviation} −${size}` : `${abbreviation} +${size}`;
}

export function TeamSchedule({ schedule, sos, sosBasis, season, abbreviation, nextWeek, logos, teamIds, scoringLabel }) {
  const games = schedule ?? [];
  return (
    <section className="glass-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-fg">Schedule</h2>
          <p className="text-[11.5px] text-faint">{season} regular season {"·"} strength of schedule in {scoringLabel}</p>
        </div>
        <Link to="/insight/sos" className="text-[11px] text-faint transition hover:text-accent">Full grid</Link>
      </div>
      {POSITIONS.some((position) => sos?.[position]?.full?.difficulty != null) && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          {POSITIONS.map((position) => {
            const full = sos?.[position]?.full, playoffs = sos?.[position]?.playoffs;
            return (
              <div key={position} className="rounded-xl border border-line px-2.5 py-2" style={{ background: "color-mix(in srgb, var(--fg) 4%, transparent)" }}>
                <div className="flex items-baseline justify-between text-xs font-semibold text-fg">
                  <span>{position}</span>
                  <span className="stat-num rounded px-1.5 py-0.5" style={{ background: difficultyTint(full?.difficulty) }} title="Season difficulty, 0-100, higher is harder">{formatStat(full?.difficulty, 0)}</span>
                </div>
                <div className="mt-1 flex justify-between gap-1 text-[11px] text-muted">
                  <span>{full?.rank ? `${ordinal(full.rank)} easiest` : "—"}</span>
                  <span title="Weeks 15-17, when fantasy titles are decided">wk 15–17 <b className="stat-num text-fg">{formatStat(playoffs?.difficulty, 0)}</b></span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[380px] border-collapse text-[12.5px]">
          <thead>
            <tr className="text-[11px] text-faint">
              <th className="px-2 pb-1.5 text-left font-medium">Wk</th>
              <th className="px-2 pb-1.5 text-left font-medium">Date</th>
              <th className="px-2 pb-1.5 text-left font-medium">Opponent</th>
              <th className="px-2 pb-1.5 text-right font-medium">Result / line</th>
              <th className="px-2 pb-1.5 text-right font-medium">Implied</th>
            </tr>
          </thead>
          <tbody>
            {games.length === 0 && <tr><td colSpan={5} className="px-2 py-6 text-center text-muted">No schedule for this season.</td></tr>}
            {games.map((game) => {
              const isNext = game.week === nextWeek;
              const opponentId = teamIds?.[game.opponent];
              return (
                <tr key={game.game_id} className="border-t border-line" style={isNext ? { background: "color-mix(in srgb, var(--accent) 9%, transparent)" } : undefined}>
                  <td className="stat-num px-2 py-1.5 text-left text-fg">{game.week}</td>
                  <td className="px-2 py-1.5 text-left text-muted">{game.game_date ? new Date(`${game.game_date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</td>
                  <td className="px-2 py-1.5 text-left">
                    <span className="flex items-center gap-1.5">
                      <span className="w-4 text-faint">{game.is_home ? "vs" : "at"}</span>
                      {logos?.[game.opponent] && <img src={logos[game.opponent]} alt="" className="h-[18px] w-[18px] object-contain" />}
                      {opponentId ? <Link to={`/teams/${opponentId}`} className="stat-num text-fg hover:text-accent">{game.opponent}</Link> : <span className="stat-num text-fg">{game.opponent}</span>}
                    </span>
                  </td>
                  <td className="stat-num px-2 py-1.5 text-right">
                    {game.result ? (
                      <span className={game.result === "W" ? "text-pos" : game.result === "L" ? "text-neg" : "text-muted"}>{game.result} {game.team_score}–{game.opponent_score}</span>
                    ) : spreadLabel(abbreviation, game.team_spread) ?? <span className="text-faint">No line</span>}
                  </td>
                  <td className="stat-num px-2 py-1.5 text-right text-muted">{game.implied_total != null ? formatStat(game.implied_total, 1) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sosBasis && (
        <p className="mt-2 text-[11px] text-faint">
          Strength of schedule uses {sosBasis.kind === "prior_season" ? `the ${sosBasis.season} season` : `${sosBasis.season}, ${sosBasis.weeks} weeks`}.
        </p>
      )}
    </section>
  );
}
