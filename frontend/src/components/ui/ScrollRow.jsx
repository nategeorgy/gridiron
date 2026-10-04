// A row that scrolls sideways when it does not fit: the tab strips on a phone.
//
// Wrapping was the old answer, and inside a rounded-full track it turned five tabs into
// a lumpy two- or four-line blob. Scrolling keeps one line; the edge that hides more
// tabs fades, so the row says it scrolls, and the selected tab is brought into view
// when it changes, so a link to the last tab does not open on a row showing the first.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const SELECTED = '[aria-selected="true"], [aria-checked="true"], [aria-pressed="true"], [aria-current="page"]';
const FADE = 28;

export function ScrollRow({ children, className = "" }) {
  const ref = useRef(null);
  const lastSelected = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const row = ref.current;
    if (!row) return;
    const left = row.scrollLeft > 2;
    const right = row.scrollLeft + row.clientWidth < row.scrollWidth - 2;
    setEdges((now) => (now.left === left && now.right === right ? now : { left, right }));
  }, []);

  // Only when the selection changes: re-centring on every render would yank the row
  // back while someone is scrolling it.
  useLayoutEffect(() => {
    const row = ref.current;
    const active = row?.querySelector(SELECTED);
    if (!row || !active || active === lastSelected.current) return;
    lastSelected.current = active;
    if (row.scrollWidth <= row.clientWidth) return;
    const rowBox = row.getBoundingClientRect();
    const box = active.getBoundingClientRect();
    const offset = box.left - rowBox.left + row.scrollLeft;
    row.scrollLeft = Math.max(0, offset - (row.clientWidth - box.width) / 2);
  });

  useEffect(() => {
    const row = ref.current;
    if (!row) return undefined;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    if (row.firstElementChild) observer.observe(row.firstElementChild);
    row.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      row.removeEventListener("scroll", measure);
    };
  }, [measure]);

  const mask =
    edges.left || edges.right
      ? `linear-gradient(to right, ${edges.left ? `transparent, #000 ${FADE}px` : "#000, #000"}, ${
          edges.right ? `#000 calc(100% - ${FADE}px), transparent` : "#000"
        })`
      : undefined;

  return (
    <div
      ref={ref}
      className={`scroll-row min-w-0 ${className}`}
      style={mask ? { WebkitMaskImage: mask, maskImage: mask } : undefined}
    >
      {children}
    </div>
  );
}
