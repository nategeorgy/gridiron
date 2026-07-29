// Styled labeled <select> used across the filter bars.

export function Select({ label, value, onChange, options }) {
  return (
    <label className="flex flex-col gap-1">
      {label && (
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          {label}
        </span>
      )}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="glass-input px-3 py-2 text-sm"
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            style={{ background: "var(--surface-solid)", color: "var(--fg)" }}
          >
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
