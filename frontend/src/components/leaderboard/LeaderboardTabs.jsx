// The five preset tabs plus Custom. On the leaderboard each tab is a link carrying the
// page's query string, so the position group, season and filters survive the switch:
// flipping from Usage to Efficiency keeps the same players on screen. The player page's
// tables pass `onSelect` instead, since their tab is a query param rather than a path.
import { Link } from "react-router-dom";
import { ScrollRow } from "../ui/ScrollRow";
import { CUSTOM_TAB, LEADERBOARD_TABS } from "../../constants/leaderboards";

const TAB_SIZE = {
  md: "px-3.5 py-1.5 text-[13px]",
  sm: "px-2.5 py-1 text-xs",
};
const ACTIVE_STYLE = {
  background: "var(--surface-solid)",
  boxShadow:
    "0 1px 3px rgba(0, 0, 0, 0.18), inset 0 0 0 1px color-mix(in srgb, var(--accent) 60%, transparent)",
};

// The leaderboards' own tab strip (November 2026): plain words over a hairline, the
// active one underlined in the accent. Exported for the team leaderboards, whose tabs
// are their own list but should look the same.
export const UNDERLINE_TRACK = "flex items-end gap-5 border-b border-line";
export const underlineTab = (on) =>
  `-mb-px whitespace-nowrap border-b-2 px-0.5 pb-2.5 pt-1.5 text-sm font-semibold transition ${
    on ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"
  }`;

/**
 * @param active       the tab on screen
 * @param hrefFor      tab id -> link target (the leaderboard)
 * @param onSelect     tab id -> called instead of following a link (the player page)
 * @param size         "md" | "sm"
 * @param variant      "pills" (the player page) | "underline" (the leaderboard)
 * @param isAvailable  tab id -> whether the current group has that preset
 * @param customCount  columns on the custom board, or 0 when there is none yet
 * @param onStartCustom called instead of following the link when there is no custom
 *                      board yet, so the page can start one from what is on screen
 */
export function LeaderboardTabs({
  active,
  hrefFor,
  onSelect,
  isAvailable = () => true,
  customCount,
  onStartCustom,
  size = "md",
  variant = "pills",
}) {
  const underline = variant === "underline";
  const TAB_CLASS = `whitespace-nowrap rounded-full font-semibold transition ${TAB_SIZE[size]}`;
  const tab = (entry, label) => {
    const on = entry.id === active;
    if (underline) {
      if (!isAvailable(entry.id)) {
        return (
          <button
            key={entry.id}
            type="button"
            disabled
            title="No tracking stat applies to every position. Pick a position or a group."
            className={`${underlineTab(false)} cursor-not-allowed opacity-40 hover:!text-muted`}
          >
            {label}
          </button>
        );
      }
      return (
        <Link
          key={entry.id}
          to={hrefFor(entry.id)}
          role="tab"
          aria-selected={on}
          onClick={(event) => {
            if (entry.id === CUSTOM_TAB.id && !customCount && onStartCustom) {
              event.preventDefault();
              onStartCustom();
            }
          }}
          className={underlineTab(on)}
        >
          {label}
        </Link>
      );
    }
    if (!isAvailable(entry.id)) {
      return (
        <button
          key={entry.id}
          type="button"
          disabled
          title="No tracking stat applies to every position. Pick a position or a group."
          className={`${TAB_CLASS} cursor-not-allowed text-muted opacity-40`}
        >
          {label}
        </button>
      );
    }
    if (onSelect) {
      return (
        <button
          key={entry.id}
          type="button"
          role="tab"
          aria-selected={on}
          onClick={() => onSelect(entry.id)}
          className={`${TAB_CLASS} ${on ? "text-fg" : "text-muted hover:text-fg"}`}
          style={on ? ACTIVE_STYLE : undefined}
        >
          {label}
        </button>
      );
    }
    return (
      <Link
        key={entry.id}
        to={hrefFor(entry.id)}
        role="tab"
        aria-selected={on}
        onClick={(event) => {
          if (entry.id === CUSTOM_TAB.id && !customCount && onStartCustom) {
            event.preventDefault();
            onStartCustom();
          }
        }}
        className={`${TAB_CLASS} ${on ? "text-fg" : "text-muted hover:text-fg"}`}
        style={on ? ACTIVE_STYLE : undefined}
      >
        {label}
      </Link>
    );
  };

  if (underline) {
    return (
      <ScrollRow className="min-w-0 max-w-full">
        <div role="tablist" aria-label="Leaderboard" className={UNDERLINE_TRACK}>
          {LEADERBOARD_TABS.map((entry) => tab(entry, entry.label))}
          {tab(CUSTOM_TAB, customCount ? `${CUSTOM_TAB.label} (${customCount})` : CUSTOM_TAB.label)}
        </div>
      </ScrollRow>
    );
  }

  // One line that scrolls on a phone; wrapping inside the rounded track made a blob.
  return (
    <ScrollRow className="max-w-full">
      <div
        role="tablist"
        aria-label="Leaderboard"
        className="inline-flex items-center gap-0.5 rounded-full border border-edge bg-surface-2 p-1 md:flex-wrap"
      >
        {LEADERBOARD_TABS.map((entry) => tab(entry, entry.label))}
        <span aria-hidden="true" className={`mx-1 w-px shrink-0 bg-line ${size === "sm" ? "h-4" : "h-5"}`} />
        {tab(CUSTOM_TAB, customCount ? `${CUSTOM_TAB.label} (${customCount})` : CUSTOM_TAB.label)}
      </div>
    </ScrollRow>
  );
}
