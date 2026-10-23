// A positional finish ("WR4"), coloured by which of five bands it falls in.
//
// The one place a finish becomes a colour: the career table, the game log, the player
// card, the head-to-head, the game pages, Compare, the Query Builder and the home page's
// Weekly Finishes all read it, so a WR9 season and a WR9 week are the same colour
// wherever they appear, and the player card's floor and ceiling bar counts the same bands.
//
// **The bands are Nate's, set per position (October 2026)**, and read best to worst, in his
// names for the colours as the dark theme shows them:
//
//              light green  dark green  yellow   dark red  light red
//   QB         1–6          7–12        13–18    19–24     25+
//   RB         1–8          9–14        15–20    21–26     27+
//   WR         1–12         13–24       25–32    33–38     39+
//   TE         1–5          6–10        11–15    16–20     21+
//
// They replaced tiers derived from
// how deep a 12-team league starts each position, which painted WR31 the same green as
// WR13; with the league editor cut before launch, a fixed set was the honest one.
//
// **Never a percentile of the pool.** A weekly pool holds ~150 receivers, so a pool
// percentile would paint WR40 as upper-half when every manager reads it as a bad week.
//
// The chip is a tint with coloured text rather than a solid fill: a solid fill cannot carry
// legible small text in the light theme, and text mixed toward `--fg` darkens on light and
// lightens on dark, holding contrast in both.

// Where each band ends, best first: a finish at or under the first number is the top band,
// and anything past the last is the bottom one. Positions outside the four read as WR.
export const FINISH_BANDS = {
  QB: [6, 12, 18, 24],
  RB: [8, 14, 20, 26],
  WR: [12, 24, 32, 38],
  TE: [5, 10, 15, 20],
};

// Chosen by search rather than by eye, over both themes at once: the combination that best
// separates neighbouring steps (max of background and text difference, OKLab ×100, worst
// neighbour 10.6) while every chip's text clears 4.8:1, intensity rises toward both ends,
// the yellow midpoint is the quietest step, and paired tiers match in perceived strength
// (red reads stronger than green at the same alpha, which is why red's alphas are higher).
// The first hand-picked version passed contrast but put light green, yellow and light red
// within 3.5 of each other in the light theme: one wash of pale colour. Re-measure before
// changing any number here.
const TONES = [
  {
    background: "color-mix(in srgb, var(--pos) 42%, transparent)",
    color: "color-mix(in srgb, var(--pos) 30%, var(--fg))",
  },
  {
    background: "color-mix(in srgb, var(--pos) 24%, transparent)",
    color: "color-mix(in srgb, var(--pos) 62%, var(--fg))",
  },
  {
    background: "color-mix(in srgb, var(--warn) 8%, transparent)",
    color: "color-mix(in srgb, var(--warn) 70%, var(--fg))",
  },
  {
    background: "color-mix(in srgb, var(--neg) 30%, transparent)",
    color: "color-mix(in srgb, var(--neg) 64%, var(--fg))",
  },
  {
    background: "color-mix(in srgb, var(--neg) 50%, transparent)",
    color: "color-mix(in srgb, var(--neg) 30%, var(--fg))",
  },
];

// The same five steps as solid fills, for a bar or a cell big enough to need one (the
// floor and ceiling bar): the chip tints are too faint to carry a bar (the yellow is 8%).
export const BAND_FILLS = [
  "color-mix(in srgb, var(--pos) 78%, var(--surface-solid))",
  "color-mix(in srgb, var(--pos) 44%, var(--surface-solid))",
  "color-mix(in srgb, var(--warn) 52%, var(--surface-solid))",
  "color-mix(in srgb, var(--neg) 46%, var(--surface-solid))",
  "color-mix(in srgb, var(--neg) 72%, var(--surface-solid))",
];

/** A position's five bands, best first: { label ("WR13-24"), from, to (null for the last) }. */
export function finishBands(position) {
  const ends = FINISH_BANDS[position] ?? FINISH_BANDS.WR;
  return [0, 1, 2, 3, 4].map((index) => {
    const from = index ? ends[index - 1] + 1 : 1;
    const to = ends[index] ?? null;
    return { from, to, label: to == null ? `${position}${from}+` : `${position}${from}-${to}` };
  });
}

/** Which band (0 best, 4 worst) a finish falls in. */
export function finishBand(rank, position) {
  const ends = FINISH_BANDS[position] ?? FINISH_BANDS.WR;
  const index = ends.findIndex((end) => rank <= end);
  return index === -1 ? ends.length : index;
}

/** A finish's band, chip colours and description. */
export function finishTier(rank, position) {
  const band = finishBand(rank, position);
  return { ...TONES[band], band, label: `${finishBands(position)[band].label} band` };
}

export function FinishChip({ rank, position, detail }) {
  if (rank == null) return <span className="stat-num text-faint">—</span>;
  const tier = finishTier(rank, position);
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
