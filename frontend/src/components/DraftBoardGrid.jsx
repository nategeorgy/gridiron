// The draft board (M9) — teams across, rounds down, every pick in its cell.
//
// **This is the room's primary surface, not a summary of it.** A scrolling "recent
// picks" feed answers "what just happened"; a board answers the questions a drafter
// actually has — who has three running backs already, whether quarterbacks have
// started going, how far it is back to your next pick. Those are all *spatial*, and a
// list cannot show them.
//
// Two things make the grid readable at a glance:
//
// **Columns are teams, so a column is a roster.** The pick numbers are what snake, not
// the columns: round 2 runs right-to-left, so team 1 holds pick 2.12 while team 12
// holds 2.1. The arrow in each cell points where the order goes next, which is the
// only way the turn at the end of a round reads correctly.
//
// **Position is carried by colour**, from the `--position-*` tokens — aliases of the
// series hues already validated for colour-vision separation against both themes.
// Colour does the work the eye is good at (counting a column's shape); the text does
// the work colour cannot (which player).
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";

/**
 * Which pick number a (round, team slot) cell holds, following the snake.
 *
 * ⚠️ **This is the exact inverse of `snakeOrder()` in `utils/draftBots`**, and it has
 * to stay that way: that function decides whose turn it is, this one decides which
 * cell a pick lands in, and if they ever disagree the board shows every pick in the
 * wrong place while the draft itself runs correctly — a bug with no error. Verified
 * for 8/10/12/14/16 teams over 1–20 rounds: `snakeOrder(t, r)[pickNumberFor(…) - 1]`
 * returns the slot it was given, for every cell.
 */
function pickNumberFor(round, slot, teams) {
  const withinRound = round % 2 === 1 ? slot : teams - slot + 1;
  return (round - 1) * teams + withinRound;
}

/** The label a cell shows — round dot pick-within-round, the way drafters say it. */
function pickLabel(round, slot, teams) {
  const withinRound = round % 2 === 1 ? slot : teams - slot + 1;
  return `${round}.${withinRound}`;
}

/**
 * Where the draft order goes after this cell.
 *
 * The turn matters: at the end of a round the order does not wrap back to team 1, it
 * doubles back down the same column. An arrow is the cheapest way to make a snake
 * legible to someone who has not internalised it.
 */
function pickArrow(round, slot, teams) {
  const withinRound = round % 2 === 1 ? slot : teams - slot + 1;
  if (withinRound === teams) return "↓";
  return round % 2 === 1 ? "→" : "←";
}

function positionToken(position) {
  return `var(--position-${(position ?? "").toLowerCase()}, var(--surface-2))`;
}

// Secondary text *on a tinted cell* is derived from --fg rather than taken from
// --muted. The muted token was tuned against the plain card surface; measured over a
// position tint it lands at 3.7–4.2:1, under the 4.5:1 these 10px lines need. Stepping
// down from --fg instead keeps the hierarchy and stays legible on every tint, in both
// themes.
const CELL_META = "color-mix(in srgb, var(--fg) 78%, transparent)";
// Only the direction arrow uses this. It is a graphical cue rather than text, so 3:1
// is the bar it has to clear (measured 3.5–4.4:1 across the four tints in both
// themes); the pick label next to it is information someone reads, so that takes
// CELL_META instead.
const CELL_FAINT = "color-mix(in srgb, var(--fg) 62%, transparent)";

/** A drafted player's cell, tinted by position. */
function FilledCell({ player, label, arrow, isUser, onSelect }) {
  const tint = positionToken(player.position);
  const [first, ...rest] = (player.name ?? "").split(" ");
  const last = rest.join(" ") || first;

  return (
    <div
      className="relative flex h-full flex-col justify-between overflow-hidden rounded-lg border px-2 py-1.5"
      style={{
        background: `color-mix(in srgb, ${tint} var(--cell-tint), transparent)`,
        borderColor: `color-mix(in srgb, ${tint} var(--cell-tint-edge), transparent)`,
        boxShadow: isUser ? "inset 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent)" : undefined,
      }}
    >
      {/* Full strength and big enough to recognise. At 36px and 70% opacity these read
          as a smudge behind the text rather than as a face; the scrim below is what
          buys back the legibility the opacity was paying for, and it only darkens the
          side the text sits on. */}
      {player.headshot_url && (
        <>
          <img
            src={player.headshot_url}
            alt=""
            aria-hidden="true"
            loading="lazy"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
            className="pointer-events-none absolute -bottom-1 -right-1 h-12 w-12 object-contain"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(100deg, rgba(0,0,0,0.34) 42%, rgba(0,0,0,0) 78%)",
            }}
          />
        </>
      )}
      <div className="relative flex items-start justify-between gap-1">
        <span className="truncate text-[10px] leading-tight" style={{ color: CELL_META }}>
          {first}
        </span>
        <span className="stat-num shrink-0 text-[10px]" style={{ color: CELL_META }}>
          {label}
        </span>
      </div>
      {/* A button when the room can open a profile dialog, a link otherwise — the
          board is also rendered on the results screen, where a plain link is right. */}
      {onSelect ? (
        <button
          type="button"
          onClick={() => onSelect(player.player_id)}
          className="relative truncate text-left text-xs font-bold leading-tight text-fg hover:text-accent"
          title={player.name}
        >
          {last}
        </button>
      ) : (
        <Link
          to={`/players/${player.player_id}`}
          className="relative truncate text-xs font-bold leading-tight text-fg hover:text-accent"
          title={player.name}
        >
          {last}
        </Link>
      )}
      <div className="relative flex items-end justify-between gap-1">
        <span className="stat-num truncate text-[10px]" style={{ color: CELL_META }}>
          {player.position}·{player.team_abbreviation ?? "FA"}
        </span>
        <span className="shrink-0 text-[10px]" style={{ color: CELL_FAINT }}>
          {arrow}
        </span>
      </div>
    </div>
  );
}

/** A pick that has not happened yet. */
function EmptyCell({ label, arrow, isUser }) {
  return (
    <div
      className="flex h-full flex-col justify-between rounded-lg border border-line/60 px-2 py-1.5"
      style={{
        background: isUser
          ? "color-mix(in srgb, var(--accent) 7%, transparent)"
          : "color-mix(in srgb, var(--surface-2) 35%, transparent)",
      }}
    >
      <span className="stat-num self-end text-[10px] text-faint">{label}</span>
      <span className="text-[10px] text-faint">{arrow}</span>
    </div>
  );
}

/** The cell whose turn it is. */
function OnTheClockCell({ label, isUser, slot }) {
  return (
    <div
      className="flex h-full flex-col justify-between rounded-lg border px-2 py-1.5"
      style={{
        background: "color-mix(in srgb, var(--accent) var(--cell-tint), transparent)",
        borderColor: "color-mix(in srgb, var(--accent) var(--cell-tint-edge), transparent)",
      }}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-[9px] font-bold uppercase tracking-wide text-accent">
          On the clock
        </span>
        <span className="stat-num shrink-0 text-[10px] text-faint">{label}</span>
      </div>
      <span className="truncate text-xs font-bold text-fg">
        {isUser ? "Your pick" : `Team ${slot}`}
      </span>
    </div>
  );
}

export function DraftBoardGrid({
  picks,
  byId,
  teams,
  rounds,
  userSlot,
  currentPick,
  onTheClock,
  teamName = (slot) => `Team ${slot}`,
  // Which column the roster panel is showing. Not necessarily the user's — clicking a
  // header is how you go and look at what someone else has built, which is a question
  // every drafter asks and no other surface here answers.
  selectedSlot = null,
  onSelectSlot = null,
  onSelectPlayer = null,
  cellHeight = 68,
  // An explicit height, when the room is letting the reader drag the split. Absent
  // (the results screen) it falls back to the viewport-relative cap.
  height = null,
}) {
  const byPickNumber = new Map(picks.map((pick) => [pick.pick_number, pick]));
  const currentRound = currentPick ? Math.ceil(currentPick / teams) : 1;
  const scrollRef = useRef(null);
  const activeRowRef = useRef(null);

  // Follow the draft down the board. `block: "nearest"` so an already-visible round
  // does not yank the view on every bot pick.
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentRound]);

  // Narrow enough that a 12-team board fits the page's content width without
  // scrolling — the whole point of a board is seeing it at once — but still wide
  // enough for a surname and a POS·TEAM line.
  const columns = { gridTemplateColumns: `repeat(${teams}, minmax(92px, 1fr))` };

  return (
    <div className="glass-card overflow-hidden">
      {/* Viewport-relative by default, not a fixed height: the board and the player
          pool have to share one screen, and a board tall enough to look good on a 27"
          monitor pushes the pool entirely below the fold on a laptop. Both scroll
          internally so the page itself barely moves. When the room passes a height,
          the reader is driving the split instead. */}
      <div
        ref={scrollRef}
        className="overflow-auto"
        style={height ? { height } : { maxHeight: "min(34rem, 46vh)" }}
      >
        {/* Deliberately NOT `min-w-max`: that sizes every column to its content and
            overrides the `minmax` floor below, so a 12-team board scrolled sideways
            even when it had room. Left to fill the container, the grid fits when it
            can and overflows only when the 92px floor genuinely does not — which is
            what should happen at 14 and 16 teams. */}
        <div>
          {/* Team headers. Sticky, because on a 15-round board you lose track of
              whose column you are reading within two scrolls. */}
          <div
            className="sticky top-0 z-10 grid gap-1 border-b border-line px-2 pb-2 pt-2 backdrop-blur"
            style={{ ...columns, background: "color-mix(in srgb, var(--surface-solid) 88%, transparent)" }}
          >
            {Array.from({ length: teams }, (_, index) => index + 1).map((slot) => {
              const isSelected = slot === selectedSlot;
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => onSelectSlot?.(slot)}
                  title={`Show ${teamName(slot)}'s roster`}
                  className={`truncate rounded-md px-2 py-1 text-center text-[11px] font-semibold transition ${
                    slot === userSlot ? "text-accent" : "text-muted hover:text-fg"
                  } ${isSelected ? "ring-1 ring-inset" : ""}`}
                  style={{
                    background:
                      slot === userSlot
                        ? "color-mix(in srgb, var(--accent) 14%, transparent)"
                        : isSelected
                          ? "var(--surface-2)"
                          : undefined,
                    ...(isSelected
                      ? { "--tw-ring-color": "color-mix(in srgb, var(--accent) 55%, transparent)" }
                      : {}),
                  }}
                >
                  {teamName(slot)}
                </button>
              );
            })}
          </div>

          <div className="space-y-1 p-2">
            {Array.from({ length: rounds }, (_, index) => index + 1).map((round) => (
              <div
                key={round}
                ref={round === currentRound ? activeRowRef : undefined}
                className="grid gap-1"
                style={columns}
              >
                {Array.from({ length: teams }, (_, index) => index + 1).map((slot) => {
                  const pickNumber = pickNumberFor(round, slot, teams);
                  const label = pickLabel(round, slot, teams);
                  const arrow = pickArrow(round, slot, teams);
                  const isUser = slot === userSlot;
                  const pick = byPickNumber.get(pickNumber);
                  const player = pick ? byId.get(pick.player_id) : null;

                  return (
                    <div key={slot} style={{ height: cellHeight }}>
                      {player ? (
                        <FilledCell
                          player={player}
                          label={label}
                          arrow={arrow}
                          isUser={isUser}
                          onSelect={onSelectPlayer}
                        />
                      ) : pickNumber === currentPick ? (
                        <OnTheClockCell label={label} isUser={isUser} slot={onTheClock ?? slot} />
                      ) : (
                        <EmptyCell label={label} arrow={arrow} isUser={isUser} />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
