// Styled labeled <select> used across the filter bars.
//
// An option may set `disabled` with a `hint` (M8): the season picker and the sort
// picker both need to offer a choice while explaining that it has no data — removing
// it outright would leave the user wondering where a metric they know exists went.

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
            disabled={option.disabled}
            title={option.hint}
            style={{
              background: "var(--surface-solid)",
              color: option.disabled ? "var(--faint)" : "var(--fg)",
            }}
          >
            {option.label}
            {option.disabled ? " — no data" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
