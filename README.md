# GridironIQ

Advanced NFL analytics — the "Baseball Savant for the NFL." Free advanced stats
with fantasy-relevant framing, in a clean, fast, dark-mode interface.

See [`CLAUDE.md`](./CLAUDE.md) for the full product spec, schema, and scope.

## Architecture

Three fully decoupled apps (frontend talks to backend over HTTP only):

| Directory    | Stack                              | Purpose                                  |
| ------------ | ---------------------------------- | ---------------------------------------- |
| `frontend/`  | React (Vite) + Tailwind + Recharts | Public stats UI                          |
| `backend/`   | FastAPI + SQLAlchemy + Alembic     | JSON API over PostgreSQL                 |
| `pipeline/`  | Python + `nfl_data_py`             | Ingests nflverse data into PostgreSQL    |

## Prerequisites

- **Docker Desktop** — runs the local PostgreSQL instance
- **Python 3.12** — recommended for `backend/` and `pipeline/`
  (avoid 3.13/3.14: `nfl_data_py`'s pandas/numpy/pyarrow deps often lag new releases)
- **Node 20+** — for the Vite frontend

## Getting started

### 1. Start the database

```bash
docker compose up -d      # Postgres 16 on localhost:5432
docker compose ps         # confirm the "db" service is healthy
```

Credentials (local dev): user `gridiron` / password `gridiron` / db `gridiron`.

### 2. Configure environment

```bash
cp .env.example backend/.env      # then edit as needed
cp .env.example frontend/.env
```

### 3. Backend, pipeline, frontend

Setup for each app lands in the sections below as they are built out
(migrations, ingestion, and the React scaffold are the next steps).

## Status

Repo skeleton + local Postgres are in place. Next: SQLAlchemy models + Alembic
migration, then the ingestion pipeline. Track progress in `CLAUDE.md`.
