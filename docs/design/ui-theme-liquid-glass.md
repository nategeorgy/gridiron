# UI Theme — Liquid Glass (light + dark)

> Design note for GridironIQ's visual system. Pairs with
> [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) (where the code lives) and
> [`../../CLAUDE.md`](../../CLAUDE.md) (product spec / design principles).

Last updated: 2026-07-28

---

## What it is

The app uses a **Liquid Glass** aesthetic (à la Apple's iOS 26 / macOS Tahoe
material): frosted, translucent cards floating over a soft colored "environment,"
with specular edge highlights, pill controls, and large concentric radii.

There are **two themes**, chosen from the design exploration:

| Mode | Name | Feel |
| --- | --- | --- |
| **Dark** (default) | "smoked graphite" | Near-black neutral environment with faint cool glows; smoked translucent cards. |
| **Light** | "Clear" | Soft cool-white environment; near-clear white glass with dark text. |

Dark is the default (brand + `CLAUDE.md`'s dark-first heritage); users toggle with
the sun/moon control in the header, and the choice persists in `localStorage`.

### Accent decision

The two mockup skins these themes came from happened to use a **blue** accent. We
deliberately kept GridironIQ's **electric green** brand accent instead (dark
`#00e389`, light `#00b06a` for contrast). It's a single token — `--accent` — so
switching the whole app to another hue is a one-line change if we ever want to.

---

## How it works (the mechanism)

Everything is driven by **CSS custom properties** on the root element, swapped by a
single `data-theme` attribute. No `dark:` utility variants, no duplicated
component styles.

- **`frontend/src/index.css`** — defines the tokens for each theme:
  - `:root { … }` — the **dark** palette (default).
  - `:root[data-theme="light"] { … }` — the **light** palette (overrides only the tokens that change).
  - The `body` paints the theme's `--env` gradient (fixed to the viewport, so glass
    blurs a stable backdrop as the page scrolls).
  - `@layer components` defines the shared "material": `.glass-card`, `.glass-header`,
    `.glass-pill`, `.glass-input`, `.glass-popover`, `.btn-accent`, `.btn-ghost`.
- **`frontend/index.html`** — a tiny inline script sets `data-theme` from
  `localStorage` **before first paint**, so there's no flash of the wrong theme.
- **`frontend/src/hooks/useTheme.js`** — React state for the active theme; writes
  `data-theme` on `<html>` and persists to `localStorage` (`gridiron.theme`). Default `dark`.
- **`frontend/src/components/ThemeToggle.jsx`** — the header sun/moon button.
- **`frontend/tailwind.config.js`** — maps semantic Tailwind color utilities to the
  CSS variables: `text-fg`, `text-muted`, `text-faint`, `text-accent`, `bg-surface`,
  `bg-surface-2`, `border-line`, `border-edge`, `text-pos/neg/warn`.

### Token reference

| Token | Meaning |
| --- | --- |
| `--bg` | page background color (under the environment) |
| `--env` | the colored environment gradient the glass refracts |
| `--surface` / `--surface-2` | frosted card fill / raised (hover) fill |
| `--surface-solid` | opaque fill for popovers/dropdowns (menus can't be see-through) |
| `--border` / `--divider` / `--edge` | glass edge / table hairlines / top specular highlight |
| `--fg` / `--muted` / `--faint` | primary / secondary / tertiary text |
| `--accent` / `--accent-ink` | brand green / text on an accent fill |
| `--pos` / `--neg` / `--warn` | semantic up / down / caution |
| `--radius` / `--blur` / `--shadow` | card radius / backdrop blur / drop shadow |

## How to style new UI

1. Reach for a `.glass-*` class for surfaces, and the semantic Tailwind tokens
   (`text-fg`, `text-muted`, `border-line`, `text-accent`, …) for everything else.
2. **Never** hardcode a color that needs to differ by theme (no `bg-navy-900`,
   `text-slate-400`, hex literals). If a color must live in JS (e.g. a Recharts
   prop), pass the CSS variable: `fill="var(--accent)"`, `stroke="var(--divider)"`.
3. Both themes must stay legible — check new screens in light *and* dark.

## Known trade-offs

- Heavy `backdrop-filter` blur is beautiful on desktop but GPU-costly; watch
  performance on low-end phones if we add many simultaneous glass layers.
- The light "Clear" theme is intentionally low-contrast/airy; keep body text on
  `--fg` (not `--muted`) on busy cards so it stays readable.

## Related

- The home page that showcases this system is the **Command Center**
  (`frontend/src/pages/Home.jsx`) — a Bento dashboard that replaced the leaderboard
  at `/`. See ARCHITECTURE.md §4.
- Full skin exploration that led here: the 23-skin mockup (Bento + Liquid Glass).
