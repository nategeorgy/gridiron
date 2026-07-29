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

Last updated: 2026-07-28

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
| `backend/` | app | The FastAPI JSON API. See [§5](#5-backend--the-fastapi-api). |
| `pipeline/` | app | The data-ingestion scripts. See [§6](#6-pipeline--data-ingestion). |
| `docker-compose.yml` | config | Defines the **local** PostgreSQL database (Postgres 16 in a Docker container). `docker compose up -d` starts it. Data persists in a named volume `gridiron_pgdata`. |
| `render.yaml` | config | "Blueprint" telling **Render** (the backend host) how to build and run the backend in production. |
| `.env.example` | config | Template for environment variables. You copy sections of it into `backend/.env` and `frontend/.env`. Real `.env` files are **never** committed. |
| `.gitignore` | config | Lists files git should ignore (`.env`, `.venv/`, `node_modules/`, etc.). |
| `.claude/` | tooling | Claude Code settings for this repo (e.g. `launch.json` for the preview server, local settings). Not part of the app itself. |
| `GridironIQ-Technical-Walkthrough.docx` | doc | A standalone Word write-up (not wired into the code). |
| `.git/` | git | Git's internal history. Never edit by hand. |

> **Note on the three `.venv/` folders.** `backend/`, `pipeline/` each have their own
> `.venv/` (a private Python virtual environment with that app's installed
> dependencies). They are git-ignored and machine-local — not part of the source you
> edit. The frontend's equivalent is `frontend/node_modules/`.

---

## 3. How a request flows end-to-end (a concrete trace)

Following one real interaction makes the whole architecture click. **"User opens the
leaderboard and sorts by fantasy points in their custom PPR scoring":**

1. Browser loads the React app (`frontend/`). The router (`App.jsx`) shows the
   `Leaderboard` page at `/leaderboard` (the home route `/` is the Command Center).
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
| `vite.config.js` | Vite config — React plugin, dev server on port 5173. |
| `tailwind.config.js` | Tailwind theme — fonts (Inter, mono) and **semantic color tokens** (`fg`, `muted`, `faint`, `surface`, `line`, `accent`, `pos/neg/warn`) that resolve to the active theme's CSS variables. The actual Liquid Glass look lives in `src/index.css`. |
| `postcss.config.js` | Runs Tailwind + autoprefixer during the build. |
| `vercel.json` | Tells **Vercel** (the frontend host) to route all paths to `index.html` (needed for a single-page app so deep links work). |
| `public/favicon.svg` | The browser-tab icon. |

### `frontend/src/` — the actual app code

The structure follows a strict **layering** so components never call the network
directly. Top to bottom: **pages → components → hooks → services → api client.**

| Path | Layer | What it does |
| --- | --- | --- |
| `main.jsx` | entry | Boots React. Wraps the app in `BrowserRouter` (routing) and `QueryClientProvider` (React Query). Imports global CSS. |
| `App.jsx` | routing | The route table. `/` → **Home** (Command Center); a route **per leaderboard board** generated from `constants/boards.js` (`/fantasy/*` and `/nfl/*`, all rendered by `LeaderboardView`); `/players/:playerId` → PlayerProfile; `/teams` → Teams; legacy `/leaderboard` → redirect to `/fantasy/leaders`. All wrapped in `Layout`. |
| `index.css` | styling | Global styles + Tailwind directives + **the Liquid Glass theme system**: light/dark CSS-variable palettes (swapped via `data-theme`), the `body` environment gradient, and the shared `.glass-*` component classes. Plus the `.stat-num` mono-font helper. See [`docs/design/ui-theme-liquid-glass.md`](docs/design/ui-theme-liquid-glass.md). |
| **`pages/`** | pages | Top-level screens, one per route. |
| `pages/Home.jsx` | page | **The home screen (`/`) — the Command Center.** A Bento dashboard that opens on the fantasy question: the current fantasy-points leader (spotlight), live fantasy leaders, entry tiles, the active league scoring, and labeled roadmap teasers (Buy-Low/Sell-High, coming in M3). |
| `pages/LeaderboardView.jsx` | page | The generalized leaderboard, driven by a **board config** (`constants/boards.js`). Every `/fantasy/*` and `/nfl/*` route renders this with a different board — fantasy boards show the league-scoring editor + scoring-aware columns; NFL boards show raw stats with the same filters (season / week / position / type). |
| `pages/PlayerProfile.jsx` | page | One player: header, season summary cards, a weekly fantasy trend chart, and a game-by-game log. |
| `pages/Teams.jsx` | page | Team leaderboard — ranked team offensive production for a season. |
| **`components/`** | UI | Reusable pieces used by pages. |
| `components/Layout.jsx` | UI | The app shell: frosted sticky header with brand, nav (Home, the two leaderboard dropdowns, Teams), search box, and the theme toggle; renders the current page inside. The page background (the Liquid Glass "environment") is painted on `<body>`. |
| `components/ThemeToggle.jsx` | UI | Header sun/moon button that flips light ↔ dark (via `useTheme`). |
| `components/ui/NavDropdown.jsx` | UI (base) | The **Fantasy Leaderboards ▾ / NFL Leaderboards ▾** nav menus — open on hover (desktop) and click/tap (touch), keyboard/Escape accessible. Items come from `constants/boards.js`. |
| `components/ScoringControl.jsx` | UI | The league-scoring editor: preset picker (PPR/Half/Std/TE-Premium) + an expandable custom-weights panel. Emits a scoring spec string. |
| `components/SearchBox.jsx` | UI | Header player search — type a name, pick a result, jump to that player's profile. |
| `components/ui/Select.jsx` | UI (base) | A styled labeled `<select>` dropdown used all over the filter bars. |
| `components/charts/FantasyTrendChart.jsx` | UI (chart) | Recharts bar chart of fantasy points by week on the player profile. |
| **`hooks/`** | data | Custom React hooks — reusable stateful logic, mostly React Query wrappers around services. |
| `hooks/useLeaderboard.js` | data | Fetches the player leaderboard. |
| `hooks/useTeamLeaderboard.js` | data | Fetches the team leaderboard. |
| `hooks/usePlayer.js` | data | Fetches a player profile + game log. |
| `hooks/usePlayerSearch.js` | data | Fetches header search results (fires only at ≥2 chars). |
| `hooks/useMetrics.js` | data | Fetches the metric registry from the backend; exposes a `supportsScoring` capability flag. Seeded with bundled constants so the UI is never blank. |
| `hooks/useScoring.js` | state | The active league scoring. **URL query param is the source of truth** (so views are shareable), backed by `localStorage`. Defaults to PPR. (Architecture "spine C": stateless-first.) |
| `hooks/useTheme.js` | state | The active UI theme (light/dark). Writes `data-theme` on `<html>` and persists to `localStorage` (`gridiron.theme`); defaults to dark. |
| `hooks/useDebounce.js` | util | Debounces a fast-changing value (used to throttle search-as-you-type). |
| **`services/`** | network | The **only** place HTTP calls live. One function per endpoint. |
| `services/api.js` | network | The shared axios instance; sets the base URL to `{VITE_API_BASE_URL}/api/v1`. Everything else imports this. |
| `services/stats.js` | network | `getLeaderboard(params)` → `/stats/leaderboard`. |
| `services/players.js` | network | Player profile, game log, and search calls. |
| `services/teams.js` | network | Teams list + team leaderboard calls. |
| `services/metrics.js` | network | Fetches the metric registry. |
| **`constants/`** | config | App-wide constant data (no logic/network). |
| `constants/index.js` | config | Seasons, positions, weeks, the metric label/format map (seed for `useMetrics`), and the team-leaderboard + game-log column sets. |
| `constants/boards.js` | config | **The 12 leaderboard "boards"** (4 Fantasy + 8 NFL) — each declares its columns (metric ids), default sort/position, and whether it's a scoring (fantasy) board. Drives both the nav dropdowns and `LeaderboardView`. Adding a leaderboard = add a board here. |
| `constants/scoring.js` | config | League-scoring presets + editable weights, and the (de)serialize helpers that mirror the backend's scoring grammar. **Must stay in sync with `backend/app/scoring.py`.** |
| **`utils/`** | util | Pure helpers. |
| `utils/format.js` | util | `formatStat(value, format)` — renders a number as int / N-decimals / percent, with an em-dash for nulls so columns stay aligned. |

---

## 5. `backend/` — the FastAPI API

**Stack:** FastAPI (web framework) + SQLAlchemy (ORM / database access) + Alembic
(database migrations) + Pydantic (data validation & response shapes). Python **3.12**.
Served by **uvicorn** on **port 8000**. All endpoints are prefixed `/api/v1`. Interactive
API docs are auto-generated at **`http://localhost:8000/docs`**.

### Backend root files

| File | Controls |
| --- | --- |
| `requirements.txt` | Python dependencies for the backend. |
| `alembic.ini` | Alembic (migrations) configuration. |
| `.env` | Local secrets: `DATABASE_URL`, `ENVIRONMENT`, `CORS_ORIGINS`. Git-ignored. |
| `.venv/` | The backend's private Python environment (git-ignored). |

### `backend/app/` — the application

| Path | What it does |
| --- | --- |
| `main.py` | **App entry point.** Creates the FastAPI app, configures CORS (which frontend origins may call it), and wires up all the routers under `/api/v1`. |
| `config.py` | Loads settings from environment variables / `.env` (database URL, environment, allowed CORS origins) via Pydantic. |
| `database.py` | Creates the SQLAlchemy engine + session factory, and the `get_db()` dependency every endpoint uses to get a database session. |
| `scoring.py` | ⭐ **The scoring-aware fantasy engine (architecture "spine A").** Turns a league-scoring string like `"ppr:pass_td=6,te_rec=1.5"` into a `ScoringConfig`, and computes fantasy points from raw stat components — both as a SQL expression (for sorting/ranking in the DB) and in Python (for display). Fantasy points are **computed live, never stored per-scoring.** |
| `metrics.py` | ⭐ **The metric registry (architecture "spine B").** One canonical definition per metric (id, label, short label, description, format, category, how it aggregates, which positions it applies to). The single source of truth for metric metadata — the leaderboard reads aggregation behavior from here, and the frontend fetches it via `/metrics`. **Adding a stat starts here.** |
| **`models/`** | **SQLAlchemy ORM models** — Python classes mapped to database tables. |
| `models/base.py` | The shared `Base` class all models inherit from. |
| `models/team.py` | `teams` table (name, abbreviation, conference, division). |
| `models/player.py` | `players` table (name, position, team, headshot, …). |
| `models/game.py` | `games` table (season, week, home/away teams, scores, date). |
| `models/player_stats.py` | ⭐ `player_stats` table — **one row per player per game**, with ~50 stat columns (general, advanced, fantasy). The heart of the data. Season-level derived metrics (e.g. PPG) are deliberately **not** columns — they're computed in the API. |
| `models/__init__.py` | Imports all models so Alembic and the app can see them. |
| **`schemas/`** | **Pydantic schemas** — define the *shape of JSON* going in/out of the API (separate from the DB models). |
| `schemas/player.py` | Player response shape. |
| `schemas/stats.py` | Stat-line (game log) response shape. |
| `schemas/team.py` | Team response shape. |
| `schemas/common.py` | Shared pieces — e.g. the paginated-list envelope `{ data, total, page, … }`. |
| **`routers/`** | **The API endpoints**, grouped by resource. Each file is a set of related routes. |
| `routers/health.py` | `GET /health` — confirms the API and DB are alive. Used by Render's health check. |
| `routers/players.py` | `GET /players` (search/list), `/players/{id}` (profile), `/players/{id}/stats` (game log). |
| `routers/teams.py` | `GET /teams` (list), `/teams/leaderboard` (ranked team offense), `/teams/{id}/stats` (one team's season totals). |
| `routers/stats.py` | ⭐ `GET /stats/leaderboard` — the filterable player leaderboard. Two modes: **season aggregate** (one row per player) and **single week** (raw game lines). Uses the scoring engine + metric registry. The most important endpoint. |
| `routers/metrics.py` | `GET /metrics` — serves the whole metric registry to the frontend. |
| `utils/` | Shared backend helpers (currently just a placeholder `.gitkeep`). |

### `backend/alembic/` — database migrations

Alembic tracks the database schema as an ordered series of migration scripts, so any
machine (your laptop, Supabase) can be brought to the exact same schema with
`alembic upgrade head`.

| Path | What it does |
| --- | --- |
| `alembic/env.py` | Migration runtime config — points Alembic at the models + `DATABASE_URL`. |
| `alembic/versions/bd93cb7cea4b_*.py` | Migration #1 — **creates the core tables** (teams, games, players, player_stats). |
| `alembic/versions/4a2fb3bf6c6b_*.py` | Migration #2 — adds a unique constraint on team abbreviation. |
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
| `db.py` | Shared DB helpers — connection + the idempotent `upsert` used by all scripts. |
| `ingest_teams.py` | **Run 1st.** Loads all NFL teams (everything else resolves team IDs from here). |
| `ingest_players.py` | **Run 2nd.** Loads QB/RB/WR/TE players. |
| `ingest_schedules.py` | **Run 3rd.** Loads games (schedule + results) for the given `--seasons`. |
| `ingest_stats.py` | **Run 4th.** Loads per-player, per-game stat lines. Also downloads play-by-play to derive red-zone metrics (`--skip-red-zone` to skip). |

**Data scope:** seasons **2020–2025**, positions **QB/RB/WR/TE**. Some advanced
columns (snap share, routes run, slot snaps, etc.) are intentionally left `NULL`
pending a later enrichment pass — see `pipeline/README.md`.

---

## 7. The database

- **Engine:** PostgreSQL 16.
- **Local (development):** runs in Docker via `docker-compose.yml`. Credentials
  `gridiron` / `gridiron` / db `gridiron` on `localhost:5432`. Data lives in the
  `gridiron_pgdata` Docker volume and **survives reboots** — only
  `docker compose down -v` (note the `-v`) wipes it.
- **Production:** hosted on **Supabase**. The backend on Render connects to it via a
  `DATABASE_URL` set in Render's dashboard (never committed).
- **Schema:** four tables — `teams`, `players`, `games`, `player_stats` (defined in
  `backend/app/models/`, created/altered via Alembic migrations). The full annotated
  schema, including every `player_stats` column, is in [`CLAUDE.md`](CLAUDE.md).

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
`{"status":"ok","database":"connected"}`.

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
- **Spine C — Stateless-first persistence** (`frontend/src/hooks/useScoring.js`).
  State lives in the URL + `localStorage` (shareable, no login), before accounts exist.

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the full vision and milestone plan, and
[`docs/design/M1-scoring-foundation.md`](docs/design/M1-scoring-foundation.md) for the
M1 (current milestone) design.

---

## 12. "Where do I change…?" — common tasks

A cheat sheet for the most frequent kinds of change. (When adding a **stored** metric,
CLAUDE.md's rule is to touch all four layers: schema → pipeline → API → frontend.)

| I want to… | Touch these |
| --- | --- |
| Add a new **stored stat** (a real column) | 1) `backend/app/models/player_stats.py` (column) → 2) new Alembic migration → 3) `pipeline/ingest_stats.py` (populate it) → 4) `backend/app/metrics.py` (registry entry) → 5) `frontend/src/constants/index.js` (label/column). |
| Add a **derived / scoring** metric (no column) | `backend/app/metrics.py` (registry entry, `aggregation="derived"` or `"scoring"`) + wire into `backend/app/routers/stats.py`; expose in `frontend/src/constants/index.js`. |
| Change how **fantasy points** are scored | `backend/app/scoring.py` **and** mirror it in `frontend/src/constants/scoring.js`. |
| Add a new **API endpoint** | a router in `backend/app/routers/` (+ register it in `main.py`), a Pydantic schema in `schemas/`, then a service in `frontend/src/services/` + a hook. |
| Add a new **page/screen** | a component in `frontend/src/pages/`, a route in `frontend/src/App.jsx`, a nav link in `components/Layout.jsx`. |
| Add a new **leaderboard** (or change its columns) | add/edit a board in `frontend/src/constants/boards.js` (columns, default sort/position, fantasy vs NFL). The route, nav dropdown item, and page all pick it up automatically. |
| Change the **look/theme** | `frontend/src/index.css` (Liquid Glass tokens per theme + `.glass-*` classes) + `frontend/tailwind.config.js` (semantic token names). Use the `.glass-*` classes and `text-fg`/`text-muted`/`text-accent`/`border-line` tokens — never hardcode theme colors. See [`docs/design/ui-theme-liquid-glass.md`](docs/design/ui-theme-liquid-glass.md). |
| Change **data scope** (seasons, etc.) | re-run `pipeline/` scripts with new `--seasons`; update `frontend/src/constants/index.js` `SEASONS`. |

---

## 13. Mini-glossary (for the fantasy/NFL newcomer)

- **PPR / Half-PPR / Standard** — scoring systems that award 1 / 0.5 / 0 fantasy points
  per reception. "TE-Premium" gives tight ends extra per catch.
- **Fantasy points** — a weighted score of a player's real stats (yards, TDs, etc.)
  under a league's scoring rules. GridironIQ computes these live from raw stats.
- **PPG** — fantasy **points per game** (a season total divided by games played).
- **EPA** — Expected Points Added; an advanced measure of a play's value.
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
