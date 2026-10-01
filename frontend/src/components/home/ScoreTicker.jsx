// The week just played as one line of scores across the top of the page (October 2026).
//
// It replaces the Scores & Schedule card: the finals are read at a glance and the
// coming week's lines now live further down, in Week 4 Environments and Matchups, so a
// whole card of both was saying each thing twice. Each score sits beside its own team
// and the loser dims, the same reading the scoreboard card settled on.
import { Link } from "react-router-dom";

function Side({ abbreviation, logoUrl, score, lost, reverse }) {
  const tone = lost ? "font-medium text-faint" : "font-bold text-fg";
  return (
    <span className={`flex items-center gap-1.5 ${reverse ? "flex-row-reverse" : ""}`}>
      {logoUrl ? (
        <img src={logoUrl} alt="" loading="lazy" className="h-4 w-4 flex-none object-contain" />
      ) : (
        <span className="h-4 w-4 flex-none" />
      )}
      <span className={`text-[12px] ${tone}`}>{abbreviation}</span>
      <span className={`stat-num text-[12.5px] ${tone}`}>{score}</span>
    </span>
  );
}

export function ScoreTicker({ scoreboard, isLoading }) {
  const last = scoreboard?.last;
  const games = (last?.games ?? []).filter((game) => game.played);
  if (!isLoading && games.length === 0) return null;

  return (
    <section
      aria-label={last ? `${last.label} scores` : "Scores"}
      className="glass-card flex min-h-[52px] items-center gap-3 overflow-hidden py-2 pl-4 pr-2"
    >
      <span className="flex-none font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-accent">
        {last ? `${last.label} final` : "Final"}
      </span>
      {/* Scrolls sideways on its own rather than wrapping: sixteen games on two lines
          would make the strip as tall as the card it replaced. */}
      <div className="flex min-w-0 flex-1 items-center overflow-x-auto [scrollbar-width:none]">
        {isLoading && (
          <span className="h-6 w-full animate-pulse rounded-lg" style={{ background: "color-mix(in srgb, var(--surface-2) 70%, transparent)" }} />
        )}
        {games.map((game) => (
          <span key={game.game_id} className="flex flex-none items-center gap-2 border-l border-line px-3 first:border-l-0">
            <Side abbreviation={game.away_abbreviation} logoUrl={game.away_logo_url} score={game.away_score} lost={game.winner === "home"} />
            <span className="text-[11px] text-faint">{"·"}</span>
            <Side abbreviation={game.home_abbreviation} logoUrl={game.home_logo_url} score={game.home_score} lost={game.winner === "away"} reverse />
          </span>
        ))}
      </div>
      <Link
        to="/schedule/games"
        className="glass-pill flex-none px-3 py-1.5 text-[12px] font-semibold text-fg transition hover:text-accent"
      >
        {scoreboard?.next ? `${scoreboard.next.label} schedule` : "Schedule"} {"→"}
      </Link>
    </section>
  );
}
