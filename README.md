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
- **Python 3.12** — for `backend/` and `pipeline/` (already set up in each `.venv`)
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
cd gridiron/backend
.venv/bin/uvicorn app.main:app --reload --port 8000
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

# Backend deps + database schema
cd backend && python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/alembic upgrade head

# Pipeline deps + data ingestion (see pipeline/README.md for details)
# Run in this order — each step depends on the rows the previous one wrote.
cd ../pipeline && python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python ingest_teams.py
.venv/bin/python ingest_players.py
.venv/bin/python ingest_schedules.py --seasons 2020 2021 2022 2023 2024 2025
.venv/bin/python ingest_stats.py     --seasons 2020 2021 2022 2023 2024 2025
.venv/bin/python ingest_expected.py  --seasons 2020 2021 2022 2023 2024 2025
.venv/bin/python ingest_usage.py     --seasons 2020 2021 2022 2023 2024 2025

# Frontend deps
cd ../frontend && npm install
```

> **Don't skip the last two.** `ingest_expected.py` (expected components + market
> share) and `ingest_usage.py` (snaps + routes) fill columns the Expected Points
> board and *every* Insight score depend on. Skip them and those pages render
> empty rather than erroring — a confusing failure to debug.

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

**Next up: M4 — Exploration & Viz** (scatter builder, player comparison, richer
player-page charts, export). See [`docs/ROADMAP.md`](./docs/ROADMAP.md) for the
full plan and [`CLAUDE.md`](./CLAUDE.md) for detailed status.
