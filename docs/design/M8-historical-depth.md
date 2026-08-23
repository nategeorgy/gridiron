# M8 — Historical Depth (1999–present)

**Status: shipped.** Project scope moves from 2020 back to **1999**, the first season
nflverse publishes anything for. That is 27 seasons of stats instead of six, and about
150,000 stat lines instead of 36,000.

The interesting part is not the ingest. It is that **the data does not arrive all at
once**, the feeds do not say so, and they report a stat nobody measured as `0` rather
than as missing. Most of this milestone is about making the app honest about that.

---

## 1. Why 1999

Not a preference — a floor. `load_pbp` validates its argument and raises below 1999, so
every play-derived number in the ecosystem starts there. Going further back would mean
a different source and a different schema.

## 2. What is actually available, and when

Every window below was **measured**, not read off documentation. The audit is
reproducible: for each candidate column, count the player-games where the value is
non-null *and* non-zero, per season, restricted to rows where the stat must exist (a
player with a reception must have had a target).

| Layer | From | Notes |
|---|---|---|
| Schedule, scores, **spread + total lines** | **1999** | 7,388 of 7,548 games priced. Moneylines from 2008 |
| Box score — pass/rush/rec yards, TDs, receptions, carries, attempts, fumbles | **1999** | complete |
| Fantasy points + PPG, any scoring | **1999** | complete |
| EPA (passing / rushing / receiving) | **1999** | 100% of plays |
| Passer rating | **1999** | derived |
| Rushing detail — red-zone carries, inside 10/5/2, rush share | **1999** | `rusher_player_id` is 100% populated in every season |
| **Targets**, target share, yards per target, red-zone targets | **1999**, ⚠️ **gap 2003–2008** | see §3 |
| CPOE, receiving YAC | **2006** | charted at the passer, or only on completions |
| Market share, rush attempt share | **2006** | ffopportunity's *actual* team totals |
| Air yards, ADOT, RACR, WOPR, air-yards share, unrealized air yards | **2009** | needs charting *and* §3 |
| Target distribution by depth (`player_target_depth`) | **2009** | same |
| Expected points (all components, xFP, POE) | **2009** | see §4 |
| Insight scores built on expected points | **2009** | FOR, buy-low, sell-high, expected VORP |
| VORP, replacement level | **1999** | measured on actual points |
| Snap count, snap share | **2013** | see §5 |
| Routes run, route participation, TPRR, YPRR | **2016–2025** | participation feed, discontinued |
| Slot snaps | never | no free source has ever published alignment |

## 3. The receiver blackout, 2003–2008

**Play-by-play in these seasons names a receiver only on completions.** An incompletion
cannot be attributed to anybody, so a target is not merely unpublished — it is
unrecoverable. `load_player_stats` reports league-wide targets of ~3 for 2003 against
~17,500 in a healthy season.

This gap is easy to talk yourself out of, and the first build of this milestone did.
`load_ff_opportunity` *looks* like it has the missing targets: its league-wide
`rec_attempt` for 2006–2008 totals ~17,800, exactly the right magnitude, while the
weekly stats feed reports zero. Backfilling from it shrank the gap to three seasons and
restored air yards, ADOT, RACR and WOPR for 2006–2008.

It was wrong. Randy Moss's 2007 came out as **105 targets and 105 receptions**. The
checks that catch it:

- Per player, `rec_attempt` equals `receptions` in **94–99%** of player-games in
  2006–2008, against **32–39%** in every healthy season.
- The ~6,800 targets a season that make the league total look right sit on ~700 rows
  with **no player id** — the unattributed incompletions, pooled.

The lesson generalises: *an aggregate that matches is not evidence that the
attribution does.* The validation that gave false confidence compared 2009 and 2020,
where both feeds are fine, and extrapolated backwards.

## 4. Expected points wait for 2009, as a family

ffopportunity's model starts in 2006 and its **passing and rushing** sides are sound
from then (modelled/actual ratios of 1.03–1.05 and 0.95–0.98, matching modern seasons).
Its **receiving** side is fed by targets, so through the blackout it runs at **0.67 /
0.62 / 0.50** of actual for receptions, yards and touchdowns.

All of it waits for 2009 anyway, because nothing consumes a component on its own.
Expected *fantasy points* is their sum, and a sum reads a missing part as zero — so a
2007 receiver's expectation would be his rushing expectation and almost nothing else: a
number that is non-null, badly wrong, and indistinguishable from a real one. Keeping
the sound halves would buy expected points for quarterbacks in three seasons at the
cost of silently mis-ranking every skill player in them.

## 5. Two smaller measured corrections

- **Snaps start in 2013, not 2012.** nflreadpy documents 2012 as the floor and accepts
  it; the file is empty upstream. `load_snap_counts(seasons=[2012])` returns 0 rows.
- **Routes end, and the ceiling is read from data.** The participation feed is no
  longer published. Rather than hardcode the last season, the registry marks these
  metrics with a `data_ceiling_column` and `GET /metrics` resolves the real ceiling
  with `MAX(season) WHERE routes_run IS NOT NULL`, so it stays right whether or not the
  feed ever resumes.

## 6. How the honesty is enforced

**NULL, never zero, and decided in one place.**

- `pipeline/availability.py` holds the measured windows and masks every column a season
  cannot support *at ingest*, so the database itself never contains a zero that means
  "never recorded".
- `backend/app/availability.py` mirrors it for the UI, and `MetricDef.availability`
  carries the window into `GET /metrics`. Composite and per-game metrics **derive**
  their window by intersecting their inputs, so `high_value_touches_per_game` inherits
  the receiver blackout from `red_zone_targets` without anyone restating it.
- `tests/test_availability.py` fails if the two tables disagree on any stored column in
  any season — the mirror is the thing most likely to rot.
- A database-level check confirms the invariant directly: **0 violations** (a stored
  value in a season with no data) and **0 holes** (a season marked available with
  nothing stored) across 31 restricted columns and 28 seasons.

In the UI, a board with an unanswerable column shows a quiet note naming the columns
and the *cause*, dims those headers, disables them in the sort picker, and falls back
to a sortable column rather than ranking by a page of dashes.

## 7. Two bugs the wider range exposed

Neither was new; both were invisible while scope started in 2020.

**Team attribution used the player's current team.** `players.team_id` is who employs
someone *now*, and every leaderboard joined on it — so Torry Holt's 2004 was a
Jacksonville season and Javon Walker's a Las Vegas one. Season rows now take the team
from the **stat lines**, via the player's latest game in the window, and report
`teams_played_for` so a mid-season trade can be marked rather than silently resolved.

**The two feeds disagree about historical team codes.** `load_schedules` records the
code in use at the time (`STL`); `load_player_stats` and `load_pbp` normalise every
franchise to its current code (`LA`). Left alone, `games` and `player_stats` point at
different rows of `teams` for the same team — which is worse than a labelling problem:
strength of schedule derives the opposing defense by asking which side of the game the
player was *not* on, and that test is false for both sides when the codes differ, so
every Rams stat line from 1999–2015 was credited to the wrong defense.

`pipeline/franchises.py` reconciles onto the schedule's answer, because a historical
product should say St. Louis. **The mapping is derived, not hardcoded:** a franchise is
identified by nickname (`load_teams` publishes 36 codes under 32 nicknames, and the
three with more than one are exactly the three relocations), and which code was in use
is whichever appears in that season's schedule. Both halves come from the data, so it
stays correct the next time a team moves.

Verified: **0** of ~150,000 stat lines now carry a team that is not one of the two
teams in their own game.

## 8. Consequences elsewhere

- **`teams` holds 35 rows, not 32** — OAK, SD and STL played seasons in scope. The
  schedule-derived filter in `ingest_teams.py` picked them up with no change, exactly
  as it was designed to. LAR is still excluded: it never appears in a schedule.
  Surfaces that rank teams already filter per season, so SOS still returns 32 for 2004.
- **The regular season is 17 weeks before 2021**, so the week picker follows the season
  instead of offering a week nobody played.
- **Depth charts stay current-state only.** They are not history, and a 2004 view
  correctly shows none.

## 9. Deliberately not done

- **Rebuilding rush/opportunity share from play-by-play for 1999–2005.** Rusher ids are
  complete, so `rush_attempt_share` *could* reach back to 1999 instead of 2006. It
  currently comes from ffopportunity, and the honest window reflects the implementation
  rather than the theoretical limit.
- **Backfilling production's stats.** Partly overtaken by events: the M6 deployment on
  2026-08-23 already carried production's *schedule* back to 1999 (7,548 games, 7,388
  priced) and `teams` to 35, because the ingests read this branch's `FIRST_SEASON`.
  What is still outstanding is `player_stats`, which holds 2020–2025 there against
  1999–2025 locally — so production currently has ~21 seasons of games with no stat
  lines behind them. Harmless while it lasts (`/seasons` reports `has_stats`, and every
  board filters on it), and closed by running the stats chain against Supabase, which
  is hours of play-by-play downloads rather than minutes.
