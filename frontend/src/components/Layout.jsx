// App shell: frosted sticky header with brand + primary nav (Home, Insight,
// Leaderboards, Schedule, Teams), search, and the light/dark theme toggle, plus
// the fixed credit bar along the bottom.
// The page background (the Liquid Glass "environment") is painted on <body>.
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { AccountMenu } from "./AccountMenu";
import { Footer } from "./Footer";
import { SearchBox } from "./SearchBox";
import { ThemeToggle } from "./ThemeToggle";
import { MegaDropdown } from "./ui/MegaDropdown";
import { NavDropdown } from "./ui/NavDropdown";
import { LEADERBOARD_MENU, NAV_GROUPS } from "../constants/boards";

// Routes that opt out of the 1280px shell, capped rather than full-bleed so nothing
// stretches to absurd cell sizes on an ultrawide display. Empty while the draft room
// — the only page that ever needed it — is hidden for launch.
const WIDE_ROUTES = [];

const navLinkClass = ({ isActive }) =>
  `whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition ${
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
  const { pathname } = useLocation();
  const wide = WIDE_ROUTES.some((route) => pathname.startsWith(route));

  return (
    <div className="flex min-h-screen flex-col">
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
              {/* One tab for all fourteen player boards. Its routes are still grouped
                  by type, so the active check takes all three prefixes. */}
              <MegaDropdown
                label="Leaderboards"
                columns={LEADERBOARD_MENU}
                matches={["/fantasy", "/nfl", "/opportunity"]}
              />
              <NavLink to="/teams" className={navLinkClass}>
                Teams
              </NavLink>
            </nav>
            <SearchBox />
            <ThemeToggle />
            <AccountMenu />
          </div>
        </div>
      </header>
      {/* pb-* reserves the credit bar's height, since from `sm` up it is fixed and
          therefore out of flow. The steps are measured, not guessed: the bar is 57px
          tall while its text wraps to two lines, and 37px from 1280 up where it fits
          on one. Below `sm` it is in normal flow and needs no reservation. */}
      <main className={`mx-auto w-full flex-1 px-4 pb-6 pt-6 sm:pb-16 xl:pb-12 ${wide ? "max-w-[1800px]" : "max-w-7xl"}`}>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
