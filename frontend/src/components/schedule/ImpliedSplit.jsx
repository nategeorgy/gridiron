// The implied-total split bar — the one piece of the schedule that is properly ours.
//
// The market prices a game twice (a spread and a total); splitting them gives each
// offense's implied points. Two numbers in a shared "Implied A/H" cell is the least
// legible way to show the most fantasy-relevant thing on the board, so the two are
// drawn as proportions of the game's total with the numbers beneath them.
//
// ⚠️ The bar encodes the SPLIT, not the size. Two games with the same spread and very
// different totals draw the same bar, which is why the total is always printed between
// the two figures — a reader comparing games needs both, and the bar alone answers only
// "who is favoured".
import { formatStat } from "../../utils/format";

// ⚠️ Tailwind's `/45` opacity modifier does NOT work on this project's colour tokens:
// they are defined as `var(--accent)` (a hex), so `bg-accent/45` compiles to
// `rgb(var(--accent) / .45)`, which is invalid and renders fully transparent — the
// away half of this bar silently vanished. Every translucent token fill in the
// codebase uses `color-mix` for exactly this reason (see PositionTag, FinishChip).
const AWAY_FILL = "color-mix(in srgb, var(--accent) 45%, transparent)";

/**
 * @param {number|null} away    away team's implied total
 * @param {number|null} home    home team's implied total
 * @param {number|null} total   the game total, printed between them
 * @param {boolean} compact     drop the caption row (dense contexts)
 */
export function ImpliedSplit({ away, home, total, compact = false }) {
  const priced = away != null && home != null;
  // An unpriced game is a state, not a zero: render the track empty rather than
  // splitting it 50/50, which would look like a pick'em nobody posted.
  const sum = priced ? away + home : 0;
  const awayPct = sum > 0 ? (away / sum) * 100 : 0;

  return (
    <div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-2">
        {priced && (
          <>
            <span
              className="block h-full"
              style={{ width: `${awayPct}%`, background: AWAY_FILL }}
            />
            <span className="block h-full bg-accent" style={{ width: `${100 - awayPct}%` }} />
          </>
        )}
      </div>
      {!compact && (
        <div className="stat-num mt-1.5 flex items-baseline justify-between text-[10.5px] text-faint">
          {priced ? (
            <>
              <span className="font-semibold text-muted">{formatStat(away, 1)}</span>
              <span>o/u {formatStat(total, 1)}</span>
              <span className="font-semibold text-muted">{formatStat(home, 1)}</span>
            </>
          ) : (
            <span
              className="italic"
              title="The market has not posted a line for this game yet. Lines appear a few weeks out, with look-ahead numbers on a handful of games beyond that."
            >
              no line yet
            </span>
          )}
        </div>
      )}
    </div>
  );
}
