# GridironIQ — Product Roadmap

> Source of truth for product direction. `CLAUDE.md` holds the spec and scope
> summary; this file holds the vision, architecture spines, and the milestone
> plan. Update this when priorities change, then reconcile `CLAUDE.md`.

Last updated: 2026-08-20 (M6 shipped)

---

## Product vision

**The fastest way to make a confident fantasy decision.** GridironIQ turns raw NFL
data into fantasy answers — *in your league's exact scoring* — so a manager can see
who to **start, buy, sell, and draft**, and *why*, better than anywhere else. Free,
fast, beautiful, and deep enough for the analytics crowd.

Fantasy-first is the identity, not a feature. Advanced stats and general NFL data
remain first-class (the depth is a differentiator), but they serve the fantasy lens.

## Core differentiators (the moat)

1. **Your-league-scoring everywhere.** Input your exact scoring once; every
   leaderboard, metric, ranking, and tool recomputes to it. Others give a
   PPR/Half/Std toggle — we give you *your* league.
2. **Opportunity & regression intelligence.** Descriptive, explainable buy/sell/
   regression signals (Positive-Regression Index, Sell-High Index, Fantasy
   Opportunity Rating, VORP) — the *why* behind value, not a black-box projection.
3. **Self-serve data viz.** Scatter builder, comparison builder, pass/opportunity
   charts, exportable — an exploration layer most fantasy sites lack.
4. **Custom-metric builder.** Power users compose their own metrics from raw
   components.
5. **Free, fast, fotmob-grade design** in a category full of ugly, paywalled tools.

---

## Architectural spines (build these right first)

Everything stacks on three foundations, so features compose instead of getting
retrofitted:

- **A) Scoring-aware fantasy engine.** Store *raw components* (already done); compute
  fantasy points from a **scoring config** at query time. Custom scoring, VORP, FOR,
  regression indices, comparisons all call one `fantasy_points(components, config)`
  function. Build first → never retrofit "custom scoring" into a dozen features.
- **B) Single metric registry.** One canonical definition per metric (id, label,
  description, format, how-to-compute, higher-is-better, position applicability),
  shared by leaderboards, scatter, compare, and the custom-metric builder. Replaces
  today's scattered "add it in 4 places" knowledge.
- **C) Stateless-first persistence.** URL-encoded + `localStorage` state before
  accounts. Shareable by default; accounts later just sync the same state. **Completed
  in M5** — accounts slot in as one more fallback layer
  (`URL > active profile > localStorage > default`) rather than replacing anything, and
  the board filters that had never actually made it into the URL now do.

Plus one data-model rule set now to avoid a later migration:

- **Multi-source projections.** Model projections as `(player, season, week, source,
  scoring_context)` from day one so **consensus**, a future **GridironIQ model**, and
  **user-generated** projections coexist. (See Decision Log.)

---

## Milestones (priority order)

Each milestone is independently deployable. Complexity: **S** = days, **M** = 1–2
weeks, **L** = multi-week.

### 🧱 M1 — Scoring & Metric Foundation (spines A + B) — L — **✅ SHIPPED**
The architectural spine; de-risks everything after. Ships custom scoring on day one.
- **Deps:** none. **Data:** existing `player_stats` — zero data risk.
- **DB:** no new columns; optional `scoring_presets` reference table (PPR/Half/Std/DK/FD).
- **Backend:** extract `fantasy_points(components, scoring_config)`; `/stats/leaderboard`
  accepts a scoring config and computes fantasy columns from raw components; add a
  `/metrics` registry endpoint.
- **Frontend:** shared `metrics` module from the registry; a "League Scoring" editor
  persisted in URL/`localStorage`; leaderboard reads scoring from that state.
- **Ships:** custom league scoring live on the leaderboard.

### 📊 M2 — Expanded Metrics & Expected Points — M — **✅ SHIPPED**
Design note: [`design/M2-expanded-metrics.md`](design/M2-expanded-metrics.md).
- **Deps:** M1 (registry). **Data:** `load_pbp` + `load_ff_opportunity` +
  `load_snap_counts` + `load_participation`.
- **DB:** added `rush_att_inside_10/5/2`, three market-share columns
  (`rush_attempt_share`, `opportunity_share`, `market_share`), and nine **expected
  components**. Deliberately **no** `expected_fantasy_points` column — expected points
  are computed from the components by the M1 scoring engine, so xFP recomputes in the
  user's exact league scoring and stays comparable to actual points.
- **Backend:** expected-points support in the scoring engine, an `expected`
  aggregation + `modelled` flag in the registry, xFP / xFPPG / points-over-expected on
  the leaderboard, and a scoring-aware player game log.
- **Frontend:** a new "Expected Points" fantasy board, expected + usage columns across
  the existing boards, and expected-vs-actual on player pages (panel, xFP overlay on
  the trend chart, xFPTS in the game log).
- **Also folded in:** the snap and route columns the pipeline had been leaving NULL
  (`snap_count`, `snap_share`, `routes_run`, `route_participation`, TPRR, YPRR) plus
  `unrealized_air_yards`. Only `slot_snaps` remains unavailable.
- **Data limits:** `ff_opportunity` is a model estimate — labelled as `modelled` in
  the registry and on every surface. ffopportunity models no expected fumbles, a small
  known upward bias in xFP. `routes_run` is pass-play participation, not charted routes.

### 🧠 M3 — Fantasy Intelligence (the moat) — M–L — **✅ SHIPPED**
Design note: [`design/M3-fantasy-intelligence.md`](design/M3-fantasy-intelligence.md).
Most original, most on-brand. Rule/formula-based on existing data.
- **Deps:** M1 + M2. **Data:** existing — no new ingestion.
- **Shipped:** **VORP** (+ VORP/game), **Fantasy Opportunity Rating** (0–100),
  **Positive-Regression Index** (buy-low), **Sell-High Index** — every score computed
  from percentile ranks within the player's position pool, in the user's own scoring.
- **DB:** **none.** Every score is query-time. Materialising them would mean one row
  per scoring-context per league-context — the trap M2 avoided by storing components.
- **New second spine-A-style config: league context** (`app/league.py`) — league size +
  starting lineup, resolved into a replacement rank per position (12-team standard →
  QB12/RB28/WR42/TE14, flex shared across RB/WR/TE by lineup proportion, superflex to
  QB). Scoring says how much a point is worth; league context says worth more than
  *what*. Every later value feature (trade calculator, dynasty) needs both.
- **Backend:** `GET /stats/intelligence` (season or trailing 4/8-week window) and
  `GET /players/{id}/intelligence` (scores + the per-input breakdown the player page
  renders). `app/aggregation.py` extracted so the leaderboard and this board share one
  aggregation implementation.
- **Frontend:** a third nav dropdown — **Insight ▾** — with four boards (VORP /
  Opportunity Rating / Buy Low / Sell High), the league-context editor showing the
  replacement level it produces, badges + a full explanation panel on player pages, and
  live buy-low/sell-high tiles on the Command Center.
- **Validated, not just shipped:** scored on weeks 1–9 and measured on weeks 10–18,
  FOR predicts rest-of-season PPG almost monotonically (Q1 ≈2.4 → Q5 ≈13.4 PPG, all of
  2022–2024). Controlling for first-half production, high-index players beat low-index
  players by ~+2 PPG (buy-low) and −2 PPG (sell-high) among high producers. See the
  design note's backtest section — including where the buy signal is weakest.
- **Data limits:** weights are documented judgement, not fitted; anything built on the
  expected-points gap inherits ffopportunity's no-expected-fumbles bias; rookies have
  no career-efficiency baseline (it renormalises away).

### 🔬 M4 — Exploration & Viz — M — **✅ SHIPPED**
Design note: [`design/M4-exploration-viz.md`](design/M4-exploration-viz.md).
The layer that lets someone ask their own question instead of picking from ours.
- **Deps:** M1/M2/M3. **Data:** existing, plus one pbp-derived table (below).
- **Shipped:** a **curated scatter builder** — 19 pre-canned charts across six position
  groups (All / QB / RB / WR / TE / Flex), players drawn as **headshot bubbles**, median
  quadrant guides, click-through; **comparison builder** (≤5 players: a **lead-margin**
  table with headshots, overlaid weekly trend, and a percentile radar); **enhanced
  player pages** (weekly usage-share chart + depth-of-target chart); **CSV export** on
  all 17 boards and both Explore views.
- **Custom-metric engine — differentiator #4, half pulled forward.** The engine ships:
  a `custom=` request config alongside scoring and league, deliberately **structured** —
  `Σ(weight × metric) ÷ (metric | games)` — so there is no expression parser and no
  `eval` on a public endpoint. Two built-ins run on it via a new `composite` registry
  aggregation: **High-Value Touches / Game**
  (`(red_zone_targets + rush_att_inside_5) / games`) and **Touches Per Snap**
  (`(targets + carries) / snap_count`). The **builder UI is deferred** — see the
  2026-08-04 decision on curation.
- **DB:** one table, `player_target_depth` (migration `7852e5b550b0`) — a deliberate
  deviation from the "DB: none" plan, because `air_yards` is stored as a per-game total
  and a total cannot be un-summed into buckets. Stored at (player, game, depth bucket,
  **direction**) so the directional grid never needs a second backfill.
- **Backend:** `/stats/scatter`, `/stats/compare`, `/players/{id}/target-depth`,
  `app/custom_metrics.py`, and `metric_expr()` in `app/aggregation.py` — one
  metric→SQL mapping now shared by the leaderboard and the scatter.
- **Verified:** target-depth ingestion reconciles **exactly** against `player_stats`
  (2024: 16,903 bucketed targets vs 16,903 stored; receiving yards within 3 of 126,385).
  Custom-metric SQL `ORDER BY` and the Python display value agree on every row.
- **Deferred deliberately:** **PNG export** — chart-to-PNG only earns its complexity
  once there is a handle/domain to watermark with (growth playbook #2); until then a
  user's own screenshot is as good.
- **Data limits:** pass *charts* yes; route *trees* no (see Cut Ideas). Custom metrics
  are unvalidated by construction — any two metrics can be divided, so they carry no
  "good direction" and are never used in Insight scoring.

### 🔐 M5 — Accounts & Saved State — M — **✅ SHIPPED & LIVE** (accounts enabled 2026-08-12)
Design note: [`design/M5-accounts-saved-state.md`](design/M5-accounts-saved-state.md).
The completion of spine C: the same state, now following you between devices.
- **Deps:** M1–M4 (state worth saving). **Data:** none — no NFL ingestion.
- **Auth:** **email + password *and* email magic link** — no third-party account
  required — via Supabase Auth used *purely as a token issuer*. FastAPI verifies the JWT
  (`app/auth.py` — asymmetric JWKS *and* legacy HS256) and owns every account table
  through SQLAlchemy/Alembic. Deliberately **not** frontend → Supabase with RLS: that
  would split the data layer and put authorization in dashboard-managed policies instead
  of reviewable Python.
- **DB:** four cascading tables (migration `990003c7c7cf`) — `users` (the Supabase
  subject, mirrored just-in-time on first authenticated request), `league_profiles`,
  `favorites`, `saved_views`. A partial unique index enforces one active profile per
  user in the database, not just in app code.
- **Shipped:** **multiple named league profiles** (each a bundle of the two spec
  strings, stored verbatim so `scoring.py`/`league.py` stay the only grammar);
  **favorites** (star on rows and player pages, a server-side watchlist filter on all
  17 boards, a "My Players" tile on the Command Center); **saved views** (any board or
  Explore tool, stored as route + query string, so every board added later is saveable
  the day it ships); `DELETE /me` in the first release, because collecting an identity
  means owing a way to revoke it.
- **Nothing is gated.** Signed-out is a first-class state; every board and share link
  works exactly as before. An account buys sync, naming, and more than one of a thing.
  Resolution order is `URL > active profile > localStorage > default` — **the URL wins
  on purpose**, or a shared `?scoring=` link would silently show the recipient their
  own league instead of the sender's.
- **Also fixed:** the 17 boards had kept season/week/position/sort in `useState`, so a
  board link carried none of them and the first saved view stored a bare path. Now
  URL-backed (`useUrlState`) — which is what spine C had claimed since M1.
- **Verified:** 36 backend checks (CRUD, the one-active invariant, successor promotion,
  idempotent favorites, path-injection rejection, cascade, and **cross-user isolation**
  — user B gets 404s, never user A's rows); the JWT path rejects tampered, wrong-secret,
  expired, wrong-issuer, and `alg=none` tokens; and the full signed-in UI driven in a
  browser, including that a watchlist-filtered board reports the *correct total* (proving
  a server-side filter, not a trimmed page) and that Insight percentiles are unchanged
  by filtering.
- **Known limits:** **every auth path depends on email delivery**, so a real SMTP sender
  must be configured before real traffic (Supabase's built-in mailer is rate-limited and
  spam-prone); the watchlist filter passes ids in the query string (the reason for the
  300-favorite cap); and the frontend account surfaces are still covered only by
  browser-driven checks.
- **Test suite:** the backend half of that verification is now committed as
  `backend/tests/` — **150 tests** covering token verification, JIT provisioning,
  cross-user isolation on every account endpoint, and the RLS lockdown. The first
  automated tests in the repo, started here because this is the first code where a bug
  means one user reading another's data. Run on every pull request by
  `.github/workflows/backend-tests.yml`, the repo's first CI.

### 🗓️ M6 — New Data Domains — M–L — **✅ SHIPPED**
**Design note: [`docs/design/M6-new-data-domains.md`](design/M6-new-data-domains.md)** —
the measured feeds, the decisions, and the slice-by-slice plan. Read it before building
any of this.
- **The reframe: M6 is the first milestone about the future.** M1–M5 all describe
  completed seasons, so data was immutable, the pipeline could be manual, and "current
  season" could be a constant. All four M6 domains are perishable — which is why the
  milestone opens with a **season-readiness slice** rather than a feature.
- **Build order:** **4.0 season readiness** ✅ (2026 schedule + rosters, Vegas line
  columns, the roster-bio unlock, a scheduled GitHub Action, computed season defaults) →
  **4.1 Draft Value Board** ✅ (the draft-season sprint) → **4.2 depth charts + team
  pages** ✅ → **4.3 strength of schedule** ✅ → **4.4 Vegas board** ✅.
- **Draft Value Board** ✅ — consensus ECR next to **our** expected-points VORP rank, and
  the **gap** between them, first in **Insight ▾**. Both ranks are counted over the same
  players and the board stops at draftable depth — see the Decision Log entry, and the
  design note's §4.1 for the two corrections that took.
- **Depth charts** ✅ — `load_depth_charts`, **latest snapshot only**, QB/RB/WR/TE, on a
  **new team page** (`/teams/:teamId` — record, fixtures with lines and implied totals,
  depth chart with each player's PPG in *your* scoring) plus a dated badge on player
  pages. The ingest replaces rather than upserts; see the Decision Log.
- **Strength of Schedule** ✅ — fantasy points allowed by position, **computed through
  the scoring engine** so a TE-premium league gets its own answer, on a 0–100 scale where
  higher is harder. Prior-season basis rolling into current-season as games are played,
  always labelled. Windows: ROS, next 4, fantasy playoffs (15–17), full season. A team ×
  week grid, plus a strip on team pages and a column on the draft board.
- **Vegas board** ✅ — **no odds API needed**: `load_schedules` already carries forward
  `spread_line`/`total_line`. Columns landed in 4.0; the board is a player view (implied
  team totals) and a game view on one toggle. Pricing depth measured 2026-08-20: weeks
  1–6 full, week 7 half, sporadic beyond — so "not priced yet" is the common August
  state and renders as such, never as a low total.
- **Consensus is a *ranking*, not a projection** — `load_ff_rankings` has no projected
  points and no ADP. Stored in a `player_rankings` table (multi-source from day one);
  the `projections` table stays unbuilt until there is a projection to put in it.

### 🕰️ M8 — Historical Depth (1999–present) — M — **✅ SHIPPED**
**Design note: [`docs/design/M8-historical-depth.md`](design/M8-historical-depth.md)** —
the measured audit behind every window. Read it before touching `availability.py`.
- **Scope back to 1999**, the floor of nflverse play-by-play: 27 seasons instead of six,
  ~150k stat lines instead of 36k. Betting lines came along for free — 7,388 of 7,548
  games are priced back to 1999, so the Vegas board gained a quarter-century of history
  with no new ingest.
- **The real work was honesty about depth, not the ingest.** Coverage arrives in layers
  and the feeds report what nobody measured as `0`. Box score, fantasy points, EPA and
  all rushing detail reach 1999; charted passing starts 2006, snaps 2013, routes
  2016–2025, expected points 2009 — and **targets are unrecoverable 2003–2008**, because
  play-by-play in those seasons names a receiver only on completions.
- **One measured table, mirrored** (`pipeline/availability.py` +
  `backend/app/availability.py`): the pipeline NULLs what a season cannot support, the
  registry carries each window to the UI, and a test fails if the two drift. Composite
  metrics derive their window from their inputs.
- **Two silent bugs the range exposed:** season rows took the team from
  `players.team_id` (Torry Holt's 2004 was a Jacksonville season), and the schedule and
  stats feeds disagree about historical franchise codes — which had been crediting every
  Rams stat line from 1999–2015 to the wrong defense in SOS.
- **Not done:** production is still 2020–2025; the backfill is local only.

### 🎮 M7 — Games & Growth — S–L each (Dream, but a cheap hook can slot in early)
**Design note: [`docs/design/M7-games.md`](design/M7-games.md)** — the full option set,
the shared engine, and the data behind each mode. Read it before building any of this.
- **The shape:** **one puzzle engine, not N games.** A mode is a generator plus a
  renderer over a shared candidate pool, with a date-seeded daily puzzle and
  **server-side grading** (`/api/v1/games/{mode}/daily|practice|guess`). The earlier
  "client-side quiz over the API" framing is superseded — it leaks its own answer and
  can't support a shared daily. See the Decision Log entry of 2026-08-19.
- **Shortlist (build order):** **Higher or Lower** (first — the simplest mode that
  forces the engine to exist) → **Rank 'Em** + **Guess the Number** (same generator,
  new graders) → **Odd One Out** → **Stat-Line Wordle** (the flagship: clue order
  derived from percentile extremity, so content self-tunes) → **Poeltl-style Guessr**
  (only with *fantasy* reveal columns — the standard bio grid is already taken by
  Weddle / Gridiron Guessr).
- **Data:** the shortlist runs entirely on data already ingested — 2,280 player-seasons
  with 8+ games (854 distinct players) and the 76-metric registry, which *is* the
  question generator. Only the Guessr needs new data: the **roster-bio unlock** —
  `load_players` publishes 39 columns and `ingest_players.py` stores 7, leaving college,
  draft, birth date, height/weight and experience on the table (one migration + ~10
  lines). Mock draft still needs ADP from `ff_rankings`.
- **Complexity:** engine + first mode ≈ S–M; each additional shortlist mode ≈ S, except
  Stat-Line Wordle ≈ M (clue ranking). "EPA draft" and "mock draft simulator" ≈ M–L
  (game logic + ADP + deviation model).
- **Kept in the backlog** (design note §6): Target-Depth Fingerprint (the most
  proprietary — nobody else has `player_target_depth`), Regression Roulette (doubles as
  a public evaluation harness for the Positive-Regression Index), fantasy Immaculate
  Grid, Start/Sit Retro (resolves in *your* scoring), Boom or Bust, plus the original
  "Name their college" / "Name a dude" / "17-0".

### ✅ M9 — Draft (shipped 2026-08-23, ahead of M7)

- **Shipped:** a fifth nav dropdown, **Draft ▾** — **Rankings** (`/draft/rankings`), the
  **Mock Draft** room (`/draft/mock`), and the M6.1 **Value Board**, moved here from
  `/insight/draft` (which redirects, so saved views survive).
- **Rankings leads with the market, not with us.** A consensus ordering with our
  expected-VORP valuation as the column beside it — never a re-ranking of the consensus
  by our own numbers, because the board that *is* our opinion already exists next door
  and two pages both claiming to be "the ranking" is how a user stops trusting either.
- **"Consensus" is now a blend.** FantasyPros plus any expert board dropped into
  `pipeline/data/rankings/` as CSV, each **densely re-ranked before averaging** so a
  400-name board cannot outvote a 150-name one. The blend is **anonymous by
  construction**: the source registry is fail-closed, so a paywalled input can only ever
  leave the server inside an average. A first build required two sources per player and
  silently truncated the whole consensus to the shallowest board's depth.
- **Users bring their own boards** — a strict CSV upload (unmatched names come back with
  their ranks rather than being dropped) or a drag-and-drop editor. An account is needed
  to *keep* a board, never to read one.
- **Mock draft runs client-side, grades server-side.** Bots have no ADP — none exists
  free — so their reach and fall are drawn from the consensus's own disagreement, plus
  positional need and a randomness dial. Graded on expected VORP, for the M6.1 reason.
  QB/RB/WR/TE only: we hold no kicker or defense data and a placeholder round would be
  a fake.
- **In-season it becomes a weekly board.** Data-driven, not calendar-driven. There is
  deliberately **no rest-of-season ranking** — no free source publishes one, and
  building one would be a projection wearing a ranking's clothes (still a Dream item).
- **Also found:** the ECR *archive* is a real time series back to 2019, so ECR history
  **is** backfillable after all — M6.1's note applies only to the snapshot file beside
  it. And a latent import cycle in `app/metrics.py` that made three modules unimportable
  on their own.
- Full design note: [`docs/design/M9-draft.md`](design/M9-draft.md).

### 💭 Dream tail (only when the base is proven)
- **Fantasy trade calculator** — on VORP / rest-of-season value.
- **GridironIQ projection model** — own weekly/season model (see Decision Log).
- **User-generated projections** — let users publish their own projections/rankings
  (multi-source schema makes this additive).
- **Survivor pool** — live-odds dependency.
- **Dynasty value + league import** — `ff_playerids` crosswalk (validate its CSV
  fallback reliability first); dynasty value has no free authoritative source.

---

## Data reality check (grounded in `nflreadpy` 0.1.5)

| Feature | Source | Verdict |
|---|---|---|
| Expected fantasy points | `load_ff_opportunity` | 🟢 Ready-made |
| Consensus projections / ADP | `load_ff_rankings` | 🟡 **Rankings only** — ECR + dispersion, **no projected points, no ADP** (measured 2026-08-19). ECR→`gsis_id` via `load_ff_playerids`: 436/440 skill players, 0 misses in the top 200 |
| Depth charts | `load_depth_charts` | 🟢 A **timestamped snapshot feed** — 152 snapshots for 2026 so far, ~450k rows/season. M6 stores the latest only; nflverse retains the rest, so a change-log is backfillable later |
| Historical Vegas lines | `load_schedules` | 🟢 |
| **Upcoming** Vegas lines | `load_schedules` | 🟢 **Also here** — measured 2026-08-20: weeks 1–6 fully priced, week 7 half, scattered look-ahead lines beyond. An odds API is an upgrade (intraday moves, the unpriced weeks), not a prerequisite |
| Rush attempts by yard-line | `load_pbp` | 🟢 Derive |
| **Seasons 1999–2019** | `load_pbp`, `load_player_stats`, `load_schedules` | 🟢 **Shipped M8** — all three reach 1999. Coverage is layered, not uniform: see the M8 design note |
| Targets, 2003–2008 | `load_pbp` | 🔴 **Unrecoverable** — a receiver is named only on completions, so incompletions cannot be attributed. `load_ff_opportunity` looks like it has them and is reporting receptions (measured 2026-08-23) |
| Snap counts | `load_snap_counts` | 🟡 **2013+**, not the documented 2012 — nflreadpy accepts 2012 but the file is empty upstream |
| Participation / routes | `load_participation` | 🟡 **2016–2025 and ended** — FTN stopped publishing. The registry reads the real ceiling from the data rather than hardcoding a year |
| Replacement level / VORP | derived from the position-pool distribution + league config | 🟢 Shipped M3 |
| Buy-low / sell-high signals | derived (expected-points gap + usage + career baseline) | 🟢 Shipped M3 |
| Snap share / NGS / PFR adv | `load_snap_counts` / `load_nextgen_stats` / `load_pfr_advstats` | 🟢 (NGS 2016+, PFR 2018+) |
| Snap counts | `load_snap_counts` (PFR, `pfr_id` crosswalk) | 🟢 Shipped M2 |
| Pass-play participation ("routes run") | `load_participation` × `load_pbp` | 🟢 Shipped M2 — populated **2020–2025**, GSIS ids join directly (see note below) |
| Catchable targets | `load_ftn_charting` | 🟡 2022+ only |
| Slot vs wide alignment | — | 🔴 No free source (see M2 design note §3) |
| Intraday odds movement (survivor) | external odds API | 🟡 New dependency — deferred, see the row above |
| Target depth / pass direction | `load_pbp` `air_yards` + `pass_location` | 🟢 Shipped M4 — populated **2020–2025** (see correction below) |
| Route trees (drawn) | player tracking | 🔴 Not available free |
| Dynasty value | — | 🔴 No free authoritative source |

> **Correction (2026-07-30).** Directional pass data was expected to have degraded for
> recent seasons — nflfastR parses `pass_location` from play-description text, and that
> text has changed format over the years. It did not: `pass_location` is NULL on only
> 6.8–7.9% of pass plays, flat from 2020 through 2025, and that rate tracks the
> `air_yards` NULL rate (sacks, scrambles, throwaways — plays that are not targets at
> all). Coverage of actual *targets* is effectively complete, verified by an exact
> reconciliation against `player_stats`. The full direction × depth grid is therefore
> available; M4 stores both dimensions and ships the depth-only chart.

> **Correction (2026-07-29).** This table previously recorded the participation feed as
> frozen after ~2023, which ruled out route metrics for current seasons. That is not
> the case: `load_participation` returns fully-populated `offense_players` through
> 2025 (45,919 plays in 2024; 45,184 in 2025). Route metrics shipped in M2 for all six
> seasons on that basis — as pass-play participation, not charted routes.

---

## Cut / reframed ideas (and why)

- **Route trees (drawn):** need per-player X/Y tracking data nflverse doesn't publish
  (the participation feed lists who was on the field, never route coordinates).
  → **Reframed** to pass-location charts + route participation (participation shipped
  in M2; pass-location charts are M4).
- **Catchable targets:** only via FTN charting, **2022+**. Ship as a recent-seasons
  metric with the gap labeled; true history needs PFF (paid).
- **Homemade projections early:** trust risk + effort out of proportion when consensus
  + expected points exist. → Consensus first; own model later (Decision Log).
- **Dynasty value:** no free authoritative source. → Approximate via VORP + contracts;
  defer a real crowd-source integration.
- **Odds API for upcoming lines:** assumed necessary for a Vegas board; it is not.
  nflverse's schedule feed ships forward spreads/totals ~13 weeks out. → **Reframed**
  to an upgrade (intraday movement, unpriced late weeks), not an M6 dependency.
- **A `projections` table in M6:** there is no projections feed — `ff_rankings` is
  ranks, not points. → **Reframed** to `player_rankings`; a real projections table
  waits for real projections (ours, or a user's).
- **Headshot blur / pixelate game:** no data moat (an image crop any site could ship) and
  murkier image rights than stat facts. → **Cut**; the M7 shortlist guesses from *stats*.
- **Authored trivia** (records, Super Bowls, milestones): needs content we don't have and
  can't generate, so the question bank stops growing the week someone stops writing it.
  → **Cut** in favour of generated modes (`docs/design/M7-games.md` §1).

---

## Growth & Social presence

Social is a distribution layer on top of the product, not a milestone that blocks
anything. The product bar it depends on — **every shared stat links back to a fast,
screenshot-worthy public page** — is already in our DNA (stateless-first, shareable
URLs, fotmob-grade design). Timing tracks the milestones:

| When | Action |
|---|---|
| **Now** | Reserve the handle (`@GridironIQ` or chosen name) across Twitter/X + Bluesky + Instagram. Bio + app link + one pinned "what this is" post. Then go dormant — no cadence yet. |
| **M2 shipped** | Soft launch. 1–2 posts/week of expected-vs-actual / regression takeaways. Enough hook to start without feeling empty. |
| **M3 shipped** | Go active. The indices (Positive-Regression, Sell-High, FOR, VORP) *are* the content engine — each is a screenshottable, argument-starting post that links to the live tool. |
| **M4 shipped** | Lean into visuals. Scatter/comparison charts are native shareable assets that carry branding into other timelines. |

**Do not** gate social on M5 (accounts) — shareable public pages need no login.

### How to actually grow (the playbook)

1. **One weekly signature drop.** Pick a recurring, ownable format tied to an index —
   e.g. "**Sell-High Five**" every Tuesday, "**Regression Watch**" post-Sunday. Same
   name, same look, every week. Recurring formats get anticipated, screenshotted, and
   quote-tweeted; one-off hot takes don't compound.
2. **Every post is a chart + a claim + a link.** No naked text. The image travels; the
   claim starts the argument; the link converts. Watermark every image with the handle
   and URL so screenshots market for you.
3. **Ride the calendar.** Fantasy attention is weekly and seasonal. Peak leverage:
   draft season (Aug), waiver mornings (Tue/Wed), and Sunday-night/Monday reaction.
   Post when managers are making decisions, not when you finish the build.
4. **Reply-guy into the ecosystem, generously.** Answer "start/sit X or Y?" threads
   with a GridironIQ-backed take and a link. More reach early than posting into the void.
   Be useful first; the brand follows.
5. **Be provably right in public.** Track your own calls (the Sell-High names that
   busted, the regression names that hit) and post the scorecard monthly. Receipts are
   the cheapest credibility in a space full of unfalsifiable takes.
6. **Court the mid-tier, not the mega-accounts.** Analysts with 5–50k followers embed
   tools in their content and reply to DMs. Give a few of them a heads-up / free look;
   one embedding a GridironIQ chart in their podcast prep is worth more than a like from
   a 500k account.
7. **Seed where fantasy players argue, not just X.** r/fantasyfootball, r/DynastyFF,
   fantasy Discords, Bluesky's fantasy circle. Post genuinely useful tool-backed answers
   (read each community's self-promo rules first — lead with utility, not links).
8. **Instrument it.** UTM-tag the links so you learn which format/community actually
   drives sessions, and double down on what converts. Growth is a feedback loop, not a
   volume game.

Guardrail: don't let content production outrun the product. A weekly cadence you can
sustain beats a daily one you abandon — and every post should point at something on the
site that's genuinely better than the alternatives. The tool is the moat; social just
tells people it exists.

## Decision Log

- **2026-08-20 — M6 shipped without the third-party dependency it was scoped around.**
  The milestone was planned with an odds API as its one new integration and a
  `projections` table as its one new schema commitment. It shipped with neither.
  Measuring the feeds first (`docs/design/M6-new-data-domains.md` §2) showed the
  betting lines were already arriving in the schedule file we had been downloading and
  discarding since 2020, and that the "projections" feed publishes rankings with no
  points in them at all. What the milestone actually needed was the opposite of a new
  dependency: **columns from feeds already in hand** (lines and game context on `games`,
  roster bio on `players`), two small tables for things genuinely not stored
  (`player_rankings`, `depth_chart_entries`), and **two features with no storage at
  all** — strength of schedule and the Vegas board are both computed per request,
  because both depend on the scoring config. **The generalised rule, and it cost real
  work to learn twice:** measure the feed before designing around what you assume it
  contains. It moved a Vegas board from "M, new third-party dependency" to "S, already
  ingested", and it stopped a projections table from being built for data that does not
  exist.
- **2026-08-20 — Strength of schedule is a percentile, not a rank, and it names its
  source.** Two decisions inside one small feature. **Percentile because ranks are
  ambiguous here**: "the number one defense against receivers" (hardest) and "the number
  one schedule" (easiest) point in opposite directions, and a board whose whole job is
  to be argued with cannot afford a scale people read backwards. 0–100 with higher =
  harder also says *how much* harder, which a rank never does. **And the basis is stated
  on every response** because defensive numbers come from games played: in August the
  only complete measurement is last season, and defenses change over an offseason. It
  switches to the current season after four weeks and widens from there, with **no blend
  across seasons** — a number that is 60% one year and 40% another is harder to argue
  with than either, and being arguable is the point. Byes are skipped rather than
  averaged in, since an absent fixture is not an easy one. **No new tables:** points
  allowed is an aggregation run through the scoring engine per request, the same stance
  M3 took, for the same reason — a stored rating would need a row per scoring context.
- **2026-08-20 — Current state and accumulated history need different ingests.** Every
  pipeline script until M6.2 was an idempotent upsert, and the repo's standing rule said
  so. Depth charts break it: the table holds where a player sits *today*, and a player
  who is cut does not reappear with a worse rank — he stops appearing in the feed
  entirely, so an upsert never touches his row and he stays listed as the WR3 forever.
  The fix is `replace_scoped()`: delete and rewrite a whole scope (one team) inside a
  single transaction. Two details are deliberate — only scopes **present in the feed**
  are replaced, so a failed download cannot empty a team's chart, and the delete and
  insert share a transaction, so a mid-run failure leaves the previous contents rather
  than nothing. **Generalised rule:** ask whether a table accumulates facts or mirrors a
  current state, because the second kind cannot be maintained by upsert, and the failure
  is invisible — the data looks fine, it is just no longer true.
- **2026-08-20 — A rank comparison is only as honest as its denominator.** Building the
  Draft Value Board turned up a failure with no symptom: ranking the market over all 434
  names on the consensus board while ranking ourselves over the 319 who actually played
  last season. Both orderings looked fine; the gap between them did not, because a
  smaller pool compresses every rank inside it upward. The board duly reported Zach Ertz
  — consensus 384, ours 83 — as the single biggest value in the game, a +301 edge that
  was pure arithmetic. Fixed by assigning **both** ranks over the players we can value,
  with the raw ECR displayed alongside so the consensus's own number is never hidden
  behind our re-ranking of it. Two things follow. **A depth limit is part of the
  feature, not a nicety:** 93% of the consensus top 150 can be valued against ~60% past
  pick 200, so beyond the picks a league actually makes (`teams × starters × 2`) the
  disagreement between a market listing camp bodies and a valuation reading last
  season's box scores is noise dressed as signal. And **the generalised rule** — any
  feature that subtracts one ordering from another has to check that both orderings
  count the same population first. `tests/test_draft_board.py` exists mostly to hold
  this line.
- **2026-08-20 — Consensus is a *ranking*, not a projection — so we ship the gap.**
  M6 had planned "consensus projections" from `load_ff_rankings` into a `projections`
  table. Measuring the feed killed that framing: it publishes expert consensus **ranks**
  (`ecr`, `sd`, `best`, `worst`) with **no projected points and no ADP**. The distinction
  matters here more than most places — a projection is stat components, which the M1
  engine can rescore into any league; a rank is an opinion already frozen in somebody
  else's scoring, and putting one raw inside a your-league-scoring product would
  contradict differentiator #1. So ECR becomes one column and the **delta against our own
  expected-points VORP rank** becomes the feature: *the market has him 41st; we have him
  12th, and his 8 touchdowns came on 4.1 expected.* Our side is **xVORP, not actual
  VORP** — actual VORP ranks last year's results, so a touchdown fluke rides into the gap
  and the board ends up recommending variance. Consequence: the `projections` table stays
  **unbuilt** (a schema commitment made by a feed that does not exist), replaced by
  `player_rankings` with `source` + `ranking_type`, which honours the multi-source spine
  under an honest name. Players with no NFL history render tagged, with **no** gap —
  imputing rookies to replacement level would fabricate an "overvalued" verdict on every
  rookie from data we do not have.
- **2026-08-20 — M6 opens with season readiness, because the past tense is ending.**
  Every milestone so far described completed seasons: data was immutable, a manual
  pipeline was fine, nothing on screen could be stale, and "current season" could be a
  constant because the newest season was always the newest one that existed. All four M6
  domains are perishable (depth charts ~2 days, lines ~1 day, ECR ~1 week), and the
  database stops at 2025 while Week 1 of 2026 is three weeks out. So M6.0 is not a
  feature: the 2026 season gets ingested, season defaults become **computed** (latest
  season *with completed games*, so the default never resolves to an empty board), every
  M6 surface carries an "as of" stamp, and the pipeline moves to a **scheduled GitHub
  Action split by perishability** — daily for depth charts and lines, Wednesday for stats
  (after Monday night and Tuesday's stat corrections), weekly for ECR. **This puts a
  production write credential in CI for the first time**, which is a real change in the
  repo's threat surface and is scoped to the pipeline workflow deliberately. Freshness is
  a pipeline concern and never a request concern: no endpoint fetches from nflverse at
  request time, so a third-party outage stays out of the request path.
- **2026-08-20 — The Vegas board needs no odds API.** The roadmap had priced live lines
  as a separate M-sized slice with a new third-party dependency. `load_schedules([2026])`
  already carries forward `spread_line` and `total_line` — 112 of 272 games priced today,
  through week 13 — so the slice collapses to a few columns on `games` and a re-run of a
  script that already exists, with implied team totals derived rather than stored. An odds
  API buys intraday movement and the unpriced late weeks; that is an upgrade, not a
  prerequisite. **Generalised:** the assumption that a feature needs a new data source is
  worth re-measuring before it is worth designing around — the same way the participation
  feed turned out not to be frozen after 2023.
- **2026-08-19 — Games are one engine, not N client-side quizzes.** M7 had been scoped
  as "≈ S each (client-side quiz over the API)". Recording the option set properly
  ([`docs/design/M7-games.md`](design/M7-games.md)) made the flaw obvious: a quiz graded
  in the browser **ships its own answer in the network tab**, so it cannot support a
  daily puzzle everyone shares or a score worth posting — and six of them leave six
  unrelated codebases behind. The replacement is a **puzzle engine**: a mode is a
  *generator* plus a *renderer* over one shared candidate pool, with `seed = hash(mode,
  date)` producing the daily puzzle (**computed, never stored** — no puzzle table, no
  cron) and grading behind `POST /api/v1/games/{mode}/guess`. The first mode pays for the
  engine; the next four are close to free. **The enabling asset is the metric registry:**
  76 metrics × 2,280 player-seasons is not a question bank someone has to write, it is
  one that already exists — so "content cost ≈ zero" became the filter that picked the
  shortlist and rejected authored trivia outright. Games stay ungated and store nothing
  server-side in v1 (`localStorage`, per spine C); if a results table is ever added it
  holds user data and needs RLS with no policies, like the M5 account tables.
- **2026-08-06 — The platform runs a second API over your database.** Found during the
  production rollout: Supabase serves the entire `public` schema through **PostgREST**
  at `/rest/v1/`, and its default privileges grant the `anon` and `authenticated` roles
  access to new tables. So the account tables — created by a plain Alembic migration —
  would have been readable *and writable* by anyone holding the anon key, which is
  public by design and ships in our JS bundle. `GET /rest/v1/users?select=*` would have
  returned every user's email. None of the authorization in `routers/account.py` was
  wrong; it was simply **bypassed**, by a door we did not know was open. Fixed in
  migration `8f73b5b2b1a1`: RLS enabled on all four account tables with **no policies**,
  plus an explicit revoke. The backend connects as the table owner, which bypasses RLS,
  so nothing changed for the API (all 36 checks pass unchanged). No policies by design —
  writing one starts down the road to the browser querying the database directly, which
  is the architecture we rejected. **Generalised rule:** "the backend owns the data" is
  a claim about code, and holds only while nothing else serves that database. On a
  platform-as-a-database, audit what the platform exposes by default.
- **2026-08-05 — Email auth, both kinds, instead of Google OAuth.** M5 first shipped
  Google-only sign-in; swapped before merge to **email + password *and* magic link**.
  The two are complementary, not redundant: a magic link is the lowest-friction way to
  *start* an account, and a password is the most reliable way to *return* to one,
  because it does not depend on an email arriving. Shipping either alone strands users
  at whichever point that one fails. It also drops the assumption that everyone has —
  or wants to use — a Google account, and removes a third-party OAuth registration from
  the setup. **Cost, and it is real: every path now depends on email delivery**, so a
  proper SMTP sender is a launch requirement rather than a nicety; the password path is
  the partial hedge, since a confirmed account signs in again with no email at all.
  Magic links use the implicit flow so a link opened on a *different device* still
  works — people read mail on their phones — at the price of a short-lived token in the
  URL fragment, which the client consumes and clears.
  **What this cost to change: almost nothing on the backend**, which is the payoff from
  the "Supabase issues tokens, FastAPI owns the data" split. `app/auth.py` verifies
  whatever Supabase signs and never knew how the user proved who they were; the only
  edit was a `display_name` fallback to the email's local part, since email sign-ups may
  carry no name. All the work was one new component (`AuthDialog`) and the service
  functions behind it.
- **2026-08-05 — Accounts sync state; they never gate it.** M5 adds no wall. Every
  board, Insight score, and share link works signed out exactly as before, and no
  account UI renders at all when signed out or when Supabase is unconfigured. Signing
  in buys three things and no fourth: your config follows you between devices, you can
  keep more than one of it, and you can name things. The alternative — gating the
  Insight boards to drive signups — would trade the product's actual distribution
  advantage (screenshot-worthy public pages, growth playbook #2) for a metric.
- **2026-08-05 — The URL outranks the account.** Scoring/league resolve
  `URL > active profile > localStorage > default`. A signed-in user opening a link with
  `?scoring=ppr:te_rec=1.5` sees the *sender's* league. Inverting this would make every
  shared link silently lie to the person most likely to care, which would quietly
  destroy the shareability the whole product was built stateless-first to get.
  Consequence: editing scoring is a URL override, and committing it to a profile is an
  explicit act — opening a friend's link can never rewrite the league you play in.
- **2026-08-05 — Supabase issues tokens; FastAPI owns the data.** The obvious cheaper
  path was `supabase-js` reading and writing account rows straight from the browser
  with RLS policies as the only enforcement. Rejected: it splits the data layer in two,
  and puts authorization in dashboard-managed policies that never appear in a diff.
  Instead Supabase is used purely as a token issuer and `app/auth.py` is the single
  place a token becomes an identity — supporting both asymmetric (JWKS) and legacy
  HS256 signing, so the project's age never becomes a code change. The corollary rule:
  **no account endpoint accepts a user id**, so there is no request shape that reads
  another user's rows.
- **2026-08-05 — A league profile stores the spec strings verbatim.** Not a normalised
  column per scoring rule. `scoring.py` and `league.py` are already the canonical,
  validated, frontend-mirrored grammar; a second representation would be a fourth place
  it lives and a guaranteed drift source. A profile is then literally a bookmark of two
  strings, and adding a scoring rule later needs no migration. Cost: specs are validated
  by parsing on write rather than being unrepresentable-when-invalid — worth it.
- **2026-08-05 — A saved view is a route and a query string.** No typed config union per
  view kind: that buys validation we do not need and costs a migration every time a
  board gains a filter. This forced the finding that **the boards were not actually
  URL-described** — `LeaderboardView`/`InsightView` kept their filters in `useState`, so
  the first saved view stored a bare path, and board links had been dropping their
  filters since they shipped. Fixed with `useUrlState`, which is what spine C had
  claimed all along. Path validation splits deliberately: the **backend** enforces a
  narrow, stable safety envelope (same-origin app route, known section, no scheme, no
  `..`), and the **frontend** — which already owns `constants/boards.js` — checks the
  catalog, so the 19-board list is never duplicated in Python.
- **2026-07-16 — Fantasy-first pivot.** Repositioned from general "advanced NFL
  analytics" to fantasy-first. Trigger: nflsavant.com. Dropped the "Baseball Savant for
  the NFL" one-liner.
- **2026-07-16 — Consensus-first projections, designed multi-source.** Use
  `ff_rankings` + `ff_opportunity` now. Future: build a **GridironIQ projection model**
  *and* let **users create their own projections** on the site. Therefore projections
  are modeled as `(player, season, week, source, scoring_context)` from the start.
- **2026-07-16 — Defer accounts (spine C).** Ship saved/custom features via
  URL-encoded state + `localStorage` first (also makes them shareable). Accounts (M5)
  become a persistence unlock, not a prerequisite.
- **2026-07-16 — Build order.** M1 → M2 → M3 → M4 → M5 → M6 → M7 → Dream. M2 chosen to
  follow M1 as a fast win before the intelligence layer (M3).
- **2026-07-17 — Social timing.** Reserve handles now; go dormant. Soft-launch posting
  at M2, go active at M3 (the indices are the content engine), lean into visuals at M4.
  Social is a distribution layer, not a milestone — do not gate it on M5 (accounts),
  since shareable public pages need no login. See "Growth & Social presence".
- **2026-07-29 — Expected points are stored as components, not points.** M2 stores
  ffopportunity's expected *components* and runs them through the M1 scoring engine
  rather than storing its precomputed `total_fantasy_points_exp`. Reason: a stored
  points total is locked to one scoring system, so in a custom league "expected" and
  "actual" would be measured on different rulers and the gap between them — the whole
  point of the feature — would be meaningless. Verified: xFP deltas across
  PPR/Standard/TE-premium equal `expected receptions × Δweight` exactly.
- **2026-07-29 — Market share is three metrics, not one.** `rush_attempt_share`
  (carries / team carries), `opportunity_share` ((carries + targets) / team total), and
  `market_share` (share of team yards from scrimmage) — volume, touch mix, and
  production, each answering a different workload question.
- **2026-07-29 — Snap/route enrichment folded into M2.** The columns the pipeline had
  been leaving NULL were blocking 8 registry metrics and several board columns, and
  M3's Fantasy Opportunity Rating needs them. Six of the eight are now populated for
  2020–2025; `slot_snaps` has no free source and stays NULL. Prompted by finding that
  this file's "participation frozen after ~2023" note was wrong (see the correction
  under "Data reality check").
- **2026-07-30 — League context is a per-request config, not a constant.** M3 could have
  hard-coded the conventional replacement baselines (QB12/RB24/WR36/TE12). Instead
  league size + starting lineup became a second per-request config alongside scoring
  (`app/league.py`, `useLeague`), because a fixed 12-team assumption contradicts the
  product's core promise. Flex slots are shared across RB/WR/TE in proportion to the
  lineup's flex-eligible starters — matches how flex is actually used and needs no
  external assumptions. Verified: a superflex league moves the QB baseline 17.32 → 14.20
  PPG and flips the top VORP player from a receiver to Lamar Jackson.
- **2026-07-30 — Intelligence scores are percentiles, and never materialised.**
  Percentile ranks within position (not z-scores) because these distributions are skewed
  and "84th percentile among receivers" is directly actionable. Nothing is stored: the
  scores depend on both the scoring *and* league config, so a stored score would need a
  row per context — the same trap the expected-components decision avoided. Query-time
  cost measured at ~90 ms for a full season, so caching is unnecessary for now.
- **2026-07-30 — Buy/sell signals must show their work.** Every score returns its
  weighted inputs with values and percentiles, rendered on the player page. A rule-based
  signal is only better than a black-box projection if the rules are visible; this also
  keeps us honest about the weights being judgement rather than a fit.
- **2026-08-04 — Curation beats configurability (M4 review).** The scatter builder's
  free axis picker was replaced with 19 pre-canned charts across six position groups
  (All / QB / RB / WR / TE / Flex), and the custom-metric *builder UI* was deferred.
  Two arbitrary metrics almost always produce a meaningless cloud, and a blank picker
  pushes "which pairs are worth plotting" onto the user — the same reason the Insight
  boards ship four named questions instead of a formula editor. Position grouping falls
  out of the same logic: target share means nothing for a QB, rushing share nothing for
  a receiver, so **Flex** (RB/WR/TE) became a first-class filter since that is the real
  lineup decision. The custom-metric *engine* stays — the registry's `composite`
  metrics run on it.
- **2026-08-04 — Scatter points are player headshots.** The photo is the identity
  encoding, which supersedes the shape-by-position decision below and makes the
  colour-vision constraint moot rather than worked around. Consequence: a headshot has
  a minimum readable size, so plots hold tens of points, not hundreds — which exposed a
  real bug, since the cap had been applied to whatever order the database returned. The
  endpoint now takes `rank_by` and ranks before capping.
- **2026-08-04 — Comparison shows lead margins, not percentiles.** Each row names the
  leader and how far clear they are of the runner-up. Percentiles answered "is that a
  lot"; a head-to-head is asking "who wins this, and is it close". Direction comes from
  the registry's `higher_is_better`, so leading *fumbles lost* means the fewest.
  Percentiles remain in the API and still drive the radar, which needs a common scale.
  Separately, a comparison now shows only metrics applying to **every** position
  involved — a QB-vs-WR view was previously mostly empty rows.
- **2026-07-30 — Custom metrics are structured, not free-form.** `custom=` is the third
  per-request config, and it accepts a weighted sum over an optional divisor —
  nothing more. Full arithmetic with parentheses would buy nested expressions and cost
  an AST walker plus a permanent injection surface on a public endpoint; the structured
  form covers every metric proposed during design and is a strict subset, so widening
  later throws nothing away. Aggregation semantics are **aggregate-then-combine**
  (`Σyards / Σtargets`, never the mean of per-game ratios) — the alternative silently
  lets a 1-target game count as much as a 12-target one. The two new built-in metrics
  are defined as registry `formula` strings parsed by the same evaluator, so a built-in
  and a user's metric cannot drift.
- **2026-07-30 — M4 takes one DB table, breaking its own "DB: none" plan.**
  `player_target_depth` exists because `air_yards` is stored as a per-game total, and a
  total cannot be un-summed into buckets — the distribution has to come from pbp at
  ingestion. Stored at (player, game, depth bucket, **direction**) rather than
  depth-only: direction is one extra group key on a pass already being made, and
  omitting it would mean a second migration and a second full backfill the first time
  anyone wants the grid. A separate narrow table rather than columns, because 3
  directions × 4 buckets × 4 measures is 48 columns no leaderboard will ever show.
- **2026-07-30 — Scatter encodes position by shape, not colour.** Four categorical hues
  cannot clear the colour-vision separation floors in the all-pairs case a scatter
  always is (any two dots may be compared) — verified with a palette validator, not by
  eye. Shape carries identity and every mark shares the brand accent; it also reads
  better, since 500 dots in four colours is mud. The five-hue `--series-1..5` palette
  used by the comparison charts (a line chart, adjacent pairs) validates cleanly in
  both themes and is keyed to the player, never to their rank.
- **2026-07-30 — PNG export deferred out of M4.** Chart-to-PNG only earns its
  complexity once there is a handle or domain worth watermarking (growth playbook #2).
  Shipping it now would burn in a placeholder. CSV shipped everywhere instead.
- **2026-07-28 — Visual identity: Liquid Glass + Command Center home.** Adopted a
  frosted "Liquid Glass" surface system with two themes — dark "smoked graphite"
  (default) and light "Clear" — chosen from a 23-skin Bento exploration. The home
  page (`/`) is now a fantasy **Command Center** (Bento dashboard); the leaderboard
  moved to `/leaderboard`. Kept the **electric-green** brand accent in both themes
  (single `--accent` token) rather than the blue the source skins used — trivially
  swappable. League scoring is reframed as one feature among many, not the headline.
  See [`design/ui-theme-liquid-glass.md`](design/ui-theme-liquid-glass.md).
