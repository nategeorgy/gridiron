// Styled labeled <select> used across the filter bar.

export function Select({ label, value, onChange, options }) {
  return (
    <label className="flex flex-col gap-1">
      {label && (
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {label}
        </span>
      )}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-navy-700 bg-navy-850 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-navy-850">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
