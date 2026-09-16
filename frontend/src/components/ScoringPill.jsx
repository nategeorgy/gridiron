// The scoring switcher as a single pill — "Scored in [PPR ▾]".
//
// The Command Center used to show the active scoring as a *link* to the leaderboard,
// where the picker lived. That made the one global setting on the page the only thing
// you had to leave the page to change, and it changes what every number below it
// means. So the pill is the control now.
//
// A native <select> rather than a popover, deliberately: it is one of four values, it
// needs no search or description, and a custom menu here would need portalling for
// the same `backdrop-filter` stacking reason every other popover in this app does.
// The options carry an explicit solid background because a bare <option> inherits the
// page's translucent surface and renders unreadable in the dark theme.
import { SCORING_PRESET_OPTIONS, normalizeScoring } from "../constants/scoring";

export function ScoringPill({ scoring, onChange, className = "" }) {
  return (
    <label
      className={`glass-pill inline-flex cursor-pointer items-center gap-2 px-3.5 py-2 text-sm font-semibold focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${className}`}
      title="Every fantasy number on this page is priced in this scoring"
    >
      <span className="text-muted">Scored in</span>
      <span className="relative inline-flex items-center">
        <select
          value={normalizeScoring(scoring)}
          onChange={(event) => onChange(event.target.value)}
          aria-label="League scoring"
          className="cursor-pointer appearance-none bg-transparent pr-4 font-semibold text-accent outline-none"
        >
          {SCORING_PRESET_OPTIONS.map((option) => (
            <option
              key={option.value}
              value={option.value}
              style={{ background: "var(--surface-solid)", color: "var(--fg)" }}
            >
              {option.label}
            </option>
          ))}
        </select>
        <svg
          viewBox="0 0 12 12"
          aria-hidden="true"
          className="pointer-events-none absolute right-0 h-2.5 w-2.5 text-faint"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 4.5L6 8l3.5-3.5" />
        </svg>
      </span>
    </label>
  );
}
