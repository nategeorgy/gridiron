// In-page board switcher for the leaderboards (M12).
//
// Every board is one click from every other, without going back to the header. The
// nav menu is for arriving; this is for comparing — you look at Receiving Production,
// want the same players' usage, and should not have to re-open a dropdown to get it.
//
// All fourteen boards are listed rather than only the current phase's: the point is to
// see what else exists. They are grouped under their phase, which is the same grouping
// the nav menu uses, so the two teach the same map.
import { NavLink } from "react-router-dom";
import { LEADERBOARD_MENU } from "../constants/boards";

export function BoardTabs() {
  return (
    <nav aria-label="Leaderboards" className="glass-card overflow-x-auto">
      <div className="flex w-max min-w-full items-stretch">
        {LEADERBOARD_MENU.map((group, index) => (
          <div
            key={group.label}
            className={`flex flex-col gap-1 px-4 py-2.5 ${
              index ? "border-l border-line" : ""
            }`}
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-faint">
              {group.label}
            </span>
            <div className="flex items-center gap-1">
              {group.items.filter(Boolean).map((board) => (
                <NavLink
                  key={board.path}
                  to={board.path}
                  end
                  className={({ isActive }) =>
                    `whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-semibold transition ${
                      isActive
                        ? "bg-accent text-[color:var(--accent-ink)]"
                        : "text-muted hover:bg-surface-2 hover:text-fg"
                    }`
                  }
                  title={board.menuDesc}
                >
                  {board.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
