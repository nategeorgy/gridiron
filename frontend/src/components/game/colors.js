// Two chart colours for one game, one per team, from the teams' own colours.
//
// A game page draws the two teams side by side everywhere: the win probability fill,
// the drive bars, the split bars. Team colours are the natural choice, but they fail in
// two ways. Many pairings share a primary (the Bills and the Rams are both royal blue),
// and many primaries are too dark to see on the dark theme (Dallas navy, Green Bay's
// forest green). So:
//
//   1. A primary too dark to read gives way to the team's second colour when that one is
//      vivid (Green Bay's gold), and is lightened otherwise (Dallas's navy, whose second
//      colour is a grey).
//   2. If the home team's colour then sits too close to the away team's, the home team
//      takes its second colour instead (the Rams' yellow beside the Bills' blue).
//
// The results are mid-tone, so they read as fills on both themes. Text drawn in a team
// colour goes through `teamText`, which mixes it toward the theme's foreground.
import { parseColor, relativeLuminance, toHex } from "../../utils/color";

const TOO_DARK = 0.035;       // luminance below which a primary is not used as it is
const TARGET = 0.14;          // the luminance a dark colour is lightened to
const VIVID = { saturation: 0.45, luminance: 0.2 };
const MIN_HUE_GAP = 40;       // degrees; closer than this reads as the same colour
// The last resort when every colour the home team has clashes with the away team's
// (Pittsburgh gold beside Cleveland orange): a mid grey that reads on both themes.
const NEUTRAL = { r: 138, g: 148, b: 166 };

function hsl({ r, g, b }) {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const light = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: light };
  const d = max - min;
  const s = light > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return { h: h * 60, s, l: light };
}

function fromHsl({ h, s, l }) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

/** Raise the lightness, keeping hue and saturation, until the colour reaches the target
 *  luminance. Mixing toward white instead turned every navy into the same grey. */
function lighten(rgb) {
  if (relativeLuminance(rgb) >= TARGET) return rgb;
  const { h, s, l } = hsl(rgb);
  for (let next = l; next <= 0.72; next += 0.02) {
    const candidate = fromHsl({ h, s, l: next });
    if (relativeLuminance(candidate) >= TARGET) return candidate;
  }
  return fromHsl({ h, s, l: 0.72 });
}

function vivid(rgb) {
  const { s } = hsl(rgb);
  return rgb && s >= VIVID.saturation && relativeLuminance(rgb) >= VIVID.luminance;
}

/** The colour a team is drawn in, before the other team is considered. */
function preferred(primary, secondary) {
  if (!primary) return secondary ? lighten(secondary) : null;
  if (relativeLuminance(primary) < TOO_DARK && secondary && vivid(secondary)) return secondary;
  return lighten(primary);
}

function hueGap(a, b) {
  const ha = hsl(a), hb = hsl(b);
  // Two greys (or near-greys) clash whatever their nominal hue.
  if (ha.s < 0.15 && hb.s < 0.15) return 0;
  const gap = Math.abs(ha.h - hb.h) % 360;
  return Math.min(gap, 360 - gap);
}

/**
 * `{ away, home }` hex colours for a game. Either team may be missing its colours, in
 * which case the series tokens stand in, as on any other two-series chart.
 */
export function gameColors(away, home) {
  const awayPrimary = parseColor(away?.color), awaySecondary = parseColor(away?.color2);
  const homePrimary = parseColor(home?.color), homeSecondary = parseColor(home?.color2);
  const awayColor = preferred(awayPrimary, awaySecondary);
  let homeColor = preferred(homePrimary, homeSecondary);
  if (awayColor && homeColor && hueGap(awayColor, homeColor) < MIN_HUE_GAP) {
    const alternates = [homeSecondary, homePrimary].filter(Boolean).map(lighten);
    homeColor = alternates.find((candidate) => hueGap(awayColor, candidate) >= MIN_HUE_GAP) ?? NEUTRAL;
  }
  return {
    away: awayColor ? toHex(awayColor) : "var(--series-1)",
    home: homeColor ? toHex(homeColor) : "var(--series-2)",
  };
}

/** A team colour as text: mixed toward the theme's foreground so it reads on both themes. */
export function teamText(color) {
  return `color-mix(in srgb, ${color} 62%, var(--fg))`;
}

/** Ink for text sitting on a solid team-colour fill. */
export function inkOn(color) {
  const rgb = parseColor(color);
  if (!rgb) return "var(--fg)";
  return relativeLuminance(rgb) > 0.4 ? "#0b0d12" : "#ffffff";
}
