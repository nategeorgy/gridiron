# GridironIQ — Product Roadmap

> Source of truth for product direction. `CLAUDE.md` holds the spec and scope
> summary; this file holds the vision, architecture spines, and the milestone
> plan. Update this when priorities change, then reconcile `CLAUDE.md`.

Last updated: 2026-07-30

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
  accounts. Shareable by default; accounts later just sync the same state.

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

### 🔬 M4 — Exploration & Viz — M — **NEXT**
- **Deps:** M1/M2. **Data:** existing.
- **Features:** **scatter builder** (any 2 registry metrics × player base), **comparison
  builder** (≤5 players, default + custom stats), **enhanced player pages** (usage/
  opportunity charts, **pass-location chart** from pbp `pass_location`/`air_yards`),
  PNG/CSV export.
- **DB:** none. **Backend:** flexible `/stats/scatter`. **Frontend:** Recharts scatter +
  compare tables; export via canvas/CSV; state in URL (shareable).
- **Data limits:** pass *charts* yes; route *trees* no (see Cut Ideas).

### 🔐 M5 — Accounts & Saved State — M
- **Deps:** M1–M4 (state worth saving). 
- **DB:** `users`, `saved_views` (scoring, scatters, rankings, comparisons), `favorites`.
- **Backend:** Supabase Auth (already on Supabase — avoids rolling our own).
- **Frontend:** login; save/favorite; sync `localStorage` → account.

### 🗓️ M6 — New Data Domains — M–L (parallelizable after M1)
Each sub-feature is its own deployable slice:
- **Depth charts** — `load_depth_charts` (2001+), new `depth_charts` table. S–M.
- **Strength of Schedule** — fantasy pts allowed by position, from existing stats +
  schedule. M.
- **Vegas board** — historical `spread_line`/`total_line` from `load_schedules`. S.
  *Live upcoming lines* need an external **odds API** (e.g. The Odds API free tier) —
  separate freshness pipeline. M for live.
- **Consensus projections** — `load_ff_rankings` (draft + weekly), `projections` table
  (multi-source schema). M. Data limit: consensus, not ours — label the source.

### 🎮 M7 — Games & Growth — S–L each (Dream, but a cheap hook can slot in early)
- **Data:** players/teams/stats we have; "Name their college" needs `college` (in
  `load_players`/rosters — easy add). Mock draft needs ADP from `ff_rankings`.
- **Complexity:** "Name their college" / "Name a dude" / "17-0" ≈ S each (client-side
  quiz over the API). "EPA draft" and "mock draft simulator" ≈ M–L (game logic + ADP +
  deviation model).

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
| Consensus projections / ADP | `load_ff_rankings` | 🟢 Available (consensus) |
| Depth charts | `load_depth_charts` (2001+) | 🟢 |
| Historical Vegas lines | `load_schedules` | 🟢 |
| Rush attempts by yard-line | `load_pbp` | 🟢 Derive |
| Replacement level / VORP | derived from the position-pool distribution + league config | 🟢 Shipped M3 |
| Buy-low / sell-high signals | derived (expected-points gap + usage + career baseline) | 🟢 Shipped M3 |
| Snap share / NGS / PFR adv | `load_snap_counts` / `load_nextgen_stats` / `load_pfr_advstats` | 🟢 (NGS 2016+, PFR 2018+) |
| Snap counts | `load_snap_counts` (PFR, `pfr_id` crosswalk) | 🟢 Shipped M2 |
| Pass-play participation ("routes run") | `load_participation` × `load_pbp` | 🟢 Shipped M2 — populated **2020–2025**, GSIS ids join directly (see note below) |
| Catchable targets | `load_ftn_charting` | 🟡 2022+ only |
| Slot vs wide alignment | — | 🔴 No free source (see M2 design note §3) |
| Live upcoming odds (survivor) | external odds API | 🟡 New dependency |
| Route trees (drawn) | player tracking | 🔴 Not available free |
| Dynasty value | — | 🔴 No free authoritative source |

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
- **2026-07-28 — Visual identity: Liquid Glass + Command Center home.** Adopted a
  frosted "Liquid Glass" surface system with two themes — dark "smoked graphite"
  (default) and light "Clear" — chosen from a 23-skin Bento exploration. The home
  page (`/`) is now a fantasy **Command Center** (Bento dashboard); the leaderboard
  moved to `/leaderboard`. Kept the **electric-green** brand accent in both themes
  (single `--accent` token) rather than the blue the source skins used — trivially
  swappable. League scoring is reframed as one feature among many, not the headline.
  See [`design/ui-theme-liquid-glass.md`](design/ui-theme-liquid-glass.md).
