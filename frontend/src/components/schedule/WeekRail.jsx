// The week picker, as a rail rather than a <select>.
//
// A dropdown can say "Week 12 · no lines" but only once you have opened it and read
// every option. The rail says it for the whole season at once: how much of each week
// is **played** and, for the weeks ahead, how much of it the market has **priced** —
// which matters because most of a season carries no line in September, and an unpriced
// week is a state rather than an empty page.
//
// The meter is deliberately one bar with two meanings, keyed by the label beneath it:
// for a week in the past it is the share played, for a week ahead the share priced.
// They are never both partial in practice (a week is priced long before it kicks off),
// so one bar reads unambiguously and two would be noise.
const ALL = "all";

// ⚠️ Not `bg-accent/10`: Tailwind's opacity modifier is broken on this project's
// colour tokens (they are `var(--accent)`, a hex, so the modifier emits an invalid
// `rgb(var(--accent) / .1)` and renders transparent). See ImpliedSplit.
const ACTIVE_FILL = "color-mix(in srgb, var(--accent) 12%, transparent)";

/**
 * The week a schedule surface should open on: the first that is not finished, else the
 * last of the season.
 *
 * Opening on "all weeks" would be every fixture in the season, and opening on week 1
 * would be stale from late September. Callers keep this OUT of the URL (a `useUrlState`
 * default of "") so a shared link carries a week only when the sender picked one.
 */
export function defaultWeek(weeks) {
  if (!weeks || weeks.length === 0) return null;
  const upcoming = weeks.find((entry) => entry.games > 0 && entry.played < entry.games);
  return String((upcoming ?? weeks[weeks.length - 1]).week);
}

/** @param {{week:number,games:number,played:number,priced:number}[]} weeks */
export function WeekRail({ weeks, value, onChange, allowAll = true }) {
  if (!weeks || weeks.length === 0) return null;

  return (
    <div
      role="tablist"
      aria-label="Week"
      className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
    >
      {allowAll && (
        <button
          type="button"
          role="tab"
          aria-selected={value === ALL}
          onClick={() => onChange(ALL)}
          className={`flex-none rounded-xl border px-3 py-2 text-center transition ${
            value === ALL
              ? "border-accent text-accent"
              : "border-line bg-surface-2 text-muted hover:text-fg"
          }`}
        >
          <div className="text-[13px] font-bold leading-tight">All</div>
          <div className="mt-0.5 text-[8.5px] font-bold uppercase tracking-[0.06em]">
            weeks
          </div>
        </button>
      )}

      {weeks.map((entry) => {
        const done = entry.games > 0 && entry.played === entry.games;
        const partly = entry.played > 0 && !done;
        const active = String(entry.week) === String(value);
        // Played beats priced: once a game is final its line is history.
        const state = done ? "final" : partly ? "live" : entry.priced > 0 ? "priced" : "no line";
        const fill = done
          ? 100
          : partly
            ? (entry.played / entry.games) * 100
            : entry.games > 0
              ? (entry.priced / entry.games) * 100
              : 0;

        return (
          <button
            key={entry.week}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(String(entry.week))}
            title={
              done
                ? `Week ${entry.week} — all ${entry.games} games final`
                : `Week ${entry.week} — ${entry.priced} of ${entry.games} games priced`
            }
            style={active ? { background: ACTIVE_FILL } : undefined}
            className={`w-[52px] flex-none rounded-xl border pb-1.5 pt-2 text-center transition ${
              active
                ? "border-accent"
                : `border-line bg-surface-2 hover:border-edge ${done ? "opacity-70" : ""}`
            }`}
          >
            <div
              className={`stat-num text-[13px] font-bold leading-tight ${
                active ? "text-accent" : "text-fg"
              }`}
            >
              {entry.week}
            </div>
            <div
              className={`mt-0.5 text-[8.5px] font-bold uppercase tracking-[0.06em] ${
                active ? "text-accent" : done ? "text-muted" : "text-faint"
              }`}
            >
              {state}
            </div>
            <div className="mx-[7px] mt-1 h-[3px] overflow-hidden rounded-full bg-surface">
              <span
                className={`block h-full ${state === "no line" ? "bg-transparent" : "bg-accent"}`}
                style={{ width: `${fill}%` }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}

WeekRail.ALL = ALL;
