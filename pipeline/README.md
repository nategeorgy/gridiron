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
.venv/bin/python ingest_teams.py                       # 1. teams (run first, 32 of 36)
.venv/bin/python ingest_players.py                     # 2. players (QB/RB/WR/TE + bio)
.venv/bin/python ingest_schedules.py --seasons 2024    # 3. games + betting lines
.venv/bin/python ingest_stats.py --seasons 2024        # 4. per-game stats
.venv/bin/python ingest_expected.py --seasons 2024     # 5. expected + market share
.venv/bin/python ingest_usage.py --seasons 2024        # 6. snaps + routes
.venv/bin/python ingest_target_depth.py --seasons 2024 # 7. target depth (M4)
.venv/bin/python ingest_rankings.py                    # 8. consensus rankings (M6)
.venv/bin/python ingest_depth_charts.py                # 9. depth charts (M6)
```

Steps 8 and 9 are independent of 4–7 — they need only `players` (and `teams`) — but
must follow step 2.

`--seasons` is optional. Left off, each script asks `seasons.py` for its range, and
**the ranges are different on purpose**. Two things vary:

- **Which clock bounds it above.** `ingest_schedules.py` runs on the *roster* clock
  (through the upcoming season — next year's fixtures are published in spring) while
  the stat scripts run on the *stats* clock (through the last season played). Ask a
  stat script for a season that hasn't kicked off and it skips it with a warning
  rather than failing the run — which is what lets the scheduled refresh below run all
  summer without erroring.
- **Where the feed starts.** Project scope reaches back to 1999, but each feed has its
  own floor and several **raise** below it rather than returning empty:
  play-by-play 1999, depth charts 2001, ffopportunity 2006, snap counts 2013,
  participation 2016 (and it *ends* a season early — nflverse no longer publishes it).
  `clamp_seasons()` clamps both ends against a `Feed`, so asking any script for 1999
  is safe and simply logs what it skipped.

Note that a feed serving a season is not the same as that season having usable data —
see **Column coverage** below and `availability.py`.

Steps 5–7 are **enrichment passes**: they only touch player-games step 4 already
created, so they must run after it (in any order among themselves).

Full backfill (project scope starts at **1999** and runs to the current season). Each
script clamps to its own feed's window, so the same range can be passed to all of them:

```bash
.venv/bin/python ingest_schedules.py    # all seasons in one file; no --seasons needed
.venv/bin/python ingest_stats.py        --seasons $(seq 1999 2025)
.venv/bin/python ingest_expected.py     --seasons $(seq 1999 2025)
.venv/bin/python ingest_usage.py        --seasons $(seq 1999 2025)
.venv/bin/python ingest_target_depth.py --seasons $(seq 1999 2025)
```

`ingest_stats.py` downloads a season of play-by-play at a time, so a full backfill is
best run in chunks of four or five seasons rather than as one call.

### Scheduled refresh

`.github/workflows/pipeline.yml` runs this against production on a schedule, so the
perishable domains don't go stale: **rosters + schedule daily** (the schedule feed is
where betting lines arrive and move) and the **stats chain on Wednesdays in-season**,
once Monday night has been played and Tuesday's official stat corrections have landed.
It refreshes only the current season — the backfill above stays a one-off, since
re-downloading years of play-by-play weekly would rewrite numbers that cannot change.
Needs the `PIPELINE_DATABASE_URL` repo secret.

Rankings run **daily** despite the consensus only moving weekly: the upstream file is a
snapshot overwritten in place, so a scrape we miss is gone for good. A duplicate day
writes nothing new (the snapshot date is part of the key); a missed week is a permanent
hole in the history.

`ingest_stats.py` downloads play-by-play to derive red-zone, inside-10/5/2, and
unrealized-air-yard metrics. Pass `--skip-pbp` to skip that (faster, leaves those
columns NULL). `ingest_usage.py --skip-routes` does snaps only, skipping the
participation + play-by-play download.

## Column coverage

⚠️ **Populated is not the same as available in every season** (M8). The feeds report a
stat nobody measured as `0`, not as missing — a 2004 receiver with 90 catches arrives
carrying `targets = 0`. `availability.py` holds the measured window for every
restricted column and `mask_unavailable()` NULLs the rest at ingest, so the database
never stores a zero that means "never recorded". The short version: the box score,
fantasy points, EPA and all rushing detail reach 1999; charted passing starts 2006,
snaps 2013, routes 2016–2025, expected points 2009, and **targets are unrecoverable
2003–2008**. Full audit in
[`docs/design/M8-historical-depth.md`](../docs/design/M8-historical-depth.md).

`ingest_stats.py` populates:

- **General** — passing / rushing / receiving lines, fumbles
- **Advanced (direct from weekly data)** — epa, cpoe, air_yards, air_yards_share,
  target_share, racr, wopr, yards_after_catch, rushing_epa, receiving_epa
- **Advanced (derived)** — adot, passer_rating, yards_per_target,
  yards_per_reception
- **Advanced (from play-by-play)** — red_zone_rush_attempts, red_zone_targets,
  red_zone_rush_share, rush_att_inside_10 / _5 / _2, unrealized_air_yards
- **Fantasy** — fantasy_points_std / _ppr / _half

`ingest_players.py` populates, beyond identity:

- **Roster bio** (M6) — birth_date, height, weight, college_name, college_conference,
  draft_year, draft_round, draft_pick, draft_team, rookie_season, years_of_experience.
  `load_players` publishes 39 columns and this script kept 7 until M6; age and draft
  capital are draft-board inputs. The feed is a *current* view (`latest_team`), so
  re-running is how the roster follows free agency and the draft.

`ingest_schedules.py` populates, beyond the schedule and result:

- **Betting market** (M6) — spread_line, total_line, home_moneyline, away_moneyline,
  over_odds, under_odds. Populated for finished games (closing lines) *and* upcoming
  ones, which is why the Vegas board needs no external odds API. NULL beyond roughly 13
  weeks out, because the market has not priced those games yet — a real state, not
  missing data. `spread_line` is from the **home team's** perspective: positive means
  the home team is favoured.
- **Game context** (M6) — roof, surface, div_game.

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

`ingest_rankings.py` populates the **`player_rankings` table** (M6):

- One row per (player, source, ranking type, season, week, scrape date) — expert
  consensus rank (`ecr`) plus its dispersion (`sd`, `best`, `worst`), `rank_delta`, and
  `player_owned_avg`. Draft rankings carry week 0.
- **Rankings, not projections.** `load_ff_rankings` publishes no projected points and no
  ADP, so there is nothing here to run through the scoring engine — the Draft Value
  Board treats a rank as the market's opinion and contrasts it with our own valuation
  rather than restating it in the user's scoring.
- All 18 skill-position variants are stored (redraft / dynasty / best-ball, overall and
  per-position, plus the superflex "op" boards) — about 4.3k rows, smaller than a single
  week of `player_stats`. The board picks the variant matching the user's league.
- The join to `gsis_id` runs through `load_ff_playerids`, with a normalised
  name + position fallback. Unmatched players are **named** in the log rather than
  counted: a miss inside the top 50 is a hole in the board, a miss at rank 340 is a
  college player who has never taken an NFL snap. On the 2026 board, 0 of the top 200
  were unmatched.

`ingest_teams.py` writes **35 of the 36 rows `load_teams()` publishes**. The feed
carries historical franchise codes beside current ones — LAR beside LA, OAK beside LV,
SD beside LAC, STL beside LA. The filter asks the **schedule** which teams play the
seasons in scope rather than holding a list of abbreviations to exclude, and M8 is the
payoff for that choice: widening scope to 1999 brought OAK, SD and STL back on its own,
because they really did play those seasons, while LAR — a pure alias that appears in no
schedule — stayed out. A hardcoded exclusion list would have needed editing, and an
older one would have left St. Louis missing from seventeen seasons it played.

Because the table now spans eras, **any surface that ranks teams must filter by season**
— a real team can have no fixtures in the season being asked about. SOS and the team
leaderboard already do; that is why the 2004 SOS board returns 32 teams, not 35.

Note the separate problem this does *not* solve: the schedule and the stats feeds
disagree about which code a franchise used in a given season (`STL` vs `LA`). See
`franchises.py`.

`ingest_depth_charts.py` populates the **`depth_chart_entries` table** (M6):

- One row per (season, team, player, position) from the **newest snapshot only**, with
  `pos_rank` (1 = starter), the alignment slot, and the snapshot timestamp every surface
  shows as its "as of".
- The feed is a stream of timestamped snapshots — 152 for 2026 by mid-August, ~450k rows
  a season. Keeping only the newest is reversible: nflverse retains them all, so a
  change-log ("promoted to WR2 on Aug 12") can be backfilled later.
- **The one ingest that is not an upsert.** It holds *current state*, and a cut player
  does not appear with a worse rank — he stops appearing at all, so an upsert would
  leave him listed as the WR3 forever. Each team's rows are deleted and rewritten
  together (`replace_scoped`), and only for the teams the snapshot actually contains: a
  team missing from a download is a glitch, not a released roster.
- QB/RB/WR/TE only. The feed carries all 53 players, but a fantasy product has nothing
  to say about a left guard.

### Left NULL — no free data source

`slot_snaps`. Per-player alignment isn't published by any free nflverse feed —
participation carries formation and personnel groupings but not who lined up where,
PFR advanced receiving has no alignment column, and FTN charting is play-level with no
player attribution.

Season-level derived metrics (`fantasy_ppg_*`, `routes_run_per_game`) are **not**
stored here — they are computed in the API by aggregating these per-game rows.
