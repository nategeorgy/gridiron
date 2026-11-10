// "Save view" and the "Views" menu on the leaderboards (November 2026).
//
// A view is the page's path and query string, so saving needs nothing from the board
// beyond a suggested name and a one-line summary of what is on screen. Views are the
// account's when signed in and this browser's when not (hooks/useBoardViews).
//
// The Views button names the view on screen: its name when the URL is exactly a saved
// view, "(edited)" after one was opened here and then changed, and "Views" otherwise.
// Which view was opened is page state, not stored, so leaving the page forgets it.
import { useCallback, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Popover } from "../ui/Popover";
import { Caret } from "../ui/PillSelect";
import { normalizeQuery, useBoardViews } from "../../hooks/useBoardViews";
import { CUSTOM_TAB, LEADERBOARD_TABS } from "../../constants/leaderboards";
import { TEAM_BOARD_CUSTOM, TEAM_BOARD_TABS } from "../../constants/teamStats";
import { EXPLORE_ITEMS, PLAYER_ITEMS, SCHEDULE_ITEMS } from "../../constants/boards";

/** Where a view opens, in a word or two: "Usage", "Teams · Passing", "Scatter". */
function viewPlace(path) {
  const player = path.match(/^\/leaderboards\/([^/]+)/);
  if (player) return [...LEADERBOARD_TABS, CUSTOM_TAB].find((tab) => tab.id === player[1])?.label ?? "Leaderboards";
  const team = path.match(/^\/teams\/leaderboards\/([^/]+)/);
  if (team) return `Teams · ${[...TEAM_BOARD_TABS, TEAM_BOARD_CUSTOM].find((tab) => tab.id === team[1])?.label ?? "Leaderboards"}`;
  return [...EXPLORE_ITEMS, ...SCHEDULE_ITEMS, ...PLAYER_ITEMS].find((item) => item.path === path)?.label ?? path;
}

const viewKey = (path, query) => `${path}?${normalizeQuery(query)}`;

function BookmarkIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M4 2.5h8v11l-4-2.6-4 2.6z" />
    </svg>
  );
}

function StorageNote({ storage }) {
  return (
    <p className="px-1 text-[11.5px] text-faint">
      {storage === "account" ? "Saved to your account, on every device." : "Saved in this browser."}
    </p>
  );
}

const BUTTON = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border bg-surface-2 px-3.5 py-1.5 text-[13px] font-semibold transition";
const MENU_ITEM = "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] text-fg transition hover:bg-surface-2";

/**
 * @param defaultName  suggested name for a new view ("Usage · RB/WR/TE")
 * @param summary      one line describing the board, shown when saving
 */
export function BoardViews({ defaultName, summary }) {
  const { views, storage, save, remove } = useBoardViews();
  const location = useLocation();
  const navigate = useNavigate();
  const [panel, setPanel] = useState(null); // "save" | "views" | null
  const [opened, setOpened] = useState(null); // the name of the view last opened or saved here
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const saveButton = useRef(null);
  const viewsButton = useRef(null);
  const close = useCallback(() => setPanel(null), []);

  const query = location.search.replace(/^\?/, "");
  const here = viewKey(location.pathname, query);
  const exact = views.find((view) => viewKey(view.path, view.query) === here);
  const openedView = views.find((view) => view.name === opened);
  const current = exact ?? openedView ?? null;
  const edited = !exact && Boolean(openedView);

  const openSave = () => {
    setName(current?.name ?? defaultName ?? "");
    setError("");
    setPanel((value) => (value === "save" ? null : "save"));
  };

  const doSave = async (nameToSave) => {
    const trimmed = (nameToSave ?? "").trim();
    if (!trimmed) return;
    setBusy(true);
    setError("");
    try {
      await save({ name: trimmed, path: location.pathname, query });
      setOpened(trimmed);
      setPanel(null);
    } catch (caught) {
      const detail = caught?.response?.data?.detail;
      setError((Array.isArray(detail) ? detail[0]?.msg : detail) || "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const openView = (view) => {
    setOpened(view.name);
    setPanel(null);
    navigate(`${view.path}${view.query ? `?${view.query}` : ""}`);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        ref={saveButton}
        type="button"
        onClick={openSave}
        aria-haspopup="dialog"
        aria-expanded={panel === "save"}
        className={`${BUTTON} border-edge text-fg hover:text-accent`}
      >
        <BookmarkIcon />
        Save view
      </button>
      <button
        ref={viewsButton}
        type="button"
        onClick={() => setPanel((value) => (value === "views" ? null : "views"))}
        aria-haspopup="dialog"
        aria-expanded={panel === "views"}
        className={`${BUTTON} max-w-[260px] ${current ? "text-accent" : "border-edge text-fg hover:text-accent"}`}
        style={current ? { borderColor: "color-mix(in srgb, var(--accent) 70%, transparent)" } : undefined}
      >
        <span className="truncate">{current ? current.name : "Views"}</span>
        {edited && <span className="font-medium text-faint">(edited)</span>}
        {!current && views.length > 0 && (
          <span
            className="stat-num min-w-[18px] rounded-full px-1.5 text-center text-[11px] font-semibold leading-4 text-fg"
            style={{ background: "color-mix(in srgb, var(--accent) 22%, transparent)" }}
          >
            {views.length}
          </span>
        )}
        <Caret />
      </button>

      <Popover anchorRef={saveButton} open={panel === "save"} onClose={close} width={320} label="Save this board">
        <h4 className="px-0.5 text-[13px] font-bold text-fg">Save this board</h4>
        <input
          data-autofocus=""
          value={name}
          maxLength={60}
          placeholder="View name"
          aria-label="View name"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && doSave(name)}
          onFocus={(event) => event.target.select()}
          className="glass-input px-2.5 py-1.5 text-sm"
        />
        {summary && <p className="px-0.5 text-xs leading-relaxed text-muted">{summary}</p>}
        {views.some((view) => view.name === name.trim()) && (
          <p className="px-0.5 text-xs text-faint">Replaces the view with this name.</p>
        )}
        {error && <p className="px-0.5 text-xs text-neg">{error}</p>}
        <StorageNote storage={storage} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={close} className="btn-ghost px-3 py-1 text-xs font-semibold hover:!text-accent">
            Cancel
          </button>
          <button type="button" disabled={busy || !name.trim()} onClick={() => doSave(name)} className="btn-accent-solid px-3 py-1 text-xs disabled:opacity-50">
            Save
          </button>
        </div>
      </Popover>

      <Popover anchorRef={viewsButton} open={panel === "views"} onClose={close} width={320} align="end" label="Saved views">
        <h4 className="px-1 text-[13px] font-bold text-fg">Saved views</h4>
        {views.length === 0 ? (
          <p className="px-1 text-xs text-muted">Nothing saved yet. Set the board up the way you like it and press Save view.</p>
        ) : (
          <div className="grid gap-px">
            {views.map((view) => {
              const on = current?.id === view.id;
              return (
                <div key={view.id} className="flex items-center gap-1">
                  <button type="button" onClick={() => openView(view)} className={`${MENU_ITEM} min-w-0 flex-1`}>
                    <span className={`truncate ${on ? "font-semibold text-accent" : ""}`}>{view.name}</span>
                    <span className="ml-auto shrink-0 text-[11.5px] text-faint">{viewPlace(view.path)}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${view.name}`}
                    title="Delete"
                    onClick={() => {
                      remove(view.id).catch(() => {});
                      if (opened === view.name) setOpened(null);
                    }}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-faint transition hover:bg-surface-2 hover:text-fg"
                  >
                    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path d="M3 3l6 6M9 3l-6 6" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <div className="h-px bg-line" />
        {edited && (
          <button type="button" className={MENU_ITEM} onClick={() => doSave(openedView.name)}>
            <BookmarkIcon />
            Save changes to &ldquo;{openedView.name}&rdquo;
          </button>
        )}
        <button
          type="button"
          className={MENU_ITEM}
          onClick={() => {
            setName(edited ? "" : defaultName ?? "");
            setError("");
            setPanel("save");
          }}
        >
          <span aria-hidden="true" className="w-3.5 text-center text-base leading-none">+</span>
          Save as a new view
        </button>
        {current && (
          <button
            type="button"
            className={MENU_ITEM}
            onClick={() => {
              setOpened(null);
              setPanel(null);
              navigate(location.pathname);
            }}
          >
            <span aria-hidden="true" className="w-3.5" />
            Back to the default board
          </button>
        )}
        <div className="h-px bg-line" />
        <StorageNote storage={storage} />
      </Popover>
    </div>
  );
}
