// Timeframe picker for the ranked boards (M12).
//
// One control: an explicit set of weeks, or none for the full season. The rolling
// presets (last 4 / last 8) were a second way to ask a question this already answers,
// and two controls for one choice invited the meaningless combination of both.
//
// The week list is a popover rather than a multi-select: a native multi-select needs
// ctrl-click to add a second value, which almost nobody discovers.
//
// ⚠️ The popover is **portalled to document.body**, for the reason CLAUDE.md records
// about header modals: `.glass-card` sets `backdrop-filter`, which makes it both a
// containing block and a stacking context, so an absolutely-positioned child cannot
// paint above a *sibling* card no matter what z-index it claims. Rendered in place it
// disappears behind the scoring editor below it.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useGameWeeks } from "../hooks/useGames";

/** Weeks 1..18 — the regular season. Post-season boards filter by type instead. */
const WEEKS = Array.from({ length: 18 }, (_, index) => index + 1);

/** Trailing-window shortcuts, in weeks. */
const SHORTCUTS = [4, 8];

export function TimeframeFilter({ weeks, season, seasonType = "REG", onChange }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const container = useRef(null);
  const button = useRef(null);
  const popover = useRef(null);
  const selected = weeks ? weeks.split(",").filter(Boolean).map(Number) : [];

  // "Last 4" has to mean the last four weeks that were *played*, not weeks 15-18 of a
  // season that has only reached week 9 — which is the one thing the old rolling
  // preset did that a bare week grid cannot. The schedule knows; the client asks it.
  const { data: weekData } = useGameWeeks(
    { season: Number(season), season_type: seasonType },
    { enabled: Boolean(season) },
  );
  const playedWeeks = useMemo(
    () =>
      (weekData?.weeks ?? [])
        .filter((entry) => entry.played > 0)
        .map((entry) => entry.week)
        .sort((a, b) => a - b),
    [weekData],
  );

  const selectLast = (count) => {
    const window = playedWeeks.slice(-count);
    if (window.length) onChange(window.join(","));
  };

  /** True when the current selection is exactly that trailing window. */
  const isLast = (count) => {
    const window = playedWeeks.slice(-count);
    return (
      window.length > 0 &&
      window.length === selected.length &&
      window.every((week, index) => week === selected[index])
    );
  };

  // Position from the trigger's viewport rect, since the popover no longer lives
  // beside it in the tree.
  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const rect = button.current.getBoundingClientRect();
    setAnchor({ top: rect.bottom + 4, left: rect.left });
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

  // Derived from the *current* value rather than the captured prop, so a burst of
  // clicks before the next render does not collapse to the last one.
  const toggleWeek = (week) => {
    onChange((current) => {
      const now = current ? current.split(",").filter(Boolean).map(Number) : [];
      const next = now.includes(week)
        ? now.filter((value) => value !== week)
        : [...now, week].sort((a, b) => a - b);
      return next.join(",");
    });
  };

  const shortcutLabel = SHORTCUTS.find((count) => isLast(count));
  const label = shortcutLabel
    ? `Last ${shortcutLabel}`
    : selected.length
      ? `${selected.length} week${selected.length > 1 ? "s" : ""}`
      : "Full season";

  return (
    <div className="flex items-end gap-2" ref={container}>
      <div className="relative flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Timeframe</span>
        <button
          type="button"
          ref={button}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className={`glass-input min-w-[124px] px-3 py-2 text-left text-sm ${
            selected.length ? "!text-accent" : ""
          }`}
        >
          {label}
        </button>

        {open &&
          anchor &&
          createPortal(
            <div
              ref={popover}
              className="fixed z-50 w-64 rounded-xl border border-line p-3 shadow-xl"
              style={{ top: anchor.top, left: anchor.left, background: "var(--surface-solid)" }}
            >
              <div className="mb-2 flex gap-1">
                {SHORTCUTS.map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => selectLast(count)}
                    disabled={playedWeeks.length < count}
                    aria-pressed={isLast(count)}
                    className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
                      isLast(count)
                        ? "bg-accent text-[color:var(--accent-ink)]"
                        : "bg-surface-2 text-muted enabled:hover:text-fg"
                    }`}
                  >
                    Last {count}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-6 gap-1">
                {WEEKS.map((week) => {
                  const active = selected.includes(week);
                  return (
                    <button
                      key={week}
                      type="button"
                      onClick={() => toggleWeek(week)}
                      aria-pressed={active}
                      className={`stat-num rounded-md py-1.5 text-xs transition ${
                        active
                          ? "bg-accent font-semibold text-[color:var(--accent-ink)]"
                          : "bg-surface-2 text-muted hover:text-fg"
                      }`}
                    >
                      {week}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-faint">
                  {selected.length ? `Weeks ${selected.join(", ")}` : "Whole season"}
                </span>
                <button
                  type="button"
                  onClick={() => onChange({ lastWeeks: "", weeks: "" })}
                  disabled={!selected.length}
                  className="btn-ghost px-2 py-1 enabled:hover:!text-accent disabled:opacity-40"
                >
                  Clear
                </button>
              </div>
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
}
