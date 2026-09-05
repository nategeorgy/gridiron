// Position filter (M12) — multi-select, matching the weeks picker.
//
// A single-choice dropdown could not answer "receivers and tight ends", which is the
// question a flex decision actually asks, and "all positions" was the only way to see
// two of them at once — which buries them among quarterbacks.
//
// ⚠️ Selecting positions never changes a percentile. Pools are always built per
// position from the whole league (see backend/app/percentiles.py), so filtering to
// RB+WR shows each player ranked among his own position, not among the filtered set.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const POSITIONS = ["QB", "RB", "WR", "TE"];
const WIDTH = 208;
const GUTTER = 12;

export function PositionFilter({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState(null);
  const container = useRef(null);
  const button = useRef(null);
  const popover = useRef(null);

  const selected = value ? value.split(",").filter(Boolean) : [];

  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const rect = button.current.getBoundingClientRect();
    const viewport = document.documentElement.clientWidth || window.innerWidth || 1280;
    const left = Math.min(Math.max(GUTTER, rect.left), Math.max(GUTTER, viewport - WIDTH - GUTTER));
    setBox({ top: rect.bottom + 4, left });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (container.current?.contains(event.target)) return;
      if (popover.current?.contains(event.target)) return;
      setOpen(false);
    };
    const escape = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  // Derived from the current value rather than the captured prop, so a burst of clicks
  // before the next render does not collapse to the last one.
  const toggle = (position) =>
    onChange((current) => {
      const now = current ? current.split(",").filter(Boolean) : [];
      const next = now.includes(position)
        ? now.filter((entry) => entry !== position)
        : POSITIONS.filter((entry) => now.includes(entry) || entry === position);
      return next.join(",");
    });

  const label = selected.length ? selected.join(", ") : "All positions";

  return (
    <div className="flex flex-col gap-1" ref={container}>
      <span className="text-xs font-medium uppercase tracking-wide text-muted">Position</span>
      <button
        type="button"
        ref={button}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className={`glass-input min-w-[124px] px-3 py-2 text-left text-sm ${
          selected.length ? "!text-accent" : ""
        }`}
      >
        {label}
      </button>

      {open &&
        box &&
        createPortal(
          <div
            ref={popover}
            className="fixed z-50 rounded-xl border border-line p-2 shadow-xl"
            style={{ top: box.top, left: box.left, width: WIDTH, background: "var(--surface-solid)" }}
          >
            <div className="grid grid-cols-4 gap-1">
              {POSITIONS.map((position) => {
                const active = selected.includes(position);
                return (
                  <button
                    key={position}
                    type="button"
                    onClick={() => toggle(position)}
                    aria-pressed={active}
                    className={`stat-num rounded-md py-1.5 text-xs font-semibold transition ${
                      active
                        ? "text-[color:var(--accent-ink)]"
                        : "bg-surface-2 text-muted hover:text-fg"
                    }`}
                    style={
                      active
                        ? { background: `var(--position-${position.toLowerCase()})` }
                        : undefined
                    }
                  >
                    {position}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => onChange("")}
              disabled={!selected.length}
              className="btn-ghost mt-2 w-full px-2 py-1 text-xs enabled:hover:!text-accent disabled:opacity-40"
            >
              All positions
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
