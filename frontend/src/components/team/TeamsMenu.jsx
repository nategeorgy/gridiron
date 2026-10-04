// The header's Teams menu: the two team surfaces on the left, every team by division on
// the right, so any team page is one click from anywhere. Same open/close behaviour as
// the other nav menus (useHoverMenu).
import { Link, NavLink, useLocation } from "react-router-dom";
import { useHoverMenu } from "../../hooks/useHoverMenu";
import { useTeamsList } from "../../hooks/useTeamStats";
import { teamsByDivision } from "../../utils/teamStats";

/** The two team surfaces. Exported for the phone menu (components/MobileMenu.jsx). */
export const TEAM_ITEMS = [
  { path: "/teams/leaderboards", label: "Team Leaderboards", desc: "Rank all 32 offenses and defenses" },
  { path: "/teams", label: "Team Pages", desc: "One page for every team", end: true },
];

function Caret({ open }) {
  return (
    <svg viewBox="0 0 12 12" className={`h-2.5 w-2.5 transition ${open ? "rotate-180 text-accent" : "text-faint"}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 4.5L6 8l3.5-3.5" />
    </svg>
  );
}

export function TeamsMenu() {
  const { open, ref, hoverProps, closeNow, toggle } = useHoverMenu();
  const { pathname } = useLocation();
  const { data } = useTeamsList();
  const divisions = teamsByDivision(data);
  const active = pathname.startsWith("/teams");

  return (
    <div ref={ref} className="relative" {...hoverProps}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition ${active ? "glass-pill !text-accent" : "text-muted hover:text-fg"}`}
      >
        Teams
        <Caret open={open} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 w-[min(860px,calc(100vw-32px))] pt-1.5">
          <div role="menu" className="glass-popover grid gap-1.5 p-1.5 md:grid-cols-[230px_minmax(0,1fr)]">
            <div>
              {TEAM_ITEMS.map((item) => (
                <NavLink key={item.path} to={item.path} end={item.end} role="menuitem" onClick={closeNow} className={({ isActive }) => `block rounded-lg px-3 py-2 transition ${isActive ? "bg-surface-2" : "hover:bg-surface-2"}`}>
                  {({ isActive }) => (
                    <>
                      <div className={`text-sm font-semibold ${isActive ? "text-accent" : "text-fg"}`}>{item.label}</div>
                      <div className="text-xs text-muted">{item.desc}</div>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-line px-2.5 py-2 md:grid-cols-4 md:border-l md:border-t-0">
              {divisions.map(({ division, teams }) => (
                <div key={division}>
                  <h4 className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">{division}</h4>
                  {teams.map((team) => (
                    <Link key={team.team_id} to={`/teams/${team.team_id}`} role="menuitem" onClick={closeNow} className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-[12.5px] text-fg transition hover:bg-surface-2">
                      {team.logo_url && <img src={team.logo_url} alt="" className="h-5 w-5 object-contain" />}
                      {team.name.split(" ").pop()}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
