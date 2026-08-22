# M6 Design — New Data Domains

> Status: **shipped in full** (2026-08-20) — 4.0 through 4.4. Milestone: [`docs/ROADMAP.md`](../ROADMAP.md) → M6.
> Depends on M1 (scoring engine + metric registry), M2 (expected components) and M3
> (VORP, league context). M7 is unblocked by §4.0 of this note, not gated behind it.

Last updated: 2026-08-20 (M6 complete)

M6 adds four data domains — **depth charts, strength of schedule, Vegas lines, and
consensus rankings** — plus the two things those domains turn out to require: a **2026
season the app actually knows about**, and **team pages** for the team-level data to live
on. This note records what the feeds actually contain (§2, measured, not assumed), the
decisions taken before any code (§3), the slices (§4), and the risks (§6).

---

## 1. The reframe — M6 is the first milestone about the past tense ending

Everything shipped so far describes **completed seasons**. `player_stats` for 2020–2025
is immutable: a manual pipeline run is fine because last year's numbers do not change,
nothing on screen can be stale, and "current season" could be a constant because the
newest season was always the newest one that existed.

All four M6 domains are **perishable**:

| Domain | Changes | Worthless when stale by |
| --- | --- | --- |
| Depth charts | daily through camp, weekly in-season | ~2 days |
| Vegas lines | continuously | ~1 day |
| Consensus rankings (ECR) | weekly | ~1 week |
| Strength of schedule | weekly, as defenses reveal themselves | ~1 week |

Four consequences, and they are the real content of M6.0:

1. **The 2026 season has to exist in the database.** It currently does not — `games` and
   `player_stats` stop at 2025, and Week 1 is **2026-09-09**.
2. **Refresh has to be automated.** A manual pipeline that lapses turns a depth chart
   from a feature into a lie.
3. **Every M6 surface needs an "as of" stamp.** Perishable data that does not say when it
   was picked is worse than no data.
4. **"Current season" must be computed, not constant.** `SEASONS` is a literal array in
   [`frontend/src/constants/index.js:5`](../../frontend/src/constants/index.js) and
   `DEFAULT_SEASONS` a literal range in every pipeline script.

---

## 2. Data reality (measured 2026-08-19/20 against `nflreadpy` 0.1.5)

| Feed | 2026 status | Detail |
| --- | --- | --- |
| `load_schedules([2026])` | 🟢 published | 272 games; Week 1 = 2026-09-09 |
| — betting lines within it | 🟢 **weeks 1–13 priced** | `spread_line`/`total_line` on 112 of 272; also moneylines, spread odds, over/under odds |
| `load_depth_charts([2026])` | 🟢 live | 449,396 rows across **152 snapshots** since 2026-03-22; latest 2026-08-19; 925 skill-position rows in the latest, 12 missing `gsis_id` |
| `load_ff_rankings("draft")` | 🟢 current | 5,849 rows, scraped **2026-08-14** |
| `load_ff_rankings("week")` | 🟡 out of season | last scrape 2025-12-30; refreshes once games resume |
| `load_ff_playerids()` | 🟢 | 12,472 rows; 7,989 with `gsis_id`, 4,873 with `fantasypros_id` |
| `load_players()` | 🟢 | **39 columns published, 7 stored** |
| `load_rosters([2026])` | 🟢 | 2,930 rows |
| `load_pbp` / `load_stats` / `load_snap_counts` / `load_participation` / `load_ff_opportunity` | 🔴 **refuses 2026** | `ValueError: Season must be between … and 2025` — a season guard that rolls over at kickoff |
| `load_injuries` | 🟡 2009–2025 | weekly practice reports; no 2026 rows until games start |

### Two roadmap assumptions that were wrong

**"Live upcoming lines need an external odds API."** They do not, for v1. The nflverse
schedule file already carries forward-looking `spread_line` and `total_line` for the next
~13 weeks, refreshed with the rest of the feed. An odds API buys intraday movement and
weeks 14–18 — a later upgrade, not a prerequisite. This turns the Vegas slice into **one
migration plus a re-run of a script that already exists**.

**"Consensus projections via `load_ff_rankings`."** The feed is **expert consensus
*rankings*** — `ecr`, `sd`, `best`, `worst`, `rank_delta`, `player_owned_avg` — with **no
projected points and no ADP**. There is nothing in it to put in a `projections` table.
The distinction is not pedantic: a *projection* is stat components, which the M1 engine
could rescore into any league; a *rank* is an opinion already baked in somebody else's
scoring and cannot be recomputed at all. See the §3 decision.

Variants available (all one scrape date, ~5.8k rows total): `redraft-overall`,
`redraft-op` (superflex), `redraft-{qb,rb,wr,te,k,dst}`, `dynasty-*`, `best-*`.

### The crosswalk is not the risk it looked like

ECR carries FantasyPros ids, not `gsis_id`, so the join runs through `load_ff_playerids`.
Measured on `redraft-overall`: **436 of 440 skill-position players matched**, and
**0 unmatched inside the top 200 ECR** — the four misses are a free-agent TE and three
players ranked 313th or worse. Name-matching stays as a logged fallback, not a load-bearing
mechanism.

---

## 3. Decisions taken before writing code

**3.1 — Consensus is a ranking, so we ship the *gap*, not the ranking.** Showing ECR
alone would put someone else's number, in someone else's scoring, inside a product whose
first differentiator is your-league-scoring everywhere. Instead ECR becomes one column and
the headline is the **delta against our own value rank**: *the market has him 41st; we
have him 12th.* We are not projecting — we are contrasting an opinion with a measurement,
which is the same move the Positive-Regression Index makes against actual production.

**3.2 — Our side of the gap is expected-points VORP (xVORP), not actual VORP.** Actual
VORP ranks last season's *results*, so a 12-touchdown fluke rides straight into the gap
and the board recommends buying variance. Expected-points VORP ranks the *opportunity*
that produced them. This is the deepest asset we own (M2 components → M1 scoring engine →
M3 replacement level), and it makes the gap self-explaining: "8 touchdowns on 4.1
expected". Implementation is contained — [`intelligence.py:446`](../../backend/app/intelligence.py)
builds `replacement_ppg` by sorting `fantasy_ppg` and passing it to `_replacement_ppg`;
xVORP sorts `expected_fantasy_ppg` through the identical path.

**3.3 — Players with no NFL history appear, tagged, with no gap.** Rookies and returning
free agents are ranked in ECR's top 50 and cannot have an xVORP rank. They render in ECR
order with `—` in our column and a **"no NFL history"** tag, and are excluded from the
gap sort. Imputing them to replacement level was rejected: it fabricates a large
"market overvalues this rookie" gap on every single rookie, which is a claim we have no
data to make.

**3.4 — Depth charts store the latest snapshot only.** The feed offers ~150 snapshots per
season and movement history is genuinely interesting ("promoted to WR2 on Aug 12"), but
**this is not a one-way door**: nflverse retains every snapshot per season, so a change-log
can be backfilled from the same feed whenever it earns its place. Storing the cheap thing
first costs nothing but the option to have started earlier.

**3.5 — SOS is defined by prior-season fantasy points allowed, and rolls forward.** In
August, 2025 points allowed per position is the only complete signal (Vegas prices only
13 weeks, and only for teams, not positions). The board therefore uses prior-season points
allowed until roughly four games of the new season exist, then a widening current-season
window — **and labels which basis it is using**, because "hardest schedule" computed from
a year-old defense in December would be silently wrong. Points allowed is computed
**through the scoring engine**, per request, in the user's own scoring: a TE-premium
league does not have the same hardest schedule as a standard one.

**3.6 — Freshness is a pipeline concern, never a request concern.** No M6 endpoint fetches
from nflverse at request time. The database stays the single source of truth; a scheduled
job is the only writer. This keeps a third-party outage out of the request path.

**3.7 — The `projections` table stays unbuilt.** The roadmap's multi-source spine
(`player, season, week, source, scoring_context`) is honoured by a **`player_rankings`**
table named for what it holds, with `source` and `ranking_type` from day one. When real
projections arrive — ours or a user's — they get their own table with stat components,
because that is a different thing with different semantics. Building an empty
`projections` table now would be a schema commitment made by a feed that does not exist.

---

## 4. The slices

### 4.0 — Season readiness (must be first) — ✅ **SHIPPED**

**DB (one migration):**
- `games`: `spread_line`, `total_line`, `home_moneyline`, `away_moneyline`,
  `over_odds`, `under_odds`, `roof`, `surface`, `div_game`
- `players`: the **roster-bio unlock** — `birth_date`, `college_name`,
  `college_conference`, `height`, `weight`, `draft_year`, `draft_round`, `draft_pick`,
  `draft_team`, `rookie_season`, `years_of_experience`

**Pipeline:** `ingest_schedules.py` maps the new line columns (already in the dataframe,
currently discarded); `ingest_players.py` maps the bio columns (~10 lines). Backfill lines
for 2020–2025 in the same pass — historical spreads/totals arrive free and unlock
"performance by game total" splits later. Every `DEFAULT_SEASONS` becomes a computed range.

**Backend/frontend:** `SEASONS` is served, not hardcoded. **Default season = the latest
season with completed games**, so the app stays on 2025 through August and flips to 2026
after Week 1 — never a default that resolves to an empty board.

**Automation:** `.github/workflows/pipeline.yml`, the repo's second workflow, with the
Supabase connection string as a repo secret. Cadence split by perishability:

| Job | Schedule | Runs |
| --- | --- | --- |
| `fresh` | daily ~06:00 ET | depth charts, schedules + lines, players/rosters |
| `rankings` | weekly (Fri) | ECR |
| `stats` | Wed ~06:00 ET, in-season only | stats → expected → usage → target-depth |

Wednesday for stats because Monday night has to finish and Tuesday's official stat
corrections have to land. Play-by-play is the expensive download and it is the one that
changes least often — running it nightly would spend most of the Action minutes in M6 to
re-derive numbers that did not move.

**Tests:** bump `EXPECTED_HEAD` in `backend/tests/test_harness.py` (currently
`8f73b5b2b1a1`). No account tables touched, so no new RLS entries.

**Ships:** the app knows what year it is.

> **Shipped as designed**, with one addition the plan missed: `clamp_seasons()`. The
> stat feeds *raise* for a season that has not kicked off and the loaders take every
> season in one call, so between March and September the computed default always
> contains a season that would fail the entire run — every week, unattended.

---

### 4.1 — Draft Value Board *(the draft-season sprint)* — ✅ **SHIPPED**

**DB:** new `player_rankings` — `player_id`, `source` (`fantasypros`), `ranking_type`
(`redraft-overall` | `redraft-op` | `dynasty-overall` | `best-overall` | per-position),
`season`, `week` (NULL = draft ranking), `ecr`, `sd`, `best`, `worst`, `rank_delta`,
`player_owned_avg`, `scraped_at`. Primary key includes `scraped_at`, so **history
accumulates from our first run** — the file is a snapshot, not a time series, and
"his ECR has moved 20 spots in two weeks" is only available if we start keeping it now.

**Pipeline:** `ingest_rankings.py`. Ingest **all** variants (5.8k rows — the whole file is
smaller than one week of `player_stats`), filter to QB/RB/WR/TE, join via
`load_ff_playerids`, log unmatched counts, skip rows whose `player_id` is not in `players`.

**Backend:** `GET /api/v1/stats/draft-board?scoring=&league=&ranking_type=`. The
**ranking variant is chosen from the league config we already have** — a superflex league
gets `redraft-op` without being asked. Returns ECR (+ dispersion), xVORP rank, the gap,
age, and the top gap driver (points over expected, or TDs over expected).

**Frontend:** `/insight/draft`, first item in **Insight ▾**. Sortable by gap in both
directions — undervalued *and* overvalued are both draft decisions.

**Ships:** the one board in this product nobody else can build, live before drafts happen.

> **Two corrections found while building it**, both invisible from a passing 200:
>
> **The two ranks were counting different populations.** The plan said "rank ECR within
> our scope, rank xVORP within the same set" — but *the same set* silently wasn't: the
> market ranks every name on the consensus board while we can only value the players who
> played last season. A smaller pool compresses every rank in it upward, so the tail of
> the board filled with fake value (Zach Ertz: consensus 384, ours 83, a +301 gap that
> was pure arithmetic). Fixed by assigning **both** ranks over the players we can value,
> with the raw `ecr` shown alongside so the consensus's own number is never hidden.
> `tests/test_draft_board.py` locks the invariant.
>
> **The board needed a depth limit**, which the plan did not anticipate. Coverage falls
> off a cliff past the picks a league actually makes — 93% of the consensus top 150 can
> be valued, against ~60% past pick 200 — and beyond that the consensus is listing camp
> bodies while our side reads last season's box scores. Depth is `teams x starters x 2`
> so it moves with the league (12-team standard → 192).
>
> **Rankings refresh daily, not weekly** as §4.0's table said. The upstream file is a
> snapshot overwritten in place, so a scrape we miss is gone for good — there is no
> backfill. A duplicate day writes nothing (the scrape date is part of the key); a
> missed week is a permanent hole.
>
> **Known limit, stated on the board itself:** our side reads *last* season's
> opportunity while the market prices *next* season. So a changed situation — a rookie
> about to start, a quarterback returning from injury — shows up as a gap that is news
> about the offseason rather than a mispricing. Lamar Jackson (13 games at 16.1 xFPPG in
> 2025, below the QB12 baseline) is the clearest example on the current board.

---

### 4.2 — Depth charts + team pages — ✅ **SHIPPED**

**DB:** `depth_chart_entries` — `season`, `team_id`, `player_id`, `pos_abb`, `pos_rank`,
`pos_slot`, `pos_grp`, `snapshot_at`. **QB/RB/WR/TE only**, matching the scope everywhere
else; the table holds one current row per player.

> **Implementation note:** "latest snapshot only" is *not* a plain upsert. A cut player's
> row would survive forever, since he simply stops appearing in the feed. Each run must
> **replace a team's rows transactionally** — delete-then-insert per team — which is a
> different idempotence pattern from every other pipeline script and the most likely
> place for a subtle bug.

**Backend:** `GET /api/v1/teams/{team_id}` — team detail: record, next game (with its
line), roster with fantasy production, depth chart by position group, schedule + results.
`GET /api/v1/teams/{team_id}/stats` already exists and is reused.

**Frontend:** a new `TeamProfile` page at `/teams/:teamId`, linked from the Teams
leaderboard (rows are not clickable today — there is no route and no page). Depth-chart
position also appears on player profiles ("WR2, KC — as of Aug 19").

**Ships:** the Teams tab stops being a dead end.

> **Shipped as designed.** The implementation note above was the whole risk and it held:
> `replace_scoped()` in `pipeline/db.py` deletes and rewrites a team's rows in one
> transaction, and only for teams the snapshot contains — a team missing from a download
> is a glitch, not a released roster. Verified against live data by planting a stale KC
> entry and re-running the ingest: 31 rows → 30, the planted row gone. An upsert would
> have left it there permanently.
>
> **Two additions the plan did not call for.** The team page shows each player's
> production **in the requested scoring** rather than raw PPR — a depth chart quoting
> somebody another league's points would have been the one place in the product that
> broke differentiator #1. And the schedule is told from the team's own point of view,
> which meant flipping the stored spread on away games: `games.spread_line` is
> home-team-first, so reading it straight through would have reported a team as a
> 7-point favourite in a game it was a 7-point underdog in — on exactly half the rows,
> with the page looking completely normal. `tests/test_team_page.py` pins both.
>
> **Also folded in:** the player page now carries the M6.0 bio unlock (age, college,
> draft slot) beside a dated depth-chart badge, which is the first user-visible payoff
> from those columns.

---

### 4.3 — Strength of schedule — ✅ **SHIPPED**

**DB: none.** Points allowed is an aggregation over `player_stats` joined to `games` for
the opponent, run through the scoring engine — the same query-time-only stance as M3, for
the same reason: the answer depends on the scoring config, so a stored one would need a
row per context.

**Backend:** `GET /api/v1/stats/sos?scoring=&position=&window=`, with windows for
**rest of season**, **next 4**, **fantasy playoffs (15–17)** and **full season**. Every
response states its basis (`prior_season` | `current_season` | `transition`) and the
games behind it.

**Frontend:** `/insight/sos`. Primary view is the canonical **team × week grid** shaded by
difficulty for the selected position; SOS also surfaces as a strip on the team page and a
column on the draft board.

**Ships:** the August tiebreaker, and the in-season streaming question.

> **Shipped as designed, with one thing the plan left vague made concrete.** Difficulty
> is a **0–100 percentile where higher is harder**, not a rank — "the number one defense
> against receivers" and "the number one schedule" point in opposite directions, and a
> percentile also says how *much* harder rather than only which side of the median.
>
> **Byes are skipped, not counted.** An absent fixture averaged in as zero difficulty
> would make every team's bye week look like the softest spot on their schedule.
>
> **Found while building it:** `teams` holds four inert rows for relocated franchises
> (LAR, OAK, SD, STL) with zero games and zero stat lines — `LA` carries all the Rams
> data. The board ranked 36 teams and put four empty schedules at the top of the
> "easiest" list until it was filtered to teams that actually play the season.
>
> The position split is doing real work rather than being a filter for its own sake: on
> the 2026 board the easiest fantasy-playoff schedule belongs to **CLE for receivers**
> and **JAX for running backs**, and Philadelphia has the *easiest* full-season WR
> schedule (35.2, 1st) alongside the **31st-hardest** fantasy-playoff one (72.4).

---

### 4.4 — Vegas board — ✅ **SHIPPED**

**DB: none** — the columns land in 4.0. Implied team totals are derived, not stored:
`implied_home = total_line/2 + spread_line/2`, `implied_away = total_line/2 − spread_line/2`
(nflverse `spread_line` is positive when the home team is favoured).

**Backend:** `GET /api/v1/stats/vegas?season=&week=&view=players|games`.

**Frontend:** `/insight/vegas`, **two views on one toggle** — *players* (ranked by their
game's implied team total: who is in the best scoring environment this week) and *games*
(the slate, with spread, total, and both implied totals, clicking through to team pages).
Player-first is the default, because this board sits beside VORP and Buy Low.

**Ships:** game environment as a fantasy input, with no new third-party dependency.

> **Shipped as designed.** Both views on a toggle, players leading. Two things earned
> their tests: the **sign convention** (`spread_line` is home-team-first, so the away
> side needs it flipped — get it wrong and the board recommends the offense expected to
> score *least*, while looking entirely normal), and **unpriced as a first-class state**.
>
> **The pricing depth in §2 was more optimistic than practice.** Measured 2026-08-20:
> weeks 1–6 fully priced, week 7 half, only scattered look-ahead lines beyond — not
> "weeks 1–13", which had counted a week as priced if *any* game in it was. So the
> unpriced state is the common case in August rather than an edge: nulls render as "no
> line", sort **last** (no line is not a low total), and the week picker labels how much
> of each week the market has got to.
>
> **The player list is the depth chart, three deep per position** — M6.2's data paying
> for itself. Letting a whole 30-man roster through would bury the second-best game
> environment under the best one's practice squad.

---

## 5. Order and size

| # | Slice | Size | Blocks |
| --- | --- | --- | --- |
| 4.0 | Season readiness + automation + bio unlock | **M** | ✅ shipped |
| 4.1 | Draft Value Board | **M** | ✅ shipped |
| 4.2 | Depth charts + team pages | **M** | ✅ shipped |
| 4.3 | Strength of schedule | **M** | ✅ shipped |
| 4.4 | Vegas board | **S** | ✅ shipped |

4.4 is small because its data arrives in 4.0; the only reason it is last is that it is
the least urgent, not the most expensive.

---

## 6. Risks and known limits

- **ECR history starts when we start.** The feed carries one scrape date. Any "rank is
  rising" feature is only as old as our first ingest — which is an argument for shipping
  4.1 sooner rather than better. *First snapshot captured: 2026-08-14.*
- **Weekly ECR is dormant out of season** (last scrape 2025-12-30). In-season weekly
  rankings light up when games resume; the draft board is unaffected.
- **`nflreadpy` 0.1.5 refuses 2026 for stats/pbp/snaps/participation/ff_opportunity.**
  Expected to roll over at kickoff. If it does not, M6.0's stats job is blocked on a
  library upgrade — worth testing the first week of September rather than discovering it
  on a Wednesday cron.
- **Lines exist only through week ~13** of 2026; weeks 14–18 are unpriced until closer.
  The Vegas board must render "not yet priced" as a first-class state, not an empty table.
- **Attribution.** ECR is FantasyPros' work and must be labelled as such on every surface,
  the same way `modelled` labels ffopportunity.
- **Depth charts are ESPN-sourced** and lag beat-reporter news by a day or more. The "as
  of" stamp is what keeps that honest.
- **A production write credential now lives in GitHub Actions.** It is the first secret in
  the repo's CI that can change production data. Scope it to the pipeline workflow, and
  treat rotation as part of the setup rather than a later chore.
- **Injuries are not in M6** (feed has no 2026 rows yet) but are the obvious M6.5 slice
  once games start — the same shape as depth charts, on the same daily job.

---

## 7. Open questions

1. ~~**SOS surface**~~ — *answered by building it: the grid leads, because strength of
   schedule is a property of a **sequence** — "CLE is 1st" says far less than seeing
   their weeks 15–17 are NYG, BAL, IND. The ranked question is answered too, down the
   left-hand column. Still open if it proves wrong in use: a player-centric second view.*
2. ~~**Vegas board out of season**~~ — *answered by building it: the **next week not yet
   played**, which in July is week 1 of the coming season. A line's whole value is that
   it is about a game nobody has played, so defaulting to last season's closing numbers
   would make the board a history exhibit.*
3. ~~**Team page season selector**~~ — *answered by building it: it has a picker over
   every **scheduled** season (not just those with stats, since a fixture list is about
   what is coming). Depth charts are stored for the current season only, so the chart
   panel explains itself on older seasons rather than rendering empty.*
4. **Value board and dynasty** — the bio unlock puts age in the database; do dynasty ECR
   variants get a view, or is redraft the only supported draft in v1?
