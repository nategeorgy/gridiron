// How the Command Center arranges its cards (October 2026, "Option C").
//
// The page reads top to bottom in five bands, chosen from mockups built on 2026 Week 3
// data (https://claude.ai/artifact/556KvBCx8M7HNvYyy2RNbb):
//
//   1. a score ticker and the Highlighted Viz of the Week, full width;
//   2. the featured game recap: targets and carries in the wide column, every possession
//      in the narrow one. It replaced the team landscape and air yards cards in October
//      2026;
//   3. the season: Floor and Ceiling over Weekly Finishes on the left, the head-to-head
//      over the record book on the right (the watchlist across the top when signed in).
//      Weekly Finishes stops at the coming week rather than running to eighteen, and late
//      in a season it scrolls inside its card;
//   4. the Week N Preview, from mockup B: a heading, the slate full width, then matchups
//      beside the featured game's tale of the tape (which replaced implied totals in
//      October 2026).
//
// The arrangement is data rather than JSX for the same reason it always was: it is
// chosen by measuring, and a config is cheaper to rearrange than a page.
//
// ⚠️ **No band may end with a gap under one column** (October 2026). Home stretches both
// columns to the taller, and one card per band fills the difference with rows of its own
// (`FillBox` in components/home/primitives.jsx): Every possession's drive rows grow,
// Weekly Finishes lists more players, and Matchups lists more teams. Heights a fixed size
// cannot match keep moving (the featured pair's position, a game's drive count, signing
// in), which is why the fill is measured rather than tuned. A new pairing needs one card
// that can fill, placed last in its column.
//
// Two measurements hold:
//
// - **Floor and Ceiling (October 2026, replacing Expected vs Actual) keeps its height.**
//   Fourteen rows of fixed height, so it reads the same in the wide column at any width;
//   its strips stretch, its rows do not.
// - ⚠️ **Cards in the narrow column were built for about 500px** (Last Week's Scoring's
//   400px table set it, until that card left in October 2026; Head to Head and the
//   tale of the tape still read at that width), so it never goes narrower above 1,024.
export const HOME_LAYOUT = {
  // The page is 1,560px wide, the width every page now takes from `Layout`'s shell.
  // The two-column bands. 1.75/1 clears the narrow column's widest table from 1,440px;
  // below that the narrow column takes a bigger share so it stays near 536px at 1,280.
  columns: [
    { from: 1024, template: "minmax(0,1.28fr) minmax(0,1fr)" },
    { from: 1440, template: "minmax(0,1.75fr) minmax(0,1fr)" },
  ],
  bands: [
    { kind: "full", cards: ["ticker"] },
    { kind: "full", cards: ["highlightedViz"] },
    // The two recap charts draw at their card's measured width. (`grid`, three across from
    // 1,100px, is still a band kind; nothing uses it since this row became two columns.)
    { kind: "columns", cards: [["targetsAndCarries"], ["possessions"]] },
    // The watchlist only renders signed in with something starred, and runs across the top
    // of the season band then, so it never unbalances the columns below it.
    { kind: "full", cards: ["myPlayers"] },
    // Weekly Finishes fills what Head to Head and the Record Book leave under Floor and
    // Ceiling: about 14 rows beside a receiver pair, 19 beside backs.
    { kind: "columns", cards: [["floorCeiling", "weeklyFinishes"], ["headToHead", "recordBook"]] },
    { kind: "full", cards: ["previewHeading"] },
    { kind: "full", cards: ["slate"] },
    { kind: "columns", cards: [["matchups"], ["taleOfTheTape"]] },
  ],
};
