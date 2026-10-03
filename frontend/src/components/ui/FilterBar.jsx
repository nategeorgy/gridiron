// The filter card on the board pages.
//
// From md up it is the row of controls it has always been. Below md it folds to one
// line that states what is picked ("RB/WR/TE · 2026 · Full season · PPR") and opens on
// a tap: six labelled dropdowns stacked down a phone took most of the first screen on
// every board, and the table they filter started below it.
//
// `className` styles the controls row exactly as the page's own card did, so the
// desktop layout is unchanged; the card itself, and the fold, live here.
import { useId, useState } from "react";

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}

function Caret({ open }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={`h-3 w-3 shrink-0 transition ${open ? "rotate-180 text-accent" : "text-faint"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 4.5L6 8l3.5-3.5" />
    </svg>
  );
}

/** "a · b · c", skipping empty parts. */
export function summarize(...parts) {
  return parts.flat().filter(Boolean).join(" · ");
}

/**
 * @param summary    the current picks, one line, shown folded on a phone
 * @param className  the controls row's classes (the page's own card layout)
 * @param aside      a control that sits beside the summary on a phone, such as the
 *                   leaderboard's Edit Columns, which has its own place on desktop
 * @param footer     a part of the card that never folds, such as the schedule's week
 *                   rail: it is how those pages are navigated, not a filter on them
 */
export function FilterBar({
  summary,
  className = "flex flex-wrap gap-3 p-4",
  aside = null,
  footer = null,
  children,
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="glass-card">
      <div className="flex items-center md:hidden">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 pr-3 text-left"
        >
          <span className="text-muted">
            <FilterIcon />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-faint">Filters</span>
            <span className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-fg">{summary}</span>
          </span>
          <Caret open={open} />
        </button>
        {aside && <div className="shrink-0 py-2 pr-3">{aside}</div>}
      </div>
      <div
        id={panelId}
        className={`filter-fields ${open ? "max-md:border-t max-md:border-line" : "max-md:hidden"} ${className}`}
      >
        {children}
      </div>
      {footer}
    </div>
  );
}
