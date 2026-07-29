// A nav dropdown menu. Opens on hover on devices that support hover (desktop),
// and on click/tap everywhere (so it works on touch). Closes on outside click,
// Escape, or a route change. The trigger highlights when a child route is active.
import { useEffect, useRef, useState } from "react";
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

export function NavDropdown({ label, items, match }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();
  // Only wire hover on devices that actually hover (avoids the tap→open→close
  // double-fire on touchscreens, where we rely on click instead).
  const [canHover] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(hover: hover)").matches,
  );

  const active = location.pathname.startsWith(match);

  // Close when the route changes (e.g. after picking an item).
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Close on outside click / Escape while open.
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
        onClick={() => setOpen((prev) => !prev)}
        className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
          active ? "glass-pill !text-accent" : "text-muted hover:text-fg"
        }`}
      >
        {label}
        <Caret open={open} />
      </button>

      {open && (
        <div
          role="menu"
          className="glass-popover absolute left-0 top-full z-30 mt-1.5 w-64 p-1.5"
        >
          {items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 transition ${isActive ? "bg-surface-2" : "hover:bg-surface-2"}`
              }
            >
              {({ isActive }) => (
                <>
                  <div className={`text-sm font-semibold ${isActive ? "text-accent" : "text-fg"}`}>
                    {item.label}
                  </div>
                  {item.menuDesc && <div className="text-xs text-muted">{item.menuDesc}</div>}
                </>
              )}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}
