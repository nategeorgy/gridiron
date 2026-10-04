// Week N Slate (October 2026, from mockup B, "The Week"): every game in the coming week
// as a compact card, grouped by kickoff slot or ranked by the game total.
//
// Everything comes with the scoreboard's `next` window (lines, implied totals, records),
// and the team colours from the teams list the header's Teams menu already loads, so the
// card makes no request of its own.
//
// Slots holding one game (Thursday, Sunday and Monday nights, an international morning)
// share the top row, and the multi-game windows follow, each in its own block. A week
// read as "the primetime games, then the Sunday afternoon" is how a slate is talked about,
// and four one-card rows would push the Sunday games off the screen.
import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardHead, CardLink, CardState, Tabs } from "./primitives";
import { dateParts, formatKickoff, formatKickoffCompact, slotOf, SLOT_ORDER } from "../schedule/kickoff";
import { formatStat } from "../../utils/format";

const VIEWS = [
  { value: "kickoff", label: "By kickoff" },
  { value: "total", label: "By total" },
];

// Every Sunday game kicking off before noon Eastern has been an international one (London,
// Munich, Dublin), so the morning gets its own heading rather than reading as an early
// "Sunday Early". Kept here rather than in `slotOf` so the Schedule page is unchanged.
const INTERNATIONAL = "International";
const SLATE_ORDER = [...SLOT_ORDER.slice(0, SLOT_ORDER.indexOf("Sunday Early")), INTERNATIONAL, ...SLOT_ORDER.slice(SLOT_ORDER.indexOf("Sunday Early"))];

function slateSlot(game) {
  const slot = slotOf(game);
  const hour = Number((game.kickoff_time || "13:00").split(":")[0]);
  return slot === "Sunday Early" && hour < 12 ? INTERNATIONAL : slot;
}

/** The week's games by slot, in slate order: [{ slot, games }]. */
function groupBySlot(games) {
  const groups = new Map();
  for (const game of games) {
    const slot = slateSlot(game);
    if (!groups.has(slot)) groups.set(slot, []);
    groups.get(slot).push(game);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => SLATE_ORDER.indexOf(a) - SLATE_ORDER.indexOf(b))
    .map(([slot, slotGames]) => ({ slot, games: slotGames }));
}

/** "Oct 1–5", or "Sep 28–Oct 2" across a month boundary. */
function dateSpan(games) {
  const dates = games.map((game) => game.game_date).filter(Boolean).sort();
  if (!dates.length) return "";
  const first = dateParts(dates[0]);
  const last = dateParts(dates[dates.length - 1]);
  if (dates[0] === dates[dates.length - 1]) return `${first.mon} ${first.day}`;
  return first.mon === last.mon ? `${first.mon} ${first.day}–${last.day}` : `${first.mon} ${first.day}–${last.mon} ${last.day}`;
}

// A team colour is a brand hex that knows nothing of the theme, so it is pulled toward the
// foreground: lighter on the dark theme, darker on the light one, and never the near-black
// a few teams use sitting invisibly on a dark card.
const teamFill = (color) => (color ? `color-mix(in srgb, ${color} 72%, var(--fg))` : "var(--muted)");

// On a phone the slate runs two games across, so the record tucks under the team code
// rather than beside it: a 150px card has no room for both in one line.
function TeamRow({ teamId, abbreviation, logoUrl, record, spread, implied, score, played, won }) {
  return (
    <div className="flex h-8 items-center gap-1 sm:h-6 sm:gap-2">
      {logoUrl ? <img src={logoUrl} alt="" loading="lazy" className="h-[18px] w-[18px] flex-none object-contain sm:h-5 sm:w-5" /> : <span className="h-[18px] w-[18px] flex-none sm:h-5 sm:w-5" />}
      <span className="flex flex-col max-sm:leading-none sm:contents">
        <Link to={`/teams/${teamId}`} className={`w-[34px] text-[13px] font-bold hover:text-accent max-sm:leading-tight sm:w-[38px] ${played && !won ? "text-muted" : "text-fg"}`}>
          {abbreviation}
        </Link>
        {record && <span className="stat-num text-[9.5px] text-faint sm:text-[10.5px]">{record}</span>}
      </span>
      <span className="stat-num ml-auto text-[10px] text-muted sm:text-[11px]">{!played && spread != null ? formatStat(spread, 1) : ""}</span>
      <span className={`stat-num w-[32px] text-right text-[12.5px] font-bold sm:w-[38px] sm:text-[13px] ${played && !won ? "text-faint" : "text-fg"}`}>
        {played ? score : implied != null ? formatStat(implied, 1) : ""}
      </span>
    </div>
  );
}

function SlateGame({ game, records, colors }) {
  const parts = dateParts(game.game_date);
  const priced = game.away_implied != null && game.home_implied != null;
  const awayShare = priced ? (game.away_implied / (game.away_implied + game.home_implied)) * 100 : 0;
  const side = (prefix) => ({
    teamId: game[`${prefix}_team_id`],
    abbreviation: game[`${prefix}_abbreviation`],
    logoUrl: game[`${prefix}_logo_url`],
    record: records?.[game[`${prefix}_abbreviation`]],
    spread: game.favorite === game[`${prefix}_abbreviation`] ? game.favorite_spread : null,
    implied: game[`${prefix}_implied`],
    score: game[`${prefix}_score`],
    played: game.played,
    won: game.winner === prefix,
  });

  return (
    <div className="flex flex-col rounded-[14px] border border-line bg-surface-2 px-2 py-2 sm:px-3 sm:py-2.5">
      <div className="mb-1 flex items-center justify-between gap-1.5 whitespace-nowrap text-[9.5px] text-faint sm:mb-1.5 sm:text-[10px]">
        <span className="font-semibold">
          {parts ? `${parts.dow} ` : ""}
          <span className="sm:hidden">{formatKickoffCompact(game.kickoff_time)}</span>
          <span className="hidden sm:inline">{formatKickoff(game.kickoff_time)}</span>
        </span>
        <span className="stat-num">{game.played ? "Final" : game.total_line != null ? `O/U ${formatStat(game.total_line, 1)}` : "No line yet"}</span>
      </div>
      <TeamRow {...side("away")} />
      <TeamRow {...side("home")} />
      <div
        className="mt-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full"
        style={{ background: priced ? undefined : "color-mix(in srgb, var(--fg) 8%, transparent)" }}
        title={priced ? `${game.away_abbreviation} ${formatStat(game.away_implied, 1)}, ${game.home_abbreviation} ${formatStat(game.home_implied, 1)} implied` : undefined}
      >
        {priced && (
          <>
            <span className="block h-full" style={{ width: `${awayShare}%`, background: teamFill(colors[game.away_abbreviation]) }} />
            <span className="block h-full flex-1" style={{ background: teamFill(colors[game.home_abbreviation]) }} />
          </>
        )}
      </div>
    </div>
  );
}

// One template for every grid in the card, so the one-game slots in the top row line up
// with the columns of the multi-game blocks beneath them. Never more than four across (a
// column is at least a quarter of the row, less the three 12px gaps), so a Sunday's eight
// early games make two full rows rather than five and three. A phone takes two across
// (the 140px floor), which halves a slate that ran sixteen cards down the screen.
const GRID = "grid gap-2.5 [--slate-min:140px] sm:gap-3 sm:[--slate-min:250px]";
const GRID_COLUMNS = { gridTemplateColumns: "repeat(auto-fill, minmax(max(var(--slate-min), calc((100% - 36px) / 4)), 1fr))" };

function SlotLabel({ children }) {
  return <div className="mb-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-faint">{children}</div>;
}

export function SlateCard({ upcoming, colors, isLoading, isError }) {
  const [view, setView] = useState("kickoff");
  const games = upcoming?.games ?? [];
  const records = upcoming?.records;
  const groups = groupBySlot(games);
  const singles = groups.filter((group) => group.games.length === 1);
  const blocks = groups.filter((group) => group.games.length > 1);
  // Unpriced games sort last: no line is a state, not a low total.
  const byTotal = [...games].sort((a, b) => (b.total_line ?? -Infinity) - (a.total_line ?? -Infinity));
  const game = (entry) => <SlateGame key={entry.game_id} game={entry} records={records} colors={colors} />;

  return (
    <Card>
      <CardHead
        title={upcoming ? `${upcoming.label} Slate` : "Slate"}
        sub={games.length ? `${dateSpan(games)} · Spread on the favorite, implied points on the right` : undefined}
      >
        {games.length > 0 && <Tabs options={VIEWS} value={view} onChange={setView} label="Order the slate" />}
      </CardHead>
      <CardState isLoading={isLoading} isError={isError} isEmpty={!games.length} empty="No games next week." rows={6} />

      {games.length > 0 && view === "kickoff" && (
        <div className="grid gap-3">
          {singles.length > 0 && (
            <div className={GRID} style={GRID_COLUMNS}>
              {singles.map(({ slot, games: [only] }) => (
                <div key={slot} className="min-w-0">
                  <SlotLabel>{slot}</SlotLabel>
                  {game(only)}
                </div>
              ))}
            </div>
          )}
          {blocks.map(({ slot, games: slotGames }) => (
            <div key={slot}>
              <SlotLabel>{slot}</SlotLabel>
              <div className={GRID} style={GRID_COLUMNS}>{slotGames.map(game)}</div>
            </div>
          ))}
        </div>
      )}

      {games.length > 0 && view === "total" && <div className={GRID} style={GRID_COLUMNS}>{byTotal.map(game)}</div>}

      <CardLink to="/schedule/games">All games</CardLink>
    </Card>
  );
}
