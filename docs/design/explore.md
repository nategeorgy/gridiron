# The Explore tab (September 2026)

Five tools under **Explore ▾**, after Teams, replacing the two M4 builders that were
hidden for launch. Chosen over three rounds of mockups with real data (v3:
https://claude.ai/artifact/NL7fLhH9VMw4YytbZDwdcT). Names and subheadings are Nate's.

| Page | Path | Subheading |
| --- | --- | --- |
| Scatter | `/explore/scatter` | Visualize how players rank between two stats |
| Passing Network | `/explore/network` | Where each quarterback's targets go |
| Player Comparison | `/explore/compare` | Compare up to five players side by side |
| Target Analysis | `/explore/targets` | Where and how deep players are targeted |
| Query Builder | `/explore/query` | Search for games and seasons by any stat |

Every chart exports a branded PNG, and every page keeps its state in the URL.

## What each page decided

**Scatter.** Pre-canned questions per position (QB, RB, WR, TE), chips above one
full-width chart, never free axes. The presets are `frontend/src/constants/scatters.js`.
Cut on review: QB pressure rate vs EPA, QB inside-5 carries vs rushing TDs, WR/TE
separation vs YAC over expected, and every M4 preset. **Parked, not rejected:** a
checkbox drawing where each player was last season. The data is `/stats/intelligence`,
so a timeframe re-aggregates exactly as the leaderboards do (verified against the
mockup's own recomputation for 140 players).

**Passing Network.** The spread-out field (height is aDOT to scale, left to right is
which side a receiver is targeted on more) and a radial layout. A field with each
receiver at his average target spot was mocked and passed on. Top 6 receivers by
default, 9 or 12 on request, the rest as "others". Situations: all, red zone, third
and fourth down. Two quarterbacks from the same team sit side by side over that team's
games only, with each receiver's change in target share.

**Player Comparison.** A table only (percentile tracks were cut): the leaderboard's five
tabs filtered to stats every compared position shares, a leader pill in the leader's
colour, the winning cell tinted. Column headers are a colour dot, the headshot, the
name and the season. Charts by position: receivers get the scatter, the target maps and
depth mix with overlaid air-yard curves; backs get the scatter, run lanes and how each
carry ended; quarterbacks get the scatter, where they throw, and **EPA per attempt by
depth as a dot plot** (grouped bars were rejected; the dot plot beat field tiles).

**Target Analysis.** Positions in the order WR, TE, RB, WR/TE, WR/TE/RB. The list is a
depth mix or an air-yard distribution; one player gets zones, a heatmap or every
target. The heatmap runs green (less often) through amber to red (more often); against
the position average, red is more and green fewer. **Every target is exact in depth but
only one of three thirds in side**, because that is all play-by-play records, and every
chart says so.

**Query Builder.** The screener only. Games or seasons (combined was cut). No location,
result, betting line, opponent or team total filters. "Every game" or "Count of games
by player". Sorting only by columns the table shows.

## Data

Two tables from play-by-play, 2009 on (`backend/app/models/plays.py`,
`pipeline/ingest_plays.py`, migration `311908bb9b96`):

- `play_targets`, one row per targeted pass. `receiver_id` has **no foreign key**: a
  target to a fullback or a two-way player is still one of the quarterback's targets.
- `player_run_lanes`, one row per player, game and run lane, with how each designed
  carry ended.

Both are replaced per game. The full backfill is ~310,000 and ~100,000 rows, about
90 MB with indexes (Supabase free tier is 500 MB). The Wednesday job refreshes the
current season; **history is a one-off**:

```bash
cd pipeline
DATABASE_URL=<production> .venv/bin/python ingest_plays.py --seasons $(seq 2009 2026)
```

The Query Builder reads no new table. It searches an in-memory numpy copy of
`player_stats`, loaded once per data version (`backend/app/query_builder.py`), because
an interactive screener asking Postgres would read the whole table on every change.

## Export

`frontend/src/utils/exportImage.js` renders the chart offscreen in the theme asked for,
inlines computed paint and remote images, and frames it: title, subtitle, the 2L mark,
a faint mark inside the plot, and a footer with the wordmark, the URL and
`@SecondLevelFF`. The URL is `constants/brand.js`, `secondlevel.app`.
