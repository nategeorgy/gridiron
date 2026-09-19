// The site-wide credit bar, fixed to the bottom of the viewport.
//
// Two jobs on one line: name the feeds every number on the site is derived from, and
// say plainly that the NFL owns its own marks and that this is not an NFL site. The
// contact address rides along so a correction has somewhere to go from any page.
//
// ⚠️ It is fixed only from `sm` up. Measured, the line costs 37px at 1280 and wider
// (where it fits on one line), 57px between 640 and 1280, and **157px at 390px**,
// which is a fifth of a phone screen given over permanently to fine print. Below
// `sm` it therefore sits at the end of the page in normal flow, pushed to the bottom
// by the shell's flex column on short pages. Layout's `pb-*` steps mirror those
// measurements; re-measure if this copy changes length.
//
// `position: fixed` works here only because Layout's root has no backdrop-filter and
// no transform. Rendered inside .glass-header it would be clipped to the header, the
// same containing-block trap that sends modals opened from there to document.body.
import { Fragment } from "react";

// Every upstream the pipeline reads, in the order they carry weight. ESPN is last
// because it supplies the headshots and logos rather than any stat.
const SOURCES = [
  { name: "nflverse", href: "https://nflverse.com" },
  { name: "Next Gen Stats", href: "https://nextgenstats.nfl.com" },
  { name: "Pro Football Reference", href: "https://www.pro-football-reference.com" },
  { name: "FantasyPros", href: "https://www.fantasypros.com" },
  { name: "ESPN", href: "https://www.espn.com" },
];

export const CONTACT_EMAIL = "SecondLevelFF@gmail.com";

// Links are --fg with a muted underline, never --accent: the accent measures 2.44:1
// against the light theme's surface, well under the 4.5:1 floor at this size. The
// underline carries the affordance, and takes the accent on hover where a colour
// shift costs nothing because the text itself stays readable.
const linkClass =
  "text-fg underline decoration-muted underline-offset-2 transition hover:decoration-accent";

/** "a, b, c, d and e", each linked. */
function SourceList() {
  return SOURCES.map((source, index) => (
    <Fragment key={source.name}>
      {index > 0 && (index === SOURCES.length - 1 ? " and " : ", ")}
      <a className={linkClass} href={source.href} target="_blank" rel="noopener noreferrer">
        {source.name}
      </a>
    </Fragment>
  ));
}

export function Footer() {
  return (
    <footer className="glass-footer static sm:fixed sm:inset-x-0 sm:bottom-0 sm:z-20">
      <div className="mx-auto flex max-w-7xl flex-col items-start gap-x-6 gap-y-1 px-4 py-2 sm:flex-row sm:items-center">
        <p className="min-w-0 flex-1 text-xs leading-5 text-muted">
          Data from <SourceList />. NFL team names and logos are property of the NFL and its
          teams. Not affiliated with the NFL.
        </p>
        <a className={`${linkClass} shrink-0 whitespace-nowrap text-xs font-medium`} href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
      </div>
    </footer>
  );
}
