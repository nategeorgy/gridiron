// How the Command Center arranges its cards (October 2026, "Option C").
//
// The page reads top to bottom in four bands, chosen from mockups built on 2026 Week 3
// data (https://claude.ai/artifact/556KvBCx8M7HNvYyy2RNbb):
//
//   1. a score ticker and the Highlighted Viz of the Week, full width;
//   2. a row of Explore cards (team landscape, air yards, record book);
//   3. the two familiar columns: the week's players on the left, scoring and the
//      head-to-head on the right;
//   4. the Week N Preview, from mockup B: a heading, the slate full width, then matchups
//      and implied totals side by side.
//
// The arrangement is data rather than JSX for the same reason it always was: it is
// chosen by measuring, and a config is cheaper to rearrange than a page.
//
// Two measurements from the previous layout still hold:
//
// - ⚠️ **Expected vs Actual grows with its column.** Its plot is a fixed-ratio SVG at
//   100% width (457px tall in a 660px column, 1,029px in a 1,500px one), so it lives in
//   the wide column and never full width.
// - ⚠️ **Tables in the narrow column carry a `min-width`** (Last Week's Scoring 400px),
//   which is why the narrow column is never narrower than about 500px above 1,024.
export const HOME_LAYOUT = {
  // The home page is the only route whose width depends on its own arrangement, so
  // `Layout` drops the 1280px shell on `/` and the page centres this container itself.
  container: 1560,
  // The two-column bands. 1.75/1 clears the narrow column's widest table from 1,440px;
  // below that the narrow column takes a bigger share so it stays near 536px at 1,280.
  columns: [
    { from: 1024, template: "minmax(0,1.28fr) minmax(0,1fr)" },
    { from: 1440, template: "minmax(0,1.75fr) minmax(0,1fr)" },
  ],
  bands: [
    { kind: "full", cards: ["ticker"] },
    { kind: "full", cards: ["highlightedViz"] },
    // Three across from 1,100px (about 345px each there, the width each card is built to
    // read at), two across with the odd one out spanning both below that, one on a phone.
    { kind: "grid", cards: ["landscape", "airYards", "recordBook"] },
    { kind: "columns", cards: [["trending", "myPlayers", "expected"], ["weekly", "headToHead"]] },
    { kind: "full", cards: ["previewHeading"] },
    { kind: "full", cards: ["slate"] },
    { kind: "columns", cards: [["matchups"], ["environments"]] },
  ],
};
