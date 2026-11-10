// A dropdown drawn as a pill with no label above it: the leaderboards' filter row
// ("2026 ▾", "Full season ▾", "PPR ▾"). The value says what the control is, so the label
// moves to the tooltip and the accessible name.
//
// A native <select>, like ScoringPill, because these are short fixed lists that need no
// search; a custom menu would also need portalling out of the glass card. The options
// carry a solid background because a bare <option> inherits the translucent surface and
// is unreadable in the dark theme. `changed` outlines the pill in the accent when the
// value is not the board's default, so a narrowed board says so at a glance.

export function Caret({ className = "" }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      className={`pointer-events-none h-2.5 w-2.5 shrink-0 text-faint ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 4.5L6 8l3.5-3.5" />
    </svg>
  );
}

/** The pill's own classes, shared with the controls that are buttons rather than selects. */
export const PILL_CLASS =
  "glass-pill inline-flex items-center gap-1.5 whitespace-nowrap px-3.5 py-1.5 text-[13px] font-semibold !text-fg transition hover:border-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]";
export const PILL_CHANGED_STYLE = { borderColor: "color-mix(in srgb, var(--accent) 60%, transparent)" };

export function PillSelect({ label, value, onChange, options, changed = false }) {
  return (
    <label
      className={`${PILL_CLASS} relative cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent`}
      style={changed ? PILL_CHANGED_STYLE : undefined}
      title={label}
    >
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="cursor-pointer appearance-none bg-transparent pr-3.5 font-semibold text-fg outline-none [field-sizing:content]"
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            title={option.hint}
            style={{ background: "var(--surface-solid)", color: option.disabled ? "var(--faint)" : "var(--fg)" }}
          >
            {option.label}
            {option.disabled ? " (no data)" : ""}
          </option>
        ))}
      </select>
      <Caret className="absolute right-3" />
    </label>
  );
}
