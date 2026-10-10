// App shell: frosted sticky header with the Second Level lockup + primary nav (Home, Insight,
// Leaderboards, Schedule, Teams, Explore), search, and the light/dark theme toggle, plus
// the credit bar at the end of the page.
// The page background (the Liquid Glass "environment") is painted on <body>.
//
// Below lg (1024px) the nav does not fit, so the header holds the lockup, a search button
// and a menu button: search opens a row under the header, the menu opens MobileMenu.
import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { AccountMenu } from "./AccountMenu";
import { BrandLockup } from "./Brand";
import { Footer } from "./Footer";
import { MOBILE_HEADER_HEIGHT, MOBILE_MENU_ID, MobileMenu } from "./MobileMenu";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { SearchBox } from "./SearchBox";
import { ThemeToggle } from "./ThemeToggle";
import { NavDropdown } from "./ui/NavDropdown";
import { TeamsMenu } from "./team/TeamsMenu";
import { EXPLORE_GROUP, NAV_GROUPS } from "../constants/boards";

// Routes that opt out of the shell, capped rather than full-bleed so nothing stretches
// to absurd cell sizes on an ultrawide display. Empty while the draft room, the only
// page that ever needed it, is hidden for launch.
const WIDE_ROUTES = [];

// The shell's own cap, and the wide routes' cap, as numbers rather than Tailwind classes.
// They are numbers because **one place has to own the content width**: `<main>` and the
// credit bar both read it here, so the footer can never end up a different width from
// the content above it. Every page takes the home page's 1,560px (October 2026); it was
// 1,280px everywhere but the home page before that.
const SHELL_WIDTH = 1560;
const WIDE_WIDTH = 1800;

/** How wide the content column is on this route. */
function contentWidth(pathname) {
  return WIDE_ROUTES.some((route) => pathname.startsWith(route)) ? WIDE_WIDTH : SHELL_WIDTH;
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}

function MenuIcon({ open }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
    </svg>
  );
}

const iconButton = (on) =>
  `btn-ghost grid h-10 w-10 place-items-center transition ${on ? "!text-accent" : "text-fg"}`;

const navLinkClass = ({ isActive }) =>
  `whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition ${
    isActive ? "glass-pill !text-accent" : "text-muted hover:text-fg"
  }`;

export function Layout() {
  const { pathname } = useLocation();
  const maxWidth = contentWidth(pathname);
  // Which phone panel is open: "menu", "search" or neither. One at a time.
  const [panel, setPanel] = useState(null);
  const closePanel = useCallback(() => setPanel(null), []);
  const togglePanel = (name) => setPanel((current) => (current === name ? null : name));

  // A new page closes either panel. (A link to the page already open is closed by the
  // link's own click.) So does the window reaching lg, an iPad turned on its side: the
  // menu hides itself there, and would otherwise leave the page's scrolling locked.
  const desktop = useMediaQuery("(min-width: 1024px)");
  useEffect(() => {
    closePanel();
  }, [pathname, desktop, closePanel]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="glass-header sticky top-0 z-20">
        <div
          className="mx-auto flex items-center justify-between gap-3 px-4 lg:!h-auto lg:py-3"
          style={{ height: MOBILE_HEADER_HEIGHT, maxWidth }}
        >
          <Link to="/" aria-label="Second Level home" className="shrink-0">
            <span className="block lg:hidden">
              <BrandLockup markHeight={30} />
            </span>
            <span className="hidden lg:block">
              <BrandLockup />
            </span>
          </Link>

          <div className="flex items-center gap-2 lg:hidden">
            <button
              type="button"
              onClick={() => togglePanel("search")}
              aria-label="Search players"
              aria-expanded={panel === "search"}
              className={iconButton(panel === "search")}
            >
              <SearchIcon />
            </button>
            <button
              type="button"
              onClick={() => togglePanel("menu")}
              aria-label={panel === "menu" ? "Close menu" : "Menu"}
              aria-expanded={panel === "menu"}
              aria-controls={MOBILE_MENU_ID}
              className={iconButton(panel === "menu")}
            >
              <MenuIcon open={panel === "menu"} />
            </button>
          </div>

          <div className="hidden items-center gap-2 lg:flex">
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
              <TeamsMenu />
              <NavDropdown label={EXPLORE_GROUP.label} items={EXPLORE_GROUP.items} match={EXPLORE_GROUP.match} />
            </nav>
            <SearchBox />
            <ThemeToggle />
            <AccountMenu />
          </div>
        </div>
        {panel === "search" && (
          <div className="border-t border-line px-4 py-2.5 lg:hidden">
            <SearchBox variant="row" onDone={closePanel} />
          </div>
        )}
      </header>
      <MobileMenu open={panel === "menu"} onClose={closePanel} />
      {/* The credit bar is in normal flow now, so nothing here reserves its height. It
          takes the same width `<main>` does, from the one function that decides it. */}
      <main className="mx-auto w-full flex-1 px-4 pb-6 pt-6" style={{ maxWidth }}>
        <Outlet />
      </main>
      <Footer maxWidth={maxWidth} />
    </div>
  );
}
