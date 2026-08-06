# GridironIQ

Fantasy-first NFL analytics. Free advanced stats framed around fantasy value —
every metric answers a fantasy question, recomputed in **your league's exact
scoring and lineup** — in a clean, fast interface with light and dark themes.

**Live:** [gridiron-livid.vercel.app](https://gridiron-livid.vercel.app) ·
API [gridiron-api-t6hz.onrender.com](https://gridiron-api-t6hz.onrender.com/docs)

See [`CLAUDE.md`](./CLAUDE.md) for the full product spec, schema, and scope,
[`ARCHITECTURE.md`](./ARCHITECTURE.md) for where everything lives, and
[`docs/ROADMAP.md`](./docs/ROADMAP.md) for the milestone plan.

## Architecture

Three fully decoupled apps (frontend talks to backend over HTTP only):

| Directory    | Stack                              | Purpose                                  |
| ------------ | ---------------------------------- | ---------------------------------------- |
| `frontend/`  | React (Vite) + Tailwind + Recharts | Public stats UI                          |
| `backend/`   | FastAPI + SQLAlchemy + Alembic     | JSON API over PostgreSQL                 |
| `pipeline/`  | Python + `nflreadpy`               | Ingests nflverse data into PostgreSQL    |

## Prerequisites

- **Docker Desktop** — runs the local PostgreSQL instance
- **Python 3.12** — for `backend/` and `pipeline/`, which share one `.venv/` at the
  repo root. Use 3.12 specifically: `psycopg2-binary` has no wheels for 3.13+ and
  building it from source needs `pg_config` on your PATH.
- **Node 20+** — for the Vite frontend

## Running locally

Everything below is already installed and the database already holds the
2020–2025 dataset, so day-to-day you only need to **start the three services**.
Open three terminals:

### 1. Database

Make sure Docker Desktop is running, then:

```bash
cd gridiron
docker compose up -d          # starts Postgres 16; no-op if already running
```

Credentials (local dev): user `gridiron` / password `gridiron` / db `gridiron`
on `localhost:5432`.

### 2. Backend

```bash
cd gridiron/backend && ../.venv/bin/uvicorn app.main:app --reload --port 8000
```

`--reload` auto-restarts on code edits. Docs at http://localhost:8000/docs.

### 3. Frontend

```bash
cd gridiron/frontend
npm run dev                   # http://localhost:5173
```

### Sanity check

```bash
curl localhost:8000/api/v1/health     # {"status":"ok","database":"connected"}
```

Then open http://localhost:5173. Edit code → both servers hot-reload → refresh.

## First-time / from-scratch setup

Only needed on a fresh machine (the steps above are enough day-to-day):

```bash
# Env files
cp .env.example backend/.env
cp .env.example frontend/.env

# One virtualenv at the repo root, shared by backend/ and pipeline/
python3.12 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt -r pipeline/requirements.txt

# Database schema
cd backend && ../.venv/bin/alembic upgrade head

# Data ingestion (see pipeline/README.md for details)
# Run in this order — each step depends on the rows the previous one wrote.
cd ../pipeline
../.venv/bin/python ingest_teams.py
../.venv/bin/python ingest_players.py
../.venv/bin/python ingest_schedules.py     --seasons 2020 2021 2022 2023 2024 2025
../.venv/bin/python ingest_stats.py         --seasons 2020 2021 2022 2023 2024 2025
../.venv/bin/python ingest_expected.py      --seasons 2020 2021 2022 2023 2024 2025
../.venv/bin/python ingest_usage.py         --seasons 2020 2021 2022 2023 2024 2025
../.venv/bin/python ingest_target_depth.py  --seasons 2020 2021 2022 2023 2024 2025

# Frontend deps
cd ../frontend && npm install
```

> **Don't skip the last three.** `ingest_expected.py` (expected components +
> market share), `ingest_usage.py` (snaps + routes), and `ingest_target_depth.py`
> (targets by pass depth) fill the columns and table that the Expected Points
> board, *every* Insight score, and the player-page depth chart depend on. Skip
> them and those pages render empty rather than erroring — a confusing failure to
> debug.

> **Your data persists.** Postgres data lives in the `gridiron_pgdata` Docker
> volume, so it survives reboots and `docker compose down`. The only command
> that wipes it is `docker compose down -v` (with `-v`) — avoid that flag and
> you never need to re-run the pipeline.

## Status

**Deployed and live** — frontend on Vercel, API on Render, database on Supabase.
Both auto-deploy on push to `main`.

Shipped so far:

| | |
| --- | --- |
| **Phase 1** | Data pipeline (2020–2025), FastAPI API, player + team leaderboards, player profiles, search, the Liquid Glass theme, and the Command Center home |
| **M1** | Scoring-aware fantasy engine — every fantasy number recomputes to your exact league scoring, from a single metric registry |
| **M2** | Expected fantasy points (scoring-aware), market share, goal-line carries, snap + route usage |
| **M3** | Fantasy intelligence — VORP, Fantasy Opportunity Rating, Buy-Low and Sell-High indices, plus league context (size + starting lineup) |
| **M4** | Exploration & viz — a curated scatter builder (19 charts across six position groups, players drawn as headshots), a comparison builder (up to 5 players, showing who leads each stat and by how much), usage and target-depth charts on player pages, and CSV export everywhere |
| **M5** | Accounts & saved state — sign in with an email and password, or just have a link emailed to you, to keep **multiple named league profiles**, a **watchlist** of players (star them, filter any board to them, see them on the home page), and **saved views** of any board or chart. Nothing is behind a login: every page and share link works signed out exactly as before |

**Next up: M6 — New Data Domains** (depth charts, strength of schedule, a Vegas
board, and consensus projections). See [`docs/ROADMAP.md`](./docs/ROADMAP.md) for
the full plan and [`CLAUDE.md`](./CLAUDE.md) for detailed status.
