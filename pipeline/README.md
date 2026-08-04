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
.venv/bin/python ingest_expected.py --seasons 2024     # 5. expected + market share
.venv/bin/python ingest_usage.py --seasons 2024        # 6. snaps + routes
.venv/bin/python ingest_target_depth.py --seasons 2024 # 7. target depth (M4)
```

Steps 5–7 are **enrichment passes**: they only touch player-games step 4 already
created, so they must run after it (in any order among themselves).

Full backfill (project scope is 2020–2025):

```bash
.venv/bin/python ingest_schedules.py --seasons 2020 2021 2022 2023 2024 2025
.venv/bin/python ingest_stats.py     --seasons 2020 2021 2022 2023 2024 2025
.venv/bin/python ingest_expected.py  --seasons 2020 2021 2022 2023 2024 2025
.venv/bin/python ingest_usage.py     --seasons 2020 2021 2022 2023 2024 2025
.venv/bin/python ingest_target_depth.py --seasons 2020 2021 2022 2023 2024 2025
```

`ingest_stats.py` downloads play-by-play to derive red-zone, inside-10/5/2, and
unrealized-air-yard metrics. Pass `--skip-pbp` to skip that (faster, leaves those
columns NULL). `ingest_usage.py --skip-routes` does snaps only, skipping the
participation + play-by-play download.

## Column coverage

`ingest_stats.py` populates:

- **General** — passing / rushing / receiving lines, fumbles
- **Advanced (direct from weekly data)** — epa, cpoe, air_yards, air_yards_share,
  target_share, racr, wopr, yards_after_catch, rushing_epa, receiving_epa
- **Advanced (derived)** — adot, passer_rating, yards_per_target,
  yards_per_reception
- **Advanced (from play-by-play)** — red_zone_rush_attempts, red_zone_targets,
  red_zone_rush_share, rush_att_inside_10 / _5 / _2, unrealized_air_yards
- **Fantasy** — fantasy_points_std / _ppr / _half

`ingest_expected.py` populates:

- **Expected components** — passing_yards_exp, passing_tds_exp, interceptions_exp,
  rushing_yards_exp, rushing_tds_exp, receiving_yards_exp, receiving_tds_exp,
  receptions_exp, two_point_conv_exp. These are *model estimates* (nflverse
  ffopportunity), and the API flags them as `modelled` so the UI labels them.
  Expected fantasy **points** are never stored — the backend computes them from these
  components and the requested league scoring.
- **Market share** — rush_attempt_share, opportunity_share, market_share

`ingest_usage.py` populates:

- **Snaps** (PFR, via a pfr_id → gsis_id crosswalk) — snap_count, snap_share
- **Routes** (participation × play-by-play) — routes_run, route_participation, and the
  derived targets_per_route_run, yards_per_route_run

> **`routes_run` is pass-play participation, not charted routes.** A back who stays in
> to block counts as having run a route, so routes are slightly overstated (and TPRR
> slightly understated) for run-blocking backs and tight ends. Accurate for receivers.
> QBs are skipped. See `docs/design/M2-expanded-metrics.md` §3.

`ingest_target_depth.py` populates the **`player_target_depth` table** (not columns on
`player_stats` — the grain is different):

- One row per (player, game, depth bucket, direction), with targets, receptions,
  receiving_yards, receiving_tds, and air_yards.
- Buckets are `behind_los` (< 0 air yards), `short_0_9`, `intermediate_10_19`,
  `deep_20_plus`; directions are `left` / `middle` / `right`.
- Direction is stored even though the shipped depth-of-target chart sums it away —
  it costs one extra group key on a play-by-play pass we already make, and adding it
  later would mean a second migration and a second full backfill.

> A target is counted only when the play has both a receiver id and an air-yards value.
> That excludes ~10% of *pass plays* (sacks, scrambles, throwaways) but those are not
> targets at all: bucketed targets reconcile **exactly** against `player_stats`
> (2024: 16,903 = 16,903). See `docs/design/M4-exploration-viz.md` §5.

### Left NULL — no free data source

`slot_snaps`. Per-player alignment isn't published by any free nflverse feed —
participation carries formation and personnel groupings but not who lined up where,
PFR advanced receiving has no alignment column, and FTN charting is play-level with no
player attribution.

Season-level derived metrics (`fantasy_ppg_*`, `routes_run_per_game`) are **not**
stored here — they are computed in the API by aggregating these per-game rows.
