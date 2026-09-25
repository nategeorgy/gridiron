// Edit Columns: a slide-out beside the leaderboard with the board on top and the
// library below.
//
// **On your board** is the table's columns in order, under the table's own section
// headers, dragged to reorder (mouse, pen or finger) or moved with the arrow keys, with
// an × on each. **Add stats** is every stat the position group has, split by the page's
// five tabs, as chips that add or remove a column in one tap. Ordering and picking live
// in one view, so there is no Reorder mode to find. A line at the bottom says what the
// last stat hovered or focused measures.
//
// It edits LIVE. The board stays in view to the left and every tap shows up in the table
// at once, which is why this is a slide-out rather than a modal: a modal hides the thing
// being edited. That is only affordable because a column change costs no request. The
// page asks for percentiles on every stat the position group has, and rows already
// carry every stat, so adding or dragging a column is drawn in the browser (see
// LeaderboardView).
//
// Portalled to document.body: the page's glass cards use backdrop-filter, which makes
// them the containing block for anything `position: fixed` inside them.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LEADERBOARD_TABS, groupFor, groupPool, poolColumns } from "../../constants/leaderboards";

const TINT = (percent) => `color-mix(in srgb, var(--accent) ${percent}%, transparent)`;
const CARD = "color-mix(in srgb, var(--fg) 3%, var(--surface-solid))";
const CARD_HI = "color-mix(in srgb, var(--accent) 13%, var(--surface-solid))";

const appliesTo = (metric, position) =>
  !metric?.appliesTo || metric.appliesTo === "all" || metric.appliesTo.includes(position);

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <circle cx="7" cy="7" r="4.8" />
      <path d="m10.6 10.6 3.4 3.4" strokeLinecap="round" />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg viewBox="0 0 10 14" className="h-3.5 w-2.5 shrink-0" fill="currentColor" aria-hidden="true">
      {[2.5, 7, 11.5].flatMap((y) => [
        <circle key={`a${y}`} cx="2.5" cy={y} r="1.3" />,
        <circle key={`b${y}`} cx="7.5" cy={y} r="1.3" />,
      ])}
    </svg>
  );
}

const Label = ({ children }) => (
  <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-faint">{children}</div>
);

/**
 * The board's columns in order, under the table's section headers. A drag is previewed
 * locally and committed once, on release, so the URL and the table change once per move
 * rather than once per pixel. While dragging, each column keeps the header it started
 * under; the page regroups on drop.
 */
function BoardList({ sections, metrics, onChange }) {
  const columns = sections.flatMap((entry) => entry.columns);
  const headerOf = new Map(sections.flatMap((entry) => entry.columns.map((column) => [column, entry.name])));
  const [draft, setDraft] = useState(null);
  const [dragging, setDragging] = useState(null);
  const listRef = useRef(null);
  const refocus = useRef(null);
  const order = draft ?? columns;

  // After a keyboard move the list re-renders; keep focus on the item that moved.
  useEffect(() => {
    if (!refocus.current) return;
    listRef.current?.querySelector(`[data-col="${refocus.current}"]`)?.focus();
    refocus.current = null;
  });

  const move = (from, to) => {
    if (to < 0 || to >= columns.length) return;
    const next = columns.slice();
    const [column] = next.splice(from, 1);
    next.splice(to, 0, column);
    refocus.current = column;
    onChange(next);
  };

  const startDrag = (event, column) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(column);
    setDraft(columns);
  };

  const drag = (event) => {
    if (!dragging || !listRef.current) return;
    const others = [...listRef.current.querySelectorAll("[data-col]")].filter(
      (node) => node.dataset.col !== dragging,
    );
    const before = others.find((node) => {
      const rect = node.getBoundingClientRect();
      return event.clientY < rect.top + rect.height / 2;
    });
    setDraft((current) => {
      const base = current ?? columns;
      const without = base.filter((column) => column !== dragging);
      const at = before ? without.indexOf(before.dataset.col) : without.length;
      const next = [...without.slice(0, at), dragging, ...without.slice(at)];
      return next.every((column, index) => column === base[index]) ? base : next;
    });
  };

  const drop = () => {
    if (!dragging) return;
    const next = draft;
    setDragging(null);
    setDraft(null);
    if (next && next.some((column, index) => column !== columns[index])) onChange(next);
  };

  if (!columns.length) {
    return <p className="px-2 py-4 text-sm text-muted">No columns yet. Add some stats below.</p>;
  }

  const items = [];
  order.forEach((column, index) => {
    const header = headerOf.get(column) ?? "";
    if (header && header !== headerOf.get(order[index - 1])) {
      items.push(
        <li key={`h-${index}-${header}`} aria-hidden="true" className="px-2 pb-0.5 pt-2">
          <Label>{header}</Label>
        </li>,
      );
    }
    items.push(
      <li
        key={column}
        data-col={column}
        tabIndex={0}
        aria-label={`${metrics[column]?.label ?? column}, column ${index + 1} of ${order.length}. Arrow keys move it.`}
        onPointerDown={(event) => startDrag(event, column)}
        onPointerMove={drag}
        onPointerUp={drop}
        onPointerCancel={drop}
        onKeyDown={(event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          move(index, index + (event.key === "ArrowUp" ? -1 : 1));
        }}
        className={`flex select-none items-center gap-2 rounded-lg px-2 py-1 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] ${
          dragging === column ? "cursor-grabbing shadow-lg" : "cursor-grab hover:bg-surface-2"
        }`}
        style={{ touchAction: "none", ...(dragging === column ? { background: CARD_HI } : {}) }}
      >
        <span className="text-faint"><GripIcon /></span>
        <span className="min-w-0 flex-1 truncate">
          <span className="font-semibold text-fg">{metrics[column]?.short ?? column}</span>
          <span className="ml-1.5 text-xs text-faint">{metrics[column]?.label}</span>
        </span>
        <button
          type="button"
          onClick={() => onChange(columns.filter((entry) => entry !== column))}
          aria-label={`Remove ${metrics[column]?.label ?? column}`}
          className="rounded-md px-1.5 text-base leading-none text-faint transition hover:bg-surface-2 hover:text-neg"
        >
          ×
        </button>
      </li>,
    );
  });

  return (
    <ol ref={listRef} aria-label="Columns on your board, in order">
      {items}
    </ol>
  );
}

/**
 * @param open, onClose
 * @param group       position group value ("RB,WR,TE", "QB", "all", ...)
 * @param sections    the board's sections, in order: what the table's headers show
 * @param onChange    called with the next ordered list of columns on every edit
 * @param onReset     back to the preset the board started from
 * @param resetLabel  e.g. "Reset to Usage"
 * @param initialTab  the library tab to open on: the preset the board came from
 * @param metrics     the registry, from useMetrics
 * @param exclude     stats this table shows elsewhere, left out of the library (the
 *                    player page's tables have a fixed lead block)
 * @param boardTitle  heading over the column list ("On your board", "In this table")
 * @param subtitle    optional line under the panel title
 */
export function ColumnEditor({
  open,
  onClose,
  group,
  sections,
  onChange,
  onReset,
  resetLabel,
  initialTab,
  metrics,
  exclude = [],
  boardTitle = "On your board",
  subtitle = null,
}) {
  const [query, setQuery] = useState("");
  const [libraryTab, setLibraryTab] = useState(initialTab);
  const [info, setInfo] = useState(null);
  const searchRef = useRef(null);
  const libraryRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const returnTo = document.activeElement;
    setQuery("");
    setInfo(null);
    setLibraryTab(initialTab);
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    const onKey = (event) => event.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      if (returnTo && document.contains(returnTo)) returnTo.focus();
    };
    // Opening is the only moment the panel resets itself; later tab changes on the page
    // must not yank the library away from the tab someone is browsing.
  }, [open]);

  if (!open) return null;

  const columns = sections.flatMap((entry) => entry.columns);
  const members = groupFor(group).positions;
  const excluded = new Set(exclude);
  const pool = Object.fromEntries(
    Object.entries(groupPool(group)).map(([tab, entries]) => [
      tab,
      entries
        .map((entry) => ({ name: entry.name, columns: entry.columns.filter((id) => !excluded.has(id)) }))
        .filter((entry) => entry.columns.length),
    ]),
  );
  const tabs = LEADERBOARD_TABS.filter((tab) => pool[tab.id]?.length);
  const activeTab = pool[libraryTab] ? libraryTab : tabs[0]?.id;
  const chosen = new Set(columns);
  const needle = query.trim().toLowerCase();
  const matches = (id) =>
    !needle ||
    [id, metrics[id]?.short, metrics[id]?.label, metrics[id]?.description].some((text) =>
      (text ?? "").toLowerCase().includes(needle),
    );
  // In a mixed group, a stat only some positions have is dimmed, says who has it, and
  // shows a dash on the others' rows.
  const whoHas = (id) => members.filter((position) => appliesTo(metrics[id], position));
  const isPartial = (id) => members.length > 1 && whoHas(id).length < members.length;
  const onTab = (tab) => columns.filter((id) => (pool[tab] ?? []).some((entry) => entry.columns.includes(id))).length;

  const toggle = (id) => onChange(chosen.has(id) ? columns.filter((entry) => entry !== id) : [...columns, id]);

  // Searching looks across every tab; browsing shows one.
  const library = (needle ? tabs : tabs.filter((tab) => tab.id === activeTab)).flatMap((tab) =>
    pool[tab.id]
      .map((entry) => ({ tab, name: entry.name, columns: entry.columns.filter(matches) }))
      .filter((entry) => entry.columns.length),
  );

  const smallButton =
    "rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold text-muted transition hover:text-fg";

  return createPortal(
    <>
      {/* Light scrim: the board behind is the preview, so it stays readable. */}
      <div className="fixed inset-0 z-40" style={{ background: "rgba(8, 10, 14, 0.16)" }} onClick={onClose} />
      <aside
        role="dialog"
        aria-labelledby="column-editor-title"
        className="fixed bottom-0 right-0 top-0 z-50 flex w-[min(440px,100vw)] flex-col border-l border-line shadow-2xl"
        style={{
          background: "var(--surface-solid)",
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          animation: "slide-in-right 0.2s ease-out",
        }}
      >
        <header className="flex flex-none items-start justify-between gap-3 px-5 pb-3 pt-4">
          <div>
            <h2 id="column-editor-title" className="text-xl font-extrabold tracking-tight text-fg">
              Edit Columns
            </h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg px-2 text-2xl leading-none text-muted transition hover:bg-surface-2 hover:text-fg"
          >
            ×
          </button>
        </header>

        {/* On your board */}
        <section
          aria-labelledby="column-editor-board"
          className="mx-5 flex max-h-[36vh] flex-none flex-col rounded-2xl border border-line"
          style={{ background: CARD }}
        >
          <div className="flex items-center gap-2 px-3 pb-1.5 pt-2.5">
            <h3 id="column-editor-board" className="flex-1 text-sm font-bold text-fg">
              {boardTitle}
            </h3>
            <span className="text-xs text-faint">
              {columns.length} column{columns.length === 1 ? "" : "s"}
            </span>
            <button type="button" onClick={() => onChange([])} disabled={!columns.length} className={`${smallButton} disabled:opacity-40`}>
              Clear
            </button>
            <button type="button" onClick={onReset} title={resetLabel} className={smallButton}>
              Reset
            </button>
          </div>
          <div className="min-h-0 overflow-y-auto px-1.5 pb-2">
            <BoardList sections={sections} metrics={metrics} onChange={onChange} />
          </div>
        </section>

        {/* Add stats */}
        <section aria-labelledby="column-editor-library" className="flex min-h-0 flex-1 flex-col gap-2.5 px-5 pt-4">
          <h3 id="column-editor-library" className="text-sm font-bold text-fg">
            Add stats
          </h3>
          <label className="glass-input flex items-center gap-2 px-3 py-2 text-faint">
            <SearchIcon />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search every stat"
              aria-label="Search every stat"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-faint"
            />
          </label>
          {!needle && (
            <div role="tablist" aria-label="Stats by tab" className="flex gap-0.5 rounded-xl border border-line p-[3px]" style={{ background: CARD }}>
              {tabs.map((tab) => {
                const on = tab.id === activeTab;
                const count = onTab(tab.id);
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => {
                      setLibraryTab(tab.id);
                      if (libraryRef.current) libraryRef.current.scrollTop = 0;
                    }}
                    className={`flex-1 whitespace-nowrap rounded-lg px-1.5 py-1 text-xs font-semibold transition ${
                      on ? "text-fg" : "text-muted hover:text-fg"
                    }`}
                    style={
                      on
                        ? {
                            background: "var(--surface-solid)",
                            boxShadow: `0 1px 3px rgba(0, 0, 0, 0.2), inset 0 0 0 1px ${TINT(60)}`,
                          }
                        : undefined
                    }
                  >
                    {tab.label}
                    {count > 0 && <span className="ml-1 text-[10px] text-accent">{count}</span>}
                  </button>
                );
              })}
            </div>
          )}
          <div ref={libraryRef} className="min-h-0 flex-1 overflow-y-auto pb-3">
            {library.length ? (
              library.map((entry) => (
                <div key={`${entry.tab.id}-${entry.name}`}>
                  <div className="mb-1.5 mt-2.5">
                    <Label>{needle ? `${entry.tab.label} · ${entry.name}` : entry.name}</Label>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {entry.columns.map((id) => {
                      const on = chosen.has(id);
                      const partial = isPartial(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => toggle(id)}
                          onMouseEnter={() => setInfo(id)}
                          onFocus={() => setInfo(id)}
                          aria-pressed={on}
                          aria-label={`${on ? "Remove" : "Add"} ${metrics[id]?.label ?? id}`}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold text-fg transition ${
                            on ? "border-solid" : "border-dashed hover:border-solid"
                          } ${partial ? "opacity-60" : ""}`}
                          style={{
                            borderColor: on ? TINT(60) : "color-mix(in srgb, var(--faint) 60%, transparent)",
                            background: on ? CARD_HI : "transparent",
                          }}
                        >
                          <span className="font-extrabold text-accent" aria-hidden="true">
                            {on ? "✓" : "+"}
                          </span>
                          {metrics[id]?.short ?? id}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            ) : (
              <p className="py-6 text-sm text-muted">No stat matches "{query}".</p>
            )}
          </div>
        </section>

        {/* What the last stat hovered or focused measures */}
        <div aria-live="polite" className="mx-5 min-h-[62px] flex-none border-t border-line py-2.5 text-xs leading-relaxed text-muted">
          {info ? (
            <>
              <span className="font-semibold text-fg">{metrics[info]?.label ?? info}</span>
              {isPartial(info) ? ` · ${whoHas(info).join(", ")} only` : ""}
              <br />
              {metrics[info]?.description}
            </>
          ) : (
            "Hover a stat to see what it measures."
          )}
        </div>

        <footer className="flex flex-none items-center gap-3 border-t border-line px-5 py-3">
          <span className="text-xs text-faint">
            {columns.length} of {poolColumns(group).filter((id) => !excluded.has(id)).length} stats ·{" "}
            {groupFor(group).label}
          </span>
          <span className="flex-1" />
          <button type="button" onClick={onClose} className="btn-accent-solid px-6 py-2 text-sm">
            Done
          </button>
        </footer>
      </aside>
    </>,
    document.body,
  );
}
