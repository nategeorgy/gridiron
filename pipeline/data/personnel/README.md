# Season-to-date personnel (hand-supplied, never committed)

nflverse's only personnel source is the participation file, which arrives after the
Super Bowl. So during the season, offensive personnel groupings arrive as a spreadsheet
supplied by hand, and `pipeline/ingest_personnel.py` loads it into
`team_personnel_season`.

⚠️ **Everything in this folder except this README is gitignored**, the same as the
routes exports: it is hand-supplied charting data and the repository is public. Keep the
files local.

## The format

One row per team, season to date. The header row is required; column order does not
matter and extra columns are ignored.

| Column | Notes |
|---|---|
| `Team` | Abbreviation (`ARI`, `LAR` or `LA`, ...). A relocated code resolves through `franchises.py`. |
| `<grouping> Personnel %` | Share of the offense's plays, as a fraction (`0.62`). Stored as given. |
| `<grouping> Personnel Plays` | Integer. A blank or `-` means the team never used it. |
| `<grouping> Personnel EPA` | EPA per play. `-` (withheld under 20 plays) is stored as NULL. |
| `<grouping> Personnel Success Rate` | A fraction. `-` is stored as NULL. |

`<grouping>` is any two digits (`11`, `12`, `13`, `21`, `22`, ...); the script finds
them from the header. `.xlsx` (first sheet) or `.csv`. Stray cells below the table (a
row with no team) are ignored.

## Naming the file

    <season>-w<through week>[-label].xlsx        e.g.  2026-w03.xlsx

The week is the last week the totals include. Each file is a snapshot, so only the
newest per season is loaded, and it replaces the previous one team by team.

## Loading it

It is cross-checked against the week's play-by-play team stats, so run it after the
stats job has ingested that week.

```bash
cd pipeline
.venv/bin/python ingest_personnel.py --dry-run   # parse + cross-check, no writes
.venv/bin/python ingest_personnel.py             # the newest file per season
```

Production is loaded the same way, from a local terminal, with the production
`DATABASE_URL` set inline. The file never goes through CI.
