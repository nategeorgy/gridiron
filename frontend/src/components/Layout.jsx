// App shell: frosted sticky header with the Second Level lockup + primary nav (Home, Insight,
// Leaderboards, Schedule, Teams), search, and the light/dark theme toggle, plus
// the credit bar at the end of the page.
// The page background (the Liquid Glass "environment") is painted on <body>.
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { AccountMenu } from "./AccountMenu";
import { BrandLockup } from "./Brand";
import { Footer } from "./Footer";
import { SearchBox } from "./SearchBox";
import { ThemeToggle } from "./ThemeToggle";
import { MegaDropdown } from "./ui/MegaDropdown";
import { NavDropdown } from "./ui/NavDropdown";
import { LEADERBOARD_MENU, NAV_GROUPS } from "../constants/boards";
import { HOME_LAYOUT } from "../constants/homeLayout";

// Routes that opt out of the 1280px shell, capped rather than full-bleed so nothing
// stretches to absurd cell sizes on an ultrawide display. Empty while the draft room
// — the only page that ever needed it — is hidden for launch.
const WIDE_ROUTES = [];

// The shell's own cap, and the wide routes' cap, as numbers rather than Tailwind classes
// (`max-w-7xl` is 80rem). They are numbers because **one place has to own the content
// width**: `<main>` and the credit bar both read it here, so the footer can never end up
// a different width from the content above it — which is what happened when the home
// page started choosing its own width and the footer kept the 1280px class.
const SHELL_WIDTH = 1280;
const WIDE_WIDTH = 1800;

/** How wide the content column is on this route. */
function contentWidth(pathname) {
  // The home page's arrangement decides how much room its columns need, so it names its
  // own width (constants/homeLayout.js). Every other route takes the shell.
  if (pathname === "/") return HOME_LAYOUT.container;
  return WIDE_ROUTES.some((route) => pathname.startsWith(route)) ? WIDE_WIDTH : SHELL_WIDTH;
}

const navLinkClass = ({ isActive }) =>
  `whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition ${
    isActive ? "glass-pill !text-accent" : "text-muted hover:text-fg"
  }`;

export function Layout() {
  const { pathname } = useLocation();
  const maxWidth = contentWidth(pathname);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="glass-header sticky top-0 z-20">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" aria-label="Second Level home" className="shrink-0">
            <BrandLockup />
          </Link>
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
      {/* The credit bar is in normal flow now, so nothing here reserves its height. It
          takes the same width `<main>` does, from the one function that decides it. */}
      <main className="mx-auto w-full flex-1 px-4 pb-6 pt-6" style={{ maxWidth }}>
        <Outlet />
      </main>
      <Footer maxWidth={maxWidth} />
    </div>
  );
}
