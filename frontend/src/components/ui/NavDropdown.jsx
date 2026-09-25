// A nav dropdown menu. Opens on hover on devices that support hover (desktop),
// and on click/tap everywhere (so it works on touch). Closes on outside click,
// Escape, or a route change. The trigger highlights when a child route is active.
//
// The open/close behaviour, including the grace period that stops the menu closing
// while the pointer travels toward it, lives in useHoverMenu. Note the panel's offset is PADDING on a hoverable wrapper rather than
// a margin: a margin would put 6px of dead space between the trigger and the panel,
// and crossing dead space is a mouseleave.
import { NavLink, useLocation } from "react-router-dom";
import { useHoverMenu } from "../../hooks/useHoverMenu";

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
  const { open, ref, hoverProps, closeNow, toggle } = useHoverMenu();
  const { pathname } = useLocation();
  const active = pathname.startsWith(match);

  return (
    <div ref={ref} className="relative" {...hoverProps}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition ${
          active ? "glass-pill !text-accent" : "text-muted hover:text-fg"
        }`}
      >
        {label}
        <Caret open={open} />
      </button>

      {open && (
        // The wrapper carries the gap as padding, so the gap is hoverable.
        <div className="absolute left-0 top-full z-30 w-64 pt-1.5">
          <div role="menu" className="glass-popover p-1.5">
            {items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                role="menuitem"
                onClick={closeNow}
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
        </div>
      )}
    </div>
  );
}
