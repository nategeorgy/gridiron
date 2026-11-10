// The leaderboard's Display menu: how every stat cell is drawn (constants/boardDisplay.js).
//
// Closed, it reads "Display" beside a sample of the current mode, so the button says
// what it changes and shows the current choice without spelling it out. Open, each mode
// is a row with a sample cell drawn exactly the way the table draws it, which says more
// than any name for "percentile under the value" could.
import { useCallback, useRef, useState } from "react";
import { Popover } from "../ui/Popover";
import { Caret } from "../ui/PillSelect";
import { DISPLAY_MODES, isShadedDisplay } from "../../constants/boardDisplay";
import { LEGEND_STOPS, percentileFill, percentileInk, rankPercentile } from "../../utils/percentileScale";

// One example cell: a receiver's 24.3% target share, 87th percentile, 12th of 90.
const SAMPLE = { value: "24.3%", percentile: 87, rank: 12, pool: 90 };

export function SampleCell({ mode, large = false }) {
  const size = large ? "h-9 w-[58px] text-[12px]" : "h-7 w-[46px] text-[11px]";
  const shaded = isShadedDisplay(mode);
  return (
    <span
      className={`stat-num flex shrink-0 flex-col items-center justify-center rounded-md border border-line leading-[1.05] text-fg ${size}`}
      style={shaded ? { background: percentileFill(SAMPLE.percentile) } : undefined}
      aria-hidden="true"
    >
      {mode === "percentiles" ? (
        <span className="font-semibold">{SAMPLE.percentile}</span>
      ) : (
        <span>{SAMPLE.value}</span>
      )}
      {mode === "percentile" && (
        <span className="text-[9px] font-bold" style={{ color: percentileInk(SAMPLE.percentile) }}>
          {SAMPLE.percentile}
        </span>
      )}
      {mode === "rank" && (
        <span className="text-[9px] font-bold" style={{ color: percentileInk(rankPercentile(SAMPLE.rank, SAMPLE.pool)) }}>
          #{SAMPLE.rank}
        </span>
      )}
    </span>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

export function DisplayMenu({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef(null);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-edge bg-surface-2 py-[3px] pl-[3px] pr-2.5 text-[13px] font-semibold text-fg transition hover:border-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]"
      >
        <SampleCell mode={value} />
        Display
        <Caret />
      </button>
      <Popover anchorRef={anchor} open={open} onClose={close} width={330} label="Display">
        <h4 className="px-1 text-[13px] font-bold text-fg">Display</h4>
        <div className="grid gap-px">
          {DISPLAY_MODES.map((mode) => {
            const on = mode.id === value;
            return (
              <button
                key={mode.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  onChange(mode.id);
                  setOpen(false);
                }}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-left transition hover:bg-surface-2"
              >
                <SampleCell mode={mode.id} large />
                <span className="grid min-w-0 gap-px">
                  <b className={`text-[13px] font-semibold ${on ? "text-accent" : "text-fg"}`}>{mode.label}</b>
                  <small className="text-[11.5px] text-faint">{mode.hint}</small>
                </span>
                <span className="ml-auto w-4 shrink-0 text-accent">{on ? <Check /> : null}</span>
              </button>
            );
          })}
        </div>
      </Popover>
    </>
  );
}

/** The scale under the menu: 0 to 100, or last to #1 when the table shows ranks. */
export function PercentileLegend({ mode }) {
  if (mode === "values") return null;
  const ranks = mode === "rank";
  return (
    <span
      className="hidden items-center gap-1.5 whitespace-nowrap text-[11px] text-faint lg:inline-flex"
      title={ranks ? "Rank among the position this season" : "Percentile among the position this season"}
    >
      <span className="stat-num">{ranks ? "Last" : "0"}</span>
      <span className="flex h-2 w-24 overflow-hidden rounded-full border border-edge">
        {LEGEND_STOPS.map((stop) => (
          <span key={stop} className="flex-1" style={{ background: percentileFill(stop) }} />
        ))}
      </span>
      <span className="stat-num">{ranks ? "#1" : "100"}</span>
    </span>
  );
}
