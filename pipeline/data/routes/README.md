# Weekly routes exports (hand-supplied, never committed)

nflverse has no in-season route data: FTN delivers the participation file only after a
season's post-season. So during the season, routes run arrive as a spreadsheet supplied
by hand, and `pipeline/ingest_routes.py` attaches them to the week's stat lines.

⚠️ **Everything in this folder except this README is gitignored.** The exports are
licensed charting data and the repository is public. Keep the files local.

## The format

The header row is required; column order does not matter and extra columns are ignored.

| Column | Required | Notes |
|---|---|---|
| `Name` | ✅ | As the export writes it. Suffixes, punctuation and casing are normalised before matching. |
| `Position` | ✅ | `WR`, `TE`, `HB`, `FB` (PFF's labels; `HB`/`FB` match as backs). |
| `Routes Run` | ✅ | Integer. |
| `Team` | ✅ | The full name, e.g. `Chicago Bears`. It is what separates two players with the same name. |
| `Snaps`, `Targets`, `Carries` | optional | **Cross-checked against the stored stat line, never written.** Disagreements are logged. |

`.xlsx` (first sheet) or `.csv`.

## Naming the file

    <season>-w<week>[-label].xlsx        e.g.  2026-w01.xlsx, 2026-w01-pre-mnf.xlsx

Several files may cover one week (a pre-Monday-night export, then Monday night on its
own). They are applied in name order and a later file wins where two overlap.

## Loading it

Enrichment only: the week's stat lines must already exist, so run it **after** the stats
job has ingested that week.

```bash
cd pipeline
.venv/bin/python ingest_routes.py --dry-run   # match + cross-check, no writes
.venv/bin/python ingest_routes.py             # every export in this folder
```

The scheduled workflow cannot see these files, so **production is loaded from a local
machine** by pointing the same command at the production database:

```bash
DATABASE_URL='<production connection string>' .venv/bin/python ingest_routes.py
```

After that, the weekly stats job keeps TPRR and YPRR in step with any stat correction on
its own (`ingest_usage.py` re-derives them for every row that has a route count).

## Check the log

- **UNMATCHED** — a player with targets or carries who matched no stat line. Usually a
  name nflverse writes differently; worth fixing.
- **NO ROUTES** — a stat line with targets on a team the export covers, but no row for
  that player.
- **touched nothing** — a player with routes but no target or carry. nflverse writes no
  stat line for him, so there is nowhere to put the routes. Expected, not a problem.
- **cross-check** — snaps, targets or carries that disagree with what is stored.

## What the numbers mean

These are **charted routes**, not the pass-play participation 2016–2025 is built from.
A tight end kept in to block ran no route here but "ran" one in those seasons, so his
route participation reads lower and his TPRR / YPRR higher than the same usage would have
a year earlier. Measured on 2026 Week 1 against the same players' 2025: receivers +0.6
points of route participation, tight ends −9.3, backs −8.5. Every percentile is computed
within a season, so boards rank fairly.

**Route participation divides by team dropbacks, scrambles included** — the export counts
a route on a scramble, and against pass plays alone 10 of 282 players came out above 100%.

