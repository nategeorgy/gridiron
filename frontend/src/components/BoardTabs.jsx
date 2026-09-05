// In-page board switcher (M12) — two tiers: phase, then board.
//
// Every board is one click from every other without returning to the header. The nav
// menu is for arriving; this is for comparing — you read Receiving Production, want the
// same players' usage, and should not have to reopen a dropdown to get it.
//
// Two tiers rather than one flat strip of fourteen: the second row never holds more
// than four items, nothing scrolls sideways, and the phase you are in is stated rather
// than inferred from which pill happens to be lit. Switching phase lands on that
// phase's first board, which is always Fantasy.
import { NavLink, useLocation } from "react-router-dom";
import { LEADERBOARD_MENU } from "../constants/boards";

function Tier({ label, children }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[52px] shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-faint">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

export function BoardTabs() {
  const { pathname } = useLocation();

  // The active phase comes from the route, so a link straight into a board still
  // opens on the right tier — there is no separate selection to keep in sync.
  const activeGroup =
    LEADERBOARD_MENU.find((group) =>
      group.items.some((board) => board && board.path === pathname),
    ) ?? LEADERBOARD_MENU[0];

  return (
    <nav aria-label="Leaderboards" className="glass-card flex flex-col gap-2 p-3">
      <Tier label="Phase">
        {LEADERBOARD_MENU.map((group) => {
          const isActive = group.label === activeGroup.label;
          return (
            <NavLink
              key={group.label}
              to={group.items.find(Boolean).path}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-[13px] font-semibold transition ${
                isActive
                  ? "bg-accent text-[color:var(--accent-ink)]"
                  : "text-muted hover:bg-surface-2 hover:text-fg"
              }`}
            >
              {group.label}
            </NavLink>
          );
        })}
      </Tier>

      <div className="h-px bg-line" />

      <Tier label="Board">
        {activeGroup.items.filter(Boolean).map((board) => (
          <NavLink
            key={board.path}
            to={board.path}
            end
            title={board.menuDesc}
            className={({ isActive }) =>
              `whitespace-nowrap rounded-full border px-3 py-1 text-[13px] font-semibold transition ${
                isActive
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:bg-surface-2 hover:text-fg"
              }`
            }
          >
            {board.label}
          </NavLink>
        ))}
      </Tier>
    </nav>
  );
}
