// Column-header tooltip for the ranked tables (M12).
//
// Replaces the native `title` attribute, which had two problems: the browser waits
// roughly a second before showing it, and it renders in the OS's own styling — so the
// one place we explain what a stat *means* looked like a system error message and
// arrived after the reader had already moved on.
//
// This appears immediately (a very short delay only to stop it strobing as the pointer
// sweeps a 35-column header row), carries the full label, the definition, the season
// window when the metric has one, and the hint that the header sorts.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Long enough not to flicker while sweeping the header row, short enough to feel free. */
const OPEN_DELAY_MS = 90;
const WIDTH = 300;
const GUTTER = 12;

export function useStatTooltip() {
  const [tip, setTip] = useState(null);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const show = (element, content) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const rect = element.getBoundingClientRect();
      setTip({ ...content, anchor: rect });
    }, OPEN_DELAY_MS);
  };

  const hide = () => {
    clearTimeout(timer.current);
    setTip(null);
  };

  return { tip, show, hide };
}

export function StatTooltip({ tip }) {
  const [box, setBox] = useState(null);

  useLayoutEffect(() => {
    if (!tip) return setBox(null);
    // documentElement.clientWidth excludes the scrollbar and, unlike innerWidth, is
    // reliable in embedded contexts.
    const viewport = document.documentElement.clientWidth || window.innerWidth || 1280;
    const centred = tip.anchor.left + tip.anchor.width / 2 - WIDTH / 2;
    const left = Math.min(Math.max(GUTTER, centred), Math.max(GUTTER, viewport - WIDTH - GUTTER));
    setBox({ top: tip.anchor.bottom + 8, left });
    return undefined;
  }, [tip]);

  if (!tip || !box) return null;

  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 rounded-xl border border-line p-3 shadow-xl"
      style={{ top: box.top, left: box.left, width: WIDTH, background: "var(--surface-solid)" }}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-bold text-fg">{tip.label}</span>
        {tip.short && tip.short !== tip.label && (
          <span className="stat-num text-[10px] uppercase tracking-wider text-faint">
            {tip.short}
          </span>
        )}
      </div>
      {tip.description && (
        <p className="mt-1.5 text-xs leading-relaxed text-muted">{tip.description}</p>
      )}
      {tip.seasons && (
        <p className="mt-1.5 stat-num text-[10px] uppercase tracking-wider text-faint">
          {tip.seasons}
        </p>
      )}
      <p className="mt-2 border-t border-line pt-1.5 text-[11px] font-semibold italic text-accent">
        {tip.unavailable ? "Not recorded this season" : "Click to sort"}
      </p>
    </div>,
    document.body,
  );
}
