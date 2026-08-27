// The position letters, in the position's own colour (M9).
//
// The same `--position-*` tokens the draft board tints its cells with, so a green
// "WR" in the player list and a green cell on the board are recognisably the same
// fact. Without that, colour is doing work in one place and nothing in the other, and
// the reader has to hold two mappings.
//
// Colour is never the *only* channel: the letters are always there. That is what keeps
// this readable for a colour-blind user, and it is why the tokens alias the series
// hues rather than inventing new ones — those were validated for exactly this.
const TINT_STRENGTH = {
  // A tag is small and sits on the plain card rather than in a coloured cell, so it
  // needs a firmer fill than a board cell to register at all.
  solid: { fill: "38%", text: "var(--fg)" },
  quiet: { fill: "18%", text: "var(--muted)" },
};

export function PositionTag({ position, variant = "solid", className = "" }) {
  if (!position) return null;
  const token = `var(--position-${position.toLowerCase()}, var(--surface-2))`;
  const { fill, text } = TINT_STRENGTH[variant] ?? TINT_STRENGTH.solid;

  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold leading-none ${className}`}
      style={{
        background: `color-mix(in srgb, ${token} ${fill}, transparent)`,
        color: text,
      }}
    >
      {position}
    </span>
  );
}
