// The five preset tabs plus Custom. On the leaderboard each tab is a link carrying the
// page's query string, so the position group, season and filters survive the switch:
// flipping from Usage to Efficiency keeps the same players on screen. The player page's
// tables pass `onSelect` instead, since their tab is a query param rather than a path.
import { Link } from "react-router-dom";
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

/**
 * @param active       the tab on screen
 * @param hrefFor      tab id -> link target (the leaderboard)
 * @param onSelect     tab id -> called instead of following a link (the player page)
 * @param size         "md" | "sm"
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
}) {
  const TAB_CLASS = `whitespace-nowrap rounded-full font-semibold transition ${TAB_SIZE[size]}`;
  const tab = (entry, label) => {
    const on = entry.id === active;
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

  return (
    <div
      role="tablist"
      aria-label="Leaderboard"
      className="inline-flex flex-wrap items-center gap-0.5 rounded-full border border-edge bg-surface-2 p-1"
    >
      {LEADERBOARD_TABS.map((entry) => tab(entry, entry.label))}
      <span aria-hidden="true" className={`mx-1 w-px bg-line ${size === "sm" ? "h-4" : "h-5"}`} />
      {tab(CUSTOM_TAB, customCount ? `${CUSTOM_TAB.label} (${customCount})` : CUSTOM_TAB.label)}
    </div>
  );
}
