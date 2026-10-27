// The hand-picked players on the Command Center (M10).
//
// ⚠️ **The player selection is hand-picked, not computed.** The M3 engine has
// positive-regression and sell-high indices, and a later pass will decide whether
// these cards should be driven by them or by something new — so the lists below are a
// deliberate placeholder with a known expiry, not a shortcut that got left in.
//
// Only the *selection* is hardcoded. Every number the cards show is fetched live in
// the reader's own scoring, so nothing here goes stale in the way a pasted stat line
// would; when the picks are replaced by a query, the cards do not change.
//
// **The cards read the season the picks were chosen from.** Every number is live, but
// pointing a 2025 pick at 2026 showed a Week 1 line beside a note about the previous
// season. The picks below are from 2026.
export const SIGNALS_SEASON = 2026;

/**
 * The head-to-head's opening pair. A reader can swap either player from the card, and
 * the pick rides in the URL (`?h2h=`), so this is only what the card shows first.
 *
 * `weeks` narrows the featured pair to the games they shared, percentile pools
 * included; a pair the reader picks gets the whole season again.
 */
export const FEATURED_MATCHUP = {
  players: ["00-0040735", "00-0039919"], // Luther Burden III, Rome Odunze
  caption: `${SIGNALS_SEASON} season`,
};

/**
 * The featured games (October 2026): a game just played, drawn as who got the ball and
 * every possession in the row under the Highlighted Viz, and a game coming up, drawn as
 * the tale of the tape in the Week N Preview. Game ids as /games names them.
 *
 * A pick only shows while its game is in the week the scoreboard calls last (the recap)
 * or next (the preview). Otherwise the page takes the closest finish and the biggest
 * total, so the week flipping before these are re-picked never shows last week's game.
 */
export const FEATURED_GAMES = {
  recap: "2026_07_GB_DET", // Packers 17 at Lions 20
  preview: "2026_08_BAL_BUF", // Ravens at Bills, a 53.5 total
};

/**
 * Highlighted Viz of the Week (October 2026): one Explore chart, large, at the top of the
 * page. `kind` names the chart so a later week can feature something other than a
 * passing network; today "network" is the only kind the card draws. As with the picks
 * above, only the selection is written here: every number in the headline is read live.
 */
export const HIGHLIGHTED_VIZ = {
  kind: "network",
  season: 2026,
  // The season so far. Name `weeks` (e.g. "4") to feature a single week instead.
  passerId: "00-0036442", // Joe Burrow
  team: "CIN",
};

/**
 * Record Book entries: a week's standout line set against every season since 2009,
 * answered live by the Query Builder (`/explore/query`).
 *
 * - `leaders`: a seasons search cut at `lastWeek`, drawn as a ranked list (the query's
 *   `limit`) with the featured player's season highlighted. It ranks by fantasy points
 *   unless the entry names a `stat` (and its `format`).
 * - `count`: how many games since 2009 match `where`, and how many of them this season;
 *   `playerId`/`week` pick the featured game out of the same search for its line.
 *   `seasonCount: false` leaves the "this season" clause off.
 */
export const RECORD_BOOK = {
  season: 2026,
  week: 7,
  entries: [
    {
      // A record in PPR, half-PPR and standard, ahead of Cooper Kupp's 2021 and Tyreek
      // Hill's 2023. Wes Welker's 2011, ahead of him through Week 6, had its bye in Week 7.
      kind: "leaders",
      playerId: "00-0038543", // Jaxon Smith-Njigba
      title: "Most fantasy points by a wide receiver through Week 7",
      query: { grain: "seasons", positions: "WR", last_week: 7, where: "fantasy_points::", sort: "fantasy_points", order: "desc", limit: 3 },
    },
    {
      // 59, a record ahead of Zach Ertz's 57 in 2018. His 78 targets tie Ertz's for the most.
      kind: "leaders",
      playerId: "00-0037744", // Trey McBride
      title: "Most catches by a tight end through Week 7",
      stat: "receptions",
      format: 0,
      query: { grain: "seasons", positions: "TE", last_week: 7, where: "receptions::", sort: "receptions", order: "desc", limit: 3 },
    },
    {
      // One of 15 such games since 2009, and the only one this season. The open ranges on
      // catches and touchdowns are there so the rows carry them for the line.
      kind: "count",
      playerId: "00-0040735", // Luther Burden III
      title: "130+ receiving yards on 4 or fewer targets",
      query: { grain: "games", positions: "RB,WR,TE", where: "receiving_yards:130:,targets::4,receptions::,receiving_tds::", sort: "receiving_yards", order: "desc", limit: 50 },
      line: (row) => `${row.receptions} catches on ${row.targets} targets, ${row.receiving_yards} yds, ${row.receiving_tds} TD`,
    },
  ],
};
