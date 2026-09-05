// The Leaderboards mega menu (M12) — one trigger, a column per phase.
//
// Replaces three separate nav dropdowns (Fantasy / NFL Production / Opportunity),
// which asked the reader to pick a *lens* before they had picked a subject. People
// arrive wanting receivers and then decide whether they want the fantasy view, the
// production view, or the usage behind both — so the columns are phases and the rows
// inside them are the views. Modelled on Baseball Savant's leaderboard menu.
//
// Same open/close behaviour as NavDropdown: hover on devices that hover, click
// everywhere, closes on outside click, Escape, or a route change.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

function Caret({ open }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={`h-2.5 w-2.5 transition ${open ? "rotate-180 text-accent" : "text-faint"}`}
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

/** Widest the panel is allowed to get, in px — four comfortable columns. */
const MAX_WIDTH = 896;
/** Breathing room kept between the panel and the viewport edges. */
const GUTTER = 16;

export function MegaDropdown({ label, columns, matches }) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState(null);
  const ref = useRef(null);
  const trigger = useRef(null);
  const location = useLocation();
  const [canHover] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(hover: hover)").matches,
  );

  const active = matches.some((prefix) => location.pathname.startsWith(prefix));

  // Measured rather than anchored with `right-0`. The trigger sits mid-header, and a
  // panel this wide right-anchored to it runs off the LEFT edge on anything narrower
  // than a laptop. So: prefer right-aligned to the trigger, then clamp into the
  // viewport. Recomputed on resize because the header is fluid.
  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      // documentElement.clientWidth rather than innerWidth: it excludes the scrollbar,
      // and innerWidth is unreliable in embedded/automated contexts where it can read
      // 0 — which would collapse the panel to nothing.
      const viewport = document.documentElement.clientWidth || window.innerWidth || MAX_WIDTH;
      const width = Math.max(240, Math.min(MAX_WIDTH, viewport - GUTTER * 2));
      const preferred = rect.right - width;
      const left = Math.min(Math.max(GUTTER, preferred), Math.max(GUTTER, viewport - width - GUTTER));
      setBox({ top: rect.bottom + 6, left, width });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={canHover ? () => setOpen(true) : undefined}
      onMouseLeave={canHover ? () => setOpen(false) : undefined}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        ref={trigger}
        onClick={() => setOpen((prev) => !prev)}
        className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition ${
          active ? "glass-pill !text-accent" : "text-muted hover:text-fg"
        }`}
      >
        {label}
        <Caret open={open} />
      </button>

      {open && box && (
        <div
          role="menu"
          className="glass-popover fixed z-30 p-4"
          style={{ top: box.top, left: box.left, width: box.width }}
        >
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            {columns.map((column) => (
              <div key={column.label}>
                <div className="mb-1.5 border-b border-line pb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-accent">
                  {column.label}
                </div>
                <div className="flex flex-col">
                  {column.items.filter(Boolean).map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      role="menuitem"
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        `rounded-lg px-2 py-1.5 transition ${
                          isActive ? "bg-surface-2" : "hover:bg-surface-2"
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <div
                            className={`text-sm font-semibold ${isActive ? "text-accent" : "text-fg"}`}
                          >
                            {item.label}
                          </div>
                          {item.menuDesc && (
                            <div className="text-xs leading-snug text-muted">{item.menuDesc}</div>
                          )}
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
