// One stat filter in the Query Builder: the stat's distribution across the scope as a
// histogram, the chosen range lit on it, and min / max boxes.
//
// Bars are square-root heights, so the tail a filter usually targets (100-yard games,
// 30-point weeks) stays visible beside the pile of ordinary games. The distribution is
// the scope before any stat range, so the card never hides what it filters out.
import { useEffect, useState } from "react";

const WIDTH = 280;
const HEIGHT = 40;

const toDisplay = (value, pct) => (value === null || value === undefined ? "" : pct ? String(+(value * 100).toFixed(2)) : String(value));
const fromDisplay = (text, pct) => {
  if (text.trim() === "") return null;
  const number = Number(text);
  if (Number.isNaN(number)) return null;
  return pct ? number / 100 : number;
};

export function QueryFilterCard({ condition, field, histogram, noun, onChange, onRemove }) {
  const pct = field?.format === "pct";
  const [minText, setMinText] = useState(toDisplay(condition.min, pct));
  const [maxText, setMaxText] = useState(toDisplay(condition.max, pct));
  useEffect(() => {
    setMinText(toDisplay(condition.min, pct));
    setMaxText(toDisplay(condition.max, pct));
  }, [condition.min, condition.max, pct]);

  const commit = () => {
    const min = fromDisplay(minText, pct);
    const max = fromDisplay(maxText, pct);
    if (min !== condition.min || max !== condition.max) onChange({ min, max });
  };
  const onKey = (event) => event.key === "Enter" && event.currentTarget.blur();

  const counts = histogram?.counts ?? [];
  const most = Math.max(1, ...counts);
  const lo = histogram?.lo ?? 0;
  const hi = histogram?.hi ?? 1;
  const binWidth = (hi - lo) / (counts.length || 1);
  const from = condition.min ?? -Infinity;
  const to = condition.max ?? Infinity;

  return (
    <div className="grid gap-1.5 rounded-xl border border-edge bg-surface-2 p-2.5">
      <div className="flex items-center justify-between gap-2 text-[12.5px] font-semibold text-fg">
        <span title={field?.description}>
          {field?.label ?? condition.field}
          {pct && <span className="font-medium text-faint"> (%)</span>}
        </span>
        <button type="button" onClick={onRemove} aria-label={`Remove ${field?.label ?? condition.field}`}
          className="rounded px-1.5 text-base leading-none text-faint transition hover:text-fg">×</button>
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="block h-10 w-full">
        {counts.map((count, index) => {
          const start = lo + index * binWidth;
          const inside = start + binWidth > from && start < to;
          const height = Math.sqrt(count / most) * (HEIGHT - 2);
          return (
            <rect key={index} x={(index * WIDTH) / counts.length + 0.5} y={HEIGHT - height}
              width={WIDTH / counts.length - 1.5} height={height} rx={1.5}
              fill={inside ? "color-mix(in srgb, var(--accent) 75%, transparent)" : "color-mix(in srgb, var(--fg) 16%, transparent)"} />
          );
        })}
      </svg>
      <div className="flex items-center gap-2 text-xs text-muted">
        <input value={minText} onChange={(event) => setMinText(event.target.value)} onBlur={commit} onKeyDown={onKey}
          inputMode="decimal" placeholder="min" aria-label={`Minimum ${field?.label ?? ""}`}
          className="glass-input stat-num w-full min-w-0 px-2 py-1 text-sm" />
        <span>to</span>
        <input value={maxText} onChange={(event) => setMaxText(event.target.value)} onBlur={commit} onKeyDown={onKey}
          inputMode="decimal" placeholder="max" aria-label={`Maximum ${field?.label ?? ""}`}
          className="glass-input stat-num w-full min-w-0 px-2 py-1 text-sm" />
      </div>
      <div className="stat-num text-[10.5px] text-faint">
        {histogram ? `${histogram.in_range.toLocaleString()} of ${histogram.total.toLocaleString()} ${noun} in range` : "Loading…"}
      </div>
    </div>
  );
}
