# GridironIQ — Architecture & Project Map

> **What this document is.** A plain-English, newcomer-friendly map of *everything*
> in the `gridiron/` folder: where each thing lives, what it controls, and how the
> pieces fit together. If you (or a brand-new developer) open this repo and think
> "…where is the code that does X?", this file should answer it.
>
> **This is a living document.** It is kept up to date as the project grows — see
> [How this document is maintained](#how-this-document-is-maintained) at the bottom.
> If you change the structure of the project, update this file in the same change.
>
> **Related docs:**
> - [`README.md`](README.md) — how to *run* the project locally (commands).
> - [`CLAUDE.md`](CLAUDE.md) — the product spec, database schema, scope, and coding conventions.
> - [`docs/ROADMAP.md`](docs/ROADMAP.md) — product vision and the milestone plan (M1, M2, …).
>
> Think of it this way: **README = how to run it. CLAUDE.md = the rules and the spec.
> ROADMAP = where we're going. ARCHITECTURE (this file) = where everything lives.**

Last updated: 2026-08-20 (M6.4 Vegas board — M6 complete; teams cleanup)

---

## 1. The 30-second overview

GridironIQ is a **fantasy-first NFL analytics web app**. It is built as **three
completely separate programs** that only talk to each other through well-defined
boundaries (HTTP and a shared database). You can work on any one of them without
breaking the others.

```
                                                   ┌─────────────────────────┐
   ①  pipeline/   ──writes rows──▶  🗄  PostgreSQL  ◀──reads rows──  ②  backend/   ──HTTP/JSON──▶  ③  frontend/
   (Python scripts that            (the database:      (FastAPI: turns              (React app the
    pull NFL data and              local Docker in      database rows into a          user actually
    load it into the DB)           dev, Supabase        clean JSON API)               sees in a browser)
                                    in production)
```

1. **`pipeline/`** — standalone Python scripts that download NFL data (via the
   `nflreadpy` library) and load it into the database. Run manually. This is how
   data *gets in*.
2. **`backend/`** — a FastAPI (Python) web server. It reads the database and serves
   a JSON API at `/api/v1/...`. It contains *no* NFL-fetching logic — it only reads
   what the pipeline already stored, plus does live computation like fantasy scoring.
3. **`frontend/`** — a React (Vite) single-page app styled with Tailwind. It calls
   the backend's API over HTTP and renders the leaderboard, player pages, etc. It
   never touches the database directly — only the backend does.

**Golden rule of the codebase:** the frontend talks to the backend *only* over HTTP;
the backend talks to the database; the pipeline is the only thing that writes bulk
NFL data. Nothing skips a layer.

**Accounts (M5) do not break that rule.** Supabase Auth is a fourth party, but it is
used *only* as a token issuer: the browser gets a signed JWT from it (via email +
password or a magic link) and sends that to FastAPI, which verifies it and reads/writes
the account tables itself. The frontend never reads application data from Supabase
directly — that would put authorization in dashboard-managed RLS policies instead of in
reviewable Python.

---

## 2. Top-level directory map

This is what you see when you open the `gridiron/` folder. Every item explained:

| Item | Type | What it is / controls |
| --- | --- | --- |
| `ARCHITECTURE.md` | doc | **This file.** The map of where everything lives. |
| `README.md` | doc | Quickstart: the commands to run the DB, backend, and frontend locally. |
| `CLAUDE.md` | doc | The master spec: product vision, full DB schema, metric catalog, scope ("do not build X yet"), and coding conventions. Read first by anyone (human or AI) starting work. |
| `docs/` | folder | Longer-form design docs — the roadmap and per-milestone design notes. |
| `frontend/` | app | The React web app (what users see). See [§4](#4-frontend--the-react-web-app). |
| `backend/` | app | The FastAPI JSON API, and its test suite in `backend/tests/`. See [§5](#5-backend--the-fastapi-api). |
| `pipeline/` | app | The data-ingestion scripts. See [§6](#6-pipeline--data-ingestion). |
| `docker-compose.yml` | config | Defines the **local** PostgreSQL database (Postgres 16 in a Docker container). `docker compose up -d` starts it. Data persists in a named volume `gridiron_pgdata`. |
| `render.yaml` | config | "Blueprint" telling **Render** (the backend host) how to build and run the backend in production. |
| `.env.example` | config | Template for environment variables. You copy sections of it into `backend/.env` and `frontend/.env`. Real `.env` files are **never** committed. |
| `.gitignore` | config | Lists files git should ignore (`.env`, `.venv/`, `node_modules/`, etc.). |
| `.github/` | tooling | GitHub Actions. `workflows/backend-tests.yml` runs `backend/tests/` on every pull request and on `main`, against a PostgreSQL 16 service container matching `docker-compose.yml`. Its `pytest` job is a **required status check** on `main` — a pull request cannot merge while it is red. |
| `.claude/` | tooling | Claude Code settings for this repo (e.g. `launch.json` for the preview server, local settings). Not part of the app itself. |
| `GridironIQ-Technical-Walkthrough.docx` | doc | A standalone Word write-up (not wired into the code). |
| `.git/` | git | Git's internal history. Never edit by hand. |

> **Note on `.venv/`.** The backend runs from **`backend/.venv/`** — that is what
> `.claude/launch.json` starts and the only environment with M5's `PyJWT` installed, so
> backend commands are `.venv/bin/…` from inside `backend/`. `pipeline/` still uses the
> older shared `.venv/` at the repo root (`../.venv/bin/…`). Both are git-ignored and
> machine-local, not part of the source you edit. Must be **Python 3.12**:
> `psycopg2-binary` publishes no wheels for 3.13+, and building from source needs
> `pg_config` on your PATH. The frontend's equivalent is `frontend/node_modules/`.

---

## 3. How a request flows end-to-end (a concrete trace)

Following one real interaction makes the whole architecture click. **"User opens the
leaderboard and sorts by fantasy points in their custom PPR scoring":**

1. Browser loads the React app (`frontend/`). The router (`App.jsx`) shows
   `LeaderboardView` at `/fantasy/leaders` (the home route `/` is the Command Center;
   the old `/leaderboard` URL redirects here).
2. The page reads the user's chosen filters (season, position, scoring) and calls a
   **hook** (`useLeaderboard`), which calls a **service** (`services/stats.js`),
   which uses the shared **axios client** (`services/api.js`) to make an HTTP GET to:
   `http://localhost:8000/api/v1/stats/leaderboard?season=2024&metric=fantasy_points&scoring=ppr`
3. The backend's **stats router** (`backend/app/routers/stats.py`) handles that URL.
   It parses the `scoring` string into a `ScoringConfig` (`app/scoring.py`), builds a
   SQL query, and asks the database for the ranked rows.
4. PostgreSQL returns raw stat rows. The backend computes each player's fantasy
   points **live** from the raw components + the scoring config, and returns JSON:
   `{ "data": [...players...], "total": 342, ... }`.
5. Back in the browser, React Query caches the JSON and the `Leaderboard` component
   renders it into the table. Column labels/formats come from the **metric registry**
   fetched from `GET /api/v1/metrics`.

Keep this trace in mind — nearly every feature is a variation of it: *page → hook →
service → api client → backend router → scoring/query → database → JSON → back up.*

---

## 4. `frontend/` — the React web app

**Stack:** React 18 + Vite (build tool/dev server) + Tailwind CSS (styling) + React
Router v6 (page routing) + React Query / TanStack Query (server data + caching) +
Recharts (charts). Package manager: **npm**. Dev server runs on **port 5173**.

### Frontend root files

| File | Controls |
| --- | --- |
| `index.html` | The single HTML page Vite serves; React mounts into it. |
| `package.json` | Declares dependencies and npm scripts (`npm run dev`, `build`, etc.). |
| `package-lock.json` | Exact locked dependency versions (don't edit by hand). |
| `vite.config.js` | Vite config — React plugin, dev server on port 5173 (or `PORT`, so a second dev server can run alongside the first). |
| `tailwind.config.js` | Tailwind theme — fonts (Inter, mono) and **semantic color tokens** (`fg`, `muted`, `faint`, `surface`, `line`, `accent`, `pos/neg/warn`) that resolve to the active theme's CSS variables. The actual Liquid Glass look lives in `src/index.css`. |
| `postcss.config.js` | Runs Tailwind + autoprefixer during the build. |
| `vercel.json` | Tells **Vercel** (the frontend host) to route all paths to `index.html` (needed for a single-page app so deep links work). |
| `public/favicon.svg` | The browser-tab icon. |

### `frontend/src/` — the actual app code

The structure follows a strict **layering** so components never call the network
directly. Top to bottom: **pages → components → hooks → services → api client.**

| Path | Layer | What it does |
| --- | --- | --- |
| `main.jsx` | entry | Boots React. Wraps the app in `QueryClientProvider` (React Query), **`AuthProvider`** (M5 — inside the query client, since it clears cached account queries on sign-out), and `BrowserRouter`. Imports global CSS. |
| `App.jsx` | routing | The route table. `/` → **Home** (Command Center); a route **per leaderboard board** generated from `constants/boards.js` (`/fantasy/*` and `/nfl/*`, all rendered by `LeaderboardView`); `/insight/*` → `InsightView`; **`/explore/*` → the M4 tools** (`ScatterView`, `CompareView`, mapped from `EXPLORE_ITEMS`); `/players/:playerId` → PlayerProfile; `/teams` → Teams; legacy `/leaderboard` → redirect to `/fantasy/leaders`; and **`/styleguide` → the design-token studio, registered only when `import.meta.env.DEV`** so it never ships. All wrapped in `Layout`. |
| `index.css` | styling | Global styles + Tailwind directives + **the Liquid Glass theme system**: light/dark CSS-variable palettes (swapped via `data-theme`), the `body` environment gradient, and the shared `.glass-*` component classes. Plus the `.stat-num` mono-font helper. **The single source of truth for every theme value** — `/styleguide` reads these at runtime rather than copying them. See [`docs/design/ui-theme-liquid-glass.md`](docs/design/ui-theme-liquid-glass.md). |
| **`pages/`** | pages | Top-level screens, one per route. |
| `pages/Home.jsx` | page | **The home screen (`/`) — the Command Center.** A Bento dashboard that opens on the fantasy question: the current fantasy-points leader (spotlight), live fantasy leaders, entry tiles, the active league scoring, and **live Buy-Low / Sell-High signal tiles** from the M3 intelligence API. |
| `pages/LeaderboardView.jsx` | page | The generalized leaderboard, driven by a **board config** (`constants/boards.js`). Every `/fantasy/*` and `/nfl/*` route renders this with a different board — fantasy boards show the league-scoring editor + scoring-aware columns; NFL boards show raw stats with the same filters (season / week / position / type). |
| `pages/InsightView.jsx` | page | ⭐ **The generalized Insight board (M3)**, driven by the same board config. Every `/insight/*` route renders this. Unlike the leaderboard it calls `/stats/intelligence`, adds the **league-context editor** and a **trailing-window timeframe** (full season / last 4 / last 8 weeks), and always states the pool it ranked against (window, games threshold, replacement level). |
| `pages/ScatterView.jsx` | page | ⭐ **The scatter builder (M4)** at `/explore/scatter`. A **curated** tool: users pick a position group and a *question*, not axes — the presets live in `constants/scatters.js`. Players are drawn as their own headshots, with median quadrant guides and click-through to a player page. |
| `pages/CompareView.jsx` | page | ⭐ **The comparison builder (M4)** at `/explore/compare`. Up to five players side by side, with headshots. Each row shows who **leads** that stat and by how much over the runner-up (direction from the registry's `higher_is_better`, so fewest fumbles wins). Only metrics applying to *every* compared position are shown. Plus an overlaid weekly chart and a percentile radar. Selection lives in the URL. |
| `pages/PlayerProfile.jsx` | page | One player: header, season summary cards, the **Insight panel** (M3 scores + breakdown), an Expected vs Actual panel, a weekly fantasy trend chart, **the M4 usage-trend and target-depth charts**, and a game-by-game log. |
| `pages/DraftBoardView.jsx` | page | ⭐ **The Draft Value Board (M6.1)** at `/insight/draft`. Consensus rank, our expected-VORP rank, and the gap — with the raw ECR and the experts' best/worst spread alongside. Its own page rather than an `InsightView` board because the columns are properties of a *comparison* (two ranks and their difference), not registry metrics, and a row can legitimately have no value at all — a rookie the market ranks and we have never seen play, shown in place with the reason stated rather than dropped or imputed. |
| `pages/VegasView.jsx` | page | ⭐ **The Vegas board (M6.4)** at `/insight/vegas` — one week, as a list of players ranked by their game's implied team total or as the slate itself, on a toggle. Players lead because this board sits beside VORP and Buy Low, and those rank players. The week picker labels which weeks the market has actually priced, so choosing an unpriced one reads as honest rather than broken. |
| `pages/SosView.jsx` | page | ⭐ **Strength of schedule (M6.3)** at `/insight/sos` — the canonical team × week grid, one position at a time, shaded easy-green to hard-red and dimmed outside the selected window. A grid rather than a ranked list because SOS is a property of a *sequence*: "CLE is 1st" matters far less than seeing that their weeks 15–17 are NYG, BAL, IND. Teams are still ranked easiest-first down the left. |
| `pages/Teams.jsx` | page | Team leaderboard — ranked team offensive production for a season. Rows link through to the team page. |
| `pages/TeamProfile.jsx` | page | ⭐ **One team (M6.2)** at `/teams/:teamId`: record, next game with its line and implied total, a **strength-of-schedule strip** per position (season and fantasy playoffs), the depth chart by position with each player's fantasy PPG in your scoring, and the full fixture list. Two seasons are on the page at once — the schedule is about the season coming, the production about the last one played — and it labels both rather than hoping nobody notices. |
| `pages/StyleGuide.jsx` | page (dev only) | ⭐ **The design-token studio** at `/styleguide` — a build tool, not a product page, so `App.jsx` only registers it under `npm run dev` and nothing links to it. Renders every surface the Liquid Glass material produces beside a live editor for the theme's CSS variables, and emits the CSS to paste back into `index.css`. Reads the current values with `getComputedStyle` (so `index.css` stays the single source of truth), applies edits as inline custom properties on `<html>`, and **removes them on unmount** — a draft can never leak into the rest of the app. One page rather than one per theme: the glass is `backdrop-filter`, so a light panel nested in a dark page would blur an environment that does not exist. |
| **`components/`** | UI | Reusable pieces used by pages. |
| `components/Layout.jsx` | UI | The app shell: frosted sticky header with brand, nav (Home, the four dropdowns — Insight / Explore / Fantasy / NFL — and Teams), search box, the theme toggle, and **the account menu**; renders the current page inside. Also the single mount point for `useProfileSync`. The page background (the Liquid Glass "environment") is painted on `<body>`. |
| `components/ThemeToggle.jsx` | UI | Header sun/moon button that flips light ↔ dark (via `useTheme`). |
| `components/AccountMenu.jsx` | UI | ⭐ **The header account control (M5).** A *Sign in* button when signed out; an avatar dropdown when signed in — league profiles (switch or delete), saved views (open or delete), and sign out. Renders **nothing** when the build has no Supabase project configured. Mounts `AuthDialog` in *both* branches, because a password-reset link signs the user in before they set the new password. |
| `components/AuthDialog.jsx` | UI | ⭐ **The sign-in surface (M5)**: password sign-in, sign-up, magic link, forgot-password, a "check your inbox" state, and a set-a-new-password form entered only via Supabase's `PASSWORD_RECOVERY` event. **Portalled to `document.body`** — it renders from inside the sticky header, and `.glass-header`'s `backdrop-filter` makes that a containing block for `position: fixed`, which would otherwise clip the overlay to the header. Any future modal opened from the header needs the same treatment. |
| `components/LeagueProfileBar.jsx` | UI | ⭐ **The account layer on the scoring editor (M5)**, mounted inside `ScoringControl` (the one surface present on every page with either editor). Save the current scoring+league as a named profile, update the active one, or revert to it. Editing scoring never silently rewrites a saved profile — an edit is a URL override, committing it is explicit. Hidden when signed out. |
| `components/FavoriteStar.jsx` | UI | ⭐ **The watchlist star (M5)** on player pages and every board row. Optimistic toggle. Hidden when signed out, so the Player column keeps its pre-M5 width for a visitor. |
| `components/WatchlistToggle.jsx` | UI | ⭐ **The "watchlist only" board filter (M5)** + its `useWatchlistFilter` hook. Disabled (not hidden) when nothing is starred, so the feature is discoverable from the boards. Emits `player_ids` for a **server-side** filter. |
| `components/SaveViewButton.jsx` | UI | ⭐ **"Save view" (M5)** on every board and both Explore tools — names the current route + query string. Saving under an existing name updates it. Validates the path against the board registry (the catalog check the backend deliberately leaves to the client). |
| `components/ui/NavDropdown.jsx` | UI (base) | The **Insight ▾ / Explore ▾ / Fantasy Leaderboards ▾ / NFL Leaderboards ▾** nav menus — open on hover (desktop) and click/tap (touch), keyboard/Escape accessible. Items come from `constants/boards.js`. |
| `components/StatTable.jsx` | UI | The ranked stat table + pager **shared by the leaderboard and Insight boards**: click-to-sort headers, accented active column, and positive/negative tinting for columns whose sign carries the meaning. |
| `components/TokenPanel.jsx` | UI (dev only) | ⭐ **The editor half of the token studio** — one control per token (colour + alpha, slider, or raw text), a live WCAG contrast readout that composites the translucent surface over the background before scoring, and the copyable CSS. Re-declares every token at its *baseline* value on its own root, so setting `--fg` to the surface colour blanks the gallery but never the controls that would undo it. |
| `components/ScoringControl.jsx` | UI | The league-scoring editor: preset picker (PPR/Half/Std/TE-Premium) + an expandable custom-weights panel. Emits a scoring spec string. |
| `components/LeagueControl.jsx` | UI | ⭐ **The league-context editor (M3)**: team count + starting lineup (QB/RB/WR/TE/FLEX/SUPERFLEX), showing the **replacement level it produces per position** so the link between lineup and value is visible. Emits a league spec string. |
| `components/InsightPanel.jsx` | UI | The player page's fantasy-intelligence panel: VORP / Opportunity Rating / Buy-Low / Sell-High with meters, the badges they imply ("Buy Low", "Sell High", "Elite Opportunity", "Below Replacement", "Small Sample"), and a collapsible **per-score breakdown** showing every weighted input with its value and percentile. |
| `components/PlayerPicker.jsx` | UI | Search-and-add player selector for the comparison builder, capped at five, with chips coloured to match each player's chart series. |
| `components/ExportButton.jsx` | UI | **CSV export of the current view**, on every board and both Explore views. Writes the active filters/scoring/league into a header comment so a download is self-describing. |
| `components/SearchBox.jsx` | UI | Header player search — type a name, pick a result, jump to that player's profile. |
| `components/ui/Select.jsx` | UI (base) | A styled labeled `<select>` dropdown used all over the filter bars. |
| `components/charts/FantasyTrendChart.jsx` | UI (chart) | Recharts bar chart of fantasy points by week on the player profile, with expected points overlaid as a dashed line. |
| `components/charts/MetricScatter.jsx` | UI (chart) | The scatter itself: **players drawn as circular headshots** (with an initialled disc fallback), median reference lines, an optional x=y diagonal for same-unit presets, optional bubble sizing, and faint quadrant captions. The photo carries identity, so no colour encoding is needed — which also sidesteps the colour-vision problem four position hues would create (see the M4 design note §6). |
| `components/charts/TargetDepthChart.jsx` | UI (chart) | Targets vs catches per air-yard bucket (behind LOS / 0–9 / 10–19 / 20+) on the player page — where a receiver's opportunity actually lives. |
| `components/charts/UsageTrendChart.jsx` | UI (chart) | Weekly usage shares (snap / target / route or rush / opportunity) for one player. All series share one 0–100% axis — never a second y-scale. |
| `components/charts/CompareTrendChart.jsx` | UI (chart) | Overlaid weekly fantasy points for up to five compared players. Also exports `SERIES_COLORS`, the fixed categorical order keyed to the player (never to their rank). |
| `components/charts/CompareRadar.jsx` | UI (chart) | Percentile radar across a curated per-position axis set — percentiles, not raw stats, so the shape is readable across positions. |
| **`hooks/`** | data | Custom React hooks — reusable stateful logic, mostly React Query wrappers around services. |
| `hooks/useLeaderboard.js` | data | Fetches the player leaderboard. |
| `hooks/useTeamLeaderboard.js` | data | Fetches the team leaderboard. |
| `hooks/usePlayer.js` | data | Fetches a player profile, game log, and **target-depth buckets** (`usePlayerTargetDepth`). |
| `hooks/useExplore.js` | data | Fetches the M4 Explore views: `useScatter` → `/stats/scatter`, `useCompare` → `/stats/compare`. |
| `hooks/usePlayerSearch.js` | data | Fetches header search results (fires only at ≥2 chars). |
| `hooks/useMetrics.js` | data | Fetches the metric registry from the backend; exposes a `supportsScoring` capability flag. Seeded with bundled constants so the UI is never blank. |
| `hooks/useDraftBoard.js` | data | Fetches the Draft Value Board (M6.1), strength of schedule (`useSos`, M6.3) and the Vegas board (`useVegas`, M6.4). |
| `hooks/useTeamLeaderboard.js` | data | The team leaderboard, and `useTeam` for one team's page (M6.2). |
| `hooks/useSeasons.js` | data | ⭐ **The seasons a board may offer, and the one it opens on (M6.0).** Fetches `/seasons`, seeded with a calendar-derived fallback so the first render is never an empty dropdown (the `useMetrics` pattern). `statsOnly` (default) hides seasons that exist on the schedule but have no stats yet. Replaced `SEASONS[0]`, a constant that would have left every board defaulting to last year the first September of a new season. |
| `hooks/useInsight.js` | data | Fetches the intelligence board (`useIntelligence`) and one player's scores (`usePlayerIntelligence`). |
| `hooks/useAuth.jsx` | state | ⭐ **Auth state for the whole app (M5)** — `AuthProvider` + `useAuth`. Mirrors the Supabase session into React and drops cached `["account", …]` queries on any auth change, so one user's saved state can never flash in front of the next. Also tracks `isRecovering` (set by Supabase's `PASSWORD_RECOVERY` event) so the UI asks for a new password instead of behaving like a normal sign-in. Signed-out is a first-class state. |
| `hooks/useAccount.js` | data | ⭐ **React Query over the account API (M5)**: `useAccount`, `useLeagueProfiles`, `useFavorites` (with an optimistic star toggle), `useSavedViews`. All disabled when signed out, so a visitor never fires a request that would 401. |
| `hooks/useProfileSync.js` | state | ⭐ **Keeps `localStorage` and the active profile coherent (M5).** On first sign-in with no profiles, migrates pre-account scoring/league into a profile named **"My League"**; thereafter mirrors the active profile *back* into `localStorage`, which is what lets the state hooks resolve correctly on first paint. Mounted once, in `Layout`. |
| `hooks/useUrlState.js` | state | ⭐ **A filter that lives in the query string (M5).** Keeps defaults out of the URL and validates against an optional whitelist, so a param carried over from another board falls back instead of wedging the view. Backfills the spine-C promise the 17 boards had never actually kept — and, since 2026-08-20, the Teams leaderboard and both Explore tools, which M5 had missed. **Every filter on every ranked view now lives here.** |
| `hooks/useScoring.js` | state | The active league scoring, resolved **URL param > active league profile > `localStorage` > PPR**. The URL outranks the account deliberately: a shared `?scoring=` link must show *that* league to whoever opens it, or every share link silently lies. |
| `hooks/useLeague.js` | state | The active **league context** (size + starting lineup), same layering as `useScoring`. Defaults to 12-team. |
| `hooks/useTheme.js` | state | The active UI theme (light/dark). Writes `data-theme` on `<html>` and persists to `localStorage` (`gridiron.theme`); defaults to dark. |
| `hooks/useDebounce.js` | util | Debounces a fast-changing value (used to throttle search-as-you-type). |
| **`services/`** | network | The **only** place HTTP calls live. One function per endpoint. |
| `services/api.js` | network | The shared axios instance; sets the base URL to `{VITE_API_BASE_URL}/api/v1`. A request interceptor attaches the Supabase access token as `Authorization: Bearer …` when there is one. Everything else imports this. |
| `services/supabase.js` | network | ⭐ **The Supabase client (M5), used *only* as a token issuer** — sign-up, password sign-in, magic link, password reset, and session refresh. It never reads or writes application data. Exports `authConfigured`, which is false (and the whole account UI absent) when the env vars are unset. |
| `services/account.js` | network | ⭐ **The account API (M5)**: `/me`, league profiles, favorites, saved views. |
| `services/stats.js` | network | `getLeaderboard(params)` → `/stats/leaderboard`; `getScatter(params)` → `/stats/scatter`; `getCompare(params)` → `/stats/compare`; `getDraftBoard(params)` → `/stats/draft-board`; `getSos(params)` → `/stats/sos`; `getVegas(params)` → `/stats/vegas`. |
| `services/insight.js` | network | `getIntelligence(params)` → `/stats/intelligence`; `getPlayerIntelligence(id, params)` → `/players/{id}/intelligence`. |
| `services/players.js` | network | Player profile, game log, search, and **target-depth** calls. |
| `services/teams.js` | network | Teams list, team leaderboard, and one team's page (M6.2). |
| `services/metrics.js` | network | Fetches the metric registry. |
| `services/seasons.js` | network | Fetches the season list + current season (M6.0). |
| **`constants/`** | config | App-wide constant data (no logic/network). |
| `constants/index.js` | config | Positions, weeks, Insight timeframes, the metric label/format map (seed for `useMetrics`), and the team-leaderboard + game-log column sets. Seasons are **no longer a literal list** (M6.0): it holds `FIRST_SEASON` plus a calendar-derived `fallbackCurrentSeason()` / `FALLBACK_SEASONS`, used only until `/seasons` answers — components call `useSeasons()`. |
| `constants/boards.js` | config | **The 17 "boards"** (4 Insight + 5 Fantasy + 8 NFL) — each declares its columns (metric ids), default sort/position, whether it's a scoring (fantasy) board, and whether it's an `insight` board (rendered by `InsightView` against `/stats/intelligence`). Also holds **`EXPLORE_ITEMS`** (M4) and **`INSIGHT_TOOLS`** (M6 — the Draft Value Board), which are tools rather than boards (no columns) and route to their own pages. Drives the four nav dropdowns. Adding a board here is all it takes. |
| `constants/scoring.js` | config | League-scoring presets + editable weights, and the (de)serialize helpers that mirror the backend's scoring grammar. **Must stay in sync with `backend/app/scoring.py`.** |
| `constants/league.js` | config | League size + starting-lineup defaults and the (de)serialize helpers that mirror the backend's league grammar. **Must stay in sync with `backend/app/league.py`.** |
| `constants/storage.js` | config | The `localStorage` keys for scoring and league, plus safe read/write helpers — shared by the state hooks and `useProfileSync`, which both write them. |
| `constants/scatters.js` | config | ⭐ **The pre-canned scatters (M4)** — six position groups (All / QB / RB / WR / TE / Flex), each with a handful of curated charts. The scatter builder deliberately offers *questions*, not free axis choice: two metrics picked at random usually produce a meaningless cloud, and the curation is the product. |
| `constants/designTokens.js` | config | ⭐ **The token registry behind `/styleguide`** — grouping, labels and control types for every theme variable, plus the contrast pairs worth watching. Deliberately holds **no values**: the studio reads those from the stylesheet, so this file cannot drift out of sync with `index.css`. Adding a token to the theme means adding one entry here. |
| **`utils/`** | util | Pure helpers. |
| `utils/format.js` | util | `formatStat(value, format)` — renders a number as int / N-decimals / percent, with an em-dash for nulls so columns stay aligned. Plus `ordinal` (21 → "21st"), `formatPercentile` (0.92 → "92nd", built on it) and `formatSigned` (explicit `+` on gaps). |
| `utils/csv.js` | util | CSV export (M4): `toCsv` (with quote escaping), `buildBoardExport` (rows/columns for any ranked board), `downloadCsv`, `slugify`. |
| `utils/color.js` | util | Colour maths for the token studio: parse hex/`rgba()` into channels + alpha, format back the way `index.css` authors it, alpha-composite a layer stack, and score WCAG contrast. Used only by `/styleguide` — components consume tokens, they never reason about what one resolves to. |

---

## 5. `backend/` — the FastAPI API

**Stack:** FastAPI (web framework) + SQLAlchemy (ORM / database access) + Alembic
(database migrations) + Pydantic (data validation & response shapes). Python **3.12**.
Served by **uvicorn** on **port 8000**. All endpoints are prefixed `/api/v1`. Interactive
API docs are auto-generated at **`http://localhost:8000/docs`**.

### Backend root files

| File | Controls |
| --- | --- |
| `requirements.txt` | Python dependencies for the backend, tests included (`pytest`, `pytest-asyncio`, `httpx`) — one venv, so a test suite nobody has installed is a test suite nobody runs. |
| `pytest.ini` | Test configuration: `testpaths = tests`, and `pythonpath = .` so tests import the app the same way the app imports itself. |
| `alembic.ini` | Alembic (migrations) configuration. |
| `.env` | Local secrets: `DATABASE_URL`, `ENVIRONMENT`, `CORS_ORIGINS`, and optionally `SUPABASE_URL` / `SUPABASE_JWT_SECRET`. Git-ignored. |
| `.venv/` | The backend's private Python environment (git-ignored). |

### `backend/app/` — the application

| Path | What it does |
| --- | --- |
| `main.py` | **App entry point.** Creates the FastAPI app, configures CORS (which frontend origins may call it), and wires up all the routers under `/api/v1`. |
| `config.py` | Loads settings from environment variables / `.env` (database URL, environment, allowed CORS origins, **Supabase auth**) via Pydantic. In **development** it also allows any `localhost` port, so a dev server on an auto-assigned port isn't blocked by CORS. `auth_enabled` is false until `SUPABASE_URL` is set, which is what lets the whole public API run on a fresh checkout with no Supabase project. |
| `database.py` | Creates the SQLAlchemy engine + session factory, and the `get_db()` dependency every endpoint uses to get a database session. |
| `auth.py` | ⭐ **Supabase JWT verification (M5)** — the only place a token becomes an identity. Supports both **asymmetric** signing (public keys from the project's JWKS, the current Supabase default) and **legacy HS256**, chosen by the token header's `alg`, so a project can migrate without a code change. Checks signature, expiry, issuer, and audience, then **provisions the local `users` row just-in-time** — no webhook, no second source of truth. Deliberately knows **nothing about how the user signed in**: swapping Google OAuth for email auth changed one line here (a `display_name` fallback to the email's local part, since email sign-ups may carry no name). Exports `get_current_user` (401s) and `get_optional_user` (returns `None`). |
| `scoring.py` | ⭐ **The scoring-aware fantasy engine (architecture "spine A").** Turns a league-scoring string like `"ppr:pass_td=6,te_rec=1.5"` into a `ScoringConfig`, and computes fantasy points from raw stat components — both as a SQL expression (for sorting/ranking in the DB) and in Python (for display). Fantasy points are **computed live, never stored per-scoring.** |
| `league.py` | ⭐ **League context (M3).** Turns a league string like `"10:rb=2,flex=2"` into a `LeagueConfig` (teams + starting lineup) and derives the **replacement rank per position** — flex slots shared across RB/WR/TE in proportion to the lineup's flex-eligible starters, superflex credited to QB. The second per-request config alongside scoring; it's what makes *value* league-aware. |
| `metrics.py` | ⭐ **The metric registry (architecture "spine B").** One canonical definition per metric (id, label, short label, description, format, category, how it aggregates, which positions it applies to). The single source of truth for metric metadata — the leaderboard reads aggregation behavior from here, and the frontend fetches it via `/metrics`. **Adding a stat starts here.** |
| `aggregation.py` | The **shared season/window aggregation layer**: which registry metrics are summed vs averaged vs per-game derived, and `finalize_row()`, which fills in the scoring-aware, expected-points, and composite/custom columns. Also `metric_expr()` — **the one place that maps any metric id to a SQL expression**, so the leaderboard's ORDER BY and the scatter's SELECT can never disagree about what a metric means. Used by the leaderboard, the intelligence engine, and both Explore endpoints. |
| `custom_metrics.py` | ⭐ **The custom-metric engine (M4)** — the third per-request config, after scoring and league. Parses `custom=name=formula[;…]` into a weighted sum over an optional divisor. Deliberately **structured, not free-form**: every term is a registry id, so there is no expression parser and no `eval`. Also holds `BUILTIN_COMPOSITES`, the registry's `composite` metrics parsed at import time — so a built-in and a user's metric run through one evaluator. See [`docs/design/M4-exploration-viz.md`](docs/design/M4-exploration-viz.md). |
| `seasons.py` | ⭐ **Which seasons exist, and which is current (M6.0).** "Current" = the newest season *with stats*, not the newest on the schedule — those differ for most of the year, and defaulting to the latter opens a board on an empty table. Shared by `/seasons` and the draft board. |
| `vegas.py` | ⭐ **The Vegas board (M6.4).** Splits each game's spread and total into **implied team totals** — the points the market expects an offense to score, and the sharpest forward-looking read on how many fantasy points will exist. No odds API and no new columns: the lines arrive in the M6.0 schedule ingest, and implied totals are derived rather than stored. Handles *unpriced* as a first-class state — the market prices a few weeks out, so most of a season carries no line in August, and a null must never sort as a low total. |
| `sos.py` | ⭐ **Strength of schedule (M6.3).** Fantasy points allowed per game by each defense to each position, **computed through the scoring engine on every request** — a TE-premium league has a different hardest schedule for tight ends, so a stored rating would need a row per scoring context. Difficulty is a **0–100 percentile, higher is harder**, deliberately not a rank ("the number one defense against receivers" and "the number one schedule" point opposite ways). States its **basis** on every response: last season until four weeks of the current one exist, then the current one, never a blend. Byes are skipped, not averaged in as easy weeks. |
| `draft_board.py` | ⭐ **The Draft Value Board engine (M6.1).** Joins a consensus snapshot to our expected-VORP valuation and computes the gap. Two rules carry the whole feature: **both ranks are counted over the same players** (ranking the market over everyone and ourselves over the subset who played inflates every gap — the first build showed a +301 "value" on a deep tight end), and the board **stops at draftable depth** (`teams x starters x 2`), past which the consensus is listing camp bodies. Also picks the consensus variant from the league config, so a superflex league gets superflex ranks unasked. |
| `intelligence.py` | ⭐ **The fantasy-intelligence engine (M3).** VORP, Fantasy Opportunity Rating, Positive-Regression (buy-low) Index, and Sell-High Index — built from percentile ranks within each position pool, plus career-baseline efficiency and usage trend. Also computes **expected VORP** (M6.1) — the same replacement-level maths run on expected points instead of actual, so it values opportunity rather than the finish it produced — and resolves trailing windows and produces the per-input `breakdown()` the player page renders. All weights and thresholds are constants at the top of the file; see [`docs/design/M3-fantasy-intelligence.md`](docs/design/M3-fantasy-intelligence.md). |
| **`models/`** | **SQLAlchemy ORM models** — Python classes mapped to database tables. |
| `models/base.py` | The shared `Base` class all models inherit from. |
| `models/team.py` | `teams` table (name, abbreviation, conference, division). |
| `models/player.py` | `players` table (name, position, team, headshot, …) plus the **roster-bio columns** (M6.0): birth date, height/weight, college, draft year/round/pick/team, rookie season, experience. `draft_team` is a bare abbreviation rather than a FK — it can name a franchise that no longer exists under that code (OAK, SD, STL). |
| `models/game.py` | `games` table (season, week, home/away teams, scores, date) plus the **betting-market columns** (M6.0): spread, total, moneylines, over/under odds, and roof/surface/division context. They arrive in the same `load_schedules` feed and are populated for *upcoming* games too, which is why the Vegas board needs no odds API. Implied team totals are derived at query time, never stored. |
| `models/player_stats.py` | ⭐ `player_stats` table — **one row per player per game**, with ~50 stat columns (general, advanced, fantasy). The heart of the data. Season-level derived metrics (e.g. PPG) are deliberately **not** columns — they're computed in the API. |
| `models/player_target_depth.py` | `player_target_depth` table (M4) — targets and production at the grain **(player, game, depth bucket, direction)**. Exists because `air_yards` is stored as a per-game total and a total can't be un-summed into buckets. Direction is stored even though the shipped chart sums it away, so the directional grid needs no second migration. |
| `models/depth_chart.py` | `depth_chart_entries` table (M6.2) — where each skill-position player currently sits on their team's chart. **Current state, not history**: the feed publishes ~150 snapshots a season and this keeps one row per player from the newest, which is reversible because nflverse retains them all. The consequence lives in the pipeline — see `ingest_depth_charts.py`. |
| `models/player_ranking.py` | `player_rankings` table (M6.1) — one player's consensus rank from one source on one day. **Rankings, not projections**: the feed publishes ECR and its dispersion, never projected points, which is why the roadmap's `projections` table stays unbuilt. `scraped_at` is in the key because the upstream file is a snapshot overwritten in place — history accrues only from our first ingest and is not backfillable. |
| `models/account.py` | ⭐ **The four account tables (M5)** — `users` (a thin mirror of the Supabase Auth subject, so the rest have a real FK), `league_profiles`, `favorites`, `saved_views`. Everything cascades from `users`, which is what makes account deletion a five-line handler. A **partial unique index** enforces at most one active profile per user in the database, not just in application logic. |
| `models/__init__.py` | Imports all models so Alembic and the app can see them. |
| **`schemas/`** | **Pydantic schemas** — define the *shape of JSON* going in/out of the API (separate from the DB models). |
| `schemas/player.py` | Player response shapes: the lean `PlayerOut` for search/list, and `PlayerDetailOut` for the profile — which adds the M6 bio columns plus a **computed `age`** (derived from `birth_date`, since a stored age is wrong the day after it is written). Split so search results don't carry a college and a draft slot per row. |
| `schemas/stats.py` | Stat-line (game log) response shape. |
| `schemas/team.py` | Team response shape. |
| `schemas/common.py` | Shared pieces — e.g. the paginated-list envelope `{ data, total, page, … }`. |
| `schemas/account.py` | ⭐ **Account request/response shapes (M5)**, and where their validation lives. Profile specs are checked by parsing them through `scoring.py` / `league.py` — a profile that saves is a profile that will render. Saved-view paths are held to a **safety envelope** (single-slash, same-origin, known section, no scheme, no `..`); the 19-board catalog check stays on the frontend, which already owns the registry. |
| **`routers/`** | **The API endpoints**, grouped by resource. Each file is a set of related routes. |
| `routers/health.py` | `GET /health` — confirms the API and DB are alive (used by Render's health check). Also **`GET /health/auth`**, which reports whether token verification is correctly wired: the expected issuer, the JWKS URL, and whether that document is actually fetchable. It exists because an unreachable JWKS, a wrong issuer, and a genuinely forged token all surface to a client as the same 401 — correct for security, useless for diagnosis. Everything it returns is already public (derivable from the anon key in the frontend bundle); the HS256 secret is reported only as a boolean. |
| `routers/players.py` | `GET /players` (search/list), `/players/{id}` (profile — carries the M6 bio columns, a computed age, and the current **depth-chart slot** with its date), `/players/{id}/stats` (game log), `/players/{id}/intelligence` (M3 scores + breakdown), `/players/{id}/target-depth` (M4 depth buckets). |
| `routers/teams.py` | `GET /teams` (list), `/teams/leaderboard` (ranked team offense), `/teams/{id}/stats` (one team's season totals), and ⭐ **`/teams/{id}`** (M6.2 — the team page: record, fixtures with their betting lines and implied totals, and the current depth chart with each player's production **in the requested scoring**). The schedule is flattened to the team's own point of view, which means flipping the stored spread for away games — it is recorded home-team-first. Also carries the team's **strength of schedule** per position (M6.3). |
| `routers/stats.py` | ⭐ `GET /stats/leaderboard` — the filterable player leaderboard. Two modes: **season aggregate** (one row per player) and **single week** (raw game lines). Uses the scoring engine + metric registry. The most important endpoint. Also `GET /stats/intelligence` (M3) — the Insight board; it computes the whole position pool first (scores are relative), then sorts and paginates in Python. Plus the two M4 Explore endpoints: **`/stats/scatter`** (any two metrics, season or per-player-week, `rank_by` before capping, `position=FLEX`; routes through the intelligence engine only when an axis needs it) and **`/stats/compare`** (≤5 players, metrics intersected across their positions, plus percentiles and weekly series). Note the *endpoints* stay general — the **UI** is what's curated (`constants/scatters.js`), so a new chart needs no backend change. Plus **`/stats/draft-board`** (M6.1) — consensus rank against our expected-VORP rank, and the gap; see `app/draft_board.py`. And **`/stats/sos`** (M6.3) — every team's fixtures rated for one position over a window (full / rest of season / next 4 / fantasy playoffs) — and **`/stats/vegas`** (M6.4), one week as either a ranked list of players or a slate of games. |
| `routers/metrics.py` | `GET /metrics` — serves the whole metric registry to the frontend. |
| `routers/seasons.py` | ⭐ **`GET /seasons` (M6.0)** — every season in the database, and which one boards should open on. Replaced a hardcoded array in the frontend. **"Current" means the newest season with *stats*, not the newest on the schedule**: next season's fixtures land months before kickoff, so defaulting to the newest season outright would open the app on an empty table. Returns both facts (`has_stats`, `completed_games`) because stat boards and schedule-shaped surfaces need different answers. |
| `routers/account.py` | ⭐ **The account endpoints (M5)**: `/me` (+ `DELETE`, which ships now rather than later — collecting an identity means owing a way to revoke it), and CRUD for `/me/league-profiles`, `/me/favorites`, `/me/saved-views`. Every handler is scoped to the token's subject and **no endpoint accepts a user id**, so there is no request shape that reads another user's rows; a guessed id 404s exactly like a nonexistent one. |
| `utils/dates.py` | `age_in_years(birth_date)` — age derived, never stored, since a stored age is wrong the day after it is written. Shared by the player schema and the draft board. |

### `backend/tests/` — the test suite

Run with `.venv/bin/python -m pytest` from `backend/`. Needs only the local Postgres — no
Supabase project, no network, no `.env`. Started at the **auth boundary**, because M5 is
the first code in the project where a bug means one user reading another user's data.

| Path | What it does |
| --- | --- |
| `README.md` | What is covered, how the fixtures work, and the traps worth knowing before adding a test. |
| `conftest.py` | ⭐ **The harness.** Creates a throwaway `gridiron_test` database, migrates it with `alembic upgrade head`, and drops it at the end — the development database is never touched, and no test depends on ingested data. Each test runs in a transaction that is rolled back, with the session joined in `create_savepoint` mode so handler `commit()` calls behave normally and still leave no trace. Also pins the suite **offline**: an autouse fixture installs a JWKS client that fails like an unreachable endpoint. |
| `helpers.py` | Test constants and token minting. Imports nothing from `app`, because `conftest.py` reads these constants to build the environment *before* the first `import app` — `settings` and the engine are both built at import time. |
| `test_auth.py` | ⭐ Token verification with **real** signed tokens and nothing overridden — signature, expiry, issuer, audience, `alg=none`, the asymmetric ES256/JWKS path, algorithm confusion, and JIT provisioning (including the email-local-part `display_name` fallback). |
| `test_cross_user_isolation.py` | ⭐ **The file that matters most.** User B attempting to read, patch, and delete user A's profiles, saved views, and favorites. The answer is always **404, never 403** — a 403 confirms the id is real and turns the endpoint into an enumeration oracle. |
| `test_rls.py` | ⭐ The row-level-security lockdown from `8f73b5b2b1a1`, and the reason the suite migrates rather than using `create_all()`: this layer is a property of the *schema*, invisible to every request-level test. Asserts the mechanism, not the flag — a role standing in for PostgREST's `anon` is granted `SELECT` and must still see nothing. |
| `test_league_profiles.py` | CRUD, spec validation, the one-active-profile invariant (including the partial unique index itself), and successor promotion. |
| `test_saved_views.py` | CRUD and the path validation that keeps a stored URL on-site. |
| `test_favorites.py` | Idempotent add/remove, unknown players, the cap. |
| `test_account.py` | The account summary and the deletion cascade. |
| `test_health.py` | `/health` and `/health/auth` — including that the auth probe never returns the HS256 secret, and that a broken JWKS is *reported* rather than raised. |
| `test_harness.py` | Guards on the fixtures themselves: that the suite really is on the throwaway database, and that the schema is at the expected migration head. |

### `backend/alembic/` — database migrations

Alembic tracks the database schema as an ordered series of migration scripts, so any
machine (your laptop, Supabase) can be brought to the exact same schema with
`alembic upgrade head`.

| Path | What it does |
| --- | --- |
| `alembic/env.py` | Migration runtime config — points Alembic at the models + `DATABASE_URL`. |
| `alembic/versions/bd93cb7cea4b_*.py` | Migration #1 — **creates the core tables** (teams, games, players, player_stats). |
| `alembic/versions/4a2fb3bf6c6b_*.py` | Migration #2 — adds a unique constraint on team abbreviation. |
| `alembic/versions/521f727f5461_*.py` | Migration #3 (M2) — adds the expected stat components, the three market-share columns, and carries inside the 10/5/2. |
| `alembic/versions/7852e5b550b0_*.py` | Migration #4 (M4) — creates `player_target_depth` (targets by depth bucket × direction). |
| `alembic/versions/990003c7c7cf_*.py` | Migration #5 (M5) — creates the four account tables (`users`, `league_profiles`, `favorites`, `saved_views`) with the one-active-profile partial index. |
| `alembic/versions/8f73b5b2b1a1_*.py` | Migration #6 (M5 security) — **enables RLS on the account tables and revokes `anon`/`authenticated`**. Required: Supabase serves the whole `public` schema through PostgREST, so without it those tables are readable and writable by anyone holding the (public) anon key, bypassing the API entirely. |
| `alembic/script.py.mako` | Template used when generating a new migration. |

---

## 6. `pipeline/` — data ingestion

**Stack:** standalone Python 3.12 scripts using **`nflreadpy`** (wraps the free
nflverse NFL datasets). This is decoupled from the backend — it reflects table
definitions straight from the database rather than importing the backend's models,
so **the migrated schema is the single source of truth.** Every script is
**idempotent** (`INSERT … ON CONFLICT DO UPDATE`) — safe to run repeatedly.

| File | What it does |
| --- | --- |
| `README.md` | How to set up and run the pipeline, run order, and which columns each script fills. |
| `requirements.txt` | Pipeline Python dependencies. |
| `db.py` | Shared DB helpers — connection, the idempotent `upsert` used by most scripts, **`replace_scoped()`** (M6.2 — delete-and-rewrite whole groups in one transaction, for tables holding *current state* where a row that should vanish simply stops appearing in the source), and `load_stat_keys()` (the guard that keeps enrichment passes from inserting half-empty stat lines). |
| `seasons.py` | ⭐ **The season clock (M6.0).** Replaced `DEFAULT_SEASONS = list(range(2020, 2026))`, copied into every script and wrong from the next September. nflreadpy owns two rollovers and this reads both: the **roster** year turns over on 15 March (schedules, rosters, players, depth charts exist months before kickoff), the **stats** year at the first game. `clamp_seasons()` drops seasons a feed can't serve yet — the loaders take every season in one call, so one unstarted season would otherwise fail an entire scheduled run. `in_season()` is the two clocks agreeing. |
| `ingest_teams.py` | **Run 1st.** Keeps only teams that appear in the schedule for the seasons in scope — `load_teams()` publishes 36 franchise codes and just 32 play. The filter is derived from the schedule rather than an exclusion list, so it survives a relocation and a change of `FIRST_SEASON`. Loads all NFL teams (everything else resolves team IDs from here). |
| `ingest_players.py` | **Run 2nd.** Loads QB/RB/WR/TE players, now including the **roster-bio columns** (M6.0). Reads `latest_team`, so re-running is what follows free agency, trades and the draft. |
| `ingest_schedules.py` | **Run 3rd.** Loads games (schedule + results) for the given `--seasons`, plus the **betting lines and game context** (M6.0). Defaults to the **roster** season range, so next season's fixtures enter the database as soon as nflverse publishes them. |
| `ingest_stats.py` | **Run 4th.** Loads per-player, per-game stat lines. Also downloads play-by-play to derive red-zone metrics, carries inside the 10/5/2, and unrealized air yards (`--skip-pbp` to skip). |
| `ingest_expected.py` | **Run 5th** (enrichment). Expected stat *components* from `load_ff_opportunity` + the three market-share metrics. Only updates existing stat lines. |
| `ingest_usage.py` | **Run 6th** (enrichment). Snap counts (PFR, joined via a `pfr_id → gsis_id` crosswalk) and route usage (participation × play-by-play), then derives TPRR/YPRR. `--skip-routes` for snaps only. |
| `ingest_depth_charts.py` | **Run 9th** (M6.2). The newest depth-chart snapshot, QB/RB/WR/TE. **The one ingest that is not an upsert** — it replaces each team's rows, because a cut player stops appearing in the feed rather than appearing with a worse rank, and an upsert would leave him at WR3 forever. |
| `ingest_target_depth.py` | **Run 7th** (M4). Aggregates play-by-play targets into `player_target_depth` by air-yard bucket × pass direction. Writes its own table rather than columns on `player_stats` — the grain is different. |

**Data scope:** positions **QB/RB/WR/TE**; seasons **2020 through the current
season**, computed rather than hardcoded (see `seasons.py`). The two halves diverge for
most of the year: the schedule reaches into the *upcoming* season (2026 fixtures and
their betting lines were loaded in August 2026) while stats stop at the last season
played. As of M2 every
advanced column is populated except `slot_snaps`, which no free data source provides
(see [`docs/design/M2-expanded-metrics.md`](docs/design/M2-expanded-metrics.md) §3 and
`pipeline/README.md`). Note that `routes_run` is *pass-play participation*, not charted
routes — the same doc explains what that over- and under-states.

---

## 7. The database

- **Engine:** PostgreSQL 16.
- **Local (development):** runs in Docker via `docker-compose.yml`. Credentials
  `gridiron` / `gridiron` / db `gridiron` on `localhost:5432`. Data lives in the
  `gridiron_pgdata` Docker volume and **survives reboots** — only
  `docker compose down -v` (note the `-v`) wipes it.
- **Production:** hosted on **Supabase**. The backend on Render connects to it via a
  `DATABASE_URL` set in Render's dashboard (never committed).
- **Schema:** eleven tables — seven of NFL data (`teams`, `players`, `games`,
  `player_stats`, `player_target_depth`, `player_rankings`, `depth_chart_entries`)
  and four of **account** data (`users`,
  `league_profiles`, `favorites`, `saved_views`, M5). All defined in
  `backend/app/models/` and created/altered via Alembic migrations. The full annotated
  schema, including every `player_stats` column, is in [`CLAUDE.md`](CLAUDE.md).
  `player_target_depth` (M4) is the one NFL table at a different grain — one row per
  player, game, depth bucket, and pass direction. M6.0 added columns but no tables:
  betting lines + context on `games`, roster bio on `players`. M6.1 added
  `player_rankings` — the one NFL table that holds an *opinion* rather than a measured
  fact, which is why its source and scrape date are part of its key.
- **Account tables are a separate island.** They reference `players` (favorites) but
  nothing references *them*, and the pipeline never touches them — so a full re-ingest
  can't disturb user data. `users.user_id` is the Supabase Auth subject verbatim rather
  than a locally-generated id, because Supabase owns `auth.users` in a schema Alembic
  does not manage.
- ⚠️ **The account tables must keep RLS enabled** (migration `8f73b5b2b1a1`). Supabase
  serves the whole `public` schema through PostgREST at `/rest/v1/`, and its default
  privileges grant `anon` access to new tables — so any account table created *without*
  RLS is readable and writable by anyone holding the anon key, which ships in the public
  JS bundle. The backend is unaffected because it connects as the table owner, which
  bypasses RLS. **Any future user-data table needs the same treatment**; the NFL
  reference tables do not, being public read-only data.

**Important schema rule (repeated everywhere for a reason):** per-game stats are
stored; **season-level derived metrics** (`fantasy_ppg_*`, `routes_run_per_game`) and
**per-scoring fantasy points** are **computed in the API by aggregating rows**, not
stored as columns. `red_zone_rush_share` is derived during ingestion.

---

## 8. Configuration & environment variables

Nothing secret is committed. Config flows from `.env` files (local) or the host's
dashboard (production).

| Variable | Used by | Local value | Production |
| --- | --- | --- | --- |
| `DATABASE_URL` | backend, pipeline | `postgresql://gridiron:gridiron@localhost:5432/gridiron` | Supabase connection string (set in Render dashboard) |
| `ENVIRONMENT` | backend | `development` | `production` |
| `CORS_ORIGINS` | backend | `http://localhost:5173` | the deployed Vercel URL (exact origins) |
| `CORS_ORIGIN_REGEX` | backend | *(unset — code default matches this project's Vercel URLs)* | override only to change the allowed-origin regex; lets Vercel **preview** deploys call the API |
| `VITE_API_BASE_URL` | frontend | `http://localhost:8000` | the deployed Render URL |
| `SUPABASE_URL` | backend | *(optional — unset disables accounts)* | `https://<project-ref>.supabase.co` (Render dashboard) |
| `SUPABASE_JWT_SECRET` | backend | *(optional)* | only for projects still signing HS256; newer ones verify from the public JWKS |
| `VITE_SUPABASE_URL` | frontend | *(optional)* | `https://<project-ref>.supabase.co` (Vercel) |
| `VITE_SUPABASE_ANON_KEY` | frontend | *(optional)* | the **publishable anon** key — never the `service_role` key, which must never reach a client bundle |

The four Supabase variables are optional by design: with them unset the app runs
exactly as it did before M5, minus the sign-in button, and the `/me` endpoints return
503 rather than a confusing 401. See
[`docs/design/M5-accounts-saved-state.md`](docs/design/M5-accounts-saved-state.md) §8
for the one-time Supabase setup — including **configuring a real SMTP sender**, which
is a launch requirement rather than a nicety, since sign-up confirmation, magic links,
and password resets all depend on mail arriving.

The template with all of these and copy instructions is [`.env.example`](.env.example).

---

## 9. Hosting & deployment

| Piece | Host | Config file | Notes |
| --- | --- | --- | --- |
| Frontend | **Vercel** | `frontend/vercel.json` | Auto-deploys on push to `main`. Live: https://gridiron-livid.vercel.app |
| Backend | **Render** | `render.yaml` | Auto-deploys on push to `main`. Live: https://gridiron-api-t6hz.onrender.com. Health check: `/api/v1/health`. |
| Database | **Supabase** | — | Managed Postgres; connection string set as a Render secret. |

Deploys are triggered by **pushing to `main`** — Vercel and Render each watch the
repo and rebuild automatically.

**Data refresh (M6.0):** `.github/workflows/pipeline.yml` runs the pipeline against
production on a schedule — **daily** for rosters and the schedule (which is where
betting lines arrive), **Wednesdays in-season** for the stats chain, after Monday night
and Tuesday's stat corrections have landed. Split by perishability on purpose:
play-by-play is the largest download and the slowest-moving input, so a single nightly
job would spend most of its minutes re-deriving numbers that did not move. The stats job
idles all summer via `seasons.in_season()`. It needs one repo secret,
**`PIPELINE_DATABASE_URL`** — the first credential in CI that can *write* to production,
which is why it is scoped to this workflow and checked for explicitly rather than
failing four scripts deep.

---

## 10. Local development quickstart

Full details in [`README.md`](README.md). The short version — three terminals:

```bash
# 1. Database (needs Docker Desktop running)
cd gridiron && docker compose up -d

# 2. Backend  → http://localhost:8000  (docs at /docs)
cd gridiron/backend && .venv/bin/uvicorn app.main:app --reload --port 8000

# 3. Frontend → http://localhost:5173
cd gridiron/frontend && npm run dev
```

Sanity check: `curl localhost:8000/api/v1/health` should return
`{"status":"ok","database":"connected"}`. For accounts, `/api/v1/health/auth` reports
whether token verification is wired correctly.

Backend tests (needs only the database from step 1 — the suite builds and drops its own
`gridiron_test`, so your data is never touched):

```bash
cd gridiron/backend && .venv/bin/python -m pytest
```

---

## 11. Key architectural concepts (the "why")

The roadmap defines three **spines** — foundations built first so features compose
instead of being retrofitted. You'll see these referenced in the code:

- **Spine A — Scoring-aware fantasy engine** (`backend/app/scoring.py`,
  `frontend/src/constants/scoring.js`). Store *raw stat components*; compute fantasy
  points from a scoring config at query time. This is what makes "your league's exact
  scoring, everywhere" possible — the product's #1 differentiator.
- **Spine B — Single metric registry** (`backend/app/metrics.py`, served via
  `/metrics`, consumed by `useMetrics`). One definition per metric, shared by every
  view. Replaces the old "add a metric in four places" problem.
- **Spine C — Stateless-first persistence** (`frontend/src/hooks/useScoring.js`,
  `frontend/src/hooks/useLeague.js`, `frontend/src/hooks/useUrlState.js`). State lives
  in the URL + `localStorage` (shareable, no login). **M5 layered accounts on top
  without changing this**: the resolution order is
  `URL > active league profile > localStorage > default`, and the URL wins on purpose —
  a shared `?scoring=` link must show *that* league to whoever opens it, or every share
  link silently lies. Nothing in the product is gated behind an account; signing in buys
  sync, naming, and more than one of a thing. M5 also had to *finish* this spine: the 17
  boards had kept their filters in `useState`, so a board link carried none of them
  (`useUrlState` fixed that).

M3 added a **second per-request config** next to scoring: **league context**
(`backend/app/league.py`, `frontend/src/constants/league.js`) — league size and
starting lineup. Scoring answers "how many points is this worth?"; league context
answers "worth more than *what*?". Any future value-based feature (the trade
calculator, dynasty value) needs both, and they thread through the API the same way.

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the full vision and milestone plan,
[`docs/design/M1-scoring-foundation.md`](docs/design/M1-scoring-foundation.md) for the
scoring engine + registry design,
[`docs/design/M2-expanded-metrics.md`](docs/design/M2-expanded-metrics.md) for expected
points, market share, and the snap/route enrichment, [`docs/design/M3-fantasy-intelligence.md`](docs/design/M3-fantasy-intelligence.md) for
the VORP / opportunity / buy-low / sell-high engine,
[`docs/design/M4-exploration-viz.md`](docs/design/M4-exploration-viz.md) for the
Explore tools and the custom-metric engine, and
[`docs/design/M5-accounts-saved-state.md`](docs/design/M5-accounts-saved-state.md) for
accounts, league profiles, favorites, and saved views (M5 — most recently shipped).

---

## 12. "Where do I change…?" — common tasks

A cheat sheet for the most frequent kinds of change. (When adding a **stored** metric,
CLAUDE.md's rule is to touch all four layers: schema → pipeline → API → frontend.)

| I want to… | Touch these |
| --- | --- |
| Add a new **stored stat** (a real column) | 1) `backend/app/models/player_stats.py` (column) → 2) new Alembic migration → 3) `pipeline/ingest_stats.py` (populate it) → 4) `backend/app/metrics.py` (registry entry) → 5) `frontend/src/constants/index.js` (label/column). |
| Add a **derived / scoring** metric (no column) | `backend/app/metrics.py` (registry entry, `aggregation="derived"` or `"scoring"`) + wire into `backend/app/aggregation.py` / `routers/stats.py`; expose in `frontend/src/constants/index.js`. |
| Add or tune an **Insight score** (M3) | `backend/app/intelligence.py` (the weights/terms are constants at the top) + a `backend/app/metrics.py` entry with `aggregation="intelligence"`; expose in `frontend/src/constants/index.js` and add it to a board's columns in `constants/boards.js`. No DB or pipeline work — these are query-time. |
| Add a **composite** metric (a formula over existing metrics) | one `backend/app/metrics.py` entry with `aggregation="composite"` and a `formula` string — it's parsed and evaluated by `custom_metrics.py`, so there is no other code to write. Then a label in `frontend/src/constants/index.js` and the metric id in a board's columns. |
| Change how **fantasy points** are scored | `backend/app/scoring.py` **and** mirror it in `frontend/src/constants/scoring.js`. |
| Change **replacement level / league rules** | `backend/app/league.py` **and** mirror it in `frontend/src/constants/league.js`. |
| Change the **custom-metric grammar** | `backend/app/custom_metrics.py`. It has no frontend mirror today — the builder UI was deferred, and the engine's only current job is evaluating the registry's `composite` metrics. |
| Add or change a **pre-canned scatter** | `frontend/src/constants/scatters.js` — one entry (position group, x/y, optional size, the question it answers, optional quadrant captions). No backend change: `/stats/scatter` already serves any registry pair. |
| Add a **chart** | a component in `frontend/src/components/charts/`. Use the `--series-1..5` CSS tokens for categorical series (fixed order, never cycled) and theme variables for everything else — never hardcode a colour. Adding a 6th categorical hue needs re-validation, not a guess. |
| Add a new **API endpoint** | a router in `backend/app/routers/` (+ register it in `main.py`), a Pydantic schema in `schemas/`, then a service in `frontend/src/services/` + a hook. |
| Add a new **page/screen** | a component in `frontend/src/pages/`, a route in `frontend/src/App.jsx`, a nav link in `components/Layout.jsx`. |
| Add a new **board** (or change its columns) | add/edit a board in `frontend/src/constants/boards.js` (columns, default sort/position, fantasy vs NFL vs `insight`). The route, nav dropdown item, and page all pick it up automatically. |
| Change the **look/theme** | `frontend/src/index.css` (Liquid Glass tokens per theme + `.glass-*` classes) + `frontend/tailwind.config.js` (semantic token names). Use the `.glass-*` classes and `text-fg`/`text-muted`/`text-accent`/`border-line` tokens — never hardcode theme colors. See [`docs/design/ui-theme-liquid-glass.md`](docs/design/ui-theme-liquid-glass.md). |
| **Tune** the look (rather than restructure it) | run `npm run dev` and open **`/styleguide`** — the token studio applies edits live across every surface at once and hands you the CSS to paste into `index.css`. Adding a *new* token to the theme means one entry in `frontend/src/constants/designTokens.js` so the studio can edit it too. |
| Add a **board filter that should survive sharing/saving** | use `useUrlState` in the view rather than `useState`, and give it a fallback (kept out of the URL) plus an optional whitelist. Saved views and share links then pick it up with no other change. |
| Add something to the **account** (a new saved thing) | 1) a model in `backend/app/models/account.py` (cascade from `users`) → 2) a migration → 3) schemas in `schemas/account.py` → 4) routes in `routers/account.py`, scoped to `get_current_user` and **never taking a user id** → 5) a service in `frontend/src/services/account.js` + a hook in `hooks/useAccount.js` keyed under `["account", …]`. |
| Change **data scope** (seasons, etc.) | re-run `pipeline/` scripts with new `--seasons`. The season *list* is no longer edited anywhere: the backend derives it from the data (`routers/seasons.py`) and the frontend reads it (`hooks/useSeasons.js`). Only `FIRST_SEASON` (in `pipeline/seasons.py`, mirrored in `constants/index.js`) is a decision rather than a fact. |

---

## 13. Mini-glossary (for the fantasy/NFL newcomer)

- **PPR / Half-PPR / Standard** — scoring systems that award 1 / 0.5 / 0 fantasy points
  per reception. "TE-Premium" gives tight ends extra per catch.
- **Fantasy points** — a weighted score of a player's real stats (yards, TDs, etc.)
  under a league's scoring rules. GridironIQ computes these live from raw stats.
- **PPG** — fantasy **points per game** (a season total divided by games played).
- **EPA** — Expected Points Added; an advanced measure of a play's value.
- **VORP** — Value Over Replacement Player: points above the last *startable* player at
  the same position in your league. How you compare a tight end to a running back.
- **Replacement level** — the points-per-game of that last startable player. Depends on
  league size and starting lineup, which is why GridironIQ makes you set them.
- **Regression** — the tendency for unusually good or bad luck (especially touchdown
  rate) to fade back toward normal. "Buy low" and "sell high" are bets on it.
- **Target share / Air yards / Snap share / Routes run** — "opportunity" metrics: how
  much of a team's usage a player commands (predictive of future fantasy value).
- **Red-zone** — inside the opponent's 20-yard line, where scoring chances are high.
- **REG / POST** — regular season vs. playoffs (a filter on most endpoints).
- **nflverse / `nflreadpy`** — the free open-source NFL data source the pipeline uses.

---

## How this document is maintained

This is a **running document**. It should always reflect the current state of the
repo. Update it in the *same change* that alters the project's structure — specifically:

- A new top-level file or folder → add a row to [§2](#2-top-level-directory-map).
- A new backend router/model/schema, or a change to what one controls → update [§5](#5-backend--the-fastapi-api).
- A new frontend page/component/hook/service → update [§4](#4-frontend--the-react-web-app).
- A new pipeline script or ingestion change → update [§6](#6-pipeline--data-ingestion).
- A new environment variable → update [§8](#8-configuration--environment-variables).
- A deployment/hosting change → update [§9](#9-hosting--deployment).
- Bump the **Last updated** date at the top and add a line to the changelog below.

### Changelog

- **2026-08-20** — **`teams` holds only teams that play** (§4, §5). `load_teams()`
  publishes 36 franchise codes — LAR, OAK, SD and STL sit beside LA, LV, LAC and LA —
  and all 36 were being ingested, so the SOS board ranked 36 teams with four empty
  schedules atop its "easiest" list and `GET /teams/{id}` returned a real 200 with no
  record, fixtures or depth chart. Three layers now: `ingest_teams.py` filters to teams
  appearing in the schedule (**derived, not a hardcoded exclusion list**, so it survives
  a relocation or a change of `FIRST_SEASON`), migration `8530feb2c2ff` deletes teams
  nothing references (**by reference count, not by name**, so it is a no-op on a fresh
  database and cannot destroy a franchise that a wider scope makes real), and
  `GET /teams/{id}` 404s for a team with no games in any season — deliberately *any*
  season, since a team with no fixtures in the season requested is an empty season, not
  a missing team.
- **2026-08-20** — **The last three views moved their filters into the URL** (§5).
  `Teams` (`type`, `metric`), `ScatterView` (`last_weeks`, `type`, `density`) and
  `CompareView` (`last_weeks`, `type`) had kept them in `useState`, so their links
  carried a partial view and a saved view of them stored little more than a path — the
  same gap M5 closed for the 17 boards and did not close here. All now use
  `useUrlState` with whitelists, and `season` keeps its M6.0 behaviour by passing
  `String(currentSeason)` as the fallback: the default stays out of the query string
  and still follows the season the API serves.
- **2026-08-20** — **M6.4 Vegas board — M6 complete** (§4, §5). New `/insight/vegas`:
  one week as a list of players ranked by their game's **implied team total**, or as the
  slate itself, on a toggle. **No new data and no odds API** — the lines came in with
  the M6.0 schedule ingest, and implied totals are derived (`total / 2 ± spread / 2`)
  rather than stored. Two things needed care: `spread_line` is stored from the *home*
  team's perspective, so the sign has to be flipped for the away side or the board
  recommends the offense expected to score least; and **unpriced is a state, not a
  zero** — the market had priced weeks 1–6 fully, week 7 half and the rest sporadically
  as of 2026-08-20, so a null line must never sort as a low total. The week picker
  labels how much of each week is priced. 14 tests in `tests/test_vegas.py`, including
  the implied-total arithmetic directly.
- **2026-08-20** — **M6.3 strength of schedule** (§4, §5). New `/insight/sos`: the
  canonical team × week grid, one position at a time, with fantasy-playoff and
  rest-of-season windows. **No new tables** — points allowed is an aggregation over
  `player_stats` joined to `games` for the opponent, run through the scoring engine per
  request, exactly like M3's scores and for the same reason. Difficulty is a 0–100
  percentile rather than a rank, because "the number one defense against receivers" and
  "the number one schedule" point opposite ways. Also lands as a strip on the team page
  and a column on the draft board. Found and fixed in passing: `teams` holds four inert
  rows for relocated franchises (LAR, OAK, SD, STL — zero games, zero stat lines), which
  would have ranked 36 teams and put four empty schedules atop the "easiest" list. 10
  tests in `tests/test_sos.py`.
- **2026-08-20** — **M6.2 depth charts + team pages** (§4, §5, §6, §7). The Teams tab
  stops being a dead end: `/teams/:teamId` shows a team's record, its fixtures with the
  betting line and implied total on each, and the current depth chart with every
  player's PPG **in the requested scoring**. New: `depth_chart_entries` (migration
  `a6763fb36779`), `pipeline/ingest_depth_charts.py`, `GET /teams/{id}`,
  `pages/TeamProfile.jsx`, and a dated depth-chart badge on the player page. Two
  decisions carry it: the table holds **current state**, so the ingest replaces each
  team's rows rather than upserting (`replace_scoped` — a cut player stops appearing in
  the feed instead of appearing with a worse rank, so an upsert would strand him at
  WR3), and the schedule is told **from the team's own point of view**, which means
  flipping the stored home-team spread on away games. 10 tests in
  `tests/test_team_page.py`.
- **2026-08-20** — **M6.1 Draft Value Board** (§4, §5, §6, §7). New `/insight/draft`
  puts expert consensus rank beside our own **expected-VORP** rank and shows the gap.
  New: `player_rankings` (migration `319f1f54a7f0`), `pipeline/ingest_rankings.py`,
  `app/draft_board.py`, `GET /stats/draft-board`, `pages/DraftBoardView.jsx`, and
  expected VORP in `app/intelligence.py`. Three decisions are load-bearing: the
  valuation is **expected** points, not actual, so a twelve-touchdown fluke does not
  read as value; **both ranks count the same players**, after a first build that ranked
  the market over 434 names and us over the 319 who had played and duly reported a +301
  "value" on a 35-year-old tight end; and the board **stops at draftable depth**, since
  93% of the consensus top 150 can be valued against ~60% past pick 200. 9 tests in
  `tests/test_draft_board.py`, aimed at exactly those invariants.
- **2026-08-20** — **M6.0 season readiness** (§4, §5, §6, §7, §9). The first milestone
  about data that is still changing, so three things had to stop being constants. The
  **season list** now comes from the database (`routers/seasons.py` → `hooks/useSeasons.js`),
  where "current" means the newest season *with stats* — the 2026 schedule sat in `games`
  all summer with no line recorded against it, and defaulting to it would have opened
  every board on an empty table. The **pipeline's season range** is computed from
  nflreadpy's two clocks (`pipeline/seasons.py`), with `clamp_seasons()` so a scheduled
  run between March and kickoff skips the unstarted season instead of failing. And the
  **refresh itself** is now scheduled (`.github/workflows/pipeline.yml`), split by
  perishability, which puts a production write credential in CI for the first time.
  Migration `7fa8428b7a1d` adds betting lines + game context to `games` and the
  roster-bio columns to `players` — both feeds we were already downloading and
  discarding. 2020–2026 schedules and lines backfilled; 6 new tests in
  `tests/test_seasons.py`.
- **2026-08-19** — **Design-token studio** (§4). New dev-only `/styleguide`
  (`pages/StyleGuide.jsx` + `components/TokenPanel.jsx` + `constants/designTokens.js` +
  `utils/color.js`): every Liquid Glass surface on one screen next to a live editor for
  the theme's CSS variables, with a WCAG readout and copyable CSS. Built so design
  tweaks stop requiring a code round-trip. Three decisions worth keeping: the registry
  holds **no values** (they are read from the stylesheet with `getComputedStyle`, so
  `index.css` stays the single source of truth); edits are inline custom properties on
  `<html>` **removed on unmount**, so a draft cannot leak into the app; and the panel
  pins itself to the baseline theme so a broken `--fg` cannot make its own undo
  invisible. Registered only under `import.meta.env.DEV` and verified absent from the
  production bundle. It ships nothing to users and changes no product behaviour.
- **2026-08-12** — **First CI** (§2). New `.github/workflows/backend-tests.yml` runs the
  backend suite on every pull request and on `main`, against a PostgreSQL 16 service
  container using the same credentials as `docker-compose.yml` — so CI runs the identical
  command a developer does, with no CI-only configuration to drift. Deliberately no
  `paths:` filter: scoping it to `backend/**` would mean the check never reports on
  documentation PRs, which silently blocks them the moment it becomes required.
- **2026-08-12** — **First automated tests** (§5). New `backend/tests/` — 150 tests
  covering the M5 auth boundary, which until now was verified by a throwaway script. The
  harness builds a throwaway `gridiron_test` with `alembic upgrade head` and drops it, so
  the development database is never touched and no test depends on ingested data; each
  test runs in a transaction rolled back at the end, and an autouse fixture keeps the
  suite off the network. `test_auth.py` uses **real signed tokens** against the real
  `get_current_user`; everything else overrides it, resolving the user through
  `Depends(get_db)` so `DELETE /me` can delete the instance its own session owns. Covers
  token verification (signature, expiry, issuer, audience, `alg=none`, the ES256/JWKS
  path, algorithm confusion), JIT provisioning, **cross-user isolation on every account
  endpoint**, the one-active-profile invariant, saved-view path rejection, the deletion
  cascade, `/health/auth`, and — the reason the suite migrates rather than using
  `create_all()` — the **RLS lockdown from `8f73b5b2b1a1`**, which adds no table or column
  and would otherwise have been invisible. New `backend/pytest.ini`; `pytest`,
  `pytest-asyncio`, `httpx` added to `requirements.txt`. Verified by breaking the app on
  purpose: 25 deliberate mutations, all caught. **Also fixed:** README and §2 described
  one shared `.venv/` at the repo root, but the backend has run from `backend/.venv/`
  since M5 added `PyJWT` — the documented command could not start the API.
- **2026-08-12** — M5 accounts **enabled in production**, plus the four fixes the
  rollout surfaced. `8f73b5b2b1a1` enables RLS on the account tables (Supabase serves
  `public` through PostgREST, so Alembic-made tables were world-readable via the public
  anon key). `services/supabase.js` now reduces `VITE_SUPABASE_URL` to the project URL
  and warns, instead of letting an endpoint suffix send auth calls to PostgREST. New
  **`GET /api/v1/health/auth`** reports issuer / JWKS URL / reachability, because a bad
  signature, an unreachable JWKS and a wrong issuer are one indistinguishable 401.
  `AuthDialog` now separates Supabase's hour-long email quota from generic rate limits.
  Stale Google-era wording cleaned out of `app/auth.py`, `routers/account.py`, and the
  M5 design note. See that note's §10 for the pattern behind all four.
- **2026-08-05** — M5 auth swapped to email, before merge. Google OAuth replaced by
  **email + password *and* magic link** (see the ROADMAP decision log). New
  `components/AuthDialog.jsx` (sign-in / sign-up / magic link / forgot / check-inbox /
  set-new-password), rewritten `services/supabase.js`, and `hooks/useAuth.jsx` now
  tracks `isRecovering` from Supabase's `PASSWORD_RECOVERY` event. Backend change was
  one line — a `display_name` fallback to the email's local part — which is the payoff
  from `app/auth.py` never knowing how the user signed in. Two bugs found and fixed by
  looking: the dialog needed a **portal** (the header's `backdrop-filter` was clipping
  a `position: fixed` overlay), and it had to mount in the *signed-in* branch too
  (a reset link signs you in). Setup no longer needs a Google OAuth app, but now
  requires a real **SMTP sender**.
- **2026-08-05** — M5: accounts & saved state. **Auth:** `app/auth.py` verifies
  Supabase-issued JWTs (asymmetric JWKS *and* legacy HS256) and provisions the local
  `users` mirror just-in-time; Supabase is used purely as a token issuer, so the
  frontend↔backend HTTP boundary is unchanged. **DB:** migration #5 (`990003c7c7cf`)
  adds four cascading tables — `users`, `league_profiles`, `favorites`, `saved_views`
  (`models/account.py`), with a partial unique index enforcing one active profile per
  user. **Backend:** `routers/account.py` (`/me` + CRUD, scoped entirely to the token
  subject, no endpoint takes a user id), `schemas/account.py`, and a `player_ids`
  watchlist filter threaded through `aggregation.window_filters` → the leaderboard
  (in SQL) and the Insight board (*after* scoring, so percentiles stay pool-relative).
  **Frontend:** `hooks/useAuth.jsx`, `useAccount.js`, `useProfileSync.js`,
  `useUrlState.js`; `services/supabase.js` + `account.js`; `components/AccountMenu`,
  `LeagueProfileBar`, `FavoriteStar`, `WatchlistToggle`, `SaveViewButton`;
  `constants/storage.js`; a "My Players" tile on Home. `useScoring`/`useLeague` gained
  the profile layer (URL still wins). **Also fixed:** the 17 boards kept their filters
  in `useState`, so a board link carried none of them — now URL-backed, which is what
  makes a saved view store more than a bare path. Four new optional env vars (§8). New
  design note: `docs/design/M5-accounts-saved-state.md`.
- **2026-08-04** — M4 revision after review. **Scatter builder is now curated**: no free
  axis/size pickers, replaced by `frontend/src/constants/scatters.js` — six position
  groups (All / QB / RB / WR / TE / Flex) with 19 pre-canned charts, each stating the
  question it answers. Players render as **headshot bubbles** (`MetricScatter`), fed by
  a new `headshot_url` on the scatter and compare payloads. `/stats/scatter` gained
  `rank_by` (so a capped plot shows the top N rather than an arbitrary slice — a latent
  bug) and `position=FLEX`. **Comparison table rebuilt**: percentile bars replaced by
  *lead margins* (leader's value plus how far clear of the runner-up, direction from the
  registry's `higher_is_better`), headshots in the header, a "leads N" tally, and
  backend-computed section grouping. Compared players now get only metrics that apply to
  **every** position involved (`_compare_metrics`), so QB-vs-WR no longer renders empty
  passing/receiving rows. The **custom-metric builder UI was removed** (deferred to a
  later milestone) — `constants/custom.js`, `hooks/useCustomMetrics.js` and
  `components/CustomMetricControl.jsx` deleted; the backend engine stays, because the
  registry's `composite` metrics are evaluated by it.

- **2026-07-30** — M4: exploration & viz. New **Explore ▾** nav group with two tools:
  `pages/ScatterView.jsx` (`/explore/scatter`) and `pages/CompareView.jsx`
  (`/explore/compare`), backed by new endpoints `GET /stats/scatter` and
  `GET /stats/compare`. New **custom-metric engine** (`backend/app/custom_metrics.py`)
  — a third per-request config alongside scoring
  and league, and a new `composite` registry aggregation that ships two built-ins
  (High-Value Touches / Game, Touches Per Snap) through the same evaluator.
  `aggregation.py` gained `metric_expr()`, the single metric→SQL mapping the
  leaderboard and scatter now share. New table `player_target_depth` (migration
  `7852e5b550b0`) fed by `pipeline/ingest_target_depth.py`, serving
  `GET /players/{id}/target-depth`. New charts: `MetricScatter`, `TargetDepthChart`,
  `UsageTrendChart`, `CompareTrendChart`, `CompareRadar`, plus `--series-1..5`
  categorical tokens in `index.css` (validated for colour-vision deficiency and
  contrast in both themes). CSV export (`utils/csv.js` + `components/ExportButton.jsx`)
  on all 17 boards and both Explore views. New design note:
  `docs/design/M4-exploration-viz.md`.

- **2026-07-30** — M3: fantasy intelligence. New backend modules `app/league.py`
  (league size + starting lineup → replacement rank per position) and
  `app/intelligence.py` (VORP, Fantasy Opportunity Rating, Positive-Regression Index,
  Sell-High Index, trailing windows, career-baseline efficiency, usage trend, and the
  explanation breakdown), plus `app/aggregation.py` — the season/window aggregate
  extracted out of `routers/stats.py` so the leaderboard and the new board share one
  implementation. Nine new registry entries (`insight` category, `intelligence`
  aggregation) and two endpoints: `GET /stats/intelligence`,
  `GET /players/{id}/intelligence`. **No migration** — every score is query-time.
  Frontend: a third nav dropdown (**Insight ▾**) with four boards
  (`/insight/vorp|opportunity|buy-low|sell-high`) rendered by a new
  `pages/InsightView.jsx`; new `components/LeagueControl.jsx`,
  `components/InsightPanel.jsx` (player-page scores, badges, per-input breakdown) and
  `components/StatTable.jsx` (extracted, now shared with `LeaderboardView`); new
  `hooks/useLeague.js`, `hooks/useInsight.js`, `services/insight.js`,
  `constants/league.js`; Home's M3 teasers replaced with live signal tiles. Also:
  `config.py` allows any localhost port in development (CORS) and `vite.config.js`
  honours `PORT`. New design note: `docs/design/M3-fantasy-intelligence.md`.
- **2026-07-29** — M2: expanded metrics & expected points. New pipeline scripts
  `ingest_expected.py` (expected components + market share, from `load_ff_opportunity`)
  and `ingest_usage.py` (snap counts + route usage); `ingest_stats.py` extended with
  carries inside 10/5/2 and unrealized air yards (`--skip-red-zone` → `--skip-pbp`);
  new `db.load_stat_keys()`. Backend: expected-points support in `app/scoring.py`, an
  `expected` aggregation + `modelled` flag in `app/metrics.py`, ranking for it in
  `routers/stats.py`, and a scoring-aware game log in `routers/players.py`. Migration
  #3 (`521f727f5461`). Frontend: a 13th board (`/fantasy/expected`), expected columns
  across the existing boards, and a scoring-aware player page with an Expected vs
  Actual panel + xFP overlay on `FantasyTrendChart`. New design note:
  `docs/design/M2-expanded-metrics.md`.
- **2026-07-28** — Leaderboard nav split. Replaced the single leaderboard with
  **Fantasy Leaderboards ▾** (Leaders / Passing / Receiving / Rushing) and **NFL
  Leaderboards ▾** (All / Passing / Receiving / Rushing × General/Advanced), driven
  by `constants/boards.js` + a generalized `pages/LeaderboardView.jsx` and a new
  `components/ui/NavDropdown.jsx`. Frontend-only (the leaderboard API already
  returns/ranks every registry metric). Also documented the `CORS_ORIGIN_REGEX`
  backend var (§8).
- **2026-07-28** — Liquid Glass theme + Command Center home. Added the light/dark
  Liquid Glass theme system (`src/index.css` tokens + `.glass-*` classes,
  `hooks/useTheme.js`, `components/ThemeToggle.jsx`, semantic Tailwind tokens, a
  pre-paint theme script in `index.html`); added the Command Center home
  (`pages/Home.jsx`) at `/` and moved the leaderboard to `/leaderboard`. New design
  note: `docs/design/ui-theme-liquid-glass.md`.
- **2026-07-22** — Initial architecture map created, reflecting the state after M1
  (scoring engine + metric registry): documented all three apps, the DB, config,
  hosting, the three architecture spines, and the "where do I change…?" cheat sheet.
