# GridironIQ — Claude Code Project Instructions

## Project Overview

GridironIQ is a **fantasy-first** NFL analytics web application. The goal is a clean, fast,
beautifully designed public-facing platform where fantasy managers come first: every stat is
framed around what it means for fantasy value, and the app answers fantasy questions (who to
start, who's earning opportunity, who's due to regress) as its primary job.

Advanced stats and general NFL data are still first-class — the depth is a core differentiator —
but they exist in service of the fantasy lens rather than alongside it. Think ESPN meets
nflfastR, led by fantasy: accessible enough for a casual fantasy player, deep enough for an
analytics nerd.

The product philosophy: free, fantasy-first advanced stats with fantasy-relevant framing baked
in from day one. Most NFL stats sites treat fantasy as an afterthought; we make it the default
view and the reason to come back.

**Long-term vision:** A platform as significant as Sleeper or Databallr, eventually
monetized through premium fantasy tools (league import, trade analyzer, waiver ranker),
B2B data licensing, and/or DFS tooling. With fun football knowledge games. None of that is in scope yet.

> **Key documents:** This file is the spec, scope, and conventions.
> [`ARCHITECTURE.md`](ARCHITECTURE.md) is the living map of *where everything lives* —
> every file and folder and what it controls, how the layers fit together, and a
> "where do I change…?" cheat sheet. Read it to orient in the codebase, and **keep it
> updated** as the project's structure changes (see the rule in "Notes for Claude Code").
> [`docs/ROADMAP.md`](docs/ROADMAP.md) holds the vision and milestone plan.

---

## Tech Stack

### Frontend
- **Framework:** React (Vite)
- **Styling:** Tailwind CSS
- **Charts/Visualizations:** Recharts (primary), D3.js (for custom visuals)
- **Routing:** React Router v6
- **State management:** React Query (server state), useState/useContext (UI state)
- **Package manager:** npm

### Backend
- **Framework:** FastAPI (Python)
- **ORM:** SQLAlchemy
- **Migrations:** Alembic
- **Package manager:** pip with requirements.txt (or uv if available)
- **Python version:** 3.11+

### Database
- **Primary:** PostgreSQL
- **Local:** PostgreSQL running locally
- **Hosted:** Supabase

### Data Pipeline
- **Primary library:** `nfl_data_py`
- **Language:** Python (standalone scripts in /pipeline)
- **Schedule:** Manual runs to start

### Hosting
- **Frontend:** Vercel
- **Backend:** Render or Railway
- **Database:** Supabase

---

## Project Structure

```
gridiron/
├── CLAUDE.md                  ← this file, always read first
├── README.md
├── .env.example               ← env var template, never commit .env
│
├── frontend/                  ← React app (completely standalone)
│   ├── public/
│   ├── src/
│   │   ├── components/        ← reusable UI components
│   │   │   ├── ui/            ← base components (buttons, inputs, tables)
│   │   │   └── charts/        ← reusable chart components
│   │   ├── pages/             ← top-level route pages
│   │   ├── hooks/             ← custom React hooks
│   │   ├── services/          ← API call functions (axios or fetch)
│   │   ├── utils/             ← formatters, helpers
│   │   ├── constants/         ← positions, seasons, metric definitions
│   │   └── App.jsx
│   ├── package.json
│   └── vite.config.js
│
├── backend/                   ← FastAPI app (completely standalone)
│   ├── app/
│   │   ├── main.py            ← FastAPI app entry point
│   │   ├── database.py        ← PostgreSQL connection, session management
│   │   ├── models/            ← SQLAlchemy ORM models
│   │   ├── schemas/           ← Pydantic request/response schemas
│   │   ├── routers/           ← API route handlers
│   │   │   ├── players.py
│   │   │   ├── teams.py
│   │   │   └── stats.py
│   │   └── utils/             ← shared backend utilities
│   ├── alembic/               ← database migrations
│   ├── requirements.txt
│   └── .env
│
└── pipeline/                  ← data ingestion scripts (standalone)
    ├── ingest_players.py
    ├── ingest_stats.py
    ├── ingest_schedules.py
    └── README.md              ← how to run the pipeline
```

---

## Database Schema

### Core Tables

> **Account tables (M5)** — `users`, `league_profiles`, `favorites`, `saved_views` —
> are defined in `backend/app/models/account.py` and documented in
> [`docs/design/M5-accounts-saved-state.md`](docs/design/M5-accounts-saved-state.md).
> They are a separate island: they reference `players`, nothing references them, and
> the pipeline never touches them. `users.user_id` is the Supabase Auth subject.

```sql
-- Teams
teams (
  team_id       SERIAL PRIMARY KEY,
  name          VARCHAR(100),        -- e.g. "Kansas City Chiefs"
  abbreviation  VARCHAR(5),          -- e.g. "KC"
  conference    VARCHAR(10),         -- "AFC" / "NFC"
  division      VARCHAR(20)          -- e.g. "AFC West"
)

-- Players
players (
  player_id     VARCHAR(50) PRIMARY KEY,  -- nfl_data_py player id
  name          VARCHAR(100),
  position      VARCHAR(5),               -- QB, RB, WR, TE
  team_id       INT REFERENCES teams(team_id),
  jersey_number INT,
  status        VARCHAR(20),              -- active, inactive, etc.
  headshot_url  VARCHAR(255)
)

-- Games
games (
  game_id       VARCHAR(50) PRIMARY KEY,  -- nfl_data_py game id
  season        INT,
  week          INT,
  season_type   VARCHAR(20),              -- REG, POST
  home_team_id  INT REFERENCES teams(team_id),
  away_team_id  INT REFERENCES teams(team_id),
  home_score    INT,
  away_score    INT,
  game_date     DATE
)

-- Player Stats (one row per player per game)
player_stats (
  stat_id           SERIAL PRIMARY KEY,
  player_id         VARCHAR(50) REFERENCES players(player_id),
  game_id           VARCHAR(50) REFERENCES games(game_id),
  team_id           INT REFERENCES teams(team_id),
  season            INT,
  week              INT,
  season_type       VARCHAR(20),

  -- General Stats
  passing_yards     INT,
  passing_tds       INT,
  interceptions     INT,
  completions       INT,
  attempts          INT,
  rushing_yards     INT,
  rushing_tds       INT,
  carries           INT,
  receiving_yards   INT,
  receiving_tds     INT,
  receptions        INT,
  targets           INT,
  fumbles           INT,
  fumbles_lost      INT,

  -- Advanced Stats
  epa                       FLOAT,   -- Expected Points Added
  cpoe                      FLOAT,   -- Completion % Over Expected (QB)
  air_yards                 FLOAT,   -- Total air yards on targets
  air_yards_share           FLOAT,   -- Share of team air yards
  target_share              FLOAT,   -- Share of team targets
  racr                      FLOAT,   -- Receiver Air Conversion Ratio
  wopr                      FLOAT,   -- Weighted Opportunity Rating
  snap_count                INT,
  snap_share                FLOAT,   -- % of team snaps played
  yards_after_catch         FLOAT,   -- YAC
  adot                      FLOAT,   -- Average Depth of Target
  passer_rating             FLOAT,
  rushing_epa               FLOAT,
  receiving_epa             FLOAT,
  red_zone_rush_share       FLOAT,   -- Share of team red zone rushing attempts
  red_zone_rush_attempts    INT,     -- Red zone rushing attempts
  red_zone_targets          INT,     -- Targets inside the red zone
  rush_att_inside_10        INT,     -- Rushing attempts inside the opponent's 10
  rush_att_inside_5         INT,     -- Rushing attempts inside the opponent's 5
  rush_att_inside_2         INT,     -- Rushing attempts inside the opponent's 2
  rush_attempt_share        FLOAT,   -- Share of team rushing attempts
  opportunity_share         FLOAT,   -- Share of team (carries + targets)
  market_share              FLOAT,   -- Share of team yards from scrimmage
  targets_per_route_run     FLOAT,   -- Targets divided by routes run
  slot_snaps                INT,     -- Snaps from slot alignment (always NULL — no free source)
  routes_run                INT,     -- Pass-play participation (see M2 design doc)
  route_participation       FLOAT,   -- % of team pass plays player ran a route
  unrealized_air_yards      FLOAT,   -- Air yards on incompletions (lost opportunity)
  yards_per_route_run       FLOAT,   -- Receiving yards divided by routes run
  yards_per_target          FLOAT,   -- Receiving yards divided by targets
  yards_per_reception       FLOAT,   -- Receiving yards divided by receptions

  -- Expected Stat Components (model estimates from nflverse ffopportunity)
  -- NOTE: store expected *components*, never expected fantasy points. Expected
  -- fantasy points are computed by the scoring engine from these components and the
  -- per-request scoring config, exactly like actual points — so the two are always
  -- comparable in the user's own league scoring.
  passing_yards_exp         FLOAT,
  passing_tds_exp           FLOAT,
  interceptions_exp         FLOAT,
  rushing_yards_exp         FLOAT,
  rushing_tds_exp           FLOAT,
  receiving_yards_exp       FLOAT,
  receiving_tds_exp         FLOAT,
  receptions_exp            FLOAT,
  two_point_conv_exp        FLOAT,

  -- Fantasy Stats
  fantasy_points_ppr        FLOAT,
  fantasy_points_half       FLOAT,
  fantasy_points_std        FLOAT,

  -- NOTE: fantasy_ppg_ppr, fantasy_ppg_half, fantasy_ppg_std, and routes_run_per_game
  -- are SEASON-LEVEL derived metrics. Do NOT store these as columns in this per-game table.
  -- Compute and expose them via the API by aggregating player_stats rows, not as stored columns.

  UNIQUE(player_id, game_id)
)

-- Target distribution by pass depth and direction (M4).
-- A different grain from player_stats, which is why it is its own table: air_yards is
-- stored there as a per-game total, and a total cannot be un-summed into buckets.
-- Direction is stored even though the shipped chart sums it away — it is one extra
-- group key on a play-by-play pass we already make, and adding it later would mean a
-- second migration and a second full backfill.
player_target_depth (
  player_id       VARCHAR(50) REFERENCES players(player_id),
  game_id         VARCHAR(50) REFERENCES games(game_id),
  depth_bucket    VARCHAR(20),   -- behind_los | short_0_9 | intermediate_10_19 | deep_20_plus
  direction       VARCHAR(10),   -- left | middle | right
  season          INT,
  week            INT,
  season_type     VARCHAR(20),
  targets         INT,
  receptions      INT,
  receiving_yards INT,
  receiving_tds   INT,
  air_yards       INT,
  PRIMARY KEY (player_id, game_id, depth_bucket, direction)
)
```

---

## Data Scope

- **Seasons:** 2020–2025 (regular season + playoffs)
- **Positions:** QB, RB, WR, TE
- **Source:** `nfl_data_py` (wraps nflverse data)

### Metric Categories

**General**
- Passing: yards, TDs, INTs, completions, attempts, passer rating
- Rushing: yards, TDs, carries, fumbles
- Receiving: yards, TDs, receptions, targets

**Advanced**
- EPA (Expected Points Added)
- CPOE (Completion Percentage Over Expected)
- Air yards, air yards share, ADOT
- Target share
- RACR (Receiver Air Conversion Ratio)
- WOPR (Weighted Opportunity Rating)
- Snap count / snap share
- Yards after catch (YAC)
- Rushing EPA
- Red Zone Rushing Share
- Red Zone Rushing Attempts
- Red Zone Targets
- Rushing Attempts Inside 10 / 5 / 2
- Rush Share, Opportunity Share, Market Share
- Targets Per Route Run
- Slot Snaps
- Routes Run
- Routes Run Per Game
- Route Participation
- Unrealized Air Yards
- Yards Per Route Run
- Yards Per Target
- Yards Per Reception
- High-Value Touches / Game — `(red_zone_targets + rush_att_inside_5) / games`
- Touches Per Snap — `(targets + carries) / snap_count`
- Target distribution by pass depth (behind LOS / 0–9 / 10–19 / 20+) and direction

**Fantasy**
- Fantasy points (PPR, Half-PPR, Standard, or any custom league scoring)
- Fantasy points per game (PPR, Half-PPR, Standard, or any custom league scoring)
- Expected fantasy points + expected PPG (scoring-aware, from expected components)
- Points over expected (actual − expected)

**Composite** (M4 — a registry `formula` string evaluated by `app/custom_metrics.py`.
The same engine can serve user-composed metrics via a `custom=` request config, but
that builder UI is deferred. See
[`docs/design/M4-exploration-viz.md`](docs/design/M4-exploration-viz.md))
- Any weighted sum of registry metrics over an optional divisor, e.g.
  `0.6*target_share+0.4*rush_attempt_share` or `fantasy_points/snap_count`
- Aggregated **first**, then combined — `Σyards / Σtargets`, never the mean of
  per-game ratios

**Insight** (M3 — derived at query time from a scoring config *and* a league config;
no stored columns. See [`docs/design/M3-fantasy-intelligence.md`](docs/design/M3-fantasy-intelligence.md))
- VORP + VORP per game (value over the last startable player at the position)
- Replacement level (that player's PPG, in your scoring and league)
- Fantasy Opportunity Rating (0–100)
- Positive-Regression Index (0–100, buy-low)
- Sell-High Index (0–100)
- TDs over expected, Efficiency vs career baseline, Usage trend

---

## MVP Feature Scope

> **The detailed, prioritized plan lives in [`docs/ROADMAP.md`](docs/ROADMAP.md)** —
> vision, differentiators, architecture spines, and per-milestone work. This section
> is the summary; keep the two in sync.

### Phase 1 — Shipped (the base stats platform)
1. Data ingestion pipeline (nflreadpy → PostgreSQL)
2. FastAPI endpoints for player stats, team stats, filtering
3. React frontend scaffold with routing and layout
4. Player stats leaderboard (filterable by position/season/week/metric)
5. Individual player profile page (stat line per game, season totals, charts)
6. Team leaderboard page
7. Basic search (find a player by name)

### Near-term — Fantasy-First Build (current focus)
Build order per ROADMAP. **Build the foundation before the features on top of it.**
- **M1 — Scoring & Metric Foundation** (✅ SHIPPED): scoring-aware fantasy engine (compute
  fantasy points from a per-request scoring config, not stored columns) + a single
  metric registry. Ships custom league scoring on the leaderboard.
- **M2 — Expanded Metrics & Expected Points** (✅ SHIPPED): scoring-aware expected
  fantasy points (`load_ff_opportunity` components through the same engine as actual
  points), market share (rush / opportunity / yards), rush attempts inside 10/5/2, and
  the snap + route usage columns that had been left NULL.
- **M3 — Fantasy Intelligence** (✅ SHIPPED): VORP, Fantasy Opportunity Rating,
  Positive-Regression Index, Sell-High Index — all computed at query time from
  percentile ranks within a position pool. Introduced **league context** (size +
  starting lineup) as a second per-request config alongside scoring, because value has
  to be measured against a league-specific replacement level.
- **M4 — Exploration & Viz** (✅ SHIPPED): a **curated** scatter builder (19 pre-canned
  charts across six position groups, players drawn as headshot bubbles), comparison
  builder (≤5 players: lead-margin table + trend + radar), enhanced player pages
  (usage-share and depth-of-target charts), and CSV export everywhere. The
  custom-metric **engine** ships (it evaluates the registry's `composite` metrics); its
  builder **UI** is deferred, as is PNG export until there's a brand to watermark with.

- **M5 — Accounts & Saved State** (✅ SHIPPED): email sign-in — **password *or* magic
  link**, no third-party account needed — via Supabase Auth, with
  FastAPI verifying the token and owning all account data. Ships **multiple named
  league profiles** (each a bundle of a scoring spec + a league spec), a **favorites
  watchlist** (star, filter, "My Players" tile), and **saved views** (any board,
  scatter, or comparison, stored as its route + query string). **Nothing is gated** —
  accounts are a sync/naming layer over the existing URL + `localStorage` state, and
  the URL still outranks the account so shared links never lie.

### Later phases (see ROADMAP for detail)
- **M6 — New data domains**: depth charts, strength of schedule, Vegas board, consensus
  projections (`load_ff_rankings`).
- **M7 — Games & growth**: college/name trivia, EPA draft, mock draft simulator.
- **Dream**: trade calculator (on VORP), GridironIQ + user-generated projection models,
  survivor pool, dynasty value + league import.

### Out of Scope — Do Not Build Yet
- Paywall / subscription system
- Native mobile app
- Email alerts
- Admin dashboard
- Route trees drawn from tracking data (no free data source — see ROADMAP "Cut ideas")
- Homemade projection models right now (consensus-first; own model is a later Dream item)

---

## API Design Principles

- All endpoints prefixed with `/api/v1/`
- Always return JSON
- Use query params for filtering: `?season=2024&week=1&position=WR`
- Paginate list endpoints: `?limit=50&offset=0`
- Return snake_case field names
- Include metadata in list responses: `{ data: [...], total: 100, page: 1 }`

### Key Endpoints (target)
```
GET /api/v1/players                          ← list/search players
GET /api/v1/players/{player_id}              ← player profile
GET /api/v1/players/{player_id}/stats        ← player game log
GET /api/v1/players/{player_id}/intelligence ← M3 scores + explanation breakdown
GET /api/v1/players/{player_id}/target-depth ← M4 targets by pass depth
GET /api/v1/stats/leaderboard                ← filterable leaderboard
GET /api/v1/stats/intelligence               ← M3 Insight board (VORP / FOR / buy / sell)
GET /api/v1/stats/scatter                    ← M4 any two metrics (UI offers presets only)
GET /api/v1/stats/compare                    ← M4 up to 5 players, position-intersected
GET /api/v1/metrics                          ← metric registry
GET /api/v1/teams                            ← all teams
GET /api/v1/teams/{team_id}/stats            ← team stats
GET /api/v1/games                            ← game schedule/results

# M5 — accounts. All require a verified Supabase token; none takes a user id.
GET/DELETE /api/v1/me                        ← profile + counts / delete account
CRUD       /api/v1/me/league-profiles        ← named scoring+league bundles
GET/PUT/DELETE /api/v1/me/favorites[/{id}]   ← watchlist (idempotent add/remove)
CRUD       /api/v1/me/saved-views            ← named route + query string

GET /api/v1/health                           ← API + DB liveness (Render health check)
GET /api/v1/health/auth                      ← is token verification wired? (issuer,
                                               JWKS URL, whether it is reachable).
                                               Public, non-secret — the diagnostic a
                                               401 deliberately withholds
```

Three per-request configs shape fantasy output, all parsed from compact spec strings:
- `scoring=preset[:overrides]` — e.g. `ppr`, `ppr:pass_td=6,te_rec=1.5` (see `app/scoring.py`)
- `league=teams[:slot=value]` — e.g. `12`, `10:rb=2,flex=2`, `12:superflex=1` (see `app/league.py`)
- `custom=name=formula[;…]` — e.g. `hvt=red_zone_targets+rush_att_inside_5/games`
  (see `app/custom_metrics.py`). A weighted sum over an optional divisor — **structured,
  never free-form arithmetic**, so there is no expression parser and no `eval`.

---

## Design Principles

- **Fantasy-first framing** — this is the identity, not a feature. Surface what every metric
  means for fantasy value; default to fantasy-relevant sorts, groupings, and defaults (e.g.
  fantasy points/PPG as the default leaderboard metric, fantasy metrics grouped ahead of raw
  ones). Raw and advanced numbers are always available, but the fantasy lens leads.
- **Liquid Glass, dark by default** — a frosted, translucent "Liquid Glass" surface
  system (Apple iOS 26 / Tahoe-style) with **two themes**: dark ("smoked graphite",
  the default) and light ("Clear"), toggled from the header and persisted in
  `localStorage`. High-contrast data in both. See
  [`docs/design/ui-theme-liquid-glass.md`](docs/design/ui-theme-liquid-glass.md).
- **Home = Command Center** — the home page (`/`) is a fantasy **Command Center**
  (a Bento dashboard that opens on "who's leading in your scoring"), *not* the
  leaderboard. Boards live in four nav dropdowns: **Insight** (`/insight/*` — VORP /
  Opportunity Rating / Buy Low / Sell High, the M3 derived signals, with both the
  scoring and league editors), **Explore** (`/explore/*` — the M4 Scatter and Compare
  builders, tools rather than ranked tables), **Fantasy Leaderboards** (`/fantasy/*` —
  Leaders / Expected Points / Passing / Receiving / Rushing, with the league-scoring
  editor) and **NFL Leaderboards** (`/nfl/*` — All / Passing / Receiving / Rushing,
  each General & Advanced, raw stats). All 17 boards plus the 2 Explore tools are
  configured in `frontend/src/constants/boards.js`; Insight is listed first — it is the
  reason to come back.
- **Data density** — show a lot of information without feeling cluttered
- **Fast** — tables should load quickly; use pagination, not infinite scroll dumps
- **Mobile responsive** — works on phone, optimized for desktop

### Color Palette
- **Electric green accent** (`--accent`) on frosted translucent surfaces over a
  colored "environment" — dark ("smoked graphite") and light ("Clear") themes.
  Colors are CSS variables (see `frontend/src/index.css`); never hardcode
  theme-dependent colors. The green is deliberately kept as the brand accent in
  both themes.
- Inspired by: **fotmob.com** (density) + Apple **Liquid Glass** (material).

### Typography
- **Inter** (primary) — clean, modern sans-serif for UI and data labels
- **Roboto Mono or JetBrains Mono** — for stat values and numbers to ensure alignment in tables

---

## Code Style & Conventions

### Python (Backend + Pipeline)
- Follow PEP 8
- Type hints on all functions
- Docstrings on all non-trivial functions
- No print statements in production code — use Python `logging`
- Environment variables via `python-dotenv`, never hardcoded

### JavaScript/React (Frontend)
- Functional components only, no class components
- Custom hooks for any reusable stateful logic
- Services layer for all API calls — never call fetch/axios directly in components
- Constants file for positions, seasons, metric labels/descriptions
- Descriptive variable names — no single letter variables outside of loops

### General
- Never commit `.env` files
- Always use environment variables for secrets and connection strings
- Write code that a new developer could understand without asking questions

---

## Environment Variables

### Backend (.env)
```
DATABASE_URL=postgresql://user:password@localhost:5432/gridiron
ENVIRONMENT=development
# Optional (M5). Unset = accounts disabled; the public API is unaffected.
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_JWT_SECRET=          # only for projects still signing HS256
```

### Frontend (.env)
```
VITE_API_BASE_URL=http://localhost:8000
# Optional (M5). Unset = no sign-in button, app otherwise identical.
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=       # the publishable anon key — never service_role
```

---

## Running Locally

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Pipeline (data ingestion)
```bash
cd pipeline
pip install -r requirements.txt
python ingest_players.py
python ingest_stats.py --seasons 2020 2021 2022 2023 2024 2025
```

---

## Current Status

- [x] Project scaffold created
- [x] Database schema created and migrated
- [x] Data pipeline built and run (players, games, stats ingested — 2020–2025)
- [x] FastAPI backend running with core endpoints
- [x] React frontend scaffold running
- [x] Player leaderboard page built (now split into Fantasy + NFL boards)
- [x] Player profile page built
- [x] Team leaderboard page built
- [x] Basic player search (header)
- [x] Command Center home page (`/`) — Bento dashboard; leaderboard moved off home
- [x] Liquid Glass UI theme — light ("Clear") / dark ("smoked graphite") + toggle
- [x] Leaderboard nav split — Fantasy Leaderboards ▾ + NFL Leaderboards ▾ (13 boards at
      the time; now 17 alongside the Insight ▾ dropdown added in M3)
- [x] M1 — Scoring & Metric Foundation: scoring-aware fantasy engine (`/metrics` registry
      + per-request scoring config), custom league scoring live on the leaderboard
- [x] M2 — Expanded Metrics & Expected Points: scoring-aware expected fantasy points
      (+ Expected Points board and expected-vs-actual player pages), market share,
      inside-10/5/2 carries, snap + route usage backfilled 2020–2025
      (see [`docs/design/M2-expanded-metrics.md`](docs/design/M2-expanded-metrics.md))
- [x] M4 — Exploration & Viz: a **curated** scatter builder (19 pre-canned charts
      across six position groups, players drawn as headshots) + a comparison builder
      (lead margins, not percentiles; metrics intersected across positions) in a
      fourth nav dropdown, **Explore ▾**; usage and target-depth charts on player
      pages; CSV export on every board. The custom-metric **engine** ships (`custom=`,
      a third per-request config) and defines two new built-in metrics — its
      **builder UI is deferred**. One new table, `player_target_depth`, backfilled
      2020–2025 locally *and on Supabase*
      (see [`docs/design/M4-exploration-viz.md`](docs/design/M4-exploration-viz.md))
- [x] M5 — Accounts & Saved State: Supabase email auth — password + magic link, token
      issuer only — verified by `app/auth.py`; four cascading tables (`users`, `league_profiles`, `favorites`,
      `saved_views`, migration `990003c7c7cf`); `/me` endpoints scoped entirely to the
      token subject; header account menu, profile bar on the scoring editor, watchlist
      star + server-side board filter, saved views, and a "My Players" tile. Also
      backfilled spine C: the 17 boards now keep their filters in the URL
      (see [`docs/design/M5-accounts-saved-state.md`](docs/design/M5-accounts-saved-state.md))
- [x] M3 — Fantasy Intelligence: VORP, Fantasy Opportunity Rating, Positive-Regression
      (buy-low) and Sell-High indices; league context (size + starting lineup) as a
      second per-request config; four Insight boards, player-page badges + a full
      explanation breakdown, and live signal tiles on the Command Center. No new DB
      columns — everything is query-time
      (see [`docs/design/M3-fantasy-intelligence.md`](docs/design/M3-fantasy-intelligence.md))
- [x] Backend test suite (`backend/tests/`, 150 tests) — the repo's first automated
      tests, started at the M5 auth boundary: token verification, JIT provisioning,
      cross-user isolation on every account endpoint, and the RLS lockdown. Run with
      `.venv/bin/python -m pytest` from `backend/`; it builds and drops its own
      `gridiron_test` database, so it never touches dev data. Runs on every pull
      request via `.github/workflows/backend-tests.yml`
      (see [`backend/tests/README.md`](backend/tests/README.md))
- [x] Deployed: Vercel (frontend) + Render (backend) + Supabase (database)
  - Frontend: https://gridiron-livid.vercel.app
  - Backend:  https://gridiron-api-t6hz.onrender.com
  - Auto-deploys on push to main

---

## Notes for Claude Code

- Always read this file at the start of every session before writing any code
- **Run the backend tests after touching `app/auth.py`, `app/routers/account.py`,
  `app/schemas/account.py`, or any migration** — `cd backend && .venv/bin/python -m
  pytest`. That is the one area where a bug means one user reading another user's data,
  which is why it is the part with tests. A new account endpoint needs an isolation test
  (user B gets a 404, never a 403) in `tests/test_cross_user_isolation.py`; a new
  migration means bumping `EXPECTED_HEAD` in `tests/test_harness.py`, and if it touches
  an account table, adding it to `tests/test_rls.py`
- **The test suite builds its schema by running the migrations, never
  `Base.metadata.create_all()`.** Keep it that way: the RLS lockdown (`8f73b5b2b1a1`)
  adds no table and no column, so a metadata-built schema would silently drop it and
  every test would still pass — see `tests/test_rls.py`
- **Keep [`ARCHITECTURE.md`](ARCHITECTURE.md) up to date.** It is the living map of the
  repo (what every file/folder is and controls). Whenever a change alters the project's
  structure — a new top-level file/folder, a new backend router/model/schema, a new
  frontend page/component/hook/service, a new pipeline script, a new env var, or a
  deployment change — update the relevant section of ARCHITECTURE.md in the *same*
  change, bump its "Last updated" date, and add a line to its changelog. Follow the
  "How this document is maintained" checklist at the bottom of that file.
- When in doubt about scope, refer to the "Out of Scope" section — do not build ahead
- Frontend and backend are fully decoupled — frontend talks to backend via HTTP only
- Prefer simple, readable solutions over clever ones
- When adding a new **stored** metric, add it to the database schema, the pipeline, the
  API response, AND the frontend constants file — all four places. **Derived** metrics
  (`derived` / `scoring` / `expected` / `intelligence` / `composite` aggregations) skip
  the schema and pipeline: they are a registry entry plus the code that computes them
  (`app/scoring.py`, `app/aggregation.py`, `app/intelligence.py`, or
  `app/custom_metrics.py`) plus the frontend constants
- A **`composite`** metric (M4) is the cheapest kind to add: one registry entry with a
  `formula` string (`"red_zone_targets+rush_att_inside_5/games"`), parsed at import time
  by `app/custom_metrics.py` and evaluated by the same engine that serves user-defined
  custom metrics. No other backend code. A typo fails at startup, not at request time
- `app/aggregation.py`'s `metric_expr()` is the **single** place a metric id becomes a
  SQL expression. Add a new aggregation kind there, not in a router — the leaderboard,
  the scatter, and the intelligence engine all depend on it agreeing with itself
- Insight scores (M3) are never stored. They depend on both the scoring config and the
  league config, so a stored score would need a row per context — the same reason M2
  stores expected *components* rather than expected points. All weights and thresholds
  live as documented constants at the top of `app/intelligence.py`
- The scoring grammar (`app/scoring.py`) and league grammar (`app/league.py`) each have
  a frontend mirror (`constants/scoring.js`, `constants/league.js`) — change both
  together, or a spec the editor builds will 400 on request. The custom-metric grammar
  (`app/custom_metrics.py`) has **no** mirror today: its builder UI was deferred, and
  the engine's only current job is evaluating the registry's `composite` metrics
- The **Scatter builder is curated, not open-ended** — users pick a position group and
  a question, never raw axes (`frontend/src/constants/scatters.js`). Two metrics chosen
  at random usually make a meaningless cloud; the curation *is* the feature. Adding a
  chart is one entry there, with no backend change
- The **Comparison table shows lead margins, not percentiles** — the leader's value plus
  how far clear they are of the runner-up. Direction comes from the registry's
  `higher_is_better`, so "leading" fumbles means the fewest. It also shows only metrics
  whose `applies_to` covers *every* compared position, so mixed-position comparisons
  never render empty rows
- Chart series colours come from the `--series-1..5` CSS tokens (a fixed categorical
  order, never cycled, keyed to the entity rather than its rank). They were validated
  for colour-vision separation and contrast against both themes' surfaces — adding a
  sixth hue means re-validating, not guessing. Never reuse `--accent`/`--pos`/`--neg`
  for a series: those carry meaning a series identity must not borrow
- **Accounts are a persistence layer, never a gate.** Nothing in the product requires
  signing in, and no account UI renders when signed out or when Supabase is
  unconfigured. Any new account-aware control must be invisible (or, if it aids
  discovery, disabled) rather than a prompt to sign up
- **`app/auth.py` must never learn how a user signed in.** It verifies whatever Supabase
  signs. That is why swapping Google OAuth for email auth cost one backend line; keep it
  that way, and add sign-in methods purely in `services/supabase.js` + `AuthDialog`
- **A modal opened from the header must be portalled to `document.body`.**
  `.glass-header`'s `backdrop-filter` makes it a containing block for `position: fixed`,
  so an overlay rendered inside it gets clipped to the header instead of the viewport
- **`SUPABASE_URL` / `VITE_SUPABASE_URL` are the *project* URL**, never one of the API
  endpoints shown beside it in the dashboard. A `/rest/v1` suffix breaks the frontend
  (auth calls land on PostgREST → `PGRST125`) and the backend (the JWKS lookup 404s →
  every signed-in request returns "Invalid or expired token"). Both now guard against
  it, but the failures are opaque — check `GET /api/v1/health/auth` first
- **A rejected token never says *why*, so don't infer config health from a 401.** Bad
  signature, unreachable JWKS, and wrong issuer are one response by design.
  `PyJWKClientError` subclasses `PyJWTError`, so a probe with a forged token returning
  "Invalid or expired token" proves only that it was rejected — **not** that
  verification is wired correctly. `GET /api/v1/health/auth` is what answers that
- **The URL outranks the account.** Scoring/league resolve
  `URL > active profile > localStorage > default`. Never invert this: a shared link
  carrying `?scoring=` has to show the sender's league to whoever opens it
- **No account endpoint may accept a user id.** The id comes from the verified token
  and nowhere else, so no request shape can reach another user's rows. Filter every
  lookup on `user_id` *and* the primary key, so a guessed id 404s like a missing one
- ⚠️ **Any new table holding user data must enable RLS in its migration** (see
  `8f73b5b2b1a1`). Supabase serves the whole `public` schema through PostgREST, and its
  default privileges grant the public `anon` key access — so a user-data table without
  RLS is world-readable *and writable*, bypassing the API entirely. The backend connects
  as the table owner and bypasses RLS, so this costs nothing. Create **no policies**:
  a policy is the first step toward the browser talking to the database directly, which
  this architecture rejects. NFL reference tables are exempt (public read-only data)
- **Board filters belong in the URL** (`useUrlState`), not `useState` — that is what
  makes a board link shareable and a saved view worth saving. Keep defaults out of the
  query string, and pass a whitelist for anything the API would reject
- A **watchlist filter narrows output only on the Insight boards.** Those scores are
  percentiles within a position pool, so filtering before scoring would silently
  redefine what a percentile means. On the leaderboard it goes in the SQL
- The pipeline scripts should be idempotent — safe to run multiple times without
  duplicating data (use INSERT ... ON CONFLICT DO UPDATE)
- fantasy_ppg_ppr, fantasy_ppg_half, fantasy_ppg_std, and routes_run_per_game are
  SEASON-LEVEL derived metrics — compute these in the API by aggregating player_stats
  rows (e.g. SUM(fantasy_points_ppr) / COUNT(game_id)), never store them as columns
  in the player_stats table
- red_zone_rush_share is a derived metric — calculate it during ingestion as a player's
  red_zone_rush_attempts divided by team total red_zone_rush_attempts for that game;
  do not look for a column by this name in nfl_data_py
