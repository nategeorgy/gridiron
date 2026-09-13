// A positional finish ("WR4"), coloured by what that finish means in the user's league.
//
// Shared by the career table and the game log so a WR9 season and a WR9 week are the
// same colour on the same page.
//
// **The tiers come from how deep the league starts each position, not from a fixed
// size.** A 12-team league starts twelve quarterbacks and thirty-six receivers, so QB22
// is a week no quarterback-needy manager could use while WR22 is an ordinary start —
// one size of tier for every position painted them the same colour. The depth is the
// backend's own `replacement_ranks` model (`app/league.py`) *without the bench*: the
// dedicated starting slots (superflex counted as quarterback), plus each flex-eligible
// position's share of the flex slots in proportion to how it is started. Bench spots are
// left out on purpose — the question here is "was this startable", not "was he
// rostered". Five steps, dark green through yellow to dark red. For the default 12-team
// 1QB/2RB/3WR/1TE/1FLEX lineup:
//
//              dark green  light green  yellow   light red  dark red
//   QB         1–12        —            —        13–24      25+
//   RB         1–12        13–24        25–28    29–40      41+
//   WR         1–12        13–36        37–42    43–54      55+
//   TE         1–12        —            13–14    15–26      27+
//
// Light red is one league's worth of ranks past the starting line — the finish a manager
// could still have picked up that week — and dark red is everything deeper. A position
// with no starter or flex band (a one-QB league) simply skips those colours.
//
// **Never a percentile of the pool.** A weekly pool holds ~150 receivers, so a pool
// percentile would paint WR40 as upper-half when every manager reads it as a bad week.
//
// The chip is a tint with coloured text rather than a solid fill: a solid fill cannot carry
// legible small text in the light theme, and text mixed toward `--fg` darkens on light and
// lightens on dark, holding contrast in both. "Dark" and "light" are intensity, not
// lightness — a dark green in the dark theme would be unreadable. Yellow is `--warn`, the
// existing caution token, rather than a new hue.

const SLOT = { QB: "qb", RB: "rb", WR: "wr", TE: "te" };
const FLEX_ELIGIBLE = ["RB", "WR", "TE"];

// Chosen by search rather than by eye, over both themes at once: the combination that best
// separates neighbouring steps (max of background and text difference, OKLab ×100, worst
// neighbour 10.6) while every chip's text clears 4.8:1, intensity rises toward both ends,
// the yellow midpoint is the quietest step, and paired tiers match in perceived strength
// (red reads stronger than green at the same alpha, which is why red's alphas are higher).
// The first hand-picked version passed contrast but put light green, yellow and light red
// within 3.5 of each other in the light theme — one wash of pale colour. Re-measure before
// changing any number here.
const TONES = {
  top: {
    background: "color-mix(in srgb, var(--pos) 42%, transparent)",
    color: "color-mix(in srgb, var(--pos) 30%, var(--fg))",
  },
  starter: {
    background: "color-mix(in srgb, var(--pos) 24%, transparent)",
    color: "color-mix(in srgb, var(--pos) 62%, var(--fg))",
  },
  flex: {
    background: "color-mix(in srgb, var(--warn) 8%, transparent)",
    color: "color-mix(in srgb, var(--warn) 70%, var(--fg))",
  },
  outside: {
    background: "color-mix(in srgb, var(--neg) 30%, transparent)",
    color: "color-mix(in srgb, var(--neg) 64%, var(--fg))",
  },
  far: {
    background: "color-mix(in srgb, var(--neg) 50%, transparent)",
    color: "color-mix(in srgb, var(--neg) 30%, var(--fg))",
  },
};

/**
 * Python's `round`: halves go to the even neighbour. `Math.round` sends them up, and flex
 * shares land on .5 often (a 14-team 1RB/2WR/1TE/3FLEX league gives backs exactly 24.5),
 * so using it made the chip's cut-off disagree with the backend's by one.
 */
function roundHalfEven(value) {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (Math.abs(fraction - 0.5) > 1e-9) return Math.round(value);
  return floor % 2 === 0 ? floor : floor + 1;
}

/**
 * How deep a league starts each position: `{ top, starter, flex }` rank cut-offs.
 * Mirrors `replacement_ranks` in backend/app/league.py with bench spots excluded —
 * rounding included, so the two agree on every lineup.
 */
export function startingDepth(position, { teams, lineup }) {
  const dedicated = (pos) => teams * (lineup[SLOT[pos]] ?? 0);
  let starter = dedicated(position);
  let startable = starter;
  if (position === "QB") {
    starter += teams * (lineup.superflex ?? 0);
    startable = starter;
  } else if (FLEX_ELIGIBLE.includes(position)) {
    const flexSlots = teams * (lineup.flex ?? 0);
    const eligible = FLEX_ELIGIBLE.reduce((total, pos) => total + dedicated(pos), 0);
    const share = !flexSlots ? 0 : eligible ? dedicated(position) / eligible : 1 / FLEX_ELIGIBLE.length;
    startable = starter + flexSlots * share;
  }
  const flex = Math.max(roundHalfEven(startable), 1);
  const top = Math.min(teams, flex);
  return { top, starter: Math.min(Math.max(starter, top), flex), flex };
}

/** Which tier a rank falls in, and how to describe it. */
export function finishTier(rank, position, league) {
  const depth = startingDepth(position, league);
  if (rank <= depth.top) {
    return { ...TONES.top, label: `${position}1 tier (${position}1–${depth.top})` };
  }
  if (rank <= depth.starter) {
    return { ...TONES.starter, label: `starter range (${position}${depth.top + 1}–${depth.starter})` };
  }
  if (rank <= depth.flex) {
    return { ...TONES.flex, label: `flex range (${position}${depth.starter + 1}–${depth.flex})` };
  }
  const plural = (count) => `${count} ${position}${count === 1 ? "" : "s"}`;
  const shallowEdge = depth.flex + league.teams;
  if (rank <= shallowEdge) {
    return {
      ...TONES.outside,
      label: `just outside the ${plural(depth.flex)} a ${league.teams}-team league starts (${position}${depth.flex + 1}–${shallowEdge})`,
    };
  }
  return {
    ...TONES.far,
    label: `well outside the ${plural(depth.flex)} a ${league.teams}-team league starts (${position}${shallowEdge + 1}+)`,
  };
}

export function FinishChip({ rank, position, league, detail }) {
  if (rank == null) return <span className="stat-num text-faint">—</span>;
  const tier = finishTier(rank, position, league);
  return (
    <span
      className="stat-num inline-block min-w-[42px] rounded-md px-1.5 py-px text-center text-[11.5px] font-semibold"
      style={{ background: tier.background, color: tier.color }}
      title={[`${position}${rank} · ${tier.label}`, detail].filter(Boolean).join(" · ")}
    >
      {position}
      {rank}
    </span>
  );
}
