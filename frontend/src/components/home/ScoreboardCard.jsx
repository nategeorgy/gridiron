// Scores & Schedule (M10) — the week just played beside the week coming up.
//
// The two tabs are labelled by week number rather than "Results" / "Next Up", because
// "Week 18" and "Week 1" are what a manager actually calls them. Which weeks those are
// comes from the server (`/games/scoreboard`): the rule depends on the season clock,
// and a client reimplementing it would drift.
//
// Note the tabs can straddle two seasons — from January to September it is last
// season's Week 18 next to the coming season's Week 1 — which is why every row still
// carries its own date. Without that, "Week 1" alone would not say which year.
import { useState } from "react";
import { Card, CardHead, CardLink, CardState, Tabs } from "./primitives";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Sun 1/4" from an ISO date. Derived, never stored — see migration c4e1a72b9f30. */
function formatDate(iso) {
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  // Constructed as UTC so a date-only value cannot slide a day backwards west of
  // Greenwich, which is exactly where most of this audience is.
  const date = new Date(Date.UTC(year, month - 1, day));
  return `${WEEKDAYS[date.getUTCDay()]} ${month}/${day}`;
}

/** "1:00 PM ET". The stored time is always Eastern, so the suffix is not a guess. */
function formatKickoff(time) {
  if (!time) return "";
  const [hours, minutes] = time.split(":").map(Number);
  const hour12 = ((hours + 11) % 12) + 1;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"} ET`;
}

/** A team's logo, or an empty box of the same size so every row keeps its columns. */
function TeamLogo({ url }) {
  return url ? (
    <img src={url} alt="" loading="lazy" className="h-[18px] w-[18px] object-contain" />
  ) : (
    <span className="h-[18px] w-[18px]" />
  );
}

/**
 * One game on one line: away on the left, home on the right, and the middle column holds
 * the date above either the score or the kickoff.
 *
 * **Each score sits beside its own team.** The first version put the matchup on the left
 * and the score at the card's far edge with only the winning number bold, so reading a
 * result meant left, right, left again. Here the losing side's abbreviation *and* score
 * dim together, which says who won without a second lookup. The middle column is a fixed
 * width so logos and scores line up down the whole list.
 */
function GameRow({ game }) {
  const awayLost = game.played && game.winner === "home";
  const homeLost = game.played && game.winner === "away";
  const side = (lost) => (lost ? "font-medium text-faint" : "font-semibold text-fg");

  return (
    <div className="border-t border-line py-2 first:border-t-0">
      <div className="grid grid-cols-[1fr_18px_84px_18px_1fr] items-center gap-2">
        <span className={`justify-self-end text-[12.5px] ${side(awayLost)}`}>{game.away_abbreviation}</span>
        <TeamLogo url={game.away_logo_url} />
        <span className="flex flex-col items-center leading-tight">
          <span className="text-[10px] text-faint">{formatDate(game.game_date)}</span>
          {game.played ? (
            <span className="stat-num text-[13px]">
              <span className={side(awayLost)}>{game.away_score}</span>
              <span className="mx-1 text-faint">–</span>
              <span className={side(homeLost)}>{game.home_score}</span>
            </span>
          ) : (
            <span className="stat-num text-[11px] text-muted">{formatKickoff(game.kickoff_time) || "TBD"}</span>
          )}
        </span>
        <TeamLogo url={game.home_logo_url} />
        <span className={`justify-self-start text-[12.5px] ${side(homeLost)}`}>{game.home_abbreviation}</span>
      </div>
      <div className="stat-num mt-0.5 text-center text-[10.5px] text-faint">
        {game.played ? (
          "Final"
        ) : (
          <>
            {/* An unpriced game is a state, not a zero — it says so rather than showing a
                blank that reads as a pick'em. */}
            {game.favorite ? `${game.favorite} ${game.favorite_spread}` : "no line"}
            {game.total_line != null && ` · O/U ${game.total_line}`}
          </>
        )}
      </div>
    </div>
  );
}

export function ScoreboardCard({ scoreboard, isLoading, isError }) {
  const [tab, setTab] = useState("next");
  const windows = { last: scoreboard?.last, next: scoreboard?.next };
  const active = windows[tab] ?? windows.next ?? windows.last;

  const options = [
    windows.last && { value: "last", label: windows.last.label },
    windows.next && { value: "next", label: windows.next.label },
  ].filter(Boolean);

  const games = active?.games ?? [];
  // A boolean, not the truthiness of a <CardState/> element — that element is always
  // truthy even when it renders null, so `state ?? list` silently swallowed the list.
  const showGames = !isLoading && !isError && games.length > 0;

  return (
    <Card>
      <CardHead title="Scores & Schedule">
        {options.length > 1 && (
          <Tabs options={options} value={tab} onChange={setTab} label="Scoreboard week" />
        )}
      </CardHead>
      <CardState
        isLoading={isLoading}
        isError={isError}
        isEmpty={games.length === 0}
        empty="No games in this week."
        rows={5}
      />
      {showGames && (
        // Capped and scrolling: a full week is 16 games, and a rail that grows to fit
        // them pushes everything below it off the screen.
        <div className="max-h-[322px] overflow-y-auto pr-1.5">
          {games.map((game) => (
            <GameRow key={game.game_id} game={game} />
          ))}
        </div>
      )}
      <CardLink to="/schedule/games">Full schedule</CardLink>
    </Card>
  );
}
