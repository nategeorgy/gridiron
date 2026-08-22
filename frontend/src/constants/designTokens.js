// The design-token registry behind `/styleguide`.
//
// Deliberately metadata ONLY — labels, control types, and grouping, but no
// values. The studio reads every current value straight out of the stylesheet
// with getComputedStyle, so `src/index.css` remains the single source of truth
// and this file cannot drift out of sync with it. Adding a token to the theme
// means adding one entry here; changing a token's *value* means touching
// nothing here at all.

/**
 * Control types:
 *   color  — colour picker + alpha slider (falls back to text if unparseable)
 *   length — slider + number box, in `unit`
 *   raw    — free text / textarea, for values with no meaningful widget
 */
export const TOKEN_GROUPS = [
  {
    id: "environment",
    label: "Environment",
    blurb:
      "The backdrop every frosted surface refracts. Fixed to the viewport, so cards blur a stable image as the page scrolls.",
    tokens: [
      { name: "--bg", label: "Page background", type: "color" },
      {
        name: "--env",
        label: "Environment gradient",
        type: "raw",
        rows: 6,
        hint: "Layered radial gradients painted on <body>. This is what the glass is blurring — flatten it and the material dies.",
      },
    ],
  },
  {
    id: "surfaces",
    label: "Surfaces",
    blurb:
      "Card fills. These are translucent on purpose: the alpha is the glass. Push any of them to 100% and the app becomes flat cards on a gradient.",
    tokens: [
      { name: "--surface", label: "Card fill", type: "color" },
      { name: "--surface-2", label: "Raised / hover fill", type: "color" },
      {
        name: "--surface-solid",
        label: "Opaque popover fill",
        type: "color",
        hint: "Dropdowns and menus, which need to stay readable over arbitrary content.",
      },
    ],
  },
  {
    id: "edges",
    label: "Edges & dividers",
    blurb: "The hairlines that give a translucent panel a findable boundary.",
    tokens: [
      { name: "--border", label: "Glass edge", type: "color" },
      { name: "--border-strong", label: "Strong edge", type: "color" },
      { name: "--divider", label: "Table hairline", type: "color" },
      {
        name: "--edge",
        label: "Specular highlight",
        type: "color",
        hint: "The 1px inset top light on every card. Carries most of the 'glass' read — drop it and cards look printed on.",
      },
    ],
  },
  {
    id: "text",
    label: "Text",
    blurb: "Three steps only. A fourth tends to become an accessibility problem.",
    tokens: [
      { name: "--fg", label: "Primary text", type: "color" },
      { name: "--muted", label: "Muted text", type: "color" },
      { name: "--faint", label: "Faint text", type: "color" },
    ],
  },
  {
    id: "brand",
    label: "Brand accent",
    blurb: "The electric green is the brand and stays green in both themes; the light theme deepens it to hold contrast.",
    tokens: [
      { name: "--accent", label: "Accent", type: "color" },
      { name: "--accent-strong", label: "Accent (strong)", type: "color" },
      { name: "--accent-ink", label: "Text on accent fill", type: "color" },
    ],
  },
  {
    id: "semantic",
    label: "Semantic",
    blurb: "Meaning, not decoration. Never borrow these for a chart series.",
    tokens: [
      { name: "--pos", label: "Positive", type: "color" },
      { name: "--neg", label: "Negative", type: "color" },
      { name: "--warn", label: "Warning", type: "color" },
    ],
  },
  {
    id: "series",
    label: "Chart series",
    blurb:
      "A fixed categorical order, never cycled — a series keeps its hue when the set is filtered. Validated for colour-vision deficiency and contrast against both card surfaces; a sixth hue means re-validating, not guessing.",
    tokens: [
      { name: "--series-1", label: "Series 1", type: "color" },
      { name: "--series-2", label: "Series 2", type: "color" },
      { name: "--series-3", label: "Series 3", type: "color" },
      { name: "--series-4", label: "Series 4", type: "color" },
      { name: "--series-5", label: "Series 5", type: "color" },
    ],
  },
  {
    id: "material",
    label: "Material",
    blurb: "Geometry and depth — the three knobs that most change how 'glass' the app feels.",
    tokens: [
      { name: "--radius", label: "Card radius", type: "length", unit: "px", min: 0, max: 40, step: 1 },
      {
        name: "--blur",
        label: "Backdrop blur",
        type: "length",
        unit: "px",
        min: 0,
        max: 60,
        step: 1,
        hint: "Below ~8px the environment reads through as noise; above ~40px it reads as flat grey.",
      },
      { name: "--shadow", label: "Card shadow", type: "raw", rows: 2 },
    ],
  },
];

/** Every token name, in registry order — used for baseline capture and CSS output. */
export const TOKEN_NAMES = TOKEN_GROUPS.flatMap((group) => group.tokens.map((token) => token.name));

/** Flat lookup by name, for the panel's controls. */
export const TOKEN_BY_NAME = Object.fromEntries(
  TOKEN_GROUPS.flatMap((group) => group.tokens.map((token) => [token.name, token])),
);

/**
 * The contrast pairs worth watching while tuning. `over` is a layer stack
 * written top-first and flattened before scoring, because on this theme text
 * never sits on an opaque fill — it sits on a translucent card over the page
 * background.
 *
 * Caveat baked into the UI: this scores the flat `--bg`, not the `--env`
 * gradient, and it cannot model what backdrop-filter pulls through. It is a
 * floor, not a certificate.
 */
export const CONTRAST_CHECKS = [
  { label: "Primary text on card", fg: "--fg", over: ["--surface", "--bg"] },
  { label: "Muted text on card", fg: "--muted", over: ["--surface", "--bg"] },
  { label: "Faint text on card", fg: "--faint", over: ["--surface", "--bg"] },
  { label: "Accent on card", fg: "--accent", over: ["--surface", "--bg"] },
  { label: "Ink on accent fill", fg: "--accent-ink", over: ["--accent", "--bg"] },
  { label: "Positive on card", fg: "--pos", over: ["--surface", "--bg"] },
  { label: "Negative on card", fg: "--neg", over: ["--surface", "--bg"] },
  { label: "Warning on card", fg: "--warn", over: ["--surface", "--bg"] },
  { label: "Series 1 on card", fg: "--series-1", over: ["--surface", "--bg"], large: true },
  { label: "Series 2 on card", fg: "--series-2", over: ["--surface", "--bg"], large: true },
  { label: "Series 3 on card", fg: "--series-3", over: ["--surface", "--bg"], large: true },
  { label: "Series 4 on card", fg: "--series-4", over: ["--surface", "--bg"], large: true },
  { label: "Series 5 on card", fg: "--series-5", over: ["--surface", "--bg"], large: true },
];

/** How each theme's block is written back into index.css. */
export const THEME_BLOCKS = [
  { theme: "dark", selector: ":root", title: 'Dark (default) — "smoked graphite"' },
  { theme: "light", selector: ':root[data-theme="light"]', title: 'Light — "Clear"' },
];
