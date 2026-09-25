// A player-page table's view controls: the leaderboard's five tabs plus Custom, and
// Edit Columns (September 2026). Each table owns one, so the career can show Fantasy
// while the game log shows Usage. The state is `useTableView`'s; this is only the
// controls and the slide-out they open.
import { useState } from "react";
import { ColumnEditor } from "../leaderboard/ColumnEditor";
import { LeaderboardTabs } from "../leaderboard/LeaderboardTabs";

function EditIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
      <path d="M6 2.5v11M10.5 2.5v11" />
    </svg>
  );
}

/**
 * @param view     from `useTableView`
 * @param title    what the editor calls this table ("Career", "Game log")
 * @param player   the player's name, for the editor's subtitle
 */
export function TableViewBar({ view, title, player, metrics }) {
  const [editorOpen, setEditorOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <LeaderboardTabs
        size="sm"
        active={view.tab}
        onSelect={(tab) => {
          // The Custom tab with nothing on it yet starts from what is on screen and
          // opens the editor, the leaderboard's behaviour.
          if (view.selectTab(tab)) setEditorOpen(true);
        }}
        customCount={view.customCount}
      />
      <button
        type="button"
        onClick={() => setEditorOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={editorOpen}
        className="inline-flex items-center gap-1.5 rounded-full border bg-surface-2 px-3 py-1 text-xs font-semibold text-fg transition hover:text-accent"
        style={{ borderColor: "color-mix(in srgb, var(--accent) 55%, transparent)" }}
      >
        <EditIcon />
        Edit Columns
      </button>
      <ColumnEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        group={view.group}
        sections={view.sections}
        onChange={view.setColumns}
        onReset={view.reset}
        resetLabel={`Reset to ${view.originLabel}`}
        initialTab={view.isCustom ? view.origin : view.tab}
        metrics={metrics}
        exclude={view.exclude}
        boardTitle="In this table"
        subtitle={`${title} columns for ${player}`}
      />
    </div>
  );
}
