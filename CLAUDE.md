# GridironIQ — Claude Code Project Instructions

## Project Overview

GridironIQ is an advanced NFL analytics web application — the "Baseball Savant for the NFL." or the "databallr for the NFL."
The goal is a clean, fast, beautifully designed public-facing stats platform where football
fans and fantasy managers can explore advanced metrics that are otherwise scattered across
fragmented, poorly designed sites.

The product philosophy: free advanced stats with fantasy-relevant framing baked in from day
one. Think ESPN meets nflfastR — accessible enough for a casual fantasy player, deep enough
for an analytics nerd.

**Long-term vision:** A platform as significant as Sleeper or Databallr, eventually
monetized through premium fantasy tools (league import, trade analyzer, waiver ranker),
B2B data licensing, and/or DFS tooling. With fun football knowledge games. None of that is in scope yet.

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
  targets_per_route_run     FLOAT,   -- Targets divided by routes run
  slot_snaps                INT,     -- Snaps taken from slot alignment
  routes_run                INT,     -- Total routes run
  route_participation       FLOAT,   -- % of team pass plays player ran a route
  unrealized_air_yards      FLOAT,   -- Air yards on incompletions (lost opportunity)
  yards_per_route_run       FLOAT,   -- Receiving yards divided by routes run
  yards_per_target          FLOAT,   -- Receiving yards divided by targets
  yards_per_reception       FLOAT,   -- Receiving yards divided by receptions

  -- Fantasy Stats
  fantasy_points_ppr        FLOAT,
  fantasy_points_half       FLOAT,
  fantasy_points_std        FLOAT,

  -- NOTE: fantasy_ppg_ppr, fantasy_ppg_half, fantasy_ppg_std, and routes_run_per_game
  -- are SEASON-LEVEL derived metrics. Do NOT store these as columns in this per-game table.
  -- Compute and expose them via the API by aggregating player_stats rows, not as stored columns.

  UNIQUE(player_id, game_id)
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
- Targets Per Route Run
- Slot Snaps
- Routes Run
- Routes Run Per Game
- Route Participation
- Unrealized Air Yards
- Yards Per Route Run
- Yards Per Target
- Yards Per Reception

**Fantasy**
- Fantasy points (PPR, Half-PPR, Standard)
- Fantasy points per game (PPR, Half-PPR, Standard)

---

## MVP Feature Scope

### In Scope — Phase 1 (Build This First)
1. Data ingestion pipeline (nfl_data_py → PostgreSQL)
2. FastAPI endpoints for player stats, team stats, filtering
3. React frontend scaffold with routing and layout
4. Player stats leaderboard (filterable by position/season/week/metric)
5. Individual player profile page (stat line per game, season totals, charts)
6. Team leaderboard page
7. Basic search (find a player by name)

### Out of Scope — Do Not Build Yet
- User authentication / accounts
- Games
- Fantasy league importing (Sleeper, ESPN, Yahoo APIs)
- Trade analyzer
- Waiver wire ranker
- Paywall / subscription system
- Mobile app
- DFS optimizer
- Email alerts
- Admin dashboard

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
GET /api/v1/stats/leaderboard                ← filterable leaderboard
GET /api/v1/teams                            ← all teams
GET /api/v1/teams/{team_id}/stats            ← team stats
GET /api/v1/games                            ← game schedule/results
```

---

## Design Principles

- **Dark mode first** — dark background, high contrast data
- **Data density** — show a lot of information without feeling cluttered
- **Fast** — tables should load quickly; use pagination, not infinite scroll dumps
- **Fantasy-relevant framing** — surface what metrics mean for fantasy value,
  not just raw numbers
- **Mobile responsive** — works on phone, optimized for desktop

### Color Palette
- **dark navy background, electric green accent, white text**
- Inspired by: **fotmob.com**

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
```

### Frontend (.env)
```
VITE_API_BASE_URL=http://localhost:8000
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
- [x] Player leaderboard page built
- [x] Player profile page built
- [x] Team leaderboard page built
- [x] Basic player search (header)
- [ ] Deployed to Vercel (frontend) + Render/Railway (backend)

---

## Notes for Claude Code

- Always read this file at the start of every session before writing any code
- When in doubt about scope, refer to the "Out of Scope" section — do not build ahead
- Frontend and backend are fully decoupled — frontend talks to backend via HTTP only
- Prefer simple, readable solutions over clever ones
- When adding a new metric, add it to the database schema, the pipeline, the API
  response, AND the frontend constants file — all four places
- The pipeline scripts should be idempotent — safe to run multiple times without
  duplicating data (use INSERT ... ON CONFLICT DO UPDATE)
- fantasy_ppg_ppr, fantasy_ppg_half, fantasy_ppg_std, and routes_run_per_game are
  SEASON-LEVEL derived metrics — compute these in the API by aggregating player_stats
  rows (e.g. SUM(fantasy_points_ppr) / COUNT(game_id)), never store them as columns
  in the player_stats table
- red_zone_rush_share is a derived metric — calculate it during ingestion as a player's
  red_zone_rush_attempts divided by team total red_zone_rush_attempts for that game;
  do not look for a column by this name in nfl_data_py
