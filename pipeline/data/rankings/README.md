# Expert ranking boards (CSV drop)

Boards dropped in this folder are ingested by `pipeline/ingest_expert_boards.py` and
**blended anonymously** into the GridironIQ Consensus. They are never exposed
individually: the API's source registry treats any source it does not explicitly
publish as private, so an individual board here can only ever reach a user as one
un-named input to an average. That is deliberate — several of these are paywalled, and
an aggregate that never attributes or reproduces a single board is a different thing
from republishing one.

## The format

`TEMPLATE.csv` in this folder is the format, and it is the *same* format the in-app
upload accepts — one parser, so a board that ingests here also imports there.

| Column | Required | Notes |
|---|---|---|
| `rank` | ✅ | Integer. Gaps are fine (we re-densify); ties are broken by file order. |
| `player` | ✅ | Full name as the expert writes it. Suffixes, punctuation and casing are normalised before matching. |
| `position` | ✅ | `QB`, `RB`, `WR` or `TE`. Any other position (K, DST, IDP) is skipped and counted in the log — GridironIQ holds no data for them. |
| `team` | optional | Team abbreviation. Not needed to match, but it is what separates two players with the same name, so include it when you have it. |
| `tier` | optional | Integer. Carried through to the board display; ignored in the blend. |

A header row is required. Column order does not matter. Extra columns are ignored.

## Naming the file

    <source-id>_<YYYY-MM-DD>.csv        e.g.  analyst-a_2026-08-23.csv

- **`source-id`** is an opaque slug that stays server-side. Use whatever you like —
  it is what the row is keyed on, not something a user ever sees. Keep it stable
  across updates of the same expert's board so history lines up.
- **The date** is the board's as-of date, which becomes `scraped_at`. It is part of the
  primary key, so re-dropping the same board with the same date overwrites rather than
  duplicating, and a new date accrues history.

Both can be overridden at the command line if a file is named differently:

```bash
python ingest_expert_boards.py --file data/rankings/whatever.csv --source analyst-a --as-of 2026-08-23
```

## What happens to unmatched names

Names resolve to `player_id` through the same `load_ff_playerids` crosswalk the
FantasyPros ingest uses, with a normalised name + position fallback. Anything still
unmatched is **logged with its rank and skipped** — never guessed at. Check the log
after a drop: an unmatched name inside the top 100 is worth fixing by hand (usually a
nickname or a rookie whose id has not propagated yet), while unmatched names at the
tail are typically camp bodies.
