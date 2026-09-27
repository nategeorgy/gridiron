// A small pill switch (Offense / Defense, Net / Offense / Defense EPA). Same active
// treatment as the leaderboard tabs, so a selected option reads the same everywhere.
const ACTIVE_STYLE = {
  background: "var(--surface-solid)",
  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.18), inset 0 0 0 1px color-mix(in srgb, var(--accent) 60%, transparent)",
};

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="glass-pill flex gap-0.5 p-[3px]" role="group" aria-label={label}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button key={option.value} type="button" aria-pressed={on} disabled={option.disabled}
            onClick={() => onChange(option.value)} title={option.hint}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition disabled:opacity-40 ${on ? "text-fg" : "text-muted hover:text-fg"}`}
            style={on ? ACTIVE_STYLE : undefined}>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
