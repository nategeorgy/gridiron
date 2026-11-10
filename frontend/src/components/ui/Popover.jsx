// A small anchored panel: the leaderboard's Filter, Display and Views menus.
//
// ⚠️ Portalled to document.body and positioned `fixed` from the trigger's rect, for the
// reason CLAUDE.md records: `.glass-card` and `.glass-header` set `backdrop-filter`,
// which makes them containing blocks, so a panel rendered inside the table card would be
// clipped to it. It opens below the trigger and flips above when there is no room, stays
// on screen sideways, follows the trigger on scroll, and closes on Escape or a click
// outside both itself and the trigger.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const GAP = 6;
const EDGE = 12;

/**
 * @param anchorRef  ref to the trigger
 * @param open       whether the panel shows
 * @param onClose    called on Escape or a click outside
 * @param width      panel width in px (capped at the viewport)
 * @param align      "start" lines the panel's left edge with the trigger's, "end" its right
 * @param label      accessible name for the panel
 */
export function Popover({ anchorRef, open, onClose, width = 320, align = "start", label, children }) {
  const panel = useRef(null);
  const [position, setPosition] = useState(null);

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor || !panel.current) return;
    const rect = anchor.getBoundingClientRect();
    const viewport = document.documentElement.clientWidth || window.innerWidth;
    const panelWidth = Math.min(width, viewport - EDGE * 2);
    const height = panel.current.offsetHeight;
    const wanted = align === "end" ? rect.right - panelWidth : rect.left;
    const left = Math.max(EDGE, Math.min(wanted, viewport - panelWidth - EDGE));
    let top = rect.bottom + GAP;
    if (top + height > window.innerHeight - EDGE && rect.top - height - GAP > EDGE) top = rect.top - height - GAP;
    const next = { top: Math.round(Math.max(EDGE, top)), left: Math.round(left), width: panelWidth };
    // Re-placed after every render (the content can change height), so only a real move
    // may set state, or the panel would render forever.
    setPosition((previous) =>
      previous && previous.top === next.top && previous.left === next.left && previous.width === next.width
        ? previous
        : next,
    );
  }, [anchorRef, width, align]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    place();
  }, [open, place, children]);

  // The panel is hidden until it has been placed, and a hidden field cannot take focus,
  // so `autoFocus` would do nothing: a field marked data-autofocus is focused once the
  // panel shows instead.
  const placed = position !== null;
  useEffect(() => {
    if (open && placed) panel.current?.querySelector("[data-autofocus]")?.focus();
  }, [open, placed]);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (event) => {
      if (panel.current?.contains(event.target)) return;
      if (anchorRef.current?.contains(event.target)) return;
      onClose();
    };
    const escape = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, onClose, anchorRef, place]);

  if (!open) return null;
  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label={label}
      className="glass-popover fixed z-50 grid max-h-[calc(100vh-24px)] grid-cols-[minmax(0,1fr)] gap-2.5 overflow-y-auto p-3"
      style={{
        top: position?.top ?? -9999,
        left: position?.left ?? -9999,
        width: position?.width ?? width,
        visibility: position ? "visible" : "hidden",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
