// The site-wide credit bar, at the end of the page.
//
// Three jobs: carry the brand, name the feeds every number on the site is derived
// from, and say plainly that the NFL owns its own marks and that this is not an NFL
// site. The contact address rides along so a correction has somewhere to go.
//
// It sits in normal flow, at the bottom of the content, and you reach it by
// scrolling. It used to be `position: fixed` from `sm` up, which cost a permanent
// strip of every screen (measured: 37px at 1280 and wider, 57px between 640 and 1280,
// and 157px at 390px, a fifth of a phone). Layout's `<main>` had to reserve that
// height with matching `pb-*` steps, so the copy could not change length without
// re-measuring two files. Unsticking it removed the budget and the coupling, and it is
// what made room for the lockup.
//
// It is a `glass-card` inside the same max-width wrapper `<main>` uses, so its edges
// line up with the content above it instead of running to the viewport. ⚠️ **The width
// is passed in rather than decided here**: it used to pick between two Tailwind classes
// of its own, and the moment a route chose a third width the footer was visibly
// narrower than everything above it. `components/Layout.jsx` owns the number now.
//
// `<main>` carries `flex-1` in the shell's flex column, which is what holds this at
// the bottom of the viewport on a short page.
import { Fragment } from "react";
import { SlashLockup } from "./Brand";

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

export function Footer({ maxWidth }) {
  return (
    <div className="mx-auto w-full px-4 pb-10" style={{ maxWidth }}>
      <footer className="glass-card px-5 py-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <SlashLockup align="start" />
          <a
            className={`${linkClass} shrink-0 whitespace-nowrap text-xs font-medium`}
            href={`mailto:${CONTACT_EMAIL}`}
          >
            {CONTACT_EMAIL}
          </a>
        </div>
        <p className="mt-5 border-t border-line pt-4 text-xs leading-5 text-muted">
          Data from <SourceList />. NFL team names and logos are property of the NFL and its
          teams. Not affiliated with the NFL.
        </p>
      </footer>
    </div>
  );
}
