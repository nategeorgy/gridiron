// The Vegas board's detail half: one offense, its share of the game total, and the
// fantasy-relevant players inside it.
//
// This is the rail above expanded. The rail answers "where are the points this week";
// this answers "and who is in line for them", which is the question that actually ends
// in a lineup decision. Both are ordered by implied total, so a team found in one is
// in the same place in the other.
//
// The split bar shows this offense against its OPPONENT's implied total rather than
// against the league — a 24-point offense in a 52-point game is in a shootout, and the
// same 24 in a 44-point game is the favourite. That difference is the whole point.
//
// ⚠️ **No text sits inside the bar.** The first version printed both implied totals on
// the two fills, which measured 2.83:1 in the light theme (white on `--accent`) and
// 3.63:1 in the dark one — the same trap `FinishChip` documents: a solid accent fill
// cannot carry legible small text in both themes. The numbers live outside it, on the
// card surface, where the contrast is the card's and already known good.
import { Link } from "react-router-dom";
import { FavoriteStar } from "../FavoriteStar";
import { PositionTag } from "../PositionTag";
import { formatStat } from "../../utils/format";

export function OffenseCard({ team, players }) {
  const opponentImplied =
    team.implied != null && team.total != null ? team.total - team.implied : null;
  const share =
    team.implied != null && team.total ? (team.implied / team.total) * 100 : 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface-2">
      <div className="grid items-center gap-3 px-3 py-2.5 sm:grid-cols-[minmax(150px,1fr)_minmax(170px,1.2fr)_62px]">
        <span className="flex items-center gap-2">
          {team.logoUrl ? (
            <img src={team.logoUrl} alt="" loading="lazy" className="h-[22px] w-[22px] flex-none object-contain" />
          ) : (
            <span className="h-[22px] w-[22px] flex-none rounded-full bg-surface" />
          )}
          <Link to={`/teams/${team.teamId}`} className="text-[13px] font-bold text-fg transition hover:text-accent">
            {team.abbreviation}
          </Link>
          <span className="stat-num text-[10.5px] text-faint">
            {team.isHome ? "vs" : "@"} {team.opponent}
          </span>
          {team.divGame && (
            <span
              className="rounded border px-1.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-warn"
              style={{ borderColor: "color-mix(in srgb, var(--warn) 35%, transparent)" }}
              title="Division game"
            >
              Div
            </span>
          )}
        </span>

        <span className="flex items-center gap-2.5">
          <span
            className="flex h-2 flex-1 overflow-hidden rounded-full bg-surface"
            title={
              team.implied != null
                ? `${team.abbreviation} ${formatStat(team.implied, 1)} · ${team.opponent} ${formatStat(opponentImplied, 1)}`
                : "Not priced yet"
            }
          >
            {team.implied != null && (
              <>
                <span className="block h-full bg-accent" style={{ width: `${share}%` }} />
                <span
                  className="block h-full"
                  style={{
                    width: `${100 - share}%`,
                    // See ImpliedSplit on why this is not `bg-accent/30`.
                    background: "color-mix(in srgb, var(--accent) 30%, transparent)",
                  }}
                />
              </>
            )}
          </span>
          <span className="stat-num w-[38px] flex-none text-right text-[10.5px] text-faint">
            {opponentImplied != null ? formatStat(opponentImplied, 1) : ""}
          </span>
        </span>

        <span className="text-right">
          {team.implied != null ? (
            <>
              <span className="stat-num block text-[15px] font-bold leading-none text-fg">
                {formatStat(team.implied, 1)}
              </span>
              <span className="stat-num mt-0.5 block text-[9.5px] text-faint">
                of {formatStat(team.total, 1)}
              </span>
            </>
          ) : (
            <span className="text-[10px] italic text-faint">no line</span>
          )}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 border-t border-line px-3 pb-3 pt-2.5">
        {players.length === 0 ? (
          <span className="text-[11px] text-faint">No charted players at this position.</span>
        ) : (
          players.map((player) => (
            <span
              key={player.player_id}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pl-1.5 pr-2.5 text-[11.5px]"
            >
              <FavoriteStar playerId={player.player_id} size="h-3 w-3" />
              <PositionTag position={player.position} />
              <Link
                to={`/players/${player.player_id}`}
                className="font-medium text-fg transition hover:text-accent"
              >
                {player.name}
              </Link>
              <span className="stat-num text-[10.5px] text-faint" title="Fantasy points per game, in your scoring">
                {formatStat(player.fantasy_ppg, 1)}
              </span>
            </span>
          ))
        )}
      </div>
    </div>
  );
}
