# GridironIQ

Fantasy-first NFL analytics. Free advanced stats framed around fantasy value —
every metric answers a fantasy question — in a clean, fast, dark-mode interface.

See [`CLAUDE.md`](./CLAUDE.md) for the full product spec, schema, and scope.

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
cd ../pipeline && python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python ingest_teams.py
.venv/bin/python ingest_players.py
.venv/bin/python ingest_schedules.py --seasons 2020 2021 2022 2023 2024 2025
.venv/bin/python ingest_stats.py     --seasons 2020 2021 2022 2023 2024 2025

# Frontend deps
cd ../frontend && npm install
```

> **Your data persists.** Postgres data lives in the `gridiron_pgdata` Docker
> volume, so it survives reboots and `docker compose down`. The only command
> that wipes it is `docker compose down -v` (with `-v`) — avoid that flag and
> you never need to re-run the pipeline.

## Status

Phase 1 MVP is feature-complete locally: data pipeline, FastAPI API, and a
React UI with a player leaderboard, player profiles, a team leaderboard, and
player search. Next up: deployment (Vercel + Render/Railway + Supabase).
Track detailed progress in `CLAUDE.md`.
