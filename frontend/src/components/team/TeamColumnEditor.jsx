// Edit Columns for the team Custom board: a slide-out with the board's columns on top
// (move with the arrows, remove with the x) and every team stat below, by tab, as chips
// that add or remove a column in one tap. O is the team with the ball, D the team
// against it. Edits are live; a column change costs no request, since the page already
// holds every stat for every team.
//
// Portalled to document.body: glass cards use backdrop-filter, which makes them the
// containing block for anything position: fixed inside them.
import { createPortal } from "react-dom";
import { TEAM_BOARD_TABS } from "../../constants/teamStats";

const columnIds = (tab) => [...new Set(tab.sections.flatMap(([, columns]) => columns.map((column) => (Array.isArray(column) ? column[0] : column))))];

export function TeamColumnEditor({ columns, metrics, onChange, onClose }) {
  const on = new Set(columns.map(([id, side]) => `${id}.${side}`));
  const chipName = (id, side) => {
    const metric = metrics[id];
    const sides = metric?.single ? ["o"] : metric?.sides ?? ["o", "d"];
    return `${metric?.short ?? id}${sides.length > 1 ? (side === "o" ? " · O" : " · D") : ""}`;
  };
  const toggle = (id, side) => {
    const key = `${id}.${side}`;
    onChange(on.has(key) ? columns.filter(([a, b]) => `${a}.${b}` !== key) : [...columns, [id, side]]);
  };
  const move = (index, step) => {
    const next = [...columns];
    const target = index + step;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const chip = (active) => `rounded-full border px-2.5 py-1 text-xs font-semibold transition ${active ? "border-transparent text-fg" : "border-line text-muted hover:text-fg"}`;
  const activeStyle = { background: "color-mix(in srgb, var(--accent) 16%, transparent)", boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--accent) 55%, transparent)" };

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" style={{ background: "rgba(8, 10, 14, 0.16)" }} onClick={onClose} />
      <aside
        role="dialog"
        aria-labelledby="team-column-editor-title"
        className="fixed bottom-0 right-0 top-0 z-50 flex w-[min(420px,100vw)] flex-col border-l border-line shadow-2xl"
        style={{ background: "var(--surface-solid)", animation: "slide-in-right 0.2s ease-out" }}
      >
        <header className="flex flex-none items-start justify-between gap-3 px-5 pb-3 pt-4">
          <div>
            <h2 id="team-column-editor-title" className="text-xl font-extrabold tracking-tight text-fg">Edit Columns</h2>
            <p className="mt-0.5 text-xs text-muted">O is the team with the ball, D is the team against it.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg px-2 text-2xl leading-none text-muted transition hover:bg-surface-2 hover:text-fg">×</button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 pb-6">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-faint">On your board</div>
          <ol className="mt-2 grid gap-1">
            {columns.length === 0 && <li className="text-xs text-muted">No columns yet. Add some below.</li>}
            {columns.map(([id, side], index) => (
              <li key={`${id}.${side}`} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-[13px] text-fg">
                <span className="stat-num w-5 text-[11px] text-faint">{index + 1}</span>
                <span className="flex-1 truncate" title={metrics[id]?.[side === "d" ? "label_d" : "label_o"]}>{chipName(id, side)}</span>
                <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)} className="px-1 text-muted hover:text-fg disabled:opacity-30">{"↑"}</button>
                <button type="button" aria-label="Move down" disabled={index === columns.length - 1} onClick={() => move(index, 1)} className="px-1 text-muted hover:text-fg disabled:opacity-30">{"↓"}</button>
                <button type="button" aria-label="Remove" onClick={() => toggle(id, side)} className="px-1 text-muted hover:text-neg">×</button>
              </li>
            ))}
          </ol>
          <div className="mt-5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-faint">Add stats</div>
          {TEAM_BOARD_TABS.filter((tab) => tab.id !== "overview").map((tab) => (
            <div key={tab.id} className="mt-3">
              <h3 className="mb-1.5 text-xs font-bold text-fg">{tab.label}</h3>
              <div className="flex flex-wrap gap-1.5">
                {columnIds(tab).flatMap((id) => {
                  const metric = metrics[id];
                  if (!metric) return [];
                  const sides = metric.single ? ["o"] : metric.sides ?? ["o", "d"];
                  return sides.map((side) => {
                    const active = on.has(`${id}.${side}`);
                    return (
                      <button key={`${id}.${side}`} type="button" onClick={() => toggle(id, side)} className={chip(active)} style={active ? activeStyle : undefined} title={metric[side === "d" ? "label_d" : "label_o"]}>
                        {chipName(id, side)}
                      </button>
                    );
                  });
                })}
              </div>
            </div>
          ))}
        </div>
        <footer className="flex flex-none justify-end border-t border-line px-5 py-3">
          <button type="button" onClick={onClose} className="glass-pill px-4 py-1.5 text-sm font-semibold text-fg">Done</button>
        </footer>
      </aside>
    </>,
    document.body,
  );
}
