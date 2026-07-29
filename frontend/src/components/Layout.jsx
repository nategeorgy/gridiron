// App shell: frosted sticky header with brand + primary nav (Home, the two
// leaderboard dropdowns, Teams), search, and the light/dark theme toggle.
// The page background (the Liquid Glass "environment") is painted on <body>.
import { NavLink, Outlet } from "react-router-dom";
import { SearchBox } from "./SearchBox";
import { ThemeToggle } from "./ThemeToggle";
import { NavDropdown } from "./ui/NavDropdown";
import { NAV_GROUPS } from "../constants/boards";

const navLinkClass = ({ isActive }) =>
  `rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
    isActive ? "glass-pill !text-accent" : "text-muted hover:text-fg"
  }`;

function BrandMark() {
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="h-7 w-7">
        <rect width="32" height="32" rx="7" fill="var(--surface-2)" />
        <path d="M8 21c4-10 12-10 16 0" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="16" cy="13" r="3" fill="var(--accent)" />
      </svg>
      <span className="text-lg font-bold tracking-tight text-fg">
        Gridiron<span className="text-accent">IQ</span>
      </span>
    </div>
  );
}

export function Layout() {
  return (
    <div className="min-h-screen">
      <header className="glass-header sticky top-0 z-20">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <BrandMark />
          <div className="flex items-center gap-2">
            <nav className="flex items-center gap-0.5">
              <NavLink to="/" end className={navLinkClass}>
                Home
              </NavLink>
              {NAV_GROUPS.map((group) => (
                <NavDropdown
                  key={group.match}
                  label={group.label}
                  items={group.items}
                  match={group.match}
                />
              ))}
              <NavLink to="/teams" className={navLinkClass}>
                Teams
              </NavLink>
            </nav>
            <SearchBox />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
