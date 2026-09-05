// Scoring and league size in one card (M12).
//
// They were two adjacent cards, which read as two unrelated decisions — but they are
// one thing: how *your* league scores and how deep it runs. Both feed every fantasy
// number on the page, and the replacement level shown inside depends on both at once.
// Splitting them also cost a lot of vertical space above the table, which is the part
// people came for.
import { LeagueControl } from "./LeagueControl";
import { ScoringControl } from "./ScoringControl";

export function LeagueSettings({
  scoring,
  onScoringChange,
  league,
  onLeagueChange,
  replacement,
}) {
  return (
    <div className="glass-card p-4">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-faint">
        League Settings
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <ScoringControl bare scoring={scoring} onChange={onScoringChange} />
        {/* A rule between them on wide screens, above them when they stack. */}
        <div className="border-t border-line pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
          <LeagueControl
            bare
            league={league}
            onChange={onLeagueChange}
            replacement={replacement}
          />
        </div>
      </div>
    </div>
  );
}
