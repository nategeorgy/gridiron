// A modal shell: overlay, escape-to-close, click-outside-to-close.
//
// **Portalled to document.body, always.** `.glass-header`'s backdrop-filter makes the
// header a containing block for `position: fixed` descendants, so an overlay rendered
// inside it is positioned against the header and clipped to it rather than covering
// the viewport. Anything opened from a header control has to portal out; doing it
// here means no caller has to remember.
import { useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * @param {boolean} hideHeader  render only a floating close button. For content that
 *   already carries its own heading — a full player profile, say — where the dialog's
 *   own title bar would just repeat it.
 */
export function Dialog({
  open, title, onClose, children, width = "max-w-lg", hideHeader = false,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 py-12"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`glass-card relative w-full ${width} p-5`}
      >
        {hideHeader ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="glass-pill absolute right-6 top-6 z-10 px-2.5 py-1 text-sm leading-none text-muted transition hover:text-fg"
          >
            ×
          </button>
        ) : (
          <div className="mb-3 flex items-start justify-between gap-3">
            <h2 className="text-lg font-bold tracking-tight text-fg">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-full px-2 py-0.5 text-lg leading-none text-faint transition hover:text-fg"
            >
              ×
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
