// The hover card for chart marks: follows the pointer, flips at the viewport edge, and
// is portalled to document.body (a glass card's backdrop-filter would otherwise trap it,
// the same reason StatTooltip and every popover here are portalled).
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Headshot } from "./common";
import { percentileColor } from "../../utils/explore";

const GAP = 14;

/**
 * `tip.show(event, content)` on enter, `tip.move(event)` on move, `tip.hide()` on leave.
 * `content` is any node.
 */
export function useChartTooltip() {
  const [state, setState] = useState(null);
  const show = useCallback((event, content) => setState({ x: event.clientX, y: event.clientY, content }), []);
  const move = useCallback((event) => setState((current) => (current ? { ...current, x: event.clientX, y: event.clientY } : current)), []);
  const hide = useCallback(() => setState(null), []);
  return { state, show, move, hide };
}

/** Spread onto an SVG element to give it this tooltip. */
export function hoverProps(tip, content, extra = {}) {
  return {
    onMouseEnter: (event) => {
      tip.show(event, typeof content === "function" ? content() : content);
      extra.onEnter?.();
    },
    onMouseMove: tip.move,
    onMouseLeave: () => {
      tip.hide();
      extra.onLeave?.();
    },
  };
}

export function ChartTooltip({ tip }) {
  const box = useRef(null);
  const [position, setPosition] = useState(null);
  const state = tip.state;

  useLayoutEffect(() => {
    if (!state || !box.current) return setPosition(null);
    const width = box.current.offsetWidth;
    const height = box.current.offsetHeight;
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = window.innerHeight;
    let left = state.x + GAP;
    let top = state.y + GAP;
    if (left + width > viewportWidth - 8) left = state.x - width - GAP;
    if (top + height > viewportHeight - 8) top = state.y - height - GAP;
    setPosition({ left: Math.max(8, left), top: Math.max(8, top) });
    return undefined;
  }, [state]);

  if (!state) return null;
  return createPortal(
    <div
      ref={box}
      role="tooltip"
      className="pointer-events-none fixed z-[100] min-w-[180px] max-w-[300px] rounded-xl border px-3 py-2.5 text-xs text-fg shadow-xl"
      style={{
        left: position?.left ?? -9999,
        top: position?.top ?? -9999,
        background: "var(--surface-solid)",
        borderColor: "var(--border-strong)",
      }}
    >
      {state.content}
    </div>,
    document.body,
  );
}

/**
 * The standard player card: headshot row, then label / value (/ percentile) rows.
 * `rows` is [[label, value, percentile?]].
 */
export function TipCard({ player, sub, rows = [], note }) {
  return (
    <div>
      {player && (
        <div className="mb-2 flex items-center gap-2.5">
          <Headshot url={player.headshot_url} name={player.name} size={34} />
          <div className="min-w-0">
            <b className="block text-[13px]">{player.name}</b>
            {sub && <small className="stat-num text-[11px] text-faint">{sub}</small>}
          </div>
        </div>
      )}
      {rows.length > 0 && (
        <table className="w-full border-collapse">
          <tbody>
            {rows.map(([label, value, percentile], index) => (
              <tr key={`${label}-${index}`}>
                <td className="py-0.5 pr-3 text-left text-muted">{label}</td>
                <td className="stat-num whitespace-nowrap py-0.5 text-right text-[11.5px]">{value}</td>
                {percentile !== undefined && (
                  <td className="stat-num w-8 py-0.5 text-right text-[10.5px]" style={{ color: percentileColor(percentile) }}>
                    {percentile ?? ""}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {note && <div className="mt-1.5 text-[11px] text-faint">{note}</div>}
    </div>
  );
}
