// The site menu below lg (October 2026): every page on the site in one panel, so any
// page is two taps from anywhere. Chosen over a bottom tab bar, which fits five of the
// six sections and sits on top of Safari's own bottom toolbar.
//
// The sections are the desktop nav's own lists (NAV_GROUPS, the Teams menu's items,
// EXPLORE_GROUP), so a page added to a dropdown appears here with no second edit. Under
// Teams sit all 32 logos by division, as in the desktop Teams menu.
//
// ⚠️ Portalled to document.body, like every overlay opened from the header:
// `.glass-header`'s backdrop-filter makes it the containing block for anything fixed
// inside it. The panel starts under the header (MOBILE_HEADER_HEIGHT) and sits beneath
// it in the stacking order, so the header's close button stays on top.
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink } from "react-router-dom";
import { AccountMenu } from "./AccountMenu";
import { TEAM_ITEMS } from "./team/TeamsMenu";
import { EXPLORE_GROUP, NAV_GROUPS } from "../constants/boards";
import { useTeamsList } from "../hooks/useTeamStats";
import { useTheme } from "../hooks/useTheme";
import { teamsByDivision } from "../utils/teamStats";

/** The header's height below lg, which the panel starts beneath. */
export const MOBILE_HEADER_HEIGHT = 60;

export const MOBILE_MENU_ID = "site-menu";

const SECTIONS = [
  ...NAV_GROUPS,
  { label: "Teams", items: TEAM_ITEMS, teams: true },
  EXPLORE_GROUP,
];

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

/** The theme as a switch: on is dark, the default. */
function ThemeSwitch() {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      onClick={toggleTheme}
      className="flex items-center gap-2.5 py-2 text-sm font-semibold text-fg"
    >
      <span
        className="relative h-[26px] w-11 shrink-0 rounded-full transition"
        style={{ background: dark ? "var(--accent)" : "color-mix(in srgb, var(--fg) 22%, transparent)" }}
      >
        <span
          className="absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-[left]"
          style={{ left: dark ? 21 : 3 }}
        />
      </span>
      Dark mode
    </button>
  );
}

function TeamLogos({ onPick }) {
  const { data } = useTeamsList();
  return (
    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
      {teamsByDivision(data).map(({ division, teams }) => (
        <div key={division}>
          <div className="mb-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-faint">{division}</div>
          <div className="grid grid-cols-4 gap-1">
            {teams.map((team) => (
              <Link
                key={team.team_id}
                to={`/teams/${team.team_id}`}
                onClick={onPick}
                aria-label={team.name}
                title={team.name}
                className="grid h-10 place-items-center rounded-lg transition hover:bg-surface-2"
              >
                {team.logo_url ? (
                  <img src={team.logo_url} alt="" loading="lazy" className="h-7 w-7 object-contain" />
                ) : (
                  <span className="text-[11px] font-bold text-fg">{team.abbreviation}</span>
                )}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function MobileMenu({ open, onClose }) {
  const panel = useRef(null);

  // The page underneath does not scroll while the menu is up, and Escape closes it.
  useEffect(() => {
    if (!open) return undefined;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    panel.current?.focus({ preventScroll: true });
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const itemClass = ({ isActive }) =>
    `flex min-h-[42px] items-center text-[14.5px] font-semibold transition ${
      isActive ? "text-accent" : "text-fg hover:text-accent"
    }`;

  return createPortal(
    <nav
      id={MOBILE_MENU_ID}
      ref={panel}
      tabIndex={-1}
      aria-label="Site"
      className="fixed inset-x-0 bottom-0 z-[15] overflow-y-auto overscroll-contain outline-none lg:hidden"
      style={{ top: MOBILE_HEADER_HEIGHT, background: "var(--surface-solid)" }}
    >
      <div className="mx-auto max-w-2xl px-4 pb-10">
        <NavLink
          to="/"
          end
          onClick={onClose}
          className={({ isActive }) =>
            `flex items-center justify-between border-b border-line py-3.5 text-[17px] font-bold ${
              isActive ? "text-accent" : "text-fg"
            }`
          }
        >
          Home
          <Arrow />
        </NavLink>

        {SECTIONS.map((section) => (
          <section key={section.label} className="border-b border-line py-3">
            <h2 className="mb-0.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-faint">
              {section.label}
            </h2>
            <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-3">
              {section.items.map((item) => (
                <NavLink key={item.path} to={item.path} end={item.end} onClick={onClose} className={itemClass}>
                  {item.label}
                </NavLink>
              ))}
            </div>
            {section.teams && <TeamLogos onPick={onClose} />}
          </section>
        ))}

        <div className="flex items-center justify-between gap-3 pt-3">
          <ThemeSwitch />
          <AccountMenu placement="up" />
        </div>
      </div>
    </nav>,
    document.body,
  );
}
