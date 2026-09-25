// Open/close behaviour for the header's hover menus (NavDropdown).
//
// Why it is a hook: until the Leaderboards mega menu was retired (September 2026) two
// menus shared it. Both had the same two bugs, and both were bugs of *geometry* rather
// than of state, so fixing one copy fixed nothing.
//
//  1. **No grace period.** `onMouseLeave` closed the menu on the same frame the pointer
//     left. A menu you have to keep the pointer inside of is a menu you have to aim at,
//     and the panel is below and to one side of its trigger — so the natural diagonal
//     travel toward an item leaves the trigger before it reaches the panel. Closing is
//     now deferred by CLOSE_DELAY_MS and cancelled if the pointer comes back, which is
//     the standard hover-intent treatment.
//
//  2. **A dead gap.** Both panels sat 6px below their trigger, and those 6px belonged to
//     neither element — crossing them fired a leave. The delay alone would paper over it,
//     but the gap is a real hole in the hover target, so the callers close it by putting
//     the offset *inside* a hoverable wrapper (padding, not margin) rather than between
//     two hoverable things.
//
// A third problem only a shared hook can solve: with a close delay, sweeping from one
// nav menu to its neighbour leaves both open for the length of the delay. So an opening
// menu closes every other one immediately, via the module-level registry below.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

/**
 * How long the pointer may be outside a menu before it closes, in ms. Long enough to
 * cross a gap or clip a corner on the way to an item, short enough that a menu left
 * behind does not linger over the page.
 */
const CLOSE_DELAY_MS = 260;

/** Every currently-open menu's immediate-close callback. Only one menu is ever open. */
const openMenus = new Set();

export function useHoverMenu() {
  const [open, setOpen] = useState(false);
  /** The wrapper that owns both the trigger and the panel — for outside-click tests. */
  const ref = useRef(null);
  const timer = useRef(null);
  const location = useLocation();

  // Only wire hover on devices that actually hover: on a touchscreen a tap fires a
  // synthetic mouseenter, so hover-to-open would fight the click handler.
  const canHover = useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(hover: hover)").matches,
    [],
  );

  const cancelClose = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const closeNow = useCallback(() => {
    cancelClose();
    setOpen(false);
  }, [cancelClose]);

  const openNow = useCallback(() => {
    cancelClose();
    // Close any sibling before opening, or the delay below leaves two panels up.
    for (const close of openMenus) if (close !== closeNow) close();
    setOpen(true);
  }, [cancelClose, closeNow]);

  /** Leave the menu open for a beat, in case the pointer is on its way back. */
  const closeSoon = useCallback(() => {
    cancelClose();
    timer.current = setTimeout(() => {
      timer.current = null;
      setOpen(false);
    }, CLOSE_DELAY_MS);
  }, [cancelClose]);

  const toggle = useCallback(() => {
    if (open) closeNow();
    else openNow();
  }, [open, openNow, closeNow]);

  // Register while open so a sibling opening can close this one on the spot.
  useEffect(() => {
    if (!open) return undefined;
    openMenus.add(closeNow);
    return () => openMenus.delete(closeNow);
  }, [open, closeNow]);

  // Never leave a timer behind: a pending close firing after unmount sets state on a
  // component that is gone.
  useEffect(() => cancelClose, [cancelClose]);

  // Close when the route changes (i.e. after picking an item).
  useEffect(() => {
    closeNow();
  }, [location.pathname, closeNow]);

  // Close on outside click / Escape while open.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) closeNow();
    };
    const onKey = (event) => {
      if (event.key === "Escape") closeNow();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, closeNow]);

  /** Spread onto the wrapper element that `ref` is attached to. */
  const hoverProps = canHover ? { onMouseEnter: openNow, onMouseLeave: closeSoon } : {};

  return { open, ref, hoverProps, openNow, closeNow, closeSoon, toggle };
}
