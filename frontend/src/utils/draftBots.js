// The mock-draft engine (M9): snake order, bot picks, and roster shape.
//
// **This runs in the browser on purpose.** A mock is ~150 picks with nothing to cheat
// at, and a round trip per pick would make the room feel like a form. The server owns
// the two things the browser cannot do honestly — the board, and the grade.
//
// **Bots have no ADP, and that turns out to be a feature.** No free source publishes
// one (measured in M6.1 and unchanged), so reach and fall are drawn instead from the
// consensus's *own disagreement*: a player the expert boards place 3rd and 14th moves
// around a lot in this draft room, and one they all place 2nd barely moves at all.
// That is closer to how a real room behaves than ADP noise would be, because ADP is
// itself downstream of the same disagreement.
//
// On top of that: positional need against the league's starting lineup, a light
// positional-run effect, and a randomness dial the user sets.

/** Positions a flex slot can take; superflex additionally takes a quarterback. */
export const FLEX_ELIGIBLE = ["RB", "WR", "TE"];

// How much a bot will move a player, in board positions, at randomness = 1. Scaled by
// how contested the player is and how deep the board has got — a reach in round one
// is two or three picks, a reach in round twelve is twenty.
const BASE_SIGMA = 3;

// Rank bonus for filling an empty starting slot. Deliberately larger than typical
// noise: a bot with no quarterback in round twelve should take one, not keep taking
// the best receiver available.
const STARTER_NEED = 10;
// A smaller pull towards a position the lineup can still use on the bench.
const DEPTH_NEED = 2;
// Applied when a position has just gone twice in the last four picks.
const RUN_BONUS = 3;
// How far down the board a bot will look at all. Beyond this the noise, not the
// board, would be choosing.
const CONSIDER = 24;

/** A small, fast, seedable PRNG so a room can be replayed exactly if we ever want to. */
export function makeRandom(seed = Date.now()) {
  let state = seed >>> 0;
  return function random() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller, so displacement is normally distributed rather than uniform. */
function gaussian(random) {
  const u = Math.max(random(), Number.EPSILON);
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * The snake order as a flat list of draft slots, one per pick.
 *
 * Odd rounds run 1→N, even rounds N→1. That is the whole of "snake", and having it in
 * one place means the room, the roster grid and the grade all agree about whose turn
 * it is.
 */
export function snakeOrder(teams, rounds) {
  const order = [];
  for (let round = 1; round <= rounds; round += 1) {
    const slots = Array.from({ length: teams }, (_, index) => index + 1);
    order.push(...(round % 2 === 1 ? slots : slots.reverse()));
  }
  return order;
}

/** Which round a 1-based pick number falls in. */
export function roundOf(pickNumber, teams) {
  return Math.floor((pickNumber - 1) / teams) + 1;
}

/**
 * How many of each position a team wants: starters, then a bench cushion.
 *
 * The cushion is what stops a bot drafting a fourth quarterback in a one-quarterback
 * league, and it is why running backs and receivers keep going long after their
 * starting slots are full — which is what actually happens in a draft.
 */
export function rosterTargets(league) {
  const flexShare = league.flex ?? 0;
  return {
    QB: {
      starters: (league.qb ?? 1) + (league.superflex ?? 0),
      max: (league.qb ?? 1) + (league.superflex ?? 0) + 1,
    },
    RB: { starters: league.rb ?? 2, max: (league.rb ?? 2) + flexShare + 3 },
    WR: { starters: league.wr ?? 3, max: (league.wr ?? 3) + flexShare + 3 },
    TE: { starters: league.te ?? 1, max: (league.te ?? 1) + 1 },
  };
}

/** Count a roster by position. */
export function countByPosition(playerIds, byId) {
  const counts = { QB: 0, RB: 0, WR: 0, TE: 0 };
  playerIds.forEach((playerId) => {
    const position = byId.get(playerId)?.position;
    if (position in counts) counts[position] += 1;
  });
  return counts;
}

/**
 * Pick one player for a bot.
 *
 * Returns the chosen row, or null when nothing on the board fits — which is a real
 * state late in a deep draft rather than an error.
 */
export function botPick({ available, counts, league, randomness, recent, random }) {
  const targets = rosterTargets(league);
  const runs = recent.reduce((tally, position) => {
    tally[position] = (tally[position] ?? 0) + 1;
    return tally;
  }, {});

  let best = null;
  let bestScore = Infinity;

  available.slice(0, CONSIDER).forEach((player, index) => {
    const target = targets[player.position];
    if (!target || counts[player.position] >= target.max) return;

    // The board's own position, plus how far this bot is willing to stray from it.
    const contested = player.dispersion ?? BASE_SIGMA;
    const sigma = randomness * (BASE_SIGMA + contested) * (1 + (player.rank ?? index) / 100);
    let score = index + gaussian(random) * sigma;

    if (counts[player.position] < target.starters) score -= STARTER_NEED;
    else if (counts[player.position] < target.max) score -= DEPTH_NEED;
    if ((runs[player.position] ?? 0) >= 2) score -= RUN_BONUS;

    if (score < bestScore) {
      bestScore = score;
      best = player;
    }
  });

  // Nothing fit the roster shape — take the best available rather than stalling.
  return best ?? available[0] ?? null;
}

/**
 * Run the draft forward from the current picks until it is the user's turn again,
 * or the draft is over. Returns the new picks array.
 *
 * Pure: it takes state and returns state, so the room can call it from an effect
 * without worrying about when.
 */
export function runBots({
  picks, board, league, teams, rounds, userSlot, randomness, seed,
}) {
  const order = snakeOrder(teams, rounds);
  const byId = new Map(board.map((player) => [player.player_id, player]));
  const taken = new Set(picks.map((pick) => pick.player_id));
  const random = makeRandom(seed + picks.length);

  const next = [...picks];

  while (next.length < order.length) {
    const pickNumber = next.length + 1;
    const slot = order[pickNumber - 1];
    if (slot === userSlot) break;

    const rosterIds = next.filter((pick) => pick.team_slot === slot).map((pick) => pick.player_id);
    const available = board.filter((player) => !taken.has(player.player_id));
    if (available.length === 0) break;

    const chosen = botPick({
      available,
      counts: countByPosition(rosterIds, byId),
      league,
      randomness,
      recent: next.slice(-4).map((pick) => byId.get(pick.player_id)?.position).filter(Boolean),
      random,
    });
    if (!chosen) break;

    taken.add(chosen.player_id);
    next.push({
      pick_number: pickNumber,
      round: roundOf(pickNumber, teams),
      team_slot: slot,
      player_id: chosen.player_id,
      is_user: false,
      auto: false,
    });
  }

  return next;
}

/**
 * The league's starting lineup, expanded into individual slots, then a bench.
 *
 * Mirrors `lineup_slots()` in `backend/app/mock_draft.py` — the same order, for the
 * same reason: dedicated slots before flexes, because a flex can take what a dedicated
 * slot cannot and filling it first would strand a starter on the bench.
 */
export function lineupSlots(lineup, rounds) {
  const slots = [];
  const push = (count, label, eligible) => {
    for (let index = 0; index < count; index += 1) slots.push({ label, eligible });
  };
  push(lineup.qb ?? 1, "QB", ["QB"]);
  push(lineup.rb ?? 2, "RB", ["RB"]);
  push(lineup.wr ?? 3, "WR", ["WR"]);
  push(lineup.te ?? 1, "TE", ["TE"]);
  push(lineup.flex ?? 0, "FLEX", FLEX_ELIGIBLE);
  push(lineup.superflex ?? 0, "SUPERFLEX", ["QB", ...FLEX_ELIGIBLE]);
  const benchCount = Math.max(0, (rounds ?? slots.length) - slots.length);
  push(benchCount, "BN", ["QB", ...FLEX_ELIGIBLE]);
  return slots;
}

/**
 * Place a roster into those slots, in the order the players were drafted.
 *
 * Draft order rather than by points, deliberately: this panel answers "what do I still
 * need", and a slot that rearranges itself under you every pick cannot answer that.
 * The *grade* fills the lineup by expected points instead, because that is a different
 * question — who you would start, not what you have.
 */
export function assignToSlots(players, lineup, rounds) {
  const slots = lineupSlots(lineup, rounds).map((slot) => ({ ...slot, player: null }));
  players.forEach((player) => {
    const target = slots.find(
      (slot) => slot.player === null && slot.eligible.includes(player.position),
    );
    if (target) target.player = player;
  });
  return slots;
}
