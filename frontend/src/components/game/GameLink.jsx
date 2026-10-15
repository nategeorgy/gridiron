// Links to a game's page, for every surface that shows a game (October 2026).
//
// A game card already links each team to its team page, and a link cannot sit inside
// another, so a card is made clickable with an overlay: `GameCardLink` covers the card
// (which must be `relative`), and the team links inside lift above it with
// `TEAM_LINK_LAYER`. Games before FIRST_GAME_PAGE_SEASON have no page and get no link.
import { Link } from "react-router-dom";
import { hasGamePage } from "../../constants";

export const gamePath = (gameId) => `/games/${gameId}`;

/** Lifts a link above a card's overlay, so it stays clickable on its own. */
export const TEAM_LINK_LAYER = "relative z-[1]";

/** The whole card as a link to the game. Renders nothing for a game without a page. */
export function GameCardLink({ game, label }) {
  if (!game?.game_id || !hasGamePage(game.season)) return null;
  const name = label ?? `${game.away_abbreviation} at ${game.home_abbreviation}, ${game.played ? "recap" : "preview"}`;
  return (
    <Link to={gamePath(game.game_id)} aria-label={name}
      className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" />
  );
}

/** Wraps its children in a link to the game when the game has a page; plain otherwise. */
export function MaybeGameLink({ gameId, season, className = "", style, title, children }) {
  if (!gameId || !hasGamePage(season)) return <span className={className} style={style} title={title}>{children}</span>;
  return <Link to={gamePath(gameId)} className={className} style={style} title={title}>{children}</Link>;
}
