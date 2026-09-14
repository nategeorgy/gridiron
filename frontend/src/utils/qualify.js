// Minimum-games thresholds, scaled to how much of the season has been played.
//
// A card asking for "4 games" is right in December and empty for most of September:
// the app moves to a new season the moment it has any stats (`useSeasons`), and a floor
// written for a full season then excludes everyone. So each threshold is stated for a
// full season and scaled to the weeks played — the same idea as `qualify_games` in
// `app/percentiles.py`, which the Insight boards already use.
//
// Proportional rather than `min(threshold, weeks)`, because byes start in Week 5: from
// then on a starter has played one game fewer than the week number, and a floor equal to
// the week would drop him.

const REGULAR_SEASON_WEEKS = 18;

/**
 * Weeks of `season` played so far, read from the scoreboard's "last" window.
 *
 * A season the scoreboard has moved past is complete. A season with stats but no
 * mostly-final week yet — the Thursday opener is in, its Sunday is not — counts as one.
 */
export function weeksPlayed(season, lastPlayed) {
  if (!season || !lastPlayed || lastPlayed.season > season) return REGULAR_SEASON_WEEKS;
  if (lastPlayed.season < season) return 1;
  return lastPlayed.week;
}

/** Scale a threshold stated for `outOf` weeks down to the `weeks` actually played. */
export function scaledMinGames(threshold, weeks, outOf = REGULAR_SEASON_WEEKS) {
  const share = Math.min(weeks, outOf) / outOf;
  return Math.max(1, Math.round(threshold * share));
}
