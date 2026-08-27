// The mock draft room (M9).
//
// **Two board settings, deliberately separate**, because they answer different
// questions. The *bots'* board is set at the top and is the market you are practising
// against. *Your* board is switchable inside the room, in the available-players panel,
// and is only a view — changing it never changes a single bot decision. Conflating the
// two would mean picking a harder cheat sheet also changed the room's behaviour, which
// is the opposite of practice.
//
// **No account required.** The draft runs in the browser and mirrors itself to
// localStorage after every pick, so it survives a refresh for everybody. Signing in
// adds a history of finished mocks, and nothing else.
//
// **The board is the room.** Teams across, rounds down, every pick in its cell — the
// questions a drafter actually has ("has anyone taken a tight end", "how far back is my
// next pick", "does team 4 already have three backs") are spatial, and a scrolling feed
// cannot answer any of them. See `components/DraftBoardGrid`.
//
// **Kickers and defenses are absent**, and the page says so: GridironIQ holds no data
// for them, and a placeholder round would be a fake.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Select } from "../components/ui/Select";
import { ScoringControl } from "../components/ScoringControl";
import { LeagueControl } from "../components/LeagueControl";
import { useDraftSources, useRankings } from "../hooks/useRankings";
import { useAuth } from "../hooks/useAuth";
import { useScoring } from "../hooks/useScoring";
import { useLeague } from "../hooks/useLeague";
import { parseLeague } from "../constants/league";
import { readStored, writeStored } from "../constants/storage";
import { gradeMockDraft, createMockDraft } from "../services/draft";
import { DraftBoardGrid } from "../components/DraftBoardGrid";
import { BoardResizer } from "../components/BoardResizer";
import { ComparePopup } from "../components/ComparePopup";
import { PlayerModal } from "../components/PlayerModal";
import { PositionTag } from "../components/PositionTag";
import { assignToSlots, roundOf, runBots, snakeOrder } from "../utils/draftBots";
import { formatStat } from "../utils/format";

const MOCK_STORAGE_KEY = "gridiron.mock";

// How tall the board is before anyone drags it, and how far it may be dragged. The
// minimum is roughly the sticky team-header row, so the board can be folded away to
// just the column headings with the pool right beneath them.
const DEFAULT_BOARD_HEIGHT = 420;
// Roughly the sticky team-header row, so the board can be folded away to just the
// column headings with the pool right beneath them.
const MIN_BOARD_HEIGHT = 44;
// What the bottom section keeps even when the board is dragged as far down as it goes.
// Measured rather than guessed: the pool card cannot shrink below its own padding,
// filter bar and table header (~230px at this width), and a floor under that made the
// card overflow its grid row and push the page into a scrollbar instead of clipping.
// This leaves the filters and a row or two — "collapsed" should not mean "gone".
const MIN_BOTTOM_HEIGHT = 284;
const BOARD_LIMIT = 800;

// Positions a FLEX filter shows. Matches the backend's FLEX_ELIGIBLE.
const FLEX_POSITIONS = ["RB", "WR", "TE"];

const RANDOMNESS_LABELS = [
  { max: 0.15, label: "Straight off the board" },
  { max: 0.45, label: "Disciplined" },
  { max: 0.75, label: "Realistic" },
  { max: 1.01, label: "Your league's worst drafter" },
];

function randomnessLabel(value) {
  return RANDOMNESS_LABELS.find((band) => value < band.max)?.label ?? "Realistic";
}

/** Rounds a league of this shape actually drafts: the lineup again, plus a bench. */
function defaultRounds(lineup) {
  const starters = lineup.qb + lineup.rb + lineup.wr + lineup.te + lineup.flex + lineup.superflex;
  return Math.min(20, starters + 6);
}

/**
 * How tall the room can be: everything from its own top edge to the bottom of the
 * window, less a little breathing room.
 *
 * Measured rather than hardcoded because the offset above it is not a constant — the
 * app header, the page padding and the room's own title bar all sit there, and any
 * of them can change height when the text wraps at a narrow width.
 */
function useAvailableHeight(ref) {
  const [height, setHeight] = useState(600);
  useEffect(() => {
    const measure = () => {
      const top = ref.current?.getBoundingClientRect().top ?? 0;
      // 28, not 16: the page's own bottom padding sits below the room, and leaving
      // only 16 put the document 8px over the viewport — enough for a scrollbar on a
      // page that is meant not to scroll at all.
      setHeight(Math.max(360, Math.round(window.innerHeight - top - 28)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  });
  return height;
}

function readSaved() {
  try {
    return JSON.parse(readStored(MOCK_STORAGE_KEY) ?? "null");
  } catch {
    return null;
  }
}

// Which positions actually produce each stat group. A dash in a column means "this
// does not apply here", which is what every fantasy table means by it — a receiver's
// passing yards genuinely are zero, but twelve zeroes on every row is noise rather
// than information. A real zero *inside* a group that applies still prints as 0,
// because that is a measurement someone might act on.
const STAT_GROUPS = {
  pass: ["QB"],
  rush: ["QB", "RB", "WR", "TE"],
  rec: ["RB", "WR", "TE"],
};

// The one honest label for these columns. There are no 2026 projections in any free
// feed — nflverse publishes ranks, never projected points — so every number here is
// last season's, and the header says so rather than letting anyone assume otherwise.
const POINTS_TITLE =
  "Last season's total, in your scoring. Not a projection — no free source publishes " +
  "2026 projected points.";

/**
 * Expand / collapse the bottom section — the two ends of what the split handle does
 * by hand. Kept next to Compare because that is where the eye already is when the
 * pool is the thing you are working in.
 */
function SplitButton({ direction, onClick, disabled, title }) {
  const expand = direction === "expand";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="glass-pill px-2 py-1.5 transition hover:!text-accent disabled:opacity-40"
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor"
           strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {expand ? (
          // Arrows pushing apart — the pool grows towards the team headers.
          <>
            <path d="M8 6.5 8 1.5M5.5 4 8 1.5 10.5 4" />
            <path d="M8 9.5 8 14.5M5.5 12 8 14.5 10.5 12" />
          </>
        ) : (
          // Arrows pulling together — the pool folds back down.
          <>
            <path d="M8 1.5 8 6.5M5.5 4 8 6.5 10.5 4" />
            <path d="M8 14.5 8 9.5M5.5 12 8 9.5 10.5 12" />
          </>
        )}
      </svg>
    </button>
  );
}

/** One right-aligned stat cell, with the group and null rules applied. */
function StatCell({ value, digits = 0, position, group, strong = false, divide = false }) {
  const applies = !group || STAT_GROUPS[group].includes(position);
  const missing = !applies || value === null || value === undefined;
  return (
    <td
      className={`stat-num whitespace-nowrap px-2 py-1.5 text-right ${
        divide ? "border-l border-line " : ""
      }${missing ? "text-faint" : strong ? "text-fg" : "text-muted"}`}
    >
      {missing ? "—" : formatStat(value, digits)}
    </td>
  );
}

/**
 * One team's roster, in the lineup slots the league actually starts.
 *
 * Slots rather than a flat list, because a list answers "who do I have" and the
 * question during a draft is "what am I missing" — an empty TE row says that at a
 * glance, and eleven names in a column does not.
 *
 * It shows *any* team, not just yours: the header of every board column is a button,
 * and "what has the guy picking in front of me already got" is a question a drafter
 * asks every round and no other surface here answers.
 */
function RosterPanel({ slots, title, isUser, onSelectPlayer }) {
  return (
    // Stretched to the pool's height by the grid, then the list spreads its rows to
    // fill it. Sitting at natural height left fourteen cramped rows above a block of
    // dead space, which read as an unfinished panel rather than a full roster.
    <div className="glass-card flex h-full min-h-0 flex-col overflow-hidden p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-fg">{title}</h3>
        {!isUser && <span className="text-[10px] text-faint">viewing another team</span>}
      </div>
      <ul className="mt-3 flex flex-1 flex-col justify-between overflow-y-auto">
        {slots.map((slot, index) => (
          <li
            key={`${slot.label}-${index}`}
            className="flex items-center gap-2 border-b border-line py-1.5 last:border-0"
          >
            <span
              className="w-11 shrink-0 rounded px-1 py-1.5 text-center text-[10px] font-bold"
              style={{
                background: slot.player
                  ? `color-mix(in srgb, var(--position-${slot.player.position.toLowerCase()}) var(--cell-tint), transparent)`
                  : "var(--surface-2)",
                color: slot.player ? "var(--fg)" : "var(--faint)",
              }}
            >
              {slot.label}
            </span>
            {slot.player ? (
              <>
                {slot.player.headshot_url ? (
                  <img
                    src={slot.player.headshot_url}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.style.visibility = "hidden";
                    }}
                    className="h-8 w-8 shrink-0 rounded-full object-cover"
                    style={{ background: "var(--surface-2)" }}
                  />
                ) : (
                  <span className="h-8 w-8 shrink-0 rounded-full bg-surface-2" />
                )}
                <button
                  type="button"
                  onClick={() => onSelectPlayer?.(slot.player.player_id)}
                  className="truncate text-left text-sm font-medium text-fg hover:text-accent"
                >
                  {slot.player.name}
                </button>
                <span className="stat-num shrink-0 text-[10px] text-muted">
                  {slot.player.team_abbreviation ?? "FA"}
                </span>
                {/* Bye weeks are what turn a good roster into an unstartable one in
                    week 7. Shown here rather than only in the pool because this is
                    where you notice you have three of them stacked. */}
                <span
                  className="stat-num shrink-0 text-[10px] text-faint"
                  title={slot.player.bye_week ? `Bye week ${slot.player.bye_week}` : "Bye unknown"}
                >
                  {slot.player.bye_week ? `BYE ${slot.player.bye_week}` : "—"}
                </span>
                <span className="stat-num ml-auto shrink-0 text-[10px] text-faint">
                  {slot.player.pickLabel}
                </span>
              </>
            ) : (
              <span className="text-sm text-faint">Empty</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MockDraftView({ board }) {
  const { isSignedIn } = useAuth();
  const [scoring, setScoring] = useScoring();
  const [league, setLeague] = useLeague();
  const { teams: leagueTeams, lineup } = parseLeague(league);

  const saved = useMemo(readSaved, []);
  const [setup, setSetup] = useState(
    () =>
      saved?.setup ?? {
        teams: leagueTeams,
        rounds: defaultRounds(lineup),
        userSlot: Math.ceil(leagueTeams / 2),
        randomness: 0.5,
        botSource: "consensus",
        seed: Math.floor(Math.random() * 1e9),
      },
  );
  const [picks, setPicks] = useState(() => saved?.picks ?? []);
  const [started, setStarted] = useState(() => Boolean(saved?.started));
  const [viewSource, setViewSource] = useState(() => saved?.setup?.botSource ?? "consensus");
  // Multi-select: an empty set means "all". "RB and WR, nothing else" is a real
  // mid-draft filter and a single-choice tab cannot express it.
  const [positionFilters, setPositionFilters] = useState([]);
  const [search, setSearch] = useState("");
  const [includeDrafted, setIncludeDrafted] = useState(false);
  const [queueOnly, setQueueOnly] = useState(false);
  // The hearted players. **Draft-local, never the account watchlist**: a mock never
  // requires signing in, and a queue you build while practising is about this draft
  // rather than a list you want following you around the app.
  const [queue, setQueue] = useState(() => saved?.queue ?? []);
  // Which team the roster panel is showing. Defaults to yours; a board header switches it.
  const [rosterSlot, setRosterSlot] = useState(null);
  const [profilePlayerId, setProfilePlayerId] = useState(null);
  const [compareOpen, setCompareOpen] = useState(false);
  // Where the reader has put the split between the board and everything below it.
  // Persisted with the draft: it is a preference about *this* room, and losing it on
  // a refresh mid-draft would be as annoying as losing the picks.
  const [boardHeight, setBoardHeight] = useState(
    () => saved?.boardHeight ?? DEFAULT_BOARD_HEIGHT,
  );
  const roomRef = useRef(null);
  const availableHeight = useAvailableHeight(roomRef);
  const [grade, setGrade] = useState(null);
  const [grading, setGrading] = useState(false);
  const [savedToHistory, setSavedToHistory] = useState(false);

  const { data: sources } = useDraftSources({ league });
  const sourceOptions = useMemo(
    () =>
      (sources?.data ?? []).map((option) => ({
        value: option.id,
        label: option.kind === "user" ? `${option.label} (yours)` : option.label,
      })),
    [sources],
  );

  // The universe of draftable players: the bots' board. Everything else is a view of
  // this, which is what keeps "switch my cheat sheet" from changing who exists.
  const { data: botBoard, isLoading: boardLoading } = useRankings({
    source: setup.botSource,
    scoring,
    league,
    limit: BOARD_LIMIT,
  });
  const { data: userBoard } = useRankings(
    { source: viewSource, scoring, league, limit: BOARD_LIMIT },
    { enabled: viewSource !== setup.botSource },
  );

  const universe = botBoard?.data ?? [];
  const byId = useMemo(
    () => new Map(universe.map((player) => [player.player_id, player])),
    [universe],
  );

  const order = useMemo(
    () => snakeOrder(setup.teams, setup.rounds),
    [setup.teams, setup.rounds],
  );
  const complete = started && picks.length >= order.length;
  const onTheClock = started && !complete ? order[picks.length] : null;
  const isUserTurn = onTheClock === setup.userSlot;

  // Persist after every change. This is the whole of "resume": a mock is fifteen
  // minutes of work and a refresh must not cost it, signed in or not.
  useEffect(() => {
    writeStored(
      MOCK_STORAGE_KEY,
      JSON.stringify({ setup, picks, started, queue, boardHeight }),
    );
  }, [setup, picks, started, queue, boardHeight]);

  // Run the bots whenever it is not the user's turn. Pure function in, new picks out.
  useEffect(() => {
    if (!started || complete || isUserTurn || universe.length === 0) return;
    const next = runBots({
      picks,
      board: universe,
      league: { ...lineup, teams: setup.teams },
      teams: setup.teams,
      rounds: setup.rounds,
      userSlot: setup.userSlot,
      randomness: setup.randomness,
      seed: setup.seed,
    });
    if (next.length !== picks.length) setPicks(next);
  }, [started, complete, isUserTurn, picks, universe, setup, lineup]);

  const taken = useMemo(() => new Set(picks.map((pick) => pick.player_id)), [picks]);

  // Where each drafted player went, so a row can say "taken at 2.04" rather than just
  // vanishing when "include drafted" is on.
  const pickByPlayer = useMemo(() => {
    const map = new Map();
    picks.forEach((pick) => {
      const withinRound =
        pick.round % 2 === 1 ? pick.team_slot : setup.teams - pick.team_slot + 1;
      map.set(pick.player_id, { ...pick, pickLabel: `${pick.round}.${withinRound}` });
    });
    return map;
  }, [picks, setup.teams]);

  // Everyone still on the board, ordered by *your* board where it has an opinion and
  // by the bots' board for anyone your board leaves off — so a 150-name cheat sheet
  // still lets you draft the 400th player rather than hiding him.
  const undrafted = useMemo(() => {
    const viewOrder = new Map(
      (userBoard?.data ?? []).map((player, index) => [player.player_id, index]),
    );
    const floor = viewOrder.size;
    return universe
      .filter((player) => !taken.has(player.player_id))
      .sort(
        (left, right) =>
          (viewOrder.get(left.player_id) ?? floor + left.rank) -
          (viewOrder.get(right.player_id) ?? floor + right.rank),
      );
  }, [universe, taken, userBoard]);

  const queued = useMemo(() => new Set(queue), [queue]);

  // What the panel actually lists. Drafted players are *included* rather than removed
  // when the toggle is on, struck through in place — "wait, who took Bijan?" is a
  // question the pool can answer for free, and a name that simply disappears cannot.
  const pool = useMemo(() => {
    const query = search.trim().toLowerCase();
    const source = includeDrafted
      ? [...undrafted, ...universe.filter((player) => taken.has(player.player_id))].sort(
          (left, right) => left.rank - right.rank,
        )
      : undrafted;
    return source
      .filter((player) => {
        if (positionFilters.length === 0) return true;
        return positionFilters.some((filter) => {
          if (filter === "FLEX") return FLEX_POSITIONS.includes(player.position);
          if (filter === "SUPERFLEX") return true;
          return player.position === filter;
        });
      })
      .filter((player) => (queueOnly ? queued.has(player.player_id) : true))
      .filter((player) => (query ? player.name.toLowerCase().includes(query) : true));
  }, [undrafted, universe, taken, includeDrafted, positionFilters, queueOnly, queued, search]);

  // Autopick and the bots always read the undrafted list, never the filtered pool: a
  // filter is a view, and "autopick" should not mean "the best receiver" just because
  // a receiver filter happens to be on.
  const available = undrafted;

  const rosterFor = useCallback(
    (slot) =>
      picks
        .filter((pick) => pick.team_slot === slot)
        .map((pick) => {
          const player = byId.get(pick.player_id);
          if (!player) return null;
          const withinRound =
            pick.round % 2 === 1 ? pick.team_slot : setup.teams - pick.team_slot + 1;
          return { ...player, pickLabel: `${pick.round}.${withinRound}` };
        })
        .filter(Boolean),
    [picks, setup.teams, byId],
  );

  const roster = useMemo(() => rosterFor(setup.userSlot), [rosterFor, setup.userSlot]);

  const panelSlot = rosterSlot ?? setup.userSlot;
  const panelSlots = useMemo(
    () => assignToSlots(rosterFor(panelSlot), lineup, setup.rounds),
    [rosterFor, panelSlot, lineup, setup.rounds],
  );

  function toggleQueued(playerId) {
    setQueue((current) =>
      current.includes(playerId)
        ? current.filter((id) => id !== playerId)
        : [...current, playerId],
    );
  }

  function togglePosition(id) {
    setPositionFilters((current) =>
      current.includes(id) ? current.filter((one) => one !== id) : [...current, id],
    );
  }

  // Your own assignment, which the position filters count off — those are a shopping
  // list, so they stay about *your* needs even while the panel is showing another
  // team's roster.
  const slots = useMemo(
    () => assignToSlots(roster, lineup, setup.rounds),
    [roster, lineup, setup.rounds],
  );

  // Every pill counts *starting slots filled*, not players held — so a roster with
  // five backs reads "RB 2/2" with the other three sitting in FLEX and on the bench,
  // rather than "RB 5/2", which looks like a bug and answers a question nobody asked.
  // What a drafter wants from this row is "what is still empty".
  const positionTabs = useMemo(() => {
    const filled = (label) =>
      slots.filter((slot) => slot.label === label && slot.player).length;
    const total = (label) => slots.filter((slot) => slot.label === label).length;
    const slotTab = (label) => ({
      id: label,
      label,
      have: filled(label),
      want: total(label),
    });
    return [
      // ALL is not a filter, it is the *absence* of one — pressing it clears the set
      // rather than adding a seventh choice that means "everything".
      { id: "ALL", label: "ALL", have: roster.length, want: setup.rounds },
      // SUPERFLEX appears only in leagues that start one. As a *filter* it matches
      // every position we carry, which is exactly what superflex-eligible means; as a
      // counter it is the one that tells you the slot is still open.
      ...["QB", "RB", "WR", "TE", "FLEX", "SUPERFLEX"]
        .filter((label) => total(label) > 0)
        .map(slotTab),
    ];
  }, [roster, slots, setup.rounds]);

  const draft = useCallback(
    (player, auto = false) => {
      if (!isUserTurn) return;
      const pickNumber = picks.length + 1;
      setPicks([
        ...picks,
        {
          pick_number: pickNumber,
          round: roundOf(pickNumber, setup.teams),
          team_slot: setup.userSlot,
          player_id: player.player_id,
          is_user: true,
          auto,
        },
      ]);
    },
    [isUserTurn, picks, setup.teams, setup.userSlot],
  );

  // Grade once the last pick lands.
  useEffect(() => {
    if (!complete || grade || grading) return;
    setGrading(true);
    const rosters = Array.from({ length: setup.teams }, (_, index) => ({
      draft_slot: index + 1,
      player_ids: picks
        .filter((pick) => pick.team_slot === index + 1)
        .map((pick) => pick.player_id),
    }));
    gradeMockDraft({ scoring, league, teams: rosters, picks, bot_source: setup.botSource })
      .then(setGrade)
      .finally(() => setGrading(false));
  }, [complete, grade, grading, picks, setup, scoring, league]);

  async function saveToHistory() {
    const mine = grade?.teams.find((team) => team.draft_slot === setup.userSlot);
    await createMockDraft({
      scoring_spec: scoring,
      league_spec: league,
      teams: setup.teams,
      rounds: setup.rounds,
      draft_slot: setup.userSlot,
      bot_source: setup.botSource,
      bot_randomness: setup.randomness,
      grade_vorp: mine?.expected_vorp ?? null,
      grade_rank: mine?.rank ?? null,
      picks,
    });
    setSavedToHistory(true);
  }

  function reset() {
    setPicks([]);
    setStarted(false);
    setGrade(null);
    setSavedToHistory(false);
    setSetup({ ...setup, seed: Math.floor(Math.random() * 1e9) });
  }

  // --- Setup -----------------------------------------------------------------

  if (!started) {
    return (
      <div className="space-y-5">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent">Draft</div>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-fg">{board.title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">{board.description}</p>
        </div>

        <div className="glass-card flex flex-wrap gap-3 p-4">
          <Select
            label="Teams"
            value={String(setup.teams)}
            onChange={(value) =>
              setSetup({
                ...setup,
                teams: Number(value),
                userSlot: Math.min(setup.userSlot, Number(value)),
              })
            }
            options={[8, 10, 12, 14, 16].map((count) => ({
              value: String(count),
              label: `${count} teams`,
            }))}
          />
          <Select
            label="Your pick"
            value={String(setup.userSlot)}
            onChange={(value) => setSetup({ ...setup, userSlot: Number(value) })}
            options={Array.from({ length: setup.teams }, (_, index) => ({
              value: String(index + 1),
              label: `Slot ${index + 1}`,
            }))}
          />
          <Select
            label="Rounds"
            value={String(setup.rounds)}
            onChange={(value) => setSetup({ ...setup, rounds: Number(value) })}
            options={Array.from({ length: 16 }, (_, index) => index + 5).map((count) => ({
              value: String(count),
              label: `${count} rounds`,
            }))}
          />
          <Select
            label="Bots draft from"
            value={setup.botSource}
            onChange={(value) => {
              setSetup({ ...setup, botSource: value });
              setViewSource(value);
            }}
            options={sourceOptions}
          />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              Bot behaviour
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={setup.randomness}
              onChange={(event) =>
                setSetup({ ...setup, randomness: Number(event.target.value) })
              }
              className="w-44 accent-[var(--accent)]"
            />
            <span className="text-[11px] text-faint">{randomnessLabel(setup.randomness)}</span>
          </label>
          <div className="ml-auto flex items-end">
            <button
              type="button"
              onClick={() => setStarted(true)}
              disabled={boardLoading || universe.length === 0}
              className="glass-pill px-4 py-2 text-sm !text-accent disabled:opacity-50"
            >
              {boardLoading ? "Loading the board…" : "Start draft"}
            </button>
          </div>
        </div>

        <div className="grid items-start gap-3 lg:grid-cols-2">
          <ScoringControl scoring={scoring} onChange={setScoring} />
          <LeagueControl league={league} onChange={setLeague} />
        </div>

        <p className="max-w-3xl text-xs leading-relaxed text-muted">
          Bots pick near the top of their board, straying further on players the expert
          boards disagree about and less on the ones they all rate the same — so a
          contested player goes at an unpredictable spot and a consensus one does not.
          They also draft for need against your league&apos;s starting lineup. Inside
          the room you can re-order the available list by any other board without
          changing what they do.
        </p>
        <p className="max-w-3xl text-xs leading-relaxed text-faint">
          Quarterbacks, running backs, receivers and tight ends only. GridironIQ holds
          no kicker or defense data, and drafting placeholder names would not be
          practice.
          {picks.length > 0 && (
            <>
              {" "}
              <button
                type="button"
                onClick={() => setStarted(true)}
                className="text-accent underline underline-offset-2"
              >
                Resume the draft you left
              </button>{" "}
              ({picks.length} picks in).
            </>
          )}
        </p>
      </div>
    );
  }

  // --- Results ---------------------------------------------------------------

  if (complete) {
    const mine = grade?.teams.find((team) => team.draft_slot === setup.userSlot);
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent">
              Draft · Results
            </div>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-fg">
              {mine ? `You finished ${mine.rank} of ${setup.teams}` : "Draft complete"}
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted">
              Graded on <span className="font-semibold text-fg">expected</span> value over
              replacement — what each starting lineup&apos;s usage was worth in your
              scoring, not what it scored. A draft graded on last season&apos;s results
              would reward whoever drafted the most touchdown luck.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isSignedIn && (
              <button
                type="button"
                onClick={saveToHistory}
                disabled={savedToHistory || !grade}
                className="glass-pill px-3 py-1.5 text-sm disabled:opacity-50"
              >
                {savedToHistory ? "Saved" : "Save to history"}
              </button>
            )}
            <button
              type="button"
              onClick={reset}
              className="glass-pill px-3 py-1.5 text-sm !text-accent"
            >
              New mock
            </button>
          </div>
        </div>

        {/* The finished board, before the numbers. After fifteen minutes of drafting
            this is what someone wants to look at, and it is the only view that shows
            what the rest of the room did with their picks. */}
        <DraftBoardGrid
          picks={picks}
          byId={byId}
          teams={setup.teams}
          rounds={setup.rounds}
          userSlot={setup.userSlot}
          currentPick={null}
          onTheClock={null}
          teamName={(slot) => (slot === setup.userSlot ? "You" : `Team ${slot}`)}
        />

        {grading && <p className="glass-card p-6 text-sm text-muted">Grading…</p>}

        {grade && (
          <>
            <div className="glass-card overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-faint">
                    <th className="px-3 py-3 text-right">Rank</th>
                    <th className="px-3 py-3">Team</th>
                    <th className="px-3 py-3 text-right" title="Sum of the starting lineup's expected VORP per game">
                      Starters xVORP
                    </th>
                    <th className="px-3 py-3 text-right" title="Expected VORP on the bench, counting only players above replacement">
                      Bench
                    </th>
                    <th className="px-3 py-3 text-right" title="Picks with no NFL history, or too few games to value. They score zero rather than being guessed at.">
                      Unvalued
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {grade.teams.map((team) => (
                    <tr
                      key={team.draft_slot}
                      className={`border-b border-line last:border-0 ${
                        team.draft_slot === setup.userSlot ? "bg-surface-2" : ""
                      }`}
                    >
                      <td className="stat-num px-3 py-2.5 text-right text-faint">{team.rank}</td>
                      <td className="px-3 py-2.5 font-medium text-fg">
                        {team.draft_slot === setup.userSlot ? "You" : `Team ${team.draft_slot}`}
                      </td>
                      <td className="stat-num px-3 py-2.5 text-right text-fg">
                        {formatStat(team.expected_vorp, 1)}
                      </td>
                      <td className="stat-num px-3 py-2.5 text-right text-muted">
                        {formatStat(team.bench_depth, 1)}
                      </td>
                      <td className="stat-num px-3 py-2.5 text-right text-faint">
                        {team.unvalued_picks}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="glass-card overflow-x-auto p-4">
              <h3 className="text-sm font-bold text-fg">Your picks</h3>
              <table className="mt-2 w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-faint">
                    <th className="px-2 py-2 text-right">Pick</th>
                    <th className="px-2 py-2">Player</th>
                    <th className="px-2 py-2 text-right" title="Their place on the board the room was drafting from">Board</th>
                    <th className="px-2 py-2 text-right" title="Pick number minus board rank. Positive means they lasted longer than the board said.">Value</th>
                    <th className="px-2 py-2 text-right">xVORP/G</th>
                  </tr>
                </thead>
                <tbody>
                  {grade.picks
                    .filter((pick) => pick.is_user)
                    .map((pick) => (
                      <tr key={pick.pick_number} className="border-b border-line last:border-0">
                        <td className="stat-num px-2 py-2 text-right text-faint">
                          {pick.round}.{String(((pick.pick_number - 1) % setup.teams) + 1).padStart(2, "0")}
                        </td>
                        <td className="px-2 py-2">
                          <Link
                            to={`/players/${pick.player_id}`}
                            className="font-medium text-fg hover:text-accent hover:underline"
                          >
                            {pick.name}
                          </Link>
                          <span className="ml-2"><PositionTag position={pick.position} /></span>
                        </td>
                        <td className="stat-num px-2 py-2 text-right text-muted">
                          {pick.board_rank ?? "—"}
                        </td>
                        <td
                          className={`stat-num px-2 py-2 text-right ${
                            pick.value > 0 ? "text-pos" : pick.value < 0 ? "text-neg" : "text-muted"
                          }`}
                        >
                          {pick.value === null || pick.value === undefined
                            ? "—"
                            : pick.value > 0
                              ? `+${pick.value}`
                              : pick.value}
                        </td>
                        <td className="stat-num px-2 py-2 text-right text-muted">
                          {formatStat(pick.expected_vorp_ppg, 2)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <p className="max-w-3xl text-[11px] leading-relaxed text-faint">
              Value is measured against the board the <em>bots</em> were reading,
              because that is the market this room actually had — grading a pick
              against a board nobody was using would measure nothing. Players with no NFL history score
              zero rather than being imputed to replacement level: we have no
              information about them, and pretending otherwise would make every rookie
              look like a mistake.
            </p>
          </>
        )}
      </div>
    );
  }

  // --- The room --------------------------------------------------------------

  const pickNumber = picks.length + 1;
  const round = roundOf(pickNumber, setup.teams);
  const slotInRound = ((pickNumber - 1) % setup.teams) + 1;
  const botLabel =
    sourceOptions.find((option) => option.value === setup.botSource)?.label ??
    setup.botSource;

  // How many picks until you are up again. The single most asked question in a draft,
  // and one the board shows spatially but not numerically.
  const untilNext = order.slice(picks.length).indexOf(setup.userSlot);

  // The board may never grow past what would leave the pool unusable, and the split is
  // clamped to that on every render — so shrinking the window cannot strand the bottom
  // section off-screen.
  const maxBoardHeight = Math.max(MIN_BOARD_HEIGHT, availableHeight - MIN_BOTTOM_HEIGHT);
  const clampedBoard = Math.min(Math.max(boardHeight, MIN_BOARD_HEIGHT), maxBoardHeight);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent">
              Draft · Round {round}, pick {slotInRound}
            </div>
            <h1 className="mt-0.5 text-xl font-bold tracking-tight text-fg">
              {isUserTurn ? "You're on the clock" : `Team ${onTheClock} is picking…`}
            </h1>
          </div>
          <span className="text-xs text-muted">
            Pick {pickNumber} of {order.length}
            {!isUserTurn && untilNext > 0 && <> · {untilNext} until you&apos;re up</>}
            {" · bots reading "}
            {botLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPicks(picks.slice(0, -1))}
            disabled={picks.length === 0}
            className="glass-pill px-3 py-1.5 text-sm disabled:opacity-50"
            title="Take the last pick back"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => draft(available[0], true)}
            disabled={!isUserTurn || available.length === 0}
            className="glass-pill px-3 py-1.5 text-sm disabled:opacity-50"
            title="Take the top player still on the board"
          >
            Autopick
          </button>
          <button type="button" onClick={reset} className="glass-pill px-3 py-1.5 text-sm !text-neg">
            Restart
          </button>
        </div>
      </div>

      {/* Everything below the title bar shares one measured column: the board at the
          height the reader chose, then the split, then the bottom section taking
          whatever is left. Panels scroll internally so the page itself does not. */}
      <div
        ref={roomRef}
        className="flex min-h-0 flex-col gap-1.5"
        style={{ height: availableHeight }}
      >
      <DraftBoardGrid
        picks={picks}
        byId={byId}
        teams={setup.teams}
        rounds={setup.rounds}
        userSlot={setup.userSlot}
        currentPick={pickNumber}
        onTheClock={onTheClock}
        teamName={(slot) => (slot === setup.userSlot ? "You" : `Team ${slot}`)}
        selectedSlot={panelSlot}
        onSelectSlot={setRosterSlot}
        onSelectPlayer={setProfilePlayerId}
        height={clampedBoard}
      />

      {/* The split. Resizing the board is all this does — the bottom section is
          `flex-1` beneath it, so every pixel the board gives up becomes pool and
          roster rather than empty page. */}
      <BoardResizer
        height={clampedBoard}
        onChange={setBoardHeight}
        min={MIN_BOARD_HEIGHT}
        max={maxBoardHeight}
      />

      <div className="grid min-h-0 flex-1 items-stretch gap-4 xl:grid-cols-[minmax(0,2.4fr)_minmax(300px,1fr)]">
        <div className="glass-card flex min-h-0 flex-col overflow-hidden p-4">
          <div className="flex flex-wrap items-end gap-3">
            <Select
              label="Rank by"
              value={viewSource}
              onChange={setViewSource}
              options={sourceOptions}
            />
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">Search</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Filter by name…"
                className="glass-input px-3 py-2 text-sm"
              />
            </label>

            {/* Each filter carries how much of that slot you have already filled, so
                the control you press to find a tight end is also the one telling you
                that you need one. Positions multi-select; ALL clears them. */}
            <div className="flex flex-wrap items-center gap-1">
              {positionTabs.map((tab) => {
                const active =
                  tab.id === "ALL"
                    ? positionFilters.length === 0
                    : positionFilters.includes(tab.id);
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() =>
                      tab.id === "ALL" ? setPositionFilters([]) : togglePosition(tab.id)
                    }
                    title={`${tab.have} of ${tab.want} ${
                      tab.id === "ALL" ? "picks made" : `${tab.label} slots filled`
                    }`}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                      active ? "glass-pill !text-accent" : "text-muted hover:text-fg"
                    }`}
                  >
                    {tab.label}{" "}
                    <span
                      className={`stat-num text-[10px] ${
                        tab.have >= tab.want ? "text-faint" : "text-accent"
                      }`}
                    >
                      {tab.have}/{tab.want}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setQueueOnly((current) => !current)}
                title={`Show only your queue (${queue.length})`}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                  queueOnly ? "glass-pill !text-accent" : "text-muted hover:text-fg"
                }`}
              >
                ♥ {queue.length}
              </button>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={includeDrafted}
                  onChange={(event) => setIncludeDrafted(event.target.checked)}
                  className="accent-[var(--accent)]"
                />
                Include drafted
              </label>
              <button
                type="button"
                onClick={() => setCompareOpen(true)}
                className="glass-pill px-3 py-1.5 text-xs"
              >
                Compare
              </button>
              <SplitButton
                direction="expand"
                onClick={() => setBoardHeight(MIN_BOARD_HEIGHT)}
                disabled={clampedBoard <= MIN_BOARD_HEIGHT}
                title="Expand — fill the screen up to the team names"
              />
              <SplitButton
                direction="collapse"
                onClick={() => setBoardHeight(maxBoardHeight)}
                disabled={clampedBoard >= maxBoardHeight}
                title="Collapse — fold the players and roster back down"
              />
            </div>
          </div>

          {viewSource !== setup.botSource && (
            <p className="mt-2 text-[11px] text-faint">
              Viewing your own order. The bots are still drafting from {botLabel} —
              switching this list never changes what they do.
            </p>
          )}

          {/* Column widths: the identity columns are shrink-to-fit (`w-px` plus
              `whitespace-nowrap`) so the table's leftover width lands on the Player
              column rather than being absorbed by an empty header — which is what
              otherwise leaves eighty pixels of dead space between the heart and the
              team it belongs to. */}
          {/* `flex-1` with `min-h-0` inside a card that has a real height: the card
              is sized by the grid row, which is sized by the measured column above, so
              the table finally has something to fill. Without the height further up
              this grew to fit all 200 rows. */}
          <div className="mt-3 min-h-0 flex-1 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10" style={{ background: "var(--surface-solid)" }}>
                {/* Grouped headers keep seventeen columns scannable: without them the
                    three "Yds" and three "TD" columns are unreadable. */}
                <tr className="text-[10px] uppercase tracking-wider text-faint">
                  <th colSpan={3} className="px-2 pb-0.5 pt-2" />
                  <th colSpan={5} className="px-2 pb-0.5 pt-2" />
                  <th colSpan={2} className="border-l border-line px-2 pb-0.5 pt-2 text-center font-bold">
                    Passing
                  </th>
                  <th colSpan={2} className="border-l border-line px-2 pb-0.5 pt-2 text-center font-bold">
                    Rushing
                  </th>
                  <th colSpan={3} className="border-l border-line px-2 pb-0.5 pt-2 text-center font-bold">
                    Receiving
                  </th>
                </tr>
                <tr className="text-xs uppercase tracking-wide text-faint">
                  <th className="w-px whitespace-nowrap px-2 pb-2 text-right" title="Their place on the board you are ranking by">
                    #
                  </th>
                  <th className="w-px whitespace-nowrap px-2 pb-2">Player</th>
                  <th className="w-px px-1 pb-2" />
                  <th className="w-px whitespace-nowrap px-2 pb-2 text-right">Age</th>
                  <th className="w-px whitespace-nowrap px-2 pb-2 text-right" title="The week their team has no game">
                    Bye
                  </th>
                  <th className="w-px whitespace-nowrap px-2 pb-2 text-right" title="Games played last season">G</th>
                  <th className="w-px whitespace-nowrap px-2 pb-2 text-right" title={POINTS_TITLE}>Pts</th>
                  <th className="w-px whitespace-nowrap px-2 pb-2 text-right" title={POINTS_TITLE}>PPG</th>
                  <th className="w-px whitespace-nowrap border-l border-line px-2 pb-2 text-right">Yds</th>
                  <th className="w-px whitespace-nowrap px-2 pb-2 text-right">TD</th>
                  <th className="w-px whitespace-nowrap border-l border-line px-2 pb-2 text-right">Yds</th>
                  <th className="w-px whitespace-nowrap px-2 pb-2 text-right">TD</th>
                  <th className="w-px whitespace-nowrap border-l border-line px-2 pb-2 text-right">Rec</th>
                  <th className="w-px whitespace-nowrap px-2 pb-2 text-right">Yds</th>
                  <th className="w-px whitespace-nowrap px-2 pb-2 text-right">TD</th>
                </tr>
              </thead>
              <tbody>
                {pool.slice(0, 200).map((player) => {
                  const pick = pickByPlayer.get(player.player_id);
                  const isQueued = queued.has(player.player_id);
                  return (
                    <tr
                      key={player.player_id}
                      className={`border-b border-line last:border-0 hover:bg-surface-2 ${
                        pick ? "opacity-45" : ""
                      }`}
                    >
                      {/* The board rank, not the row number: a filtered list that
                          renumbers itself 1..n hides how far you have dug. */}
                      <td className="stat-num w-px whitespace-nowrap px-2 py-1.5 text-right font-bold text-fg">
                        {player.rank}
                      </td>
                      {/* Heart and the two-line identity share one cell, which is what
                          lets the heart centre against *both* lines rather than sitting
                          against the first. The cell is shrink-to-fit, so the Draft
                          column beside it stays tucked in next to the names instead of
                          drifting out to the table edge. */}
                      <td className="w-px whitespace-nowrap px-2 py-1">
                        <span className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleQueued(player.player_id)}
                            aria-label={
                              isQueued
                                ? `Remove ${player.name} from your queue`
                                : `Add ${player.name} to your queue`
                            }
                            aria-pressed={isQueued}
                            title="Your queue for this draft"
                            className={`shrink-0 text-sm leading-none transition ${
                              isQueued ? "text-accent" : "text-faint hover:text-muted"
                            }`}
                          >
                            {isQueued ? "♥" : "♡"}
                          </button>
                          <span className="block leading-tight">
                            <button
                              type="button"
                              onClick={() => setProfilePlayerId(player.player_id)}
                              className={`block text-left font-medium text-fg hover:text-accent hover:underline ${
                                pick ? "line-through" : ""
                              }`}
                            >
                              {player.name}
                            </button>
                            <span className="mt-0.5 block">
                              <PositionTag position={player.position} />
                              <span className="stat-num ml-1 text-[10px] text-muted">
                                {player.team_abbreviation ?? "FA"}
                              </span>
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="w-px whitespace-nowrap py-1 pl-2.5 pr-1.5">
                        {pick ? (
                          <span
                            className="stat-num text-[10px] text-faint"
                            title={`Taken by ${pick.team_slot === setup.userSlot ? "you" : `team ${pick.team_slot}`}`}
                          >
                            {pick.pickLabel}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => draft(player)}
                            disabled={!isUserTurn}
                            className="draft-pill px-5 py-1.5 text-xs"
                          >
                            Draft
                          </button>
                        )}
                      </td>
                      <StatCell value={player.age} digits={1} />
                      <StatCell value={player.bye_week} />
                      <StatCell value={player.games_played} />
                      <StatCell value={player.fantasy_points} digits={1} strong />
                      <StatCell value={player.fantasy_ppg} digits={1} strong />
                      <StatCell value={player.passing_yards} position={player.position} group="pass" divide />
                      <StatCell value={player.passing_tds} position={player.position} group="pass" />
                      <StatCell value={player.rushing_yards} position={player.position} group="rush" divide />
                      <StatCell value={player.rushing_tds} position={player.position} group="rush" />
                      <StatCell value={player.receptions} position={player.position} group="rec" divide />
                      <StatCell value={player.receiving_yards} position={player.position} group="rec" />
                      <StatCell value={player.receiving_tds} position={player.position} group="rec" />
                    </tr>
                  );
                })}
                {pool.length === 0 && (
                  <tr>
                    <td colSpan={15} className="px-2 py-6 text-center text-muted">
                      Nobody left matching those filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <RosterPanel
          slots={panelSlots}
          title={panelSlot === setup.userSlot ? "Your roster" : `Team ${panelSlot}`}
          isUser={panelSlot === setup.userSlot}
          onSelectPlayer={setProfilePlayerId}
        />
      </div>

      </div>

      <ComparePopup
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        players={undrafted}
        season={botBoard?.valuation_season}
        scoring={scoring}
      />
      <PlayerModal playerId={profilePlayerId} onClose={() => setProfilePlayerId(null)} />
    </div>
  );
}
