// The handle that splits the draft board from the player pool below it (M9).
//
// **Which half you want depends on the moment.** Between your picks the board is the
// interesting thing and the pool is a list you are not touching; on the clock it is
// exactly the other way round. Rather than pick one split and defend it, this lets the
// reader move it — all the way up to just under the team headers, or down until the
// board fills the screen.
//
// It resizes the *board*; the pool and roster sit in normal flow beneath and follow it,
// which is why they move together without being told to.
import { useCallback, useEffect, useRef } from "react";

/** How far a keyboard press moves the split. Roughly one board row. */
const STEP = 34;

export function BoardResizer({ height, onChange, min, max }) {
  // Where the pointer was when the drag started, and the height it started from —
  // tracked so the split follows the cursor exactly rather than drifting by the
  // handle's own offset.
  const drag = useRef(null);

  const clamp = useCallback(
    (value) => Math.max(min, Math.min(max, value)),
    [min, max],
  );

  const onPointerDown = (event) => {
    // preventDefault stops the drag selecting text across the page — but it also
    // suppresses the focus a mousedown would normally give a tabbable element, which
    // silently made the arrow keys unreachable after a click. Focus explicitly.
    event.preventDefault();
    event.currentTarget.focus();
    drag.current = { y: event.clientY, height };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event) => {
    if (!drag.current) return;
    onChange(clamp(drag.current.height + (event.clientY - drag.current.y)));
  };

  const endDrag = (event) => {
    if (!drag.current) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  // While dragging, stop the pointer selecting text across the whole page — without
  // this a drag upward highlights the board like a paragraph.
  useEffect(() => {
    const stop = () => {
      drag.current = null;
    };
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, []);

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize the draft board"
      aria-valuenow={Math.round(height)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => onChange(clamp(Math.round((min + max) / 2)))}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          onChange(clamp(height - STEP));
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          onChange(clamp(height + STEP));
        } else if (event.key === "Home") {
          event.preventDefault();
          onChange(min);
        } else if (event.key === "End") {
          event.preventDefault();
          onChange(max);
        }
      }}
      title="Drag to resize the board — double-click to centre it"
      className="group flex h-2 shrink-0 cursor-row-resize touch-none select-none items-center justify-center rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
    >
      {/* A grip rather than a hairline: an invisible drag target is one nobody finds.
          It stays quiet until hovered or focused. */}
      <span
        aria-hidden="true"
        className="h-0.5 w-14 rounded-full bg-line transition group-hover:h-1 group-hover:bg-accent group-focus-visible:h-1 group-focus-visible:bg-accent"
      />
    </div>
  );
}
