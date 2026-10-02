// Implied team totals, shaped for the surfaces that rank offenses by them: the Vegas
// board's rail and the home page's Week 4 Environments card.

/**
 * One row per offense, from the week's fixtures.
 *
 * Unpriced games are kept rather than dropped (a team with no line is still playing,
 * and hiding it would make the board quietly incomplete), but they sort last, because
 * "no line" is not "a low total".
 */
export function offensesFrom(games) {
  const rows = [];
  for (const game of games) {
    const shared = {
      gameId: game.game_id,
      total: game.total_line,
      divGame: game.div_game,
    };
    rows.push({
      ...shared,
      abbreviation: game.away_abbreviation,
      teamId: game.away_team_id,
      logoUrl: game.away_logo_url,
      opponent: game.home_abbreviation,
      isHome: false,
      implied: game.away_implied,
    });
    rows.push({
      ...shared,
      abbreviation: game.home_abbreviation,
      teamId: game.home_team_id,
      logoUrl: game.home_logo_url,
      opponent: game.away_abbreviation,
      isHome: true,
      implied: game.home_implied,
    });
  }
  return rows.sort((a, b) => {
    if (a.implied == null && b.implied == null) return 0;
    if (a.implied == null) return 1;
    if (b.implied == null) return -1;
    return b.implied - a.implied;
  });
}
