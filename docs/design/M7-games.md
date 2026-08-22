# M7 Design — Games (player guessing modes)

> Status: **proposed — nothing built.** Milestone: [`docs/ROADMAP.md`](../ROADMAP.md) → M7.
> Depends on M1 (metric registry + scoring engine) and M3 (percentile ranking within a
> position pool). M6 is *not* a dependency — every mode here runs on data already in
> the database, except where a mode is explicitly marked as needing the roster-bio
> unlock (§5).

Last updated: 2026-08-19

This document exists so the option set does not get lost. It records **six shortlisted
game modes** (§4), the **one engine** they should share (§3), the **data that makes them
possible** (§2), the **one cheap pipeline addition** that gates the sixth (§5), and a
**backlog of modes that were considered and kept** (§6) rather than silently dropped.

The product argument for building any of this: every other feature in GridironIQ answers
a question the user brought with them. A game is the only thing here that gives someone a
reason to open the site on a Tuesday in June.

---

## 1. What a "game" has to be here

Three constraints shape every decision below.

1. **Content cost must be ~zero.** A quiz that needs a human to write questions dies the
   week the human gets bored. Every shortlisted mode is *generated* from the database and
   the metric registry, so the question bank grows when the data does.
2. **The answer cannot ship to the client.** A daily puzzle with a shared score is only
   worth playing if the answer is not sitting in the network tab. This is the single
   biggest reason the modes need a backend and not just a React page.
3. **It must reuse the spines.** If a game needs its own copy of "what is a metric" or
   "how do I aggregate a season", the architecture failed. Every mode below reads the
   registry (`app/metrics.py`) and goes through `metric_expr()` in `app/aggregation.py`,
   exactly like the leaderboard and the scatter.

---

## 2. The data inventory (measured 2026-08-19, local DB)

What is actually on hand, because feasibility of every mode below turns on these counts:

| Asset | Size | What it buys |
| --- | --- | --- |
| `player_stats` | 36,527 game lines, 2020–2025 | the raw material for every mode |
| Player-seasons with 8+ games | 2,280 (WR 969, RB 596, TE 496, QB 219) | the answer pool — years of daily puzzles at one per day |
| Distinct players in that pool | 854 | how many answers a regular player could ever memorise |
| `player_target_depth` | 77,903 rows; 1,025 player-seasons with 40+ targets | the fingerprint mode (§6) |
| Metric registry | 76 metrics with `format`, `applies_to`, `higher_is_better`, `rankable` | the question *generator* — see §3 |
| Players with 2+ NFL teams | 505 (220 with 3+) | grid/career modes (§6) |
| `players` bio columns stored | 7 of the 39 nflverse publishes | the gap in §5 |

**The registry is the real asset.** 76 metrics × 2,280 player-seasons is not a question
bank someone has to fill; it is a question bank that already exists and only needs a
generator pointed at it.

---

## 3. The core decision — one puzzle engine, not six games

The roadmap originally scoped these as "S each (client-side quiz over the API)". That is
the wrong shape, for the reason in §1.2: a client-side quiz leaks its own answer, cannot
have a daily seed everyone shares, and leaves six unrelated codebases behind.

**Build one engine. A mode is a generator plus a renderer.**

### The shape

A puzzle is `(mode, seed, question, answer_key)`. The answer key stays on the server.

```
GET  /api/v1/games/{mode}/daily     ← today's puzzle, deterministic from the date
GET  /api/v1/games/{mode}/practice  ← a random one, unlimited
POST /api/v1/games/{mode}/guess     ← grade one guess; returns feedback, not the answer,
                                      until the puzzle is over
```

Three pieces do all the work:

- **A seeded generator per mode.** `seed = hash(mode, date)` drives a seeded RNG over the
  candidate pool, so everyone gets the same puzzle on the same day with **no puzzle table
  and no cron job**. Puzzles are computed, not stored — the same instinct as M2 (store
  expected *components*, not points) and M3 (never store an intelligence score).
- **A shared candidate pool.** One definition of "a player-season worth asking about",
  tiered by difficulty, used by every mode. Tier 1 = roughly the top 40 at the position
  by fantasy points that season (household names); tier 3 = the full 2,280. Without this,
  each mode invents its own notion of "famous enough" and the modes feel unrelated.
- **Server-side grading.** `POST .../guess` is the only thing that knows the answer. This
  is also where a future streak/score record would attach.

### What it costs to add a mode after the first

A generator function (pick the entities, pick the metric, build the payload), a grader
function, and a renderer. Everything else — pool, seeding, routing, the daily/practice
split, sharing — is already there. That is why the shortlist is ordered the way it is in
§7: the first mode pays for the engine, the next four are nearly free.

### Deliberately not in v1

- **No `game_results` table.** Streaks and leaderboards can live in `localStorage` first,
  the same way board state did before M5. ⚠️ When a results table *is* added, it holds
  user data, so it must enable RLS with **no policies** in its migration — see the rule
  in CLAUDE.md and migration `8f73b5b2b1a1`.
- **No accounts requirement.** Per the standing rule, accounts are a persistence layer,
  never a gate. Games are fully playable signed out.

---

## 4. The shortlist

Six modes, in the order they were picked. Each entry says what the player sees, how the
generator builds it, and what the grader does.

### 4.1 Stat-Line Wordle — *the flagship*

**Player sees:** a hidden player-season, revealed one clue at a time. Fewer clues used,
more points. Guess at any point.

**Generator:** pick a player-season from the pool, then **order its clues by computed
identifying power** — the flourish that makes this mode self-tuning.

- Identifying power of a stat = how *extreme* that player's value is within the position
  pool for that season, i.e. `|percentile − 50|`. A 41% target share is a near-unique
  fingerprint and leads; 8 receiving TDs is true of dozens of players and comes last.
- M3 already computes percentile ranks within a position pool
  (`app/intelligence.py`) — that is exactly the primitive this needs. No new maths.
- **Refinement if extremity proves too blunt:** the honest measure of a clue is how much
  of the pool it *eliminates*, i.e. `−log(fraction of pool within ±ε of this value)`.
  Equally computable. Start with extremity; it is the cheaper 90%.
- **Keep identity clues out of the ranking.** Team, position, and games played are
  near-solvers, not stats. They belong in a separate context bucket revealed at fixed
  points (or as the final, most expensive reveal), never sorted in with the metrics.

**Grader:** exact player match. Score starts at N and decays per clue revealed; a wrong
guess costs a clue.

**Why it is the flagship:** it is the only mode where the *content ordering itself* is
derived from the data. The clue order for a 2023 slot receiver and a 2021 deep threat
come out different without anyone authoring either.

### 4.2 Higher or Lower

**Player sees:** two player-seasons and one metric. Which was higher? Streak until wrong.

**Generator:** pick a metric where `rankable: true`, pick two player-seasons whose
positions both satisfy the metric's `applies_to`, and select on the gap.

- **Difficulty = the percentile gap, not the raw gap.** Percentile is comparable across
  metrics on wildly different scales (yards vs. share vs. EPA); raw difference is not.
  Easy ≈ 30+ percentile points apart, brutal ≈ under 5.
- **Guard the near-tie floor.** Below some gap it is a coin flip that *feels* unfair
  rather than hard. Exclude exact ties outright.
- Difficulty can ramp with the streak — no authoring, just a widening filter.

**Grader:** compare the two values. Note direction only matters for *phrasing* ("who had
more fumbles?"); `higher_is_better` does not change which number is larger.

### 4.3 Rank 'Em

**Player sees:** 4–5 player-seasons to drag into order by one metric.

**Generator:** same picker as Higher or Lower, extended to n entities, with the same
near-tie guard applied pairwise so no two are within noise of each other.

**Grader: inversion count (Kendall tau distance), not all-or-nothing.** One swapped pair
out of 10 possible pairs at n=5 should score 9/10, not zero. This is the whole reason the
mode is worth building over a fifth multiple-choice quiz — it produces a *gradient*, so
near-misses feel earned and scores spread out.

**Reuse:** the headshot-bubble treatment from the M4 scatter gives the drag list an
identity for free.

### 4.4 Guess the Number

**Player sees:** one player-season, one metric, type a number. Price-is-Right.

**Generator:** the cheapest of all — one entity, one metric, no selection constraint
beyond the pool.

**Grader — this is where the registry earns its keep.** Two graders, chosen by the
metric's `format` field:

- **Counting stats** (`format: "int"` or a decimal count) grade on **log error**, so
  missing 1,400 receiving yards by 200 is penalised like missing 14 TDs by 2. Absolute
  error would make every large-magnitude stat trivially unfair and every small one
  trivially easy.
- **Rates and shares** (`format: "pct"`) grade on **absolute error**. A target share of
  5% vs. 10% is a 2× log error but only five points of share — log error would savage a
  reasonable guess.
- Needs an ε floor for zero-valued stats.

That the grading function is selected by existing registry metadata, rather than a
hand-maintained list, is the same principle as the leaderboard deriving aggregation from
`aggregation`.

### 4.5 Odd One Out

**Player sees:** four player-seasons — three cleared a threshold, one did not.

**Generator:** pick a metric, set the threshold at a **round number near a percentile
boundary** (e.g. the p75 value rounded to something a human would say out loud: "25%
target share", "1,000 yards"), then pick three comfortably above and one clearly below.

- **Both margins matter.** If the odd one is a hair under the line the puzzle feels like
  a trick; if the three are all miles over it is not a puzzle at all. Band both sides.
- **Open question — state the trait or hide it?** Any four players differ on dozens of
  axes, so a hidden trait means several defensible "odd ones" and only one accepted
  answer. Stating it ("three of these had a 25%+ target share — which didn't?") makes it
  a fair threshold quiz; hiding it makes a harder, occasionally unfair one. Recommend
  stating it in v1, with hidden-trait as a possible hard mode.

**Grader:** exact match on the intended odd one; the reveal always shows the threshold
and all four values, so the logic is visible.

### 4.6 Poeltl-style Guessr

**Player sees:** guess the player; each wrong guess reveals a comparison grid against the
answer.

**⛔ Blocked on the roster-bio unlock in §5.**

**The honest read: this format is well-trodden in NFL** — Weddle and Gridiron Guessr both
exist and both do the standard reveal grid (team, position, height, weight, age, jersey,
college, draft). Building that again adds nothing.

**Only build it with fantasy reveal columns.** Target share tier, snap share band, ADOT
band, route participation, position, team, season — the columns nobody else has, and the
columns that make a *fantasy* player able to reason toward the answer. Height and weight
should be at most secondary.

Directional arrows for numeric attributes and near-miss colour bands are the expected
affordances — and their colours must come from the theme tokens (`--pos` / `--neg`),
never hardcoded, per the design rules.

---

## 5. Prerequisite — the roster-bio unlock

`nfl.load_players()` publishes **39 columns**; [`pipeline/ingest_players.py`](../../pipeline/ingest_players.py)
stores **7**. The unused ones are exactly the bio attributes a guessing game wants:

```
college_name  college_conference  draft_year  draft_round  draft_pick  draft_team
birth_date    height              weight      rookie_season  years_of_experience
```

**Cost:** one Alembic migration, columns on `backend/app/models/player.py`, ~10 lines in
`ingest_players.py`, and the fields added to the player schema/response.

**Note these are bio attributes, not metrics** — they do **not** get metric-registry
entries. The registry describes things that aggregate over games; a college does not.

**Unblocks:** Poeltl-style Guessr (§4.6), "Name their college" and the mock-draft ideas
already on the roadmap, and an age/experience axis for several backlog modes.

`players` is an NFL reference table — public read-only data — so it is **exempt** from the
RLS rule, which covers user data only.

---

## 6. Backlog — considered, kept, not shortlisted

Recorded so the option set survives. Roughly in order of how distinctive they are.

- **Target-Depth Fingerprint.** Show an unlabelled depth chart (behind LOS / 0–9 / 10–19 /
  20+); guess the receiver. **The most proprietary idea here** — `player_target_depth` is
  not something other public sites have, and the profiles are genuinely identifiable:
  2024 deep-target share ran Alec Pierce 48%, Demarcus Robinson 32%, DK Metcalf 31%, down
  to checkdown backs at 1–3%. 1,025 player-seasons have 40+ targets, enough to draw. The
  M4 chart component already exists.
- **Regression Roulette.** Show a player's first-half profile — usage, expected points,
  actual points, no name — and ask whether the second half went up or down. Powered
  entirely by `app/intelligence.py` and the M2 expected components. **Its real value is
  as an evaluation harness:** aggregate the guesses and you have a public scoreboard of
  humans vs. the Positive-Regression Index. A game that measures whether the model works
  is a better argument for the model than a chart of it.
- **Immaculate Grid, fantasy edition.** 3×3, teams on one axis, *fantasy* criteria on the
  other instead of Pro Bowls. The cell sizes land right: 300+ PPR seasons = 120,
  1,000+ receiving yards = 156, 25%+ target share (8+ games) = 119 — findable but not
  obvious. 505 players with 2+ teams supply the team axis. Rarity scoring falls out of
  the counts.
- **Start/Sit Retro.** Two players, one real historical week, who scored more? The
  differentiator is that it resolves through the **user's own scoring config**, so a
  TE-premium league and a standard league can get different correct answers on the same
  matchup. No other NFL game can do that.
- **Boom or Bust.** A weekly fantasy sparkline with the name hidden — guess the player, or
  guess which week they went off. Trivial on the existing game-log endpoint.
- Already on the roadmap and still live: **Name their college**, **Name a dude**,
  **17-0**, **EPA draft**, **mock draft simulator**.

## 6b. Rejected

- **Headshot blur / pixelate.** No data moat — it is an image-cropping trick any site
  could ship — and the image rights are murkier than stat facts.
- **Authored trivia** (records, Super Bowls, milestones). Requires writing content we do
  not have and cannot generate, which violates §1.1 directly.

---

## 7. Suggested build order

| Step | Work | Size |
| --- | --- | --- |
| 1 | The engine (§3) + **Higher or Lower** as its first mode | S–M |
| 2 | **Rank 'Em** and **Guess the Number** — same generator, new graders | S |
| 3 | **Odd One Out** | S |
| 4 | **Stat-Line Wordle** — needs the clue-ranking work, worth doing properly | M |
| 5 | Roster-bio unlock (§5), then **Poeltl-style Guessr** | S + M |

Higher or Lower goes first not because it is the best mode but because it is the
**simplest thing that forces the engine to exist**. Stat-Line Wordle is the best mode and
should not be the one debugging the seeding and grading plumbing.

---

## 8. Open questions

- **Answer entry.** Free-text player names need fuzzy matching and an autocomplete
  (nicknames, suffixes, "Marvin Harrison Jr."). Multiple choice sidesteps it entirely but
  makes every mode easier. Probably: autocomplete-constrained free text, so the input is
  always a real player id.
- **Season disclosure.** Is the season part of the question ("2023 — guess the player") or
  part of the answer? Hiding it multiplies difficulty by six. Recommend showing it.
- **Odd One Out ambiguity** — stated vs. hidden trait, see §4.5.
- **Where games live in the nav.** A fifth dropdown, or a single `/games` hub? A hub is
  likely right: games are a different *kind* of thing from the boards, and the nav is
  already carrying four dropdowns and 19 destinations.
- **Do daily results need accounts?** `localStorage` first, consistent with spine C. Only
  add a table when cross-device streaks are actually asked for — and with RLS.
