// The score ticker across the top of the home page (October 2026).
//
// One line of games with a switch between the week just played and the week coming up.
// It replaced the Scores & Schedule card, and the switch was chosen from four mockups
// (https://claude.ai/artifact/8WSmUYJEJmMht7orDQqEn2) as the one that names both weeks
// on the bar, so nobody has to guess the slate is there.
//
// A final sits each score beside its own team and dims the loser, the reading the
// scoreboard card settled on. A slate game shows its kickoff and the spread on the
// favourite: implied points were mocked up too, and in a one-line strip they read as a
// score. A slate game that has been played shows its final in place.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Tabs } from "./primitives";
import { dateParts, formatKickoffCompact, todayEastern } from "../schedule/kickoff";
import { formatStat } from "../../utils/format";

/**
 * Which week the ticker opens on: the slate once the coming week's first game day has
 * arrived (Thursday, in a normal week), the finals before that.
 *
 * The server moves both windows on the Monday after a Sunday slate is in, so from Monday
 * to Wednesday the finals are the news and from the Thursday opener the slate is. Keyed
 * to the first game rather than the weekday, so a week opening on a Wednesday shows its
 * slate that day and the offseason keeps the finals until Week 1 kicks off.
 */
function openingView(finals, slate) {
  if (!slate.length) return "final";
  if (!finals.length) return "slate";
  const firstDay = slate.map((game) => game.game_date).filter(Boolean).sort()[0];
  return firstDay && todayEastern() >= firstDay ? "slate" : "final";
}

const FADE_PX = 36;
const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * A sideways strip: whether there is more at either edge (for the arrows and the fades),
 * paging by most of its width, and dragging with a mouse. Touch and trackpads scroll it
 * natively. A new `resetKey` returns it to the start, for when its contents are swapped.
 */
function useStrip(resetKey) {
  const ref = useRef(null);
  const drag = useRef(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const [dragging, setDragging] = useState(false);

  const measure = useCallback(() => {
    const strip = ref.current;
    if (!strip) return;
    const start = strip.scrollLeft <= 2;
    const end = strip.scrollLeft >= strip.scrollWidth - strip.clientWidth - 2;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  useEffect(() => {
    const strip = ref.current;
    if (!strip) return undefined;
    strip.scrollLeft = 0;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    if (strip.firstElementChild) observer.observe(strip.firstElementChild);
    return () => observer.disconnect();
  }, [resetKey, measure]);

  const page = (direction) => {
    const strip = ref.current;
    if (!strip) return;
    strip.scrollBy({ left: direction * strip.clientWidth * 0.85, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };

  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };
  const handlers = {
    onScroll: measure,
    onPointerDown: (event) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      drag.current = { x: event.clientX, left: ref.current.scrollLeft, pointerId: event.pointerId, moved: false };
    },
    onPointerMove: (event) => {
      const state = drag.current;
      if (!state) return;
      const dx = event.clientX - state.x;
      // A few pixels of slack, so a click on the strip is still a click.
      if (!state.moved && Math.abs(dx) > 4) {
        state.moved = true;
        ref.current.setPointerCapture(state.pointerId);
        setDragging(true);
      }
      if (state.moved) ref.current.scrollLeft = state.left - dx;
    },
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  };

  return { ref, edges, dragging, page, handlers };
}

function Logo({ url }) {
  return url ? (
    <img src={url} alt="" loading="lazy" draggable={false} className="h-4 w-4 flex-none object-contain" />
  ) : (
    <span className="h-4 w-4 flex-none" />
  );
}

function Side({ abbreviation, logoUrl, score, lost, reverse }) {
  const tone = lost ? "font-medium text-faint" : "font-bold text-fg";
  return (
    <span className={`flex items-center gap-1.5 ${reverse ? "flex-row-reverse" : ""}`}>
      <Logo url={logoUrl} />
      <span className={`text-[12px] ${tone}`}>{abbreviation}</span>
      <span className={`stat-num text-[12.5px] ${tone}`}>{score}</span>
    </span>
  );
}

function SlateSide({ abbreviation, logoUrl, spread, reverse }) {
  return (
    <span className={`flex items-center gap-1.5 ${reverse ? "flex-row-reverse" : ""}`}>
      <Logo url={logoUrl} />
      <span className="text-[12px] font-bold text-fg">{abbreviation}</span>
      {spread != null && <span className="stat-num text-[11px] text-muted">{formatStat(spread, 1)}</span>}
    </span>
  );
}

function Item({ divided, title, children }) {
  return (
    <span title={title} className={`flex flex-none items-center gap-2 px-3 ${divided ? "border-l border-line" : ""}`}>
      {children}
    </span>
  );
}

function FinalGame({ game, divided }) {
  return (
    <Item divided={divided}>
      <Side abbreviation={game.away_abbreviation} logoUrl={game.away_logo_url} score={game.away_score} lost={game.winner === "home"} />
      <span className="text-[11px] text-faint">{"·"}</span>
      <Side abbreviation={game.home_abbreviation} logoUrl={game.home_logo_url} score={game.home_score} lost={game.winner === "away"} reverse />
    </Item>
  );
}

function SlateGame({ game, divided }) {
  const spreadFor = (abbreviation) => (game.favorite === abbreviation ? game.favorite_spread : null);
  const title = [
    game.favorite && game.favorite_spread != null ? `${game.favorite} ${formatStat(game.favorite_spread, 1)}` : null,
    game.total_line != null ? `O/U ${formatStat(game.total_line, 1)}` : "No line yet",
  ].filter(Boolean).join(", ");
  return (
    <Item divided={divided} title={title}>
      <span className="stat-num whitespace-nowrap text-[10.5px] text-faint">{formatKickoffCompact(game.kickoff_time)}</span>
      <SlateSide abbreviation={game.away_abbreviation} logoUrl={game.away_logo_url} spread={spreadFor(game.away_abbreviation)} />
      <span className="text-[11px] font-semibold text-faint">@</span>
      <SlateSide abbreviation={game.home_abbreviation} logoUrl={game.home_logo_url} spread={spreadFor(game.home_abbreviation)} reverse />
    </Item>
  );
}

function DayMarker({ day, divided }) {
  return (
    <span
      className={`flex flex-none items-center self-stretch pr-1 font-mono text-[10px] font-bold tracking-[0.12em] text-muted ${
        divided ? "border-l border-line pl-3" : "pl-0.5"
      }`}
    >
      {day}
    </span>
  );
}

/** The slate with a day marker wherever the day changes (THU, SUN, MON). */
function slateItems(games) {
  const items = [];
  let lastDay = null;
  for (const game of games) {
    const day = dateParts(game.game_date)?.dow.toUpperCase() ?? "";
    const newDay = day !== lastDay;
    if (newDay) {
      items.push(<DayMarker key={`day-${game.game_date}`} day={day} divided={items.length > 0} />);
      lastDay = day;
    }
    const Game = game.played ? FinalGame : SlateGame;
    items.push(<Game key={game.game_id} game={game} divided={!newDay} />);
  }
  return items;
}

const CHEVRON = {
  left: "M10 3.5 5.5 8l4.5 4.5",
  right: "M6 3.5 10.5 8 6 12.5",
};

function PageArrow({ direction, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "left" ? "Earlier games" : "More games"}
      className="glass-pill grid h-7 w-7 place-items-center text-fg transition enabled:hover:text-accent disabled:opacity-30"
    >
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
        <path d={CHEVRON[direction]} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export function ScoreTicker({ scoreboard, isLoading }) {
  const last = scoreboard?.last;
  const next = scoreboard?.next;
  const finals = (last?.games ?? []).filter((game) => game.played);
  const slate = next?.games ?? [];
  const hasBoth = finals.length > 0 && slate.length > 0;

  // Null until the reader picks a week, so the opening view can follow the calendar.
  const [chosen, setChosen] = useState(null);
  const view = (hasBoth && chosen) || openingView(finals, slate);
  const shown = view === "slate" ? next : last;

  const strip = useStrip(`${view}-${shown?.season}-${shown?.week}`);

  if (!isLoading && !finals.length && !slate.length) return null;

  const mask = `linear-gradient(to right, transparent, #000 ${strip.edges.start ? 0 : FADE_PX}px, #000 calc(100% - ${
    strip.edges.end ? 0 : FADE_PX
  }px), transparent)`;
  // Slides only when the reader switched weeks, never on the first paint.
  const entrance = chosen ? (view === "slate" ? "ticker-from-right" : "ticker-from-left") : "";

  return (
    <section
      aria-label={shown ? `${shown.label} ${view === "slate" ? "slate" : "scores"}` : "Scores"}
      className="glass-card flex flex-wrap items-center gap-x-3 gap-y-2 overflow-hidden py-2.5 pl-3 pr-2.5 sm:min-h-[52px] sm:flex-nowrap sm:py-2 sm:pl-3.5 sm:pr-2"
    >
      {hasBoth ? (
        // On a phone the switch takes its row's width, with the games on a row of their own.
        <div className="min-w-0 flex-1 sm:flex-none [&>div]:w-full sm:[&>div]:w-auto [&_button]:flex-1 sm:[&_button]:flex-none">
          <Tabs
            options={[
              { value: "final", label: `${last.label} Final` },
              { value: "slate", label: `${next.label} Slate` },
            ]}
            value={view}
            onChange={(value) => value !== view && setChosen(value)}
            label="Which week"
          />
        </div>
      ) : (
        <span className="flex-none font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-accent">
          {shown ? `${shown.label} ${view === "slate" ? "slate" : "final"}` : "Final"}
        </span>
      )}

      {/* Scrolls sideways on its own rather than wrapping: sixteen games on two lines
          would make the strip as tall as the card it replaced. */}
      <div
        ref={strip.ref}
        {...strip.handlers}
        style={{ maskImage: mask, WebkitMaskImage: mask }}
        className={`order-last min-w-0 basis-full overflow-x-auto [scrollbar-width:none] sm:order-none sm:flex-1 sm:basis-auto [&::-webkit-scrollbar]:hidden ${
          strip.dragging ? "cursor-grabbing select-none" : "cursor-grab"
        }`}
      >
        {isLoading ? (
          <span className="block h-6 w-full animate-pulse rounded-lg" style={{ background: "color-mix(in srgb, var(--surface-2) 70%, transparent)" }} />
        ) : (
          <div key={view} className={`flex min-h-[34px] w-max items-center ${entrance}`}>
            {view === "slate" ? slateItems(slate) : finals.map((game, index) => <FinalGame key={game.game_id} game={game} divided={index > 0} />)}
          </div>
        )}
      </div>

      <div className="hidden flex-none gap-1 sm:flex">
        <PageArrow direction="left" disabled={strip.edges.start} onClick={() => strip.page(-1)} />
        <PageArrow direction="right" disabled={strip.edges.end} onClick={() => strip.page(1)} />
      </div>

      <Link
        to={shown ? `/schedule/games?season=${shown.season}&week=${shown.week}` : "/schedule/games"}
        className="glass-pill flex-none px-3 py-1.5 text-[12px] font-semibold text-fg transition hover:text-accent"
      >
        Full schedule {"→"}
      </Link>
    </section>
  );
}
