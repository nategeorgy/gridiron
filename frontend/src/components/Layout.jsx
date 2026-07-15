// App shell: sticky header with brand + primary nav, and a content container.
import { NavLink, Outlet } from "react-router-dom";

const navItems = [
  { to: "/", label: "Leaderboard", end: true },
  { to: "/teams", label: "Teams" },
];

function BrandMark() {
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="h-7 w-7">
        <rect width="32" height="32" rx="7" className="fill-navy-800" />
        <path d="M8 21c4-10 12-10 16 0" fill="none" stroke="#00e389" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="16" cy="13" r="3" fill="#00e389" />
      </svg>
      <span className="text-lg font-bold tracking-tight">
        Gridiron<span className="text-accent">IQ</span>
      </span>
    </div>
  );
}

export function Layout() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-navy-800 bg-navy-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <BrandMark />
          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    isActive
                      ? "bg-navy-800 text-accent"
                      : "text-slate-300 hover:bg-navy-850 hover:text-white"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
