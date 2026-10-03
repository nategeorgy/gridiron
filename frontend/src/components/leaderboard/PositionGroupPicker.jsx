// The position control on the leaderboards: seven fixed groups rather than a free
// multi-select, because each group has presets chosen for it (constants/leaderboards.js).
// A group narrows the table, never the percentile pool: a tight end on RB/WR/TE is
// still ranked among tight ends.
import { POSITION_GROUPS } from "../../constants/leaderboards";

export function PositionGroupPicker({ value, onChange }) {
  return (
    <div className="flex flex-col gap-1 max-md:!basis-full">
      <span className="text-xs font-medium uppercase tracking-wide text-muted">Position</span>
      {/* On a phone a four-column grid: the singles on one row, the groups under them,
          rather than seven pills wrapping wherever they happen to break. */}
      <div
        role="radiogroup"
        aria-label="Position group"
        className="grid grid-cols-4 gap-0.5 rounded-xl border border-edge bg-surface-2 p-1 md:flex md:flex-wrap md:items-center"
      >
        {POSITION_GROUPS.map((group) => {
          const active = group.value === value;
          return (
            <span key={group.value} className="flex items-center max-md:[&>button]:w-full">
              {group.divider && <span aria-hidden="true" className="mx-1 hidden h-5 w-px bg-line md:block" />}
              <button
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChange(group.value)}
                title={group.positions.length > 1 ? group.positions.join(", ") : undefined}
                className={`stat-num whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  active ? "text-fg" : "text-muted hover:text-fg"
                }`}
                style={
                  active
                    ? {
                        background: "var(--surface-solid)",
                        boxShadow:
                          "0 1px 3px rgba(0, 0, 0, 0.18), inset 0 0 0 1px color-mix(in srgb, var(--accent) 60%, transparent)",
                      }
                    : undefined
                }
              >
                {group.label}
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}
