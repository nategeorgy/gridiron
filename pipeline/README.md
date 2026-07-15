# GridironIQ Data Pipeline

Ingests nflverse data into PostgreSQL via [`nflreadpy`](https://github.com/nflverse/nflreadpy).
All scripts are **idempotent** (`INSERT ... ON CONFLICT DO UPDATE`) — safe to
re-run.

## Setup

```bash
cd pipeline
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp ../.env.example .env        # or ensure DATABASE_URL points at your Postgres
```

The database schema must already be migrated (see `backend/` → `alembic upgrade head`).

## Run order

Scripts must run in dependency order — players, games, and stats resolve team
abbreviations and foreign keys created by earlier steps.

```bash
.venv/bin/python ingest_teams.py                       # 1. teams (run first)
.venv/bin/python ingest_players.py                     # 2. players (QB/RB/WR/TE)
.venv/bin/python ingest_schedules.py --seasons 2024    # 3. games
.venv/bin/python ingest_stats.py --seasons 2024        # 4. per-game stats
```

Full backfill (project scope is 2020–2025):

```bash
.venv/bin/python ingest_schedules.py --seasons 2020 2021 2022 2023 2024 2025
.venv/bin/python ingest_stats.py     --seasons 2020 2021 2022 2023 2024 2025
```

`ingest_stats.py` downloads play-by-play to derive red-zone metrics. Pass
`--skip-red-zone` to skip that (faster, leaves red-zone columns NULL).

## Column coverage

`ingest_stats.py` populates:

- **General** — passing / rushing / receiving lines, fumbles
- **Advanced (direct from weekly data)** — epa, cpoe, air_yards, air_yards_share,
  target_share, racr, wopr, yards_after_catch, rushing_epa, receiving_epa
- **Advanced (derived)** — adot, passer_rating, yards_per_target,
  yards_per_reception
- **Advanced (from play-by-play)** — red_zone_rush_attempts, red_zone_targets,
  red_zone_rush_share
- **Fantasy** — fantasy_points_std / _ppr / _half

### Left NULL — pending a Phase 4b enrichment pass

These come from separate feeds (PFR advanced stats, Next Gen Stats, snap counts)
that join on non-GSIS player IDs:

`snap_count`, `snap_share`, `routes_run`, `route_participation`,
`targets_per_route_run`, `yards_per_route_run`, `slot_snaps`,
`unrealized_air_yards`.

Season-level derived metrics (`fantasy_ppg_*`, `routes_run_per_game`) are **not**
stored here — they are computed in the API by aggregating these per-game rows.
