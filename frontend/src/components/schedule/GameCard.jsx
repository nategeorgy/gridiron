// One fixture, as a card: both teams with their logos, the market's line on the
// favourite, and the implied-total split beneath.
//
// A played game shows the score where an upcoming one shows the spread — the same
// slot, because they answer the same question at different times ("who is ahead").
// Both teams stay clickable through to their team page either way.
import { Link } from "react-router-dom";
import { ImpliedSplit } from "./ImpliedSplit";
import { formatKickoffShort } from "./kickoff";
import { formatStat } from "../../utils/format";

function TeamLine({ teamId, abbreviation, logoUrl, score, spread, played, won }) {
  return (
    <div className="flex items-center gap-2.5">
      {logoUrl ? (
        <img src={logoUrl} alt="" loading="lazy" className="h-[22px] w-[22px] flex-none object-contain" />
      ) : (
        <span className="h-[22px] w-[22px] flex-none rounded-full bg-surface-2" />
      )}
      <Link
        to={`/teams/${teamId}`}
        className={`text-sm font-bold transition hover:text-accent ${
          played ? (won ? "text-fg" : "text-muted") : spread != null ? "text-fg" : "text-muted"
        }`}
      >
        {abbreviation}
      </Link>
      {played ? (
        <span
          className={`stat-num ml-auto text-[15px] ${
            won ? "font-bold text-fg" : "font-medium text-faint"
          }`}
        >
          {score}
        </span>
      ) : (
        <span className="stat-num ml-auto text-[11px] font-semibold text-accent">
          {spread != null ? formatStat(spread, 1) : ""}
        </span>
      )}
    </div>
  );
}

export function GameCard({ game }) {
  const awayFavoured = game.favorite === game.away_abbreviation;
  const homeFavoured = game.favorite === game.home_abbreviation;

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface-2 p-3">
      <div className="flex items-center justify-between text-[10.5px] text-faint">
        <span>{formatKickoffShort(game.kickoff_time)}</span>
        <span className="flex items-center gap-1.5">
          {game.div_game && (
            <span
              className="rounded border px-1.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-warn"
              style={{ borderColor: "color-mix(in srgb, var(--warn) 35%, transparent)" }}
              title="Division game"
            >
              Div
            </span>
          )}
          {(game.roof === "dome" || game.roof === "closed") && (
            <span
              className="rounded border border-line px-1.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-faint"
              title={game.roof === "closed" ? "Retractable roof, closed" : "Indoors"}
            >
              Dome
            </span>
          )}
        </span>
      </div>

      <TeamLine
        teamId={game.away_team_id}
        abbreviation={game.away_abbreviation}
        logoUrl={game.away_logo_url}
        score={game.away_score}
        spread={awayFavoured ? game.favorite_spread : null}
        played={game.played}
        won={game.winner === "away"}
      />
      <TeamLine
        teamId={game.home_team_id}
        abbreviation={game.home_abbreviation}
        logoUrl={game.home_logo_url}
        score={game.home_score}
        spread={homeFavoured ? game.favorite_spread : null}
        played={game.played}
        won={game.winner === "home"}
      />

      <ImpliedSplit away={game.away_implied} home={game.home_implied} total={game.total_line} />
    </div>
  );
}
