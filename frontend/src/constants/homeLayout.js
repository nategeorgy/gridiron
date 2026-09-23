// How the Command Center arranges its cards (September 2026).
//
// The arrangement is data rather than JSX because it was chosen by measuring, not by
// eye. The page ran about 3,900px in its original two-column shape with 3,500px of that
// in one column while the rail held a single card; every card's height was measured at
// nine column widths, four arrangements were built from those numbers, and this is the
// one that was picked. The others were: three columns (1,970px), a full-width Trending
// Players over two columns (2,667px), and the same hero over three columns (2,139px).
// All are in git history behind the `?layout=` switcher that chose between them.
//
// Two measurements shaped every candidate and still constrain any change here:
//
// - ⚠️ **Expected vs Actual grows with its column.** Its plot is a fixed-ratio SVG at
//   100% width, so it is 457px tall in a 660px column and 1,029px in a 1,500px one.
//   It sits in the wide column at 983px, where it is the tallest card on the page. Give
//   it more room and it takes it.
// - ⚠️ **Three cards need a column wider than the 391px rail this replaced.** Their
//   tables carry a `min-width` — Last Week's Scoring 400, Quarterbacks 470, Opportunity
//   Leaders 480 — and below that they scroll sideways rather than fitting. Moving two of
//   them into the rail is the whole reason the page widened to 1,560px.
export const HOME_LAYOUT = {
  // The home page is the only route whose width depends on its own arrangement, so
  // `Layout` drops the 1280px shell on `/` and the page centres this container itself.
  container: 1560,
  // ⚠️ **Two ratios, and the wider one is measured, not Tailwind's.** The 1.75/1 split
  // only clears the rail's widest table (Quarterbacks, 470px plus the card's 32px of
  // padding) from a 1,440px viewport; at 1,024px it gives the rail 355px and that table
  // scrolls sideways by 149px. So the rail takes a bigger share below 1,440, which holds
  // it at 536px on a 1,280px laptop.
  //
  // Stacking to one column below 1,200 was tried and dropped: it avoids a sideways
  // scroll of at most 78px on one card and costs about 2,100px of page height (4,843
  // against 2,693 at 1,280), and `ScrollTable` exists precisely so a narrow column
  // scrolls its table rather than crushing it.
  columns: [
    { from: 1024, template: "minmax(0,1.28fr) minmax(0,1fr)" },
    { from: 1440, template: "minmax(0,1.75fr) minmax(0,1fr)" },
  ],
  // 983px and 561px at the container above: wide enough for the plot and the head-to-head
  // radar on the left, and past every table's minimum on the right.
  assign: [
    ["trending", "myPlayers", "trendingUsage", "expected", "opportunity", "headToHead"],
    ["scoreboard", "weekly", "quarterbacks"],
  ],
  // ⚠️ **Nothing is pinned, on purpose.** The rail used to be one 445px card and stuck
  // so the scores stayed on screen. It now runs about 1,600px, and `position: sticky`
  // on a column one and a half viewports tall does nothing — nor would pinning the
  // scoreboard alone, since a sticky grid item only travels within its own row.
  sticky: null,
};
