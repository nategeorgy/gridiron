// Colour maths for the design-token studio (`/styleguide`).
//
// Nothing else in the app needs this: components just *use* the theme tokens,
// they never have to reason about what a token resolves to. The studio does,
// because it has to (a) split an authored value into a picker-friendly colour
// plus an alpha slider, and (b) score contrast — which on a Liquid Glass surface
// means compositing the translucent card over the background first, since the
// text is never actually sitting on `--surface`, it is sitting on whatever
// `--surface` lets through.

const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
// Accepts both the legacy comma form (`rgba(44, 46, 54, 0.55)`, which is what
// index.css authors) and the modern space/slash form (`rgb(44 46 54 / 55%)`).
const RGB_PATTERN = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Parse a CSS colour into `{ r, g, b, a }` (channels 0–255, alpha 0–1).
 * Returns null for anything this studio cannot round-trip — `color-mix()`,
 * named colours, gradients — so callers can fall back to raw text editing
 * instead of silently mangling the value.
 */
export function parseColor(input) {
  const value = String(input ?? "").trim();

  const hex = value.match(HEX_PATTERN);
  if (hex) {
    const digits =
      hex[1].length === 3
        ? hex[1]
            .split("")
            .map((digit) => digit + digit)
            .join("")
        : hex[1];
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
      a: 1,
    };
  }

  const rgb = value.match(RGB_PATTERN);
  if (rgb) {
    const rawAlpha = rgb[4];
    const alpha =
      rawAlpha === undefined
        ? 1
        : rawAlpha.endsWith("%")
          ? parseFloat(rawAlpha) / 100
          : parseFloat(rawAlpha);
    return {
      r: clamp(Math.round(parseFloat(rgb[1])), 0, 255),
      g: clamp(Math.round(parseFloat(rgb[2])), 0, 255),
      b: clamp(Math.round(parseFloat(rgb[3])), 0, 255),
      a: clamp(alpha, 0, 1),
    };
  }

  return null;
}

/** `{ r, g, b }` → `#rrggbb`. Alpha is ignored; see formatColor. */
export function toHex({ r, g, b }) {
  const channel = (value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/**
 * `{ r, g, b, a }` → the CSS text to write back into index.css. Opaque colours
 * emit as hex and translucent ones as `rgba(...)`, matching how the theme file
 * already authors them so a pasted change reads like the lines around it.
 */
export function formatColor({ r, g, b, a }) {
  if (a >= 1) return toHex({ r, g, b });
  const alpha = Number(a.toFixed(3));
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}

/** Alpha-composite `top` over an opaque `bottom` (source-over). */
export function compositeOver(top, bottom) {
  return {
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  };
}

/**
 * Flatten a stack of layers written top-first (the way you'd describe it out
 * loud — "the text sits on the card, which sits on the background") into the
 * single opaque colour a reader actually perceives. The last layer must be
 * opaque; if it isn't, it is treated as if it were.
 */
export function flattenLayers(layers) {
  const opaque = layers.filter(Boolean);
  if (!opaque.length) return null;
  let result = { ...opaque[opaque.length - 1], a: 1 };
  for (let index = opaque.length - 2; index >= 0; index -= 1) {
    result = compositeOver(opaque[index], result);
  }
  return result;
}

/** WCAG 2.1 relative luminance. */
export function relativeLuminance({ r, g, b }) {
  const linear = [r, g, b].map((channel) => {
    const scaled = channel / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/** WCAG contrast ratio between two opaque colours. 1 (none) to 21 (max). */
export function contrastRatio(foreground, background) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Score a ratio against WCAG. `large` applies the 3:1 threshold used for text
 * at 18.66px bold / 24px regular and above — which is what most of the numbers
 * on a stat table are not, so it defaults to false.
 */
export function wcagGrade(ratio, { large = false } = {}) {
  if (large) {
    if (ratio >= 4.5) return { label: "AAA", pass: true };
    if (ratio >= 3) return { label: "AA", pass: true };
    return { label: "Fail", pass: false };
  }
  if (ratio >= 7) return { label: "AAA", pass: true };
  if (ratio >= 4.5) return { label: "AA", pass: true };
  if (ratio >= 3) return { label: "AA large only", pass: false };
  return { label: "Fail", pass: false };
}
