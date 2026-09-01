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

function FinalRow({ game }) {
  const awayWon = game.winner === "away";
  const homeWon = game.winner === "home";
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-2 border-t border-line py-2 first:border-t-0">
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold text-fg">
          {game.away_abbreviation} <span className="text-faint">@</span> {game.home_abbreviation}
        </div>
        <div className="mt-0.5 text-[10.5px] text-faint">Final · {formatDate(game.game_date)}</div>
      </div>
      <div className="stat-num text-right text-[12px]">
        <span className={awayWon ? "font-semibold text-fg" : "text-faint"}>{game.away_score}</span>
        <span className="mx-1 text-faint">–</span>
        <span className={homeWon ? "font-semibold text-fg" : "text-faint"}>{game.home_score}</span>
      </div>
    </div>
  );
}

function FixtureRow({ game }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-2 border-t border-line py-2 first:border-t-0">
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold text-fg">
          {game.away_abbreviation} <span className="text-faint">@</span> {game.home_abbreviation}
        </div>
        <div className="mt-0.5 text-[10.5px] text-faint">
          {formatDate(game.game_date)}
          {game.kickoff_time ? ` · ${formatKickoff(game.kickoff_time)}` : ""}
        </div>
      </div>
      <div className="stat-num text-right text-[11.5px] leading-tight text-muted">
        {/* An unpriced game is a state, not a zero — it says so rather than showing a
            blank that reads as a pick'em. */}
        {game.favorite ? `${game.favorite} ${game.favorite_spread}` : <span className="text-faint">no line</span>}
        <br />
        <span className="text-faint">{game.total_line != null ? `O/U ${game.total_line}` : "—"}</span>
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
          {games.map((game) =>
            game.played ? (
              <FinalRow key={game.game_id} game={game} />
            ) : (
              <FixtureRow key={game.game_id} game={game} />
            ),
          )}
        </div>
      )}
      <CardLink to="/schedule/games">Full schedule</CardLink>
    </Card>
  );
}
