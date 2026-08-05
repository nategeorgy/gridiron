# M4 Design — Exploration & Viz

> Status: shipped. Milestone: [`docs/ROADMAP.md`](../ROADMAP.md) → M4.
> Depends on M1 (scoring engine + metric registry), M2 (expected components),
> M3 (intelligence engine + league context).

Last updated: 2026-08-04

> **Revised 2026-08-04 after review.** Three sections below describe the design as
> originally built and were superseded — read §9 first, then treat §1, §3 and §4 as
> the reasoning behind decisions that have since changed.

M1–M3 built *answers*: here is your leaderboard, here is who to buy, here is what a
player is worth in your league. M4 builds the layer that lets someone ask their own
question instead of picking from ours — plot any two metrics against each other,
line five players up side by side, define a stat we never thought of, and take the
data with them.

---

## 1. The core decision — custom metrics are a third per-request config

M1 made fantasy points scoring-aware (`scoring=`). M3 made value league-aware
(`league=`). M4 adds the third member of the same family: `custom=`, a per-request
definition of metrics that do not exist until someone asks for them.

The pattern is deliberate and now three-for-three: **the interesting configuration
does not live in the database.** A stored custom metric would need a row per user per
formula, and would immediately face the same trap M2 avoided with expected components
and M3 avoided with intelligence scores — a stored value is locked to one context.
A formula evaluated at query time is not.

### The grammar is structured, not free-form

```
custom  = spec[;spec...]
spec    = name=numerator[/denominator]
numerator   = term[+term...]
term        = [weight*]metric_id
denominator = metric_id | "games"
```

```
custom=hvt=red_zone_targets+rush_att_inside_5/games
custom=tps=targets+carries/snap_count
custom=blend=0.6*target_share+0.4*rush_attempt_share
custom=hvt=red_zone_targets+rush_att_inside_5/games;tps=targets+carries/snap_count
```

This is a weighted sum over an optional divisor — nothing more. **There is no
expression parser and no `eval`.** A term is a registry metric id looked up in
`REGISTRY_BY_ID`; a weight is a bounded float; a denominator is one metric id or the
literal `games`. Anything else is a `ValueError` that the router turns into a 400,
exactly as `parse_scoring` and `parse_league` already do.

The alternative — full arithmetic with parentheses and precedence — was considered and
deferred. It buys nested expressions like `(a+b)/(c+d)`, and costs an AST walker plus
a permanent injection surface on a public endpoint. The structured form covers every
metric anyone actually proposed during design, including all four worked examples.
It is a strict subset of the full grammar, so widening later throws nothing away.

### Aggregation semantics: aggregate first, then combine

This is the subtle part, and getting it wrong produces a metric that looks fine and is
quietly meaningless. For `receiving_yards/targets` over a season there are two candidate
readings:

- **aggregate-then-combine** — `Σ(receiving_yards) / Σ(targets)`
- **combine-then-average** — `mean(receiving_yards_g / targets_g)` over games

They differ whenever the denominator varies by game, and the second one lets a 1-target
1-catch-for-40 game count as much as a 12-target game. **GridironIQ always
aggregates first, then combines.** Each term is aggregated over the window by its
registry `aggregation` (`sum` → `SUM`, `avg` → `AVG`, `scoring`/`expected` → the M1
engine's SQL expression), and the arithmetic runs on those aggregates.

That is the same rule the leaderboard already applies to `derived` metrics
(`SUM(base)/games`), so custom metrics behave like built-ins rather than like a
special case. Division by zero yields `NULL`, never an error and never `0` — "no
data" and "zero" stay distinguishable, consistent with the rest of the codebase.

### Which metrics can be terms

| Aggregation | Usable as a term? | Why |
|---|---|---|
| `sum`, `avg` | ✅ | stored columns |
| `derived` | ✅ | `SUM(base)/games`, already an expression |
| `scoring`, `expected` | ✅ | the M1 engine emits SQL for both |
| `intelligence` | ❌ | percentile ranks computed in Python over a whole position pool; there is no column or SQL expression to divide by |

Allowing `scoring` and `expected` terms is what makes the feature more than a toy:
`fantasy_points/snap_count` (points per snap) and `fantasy_points_over_expected/games`
are both expressible, and both are scoring-aware for free.

### Labelling: the formula is the label

The URL spec carries only the name and the formula. The frontend keeps a
`localStorage` map of name → friendly label, and when a shared link arrives without
one, the display label is the formula rendered with registry `short` labels —
`(RZ TGT + IN5) / G`. That is more informative to a stranger than someone else's
private name for it, and it means a shared custom metric never arrives unreadable.

---

## 2. Two new built-in metrics, defined through the same evaluator

Two metrics ship as first-class registry entries, both `(A + B) / C`:

| Metric | Formula | Reads as |
|---|---|---|
| **High-Value Touches / Game** (`HVT/G`) | `(red_zone_targets + rush_att_inside_5) / games` | scoring-opportunity volume per game |
| **Touches Per Snap** (`TCH/SNAP`) | `(targets + carries) / snap_count` | how efficiently a role converts playing time |

Both are **derived**, so per CLAUDE.md they skip the schema and the pipeline entirely —
they are a registry entry plus the code that computes them. And that code is the
custom-metric evaluator: each is declared in the registry as a `formula` string parsed
at import time, so a typo fails fast at startup rather than at request time, and the
built-ins are validated by exactly the grammar users get.

This mirrors M2 routing expected points through the M1 scoring engine rather than
reimplementing scoring: one evaluator, no second path to drift.

`HVT/G` is the one worth defending. Red-zone targets and carries inside the 5 are the
two highest-value touch types in fantasy, they are stored separately, and nobody
publishes them combined — which is exactly the kind of thing a metric registry plus an
evaluator makes cheap to ship.

---

## 3. Scatter builder

`GET /api/v1/stats/scatter` — any two registry metrics as x/y, an optional third as
bubble size, coloured by position.

**Two modes.** Season mode plots one point per player over a season or week range —
the strategic view. Per-game mode plots one point per player-week — the distribution
view, which answers questions season aggregates hide (is this a consistent WR2 or two
monster games and eight duds?). Per-game mode is capped and defaults to a narrower
filter set, because an unfiltered season is ~6,000 points and neither the payload nor
the eye benefits.

**Intelligence metrics are allowed as axes.** This is the reason the endpoint is worth
building rather than reusing the leaderboard: Opportunity Rating against points-over-
expected *is* the buy-low thesis in one image, and it is a chart no other free fantasy
site can draw. When an axis needs an intelligence metric, the endpoint routes through
the M3 engine (whole position pool computed, then filtered) instead of the plain
aggregation path; when it doesn't, it takes the cheaper path.

Median lines on both axes split the plot into quadrants, which is what makes a scatter
readable at a glance rather than a cloud. Clicking a point opens the player.

---

## 4. Comparison builder

Up to five players, three views on one page:

1. **Stat table** — side by side, with a percentile bar per cell computed *within
   position*. Raw numbers answer "how many"; the bar answers "is that a lot", which is
   the question a comparison is actually being asked to settle.
2. **Weekly trend** — overlaid fantasy points by week, reusing `FantasyTrendChart`'s
   scoring-aware series, with expected points as dashed lines.
3. **Radar** — percentile shape across a position-appropriate metric set.

The five-player cap is a real constraint, not a round number: the radar becomes
unreadable past three or four series, and the trend chart past five. Comparing across
positions is allowed, and the percentile bars stay within-position — a TE's 80th
percentile and a WR's 80th percentile are the honest comparison, which is the same
argument VORP makes in M3.

---

## 5. Target depth — the one database change

M4 was scoped in the roadmap as **DB: none**. The depth-of-target chart breaks that,
and it is worth being explicit about why rather than quietly amending the roadmap.

The chart needs, per player, the distribution of targets and production by pass depth.
Nothing in `player_stats` can produce it: `air_yards` is stored as a per-game total, and
a total cannot be un-summed into buckets. The data has to come from `load_pbp` at the
play level and be aggregated at ingestion.

### Verified availability (all six seasons, 2026-07-30)

| Season | Pass plays | `air_yards` NULL | `pass_location` NULL | Usable |
|---|---|---|---|---|
| 2020 | 20,271 | 6.4% | 6.8% | 90.0% |
| 2021 | 21,086 | 6.9% | 7.1% | 90.0% |
| 2022 | 20,458 | 7.1% | 7.4% | 88.9% |
| 2023 | 20,797 | 7.4% | 7.8% | 88.3% |
| 2024 | 20,082 | 7.5% | 7.9% | 88.4% |
| 2025 | 19,819 | 7.3% | 7.7% | 88.2% |

The ~10% of pass plays that are unusable are sacks, scrambles, and throwaways — plays
with no receiver and no air-yards value. The NULL rate is flat across six seasons.

**Coverage of *targets* is effectively total**, which is the number that actually
matters: the excluded plays are not targets in the first place. Verified after the
2024 ingest — 16,903 targets bucketed against 16,903 in `player_stats`, an exact
reconciliation, with receiving yards within 3 of 126,385 (0.002%, most likely laterals).

**This corrects a pre-build assumption.** Directional pass data was expected to have
degraded for 2023+ (nflfastR parses `pass_location` from play-description text, and
that text has changed format over the years). It did not: `pass_location` is populated
at the same rate in 2025 as in 2020, with a sane left/middle/right split throughout.

### Grain: store direction *and* depth

Storing both dimensions costs one extra `GROUP BY` key on a pbp pass that is being made
anyway, and rolling direction up to depth-only is a `SUM` at query time. Storing
depth-only would mean a second migration and a second full pbp backfill the first time
anyone wants the direction grid. Same reasoning as M2 storing expected *components*:
keep the finer grain, aggregate on the way out.

A new narrow table rather than columns on `player_stats`, because 3 directions × 4 depth
buckets × 4 measures is 48 columns that no leaderboard will ever display:

```sql
player_target_depth (
  player_id, game_id,
  depth_bucket,   -- behind_los | short_0_9 | intermediate_10_19 | deep_20_plus
  direction,      -- left | middle | right
  targets, receptions, receiving_yards, receiving_tds, air_yards,
  PRIMARY KEY (player_id, game_id, depth_bucket, direction)
)
```

Depth buckets are `< 0`, `0–9`, `10–19`, `20+` air yards — the conventional nflverse
split, and the one fantasy analysis already speaks in.

**Ships in M4:** the depth-of-target chart (buckets, direction summed away). The
direction grid is a frontend component away, with no migration, whenever it is wanted.

---

## 6. Export

**CSV on every board** — the four Insight boards, five Fantasy boards, eight NFL
boards, and both new Explore views. The export is of the *current view*: active
filters, active scoring, active league context, and any custom metrics, with a header
comment recording that context so a downloaded file is self-describing.

**PNG is deliberately not in M4.** Chart-to-PNG only earns its complexity once there is
a brand to stamp on it (the roadmap's growth playbook wants every shared image
watermarked with a handle and URL). Until that handle exists, a user's own screenshot
is as good, and the feature would ship a watermark reading as a placeholder.

---

## 7. State

Everything follows spine C, unchanged from `useScoring`/`useLeague`: the URL query
param is the source of truth, `localStorage` holds the persisted default, and defaults
stay out of the URL to keep shared links clean. A scatter, a comparison, and a set of
custom metrics are all fully reconstructible from a URL — which is what makes them
shareable, and what makes M5 (accounts) a sync problem rather than a rebuild.

---

## 8. Known limits

- **Custom metrics are unvalidated by construction.** Anyone can define
  `interceptions/red_zone_targets` and sort by it. The registry knows each metric's
  `higher_is_better`, but a composite of several has no defensible direction, so custom
  metrics are presented without one and are never used in Insight scoring.
- **Per-game scatter mode is capped**, so it shows a filtered slice rather than every
  player-week. The cap is stated in the UI rather than silently truncating.
- **Target depth excludes ~10% of pass plays** — those with no receiver or no
  air-yards value. Coverage of *targets* is effectively complete (see §5), but depth
  charts still state the bucketed target count so the denominator is never ambiguous.
- **Percentile bars in the comparison need a qualifying pool**, so early-season and
  low-games players get wide, noisy percentiles. The same `min_games` logic M3 uses
  applies here.
- **Radar charts compress**: five axes on one shape invite reading a bigger polygon as
  "better" when the axes are not commensurable. Limited to a curated per-position metric
  set for that reason, not free choice of axes.

---

## 9. Revisions after review (2026-08-04)

Three things changed once M4 was usable. All three point the same way: **the tool's
value is curation, not configurability.**

### 9.1 The scatter builder is pre-canned, not open-ended

Free axis selection was cut. A user now picks a *position group* and a *question*; the
metric pair is chosen for them (`frontend/src/constants/scatters.js`, 19 charts across
All / QB / RB / WR / TE / Flex).

The reasoning: two metrics chosen at random almost always produce a meaningless cloud,
and a blank axis picker pushes the work of knowing which pairs are worth plotting onto
the user. Curation is the product — the same argument the Insight boards already make
by shipping four named questions rather than a formula editor.

Position grouping falls out of the same logic: almost no interesting pair works across
positions. Target share is meaningless for a quarterback, rushing share for a receiver.
The **All Positions** group is restricted to metrics that genuinely apply to all four
(fantasy points, expected points, the M3 scores), and **Flex** is the RB/WR/TE view —
which is the actual lineup decision, so `position=FLEX` became a first-class filter.

### 9.2 Players are drawn as headshots

Points are the player's own photo, clipped to a circle, with an initialled disc for the
~2.5% with no image. This supersedes §6's shape-by-position decision: the photo *is* the
identity encoding, and it is far better than either hue or shape at it. The colour-vision
constraint that ruled out four position hues is now moot rather than worked around —
there is no categorical colour on this chart at all.

Two consequences worth recording:

- **A headshot has a minimum readable size (~26px)**, so the plot can only hold tens of
  points, not hundreds. Presets are therefore ranked and capped (default top 50).
- **That exposed a real bug.** The scatter previously applied its cap to whatever order
  the database returned, so a capped plot showed an arbitrary slice of the pool. It now
  takes a `rank_by` metric (default fantasy points) and ranks before capping, in SQL for
  per-game mode and in Python for the season/intelligence paths.

### 9.3 The comparison table shows lead margins, not percentiles

Percentile bars were removed from the table. Each row now shows who **leads** the stat
and by how much over the runner-up (`+10.4`), with the leader's value emphasised, plus a
per-player tally of categories led.

Percentiles answered "is that a lot"; lead margins answer "who wins this, and is it
close" — which is the question a head-to-head comparison is actually asking. The old
design also put three things in every cell (a number, a bar, and a rank), which is
what made a 16-row table feel noisy.

Direction comes from the registry's `higher_is_better`, so leading *fumbles lost* means
the fewest, not the most. Percentiles remain in the API and still drive the radar, which
genuinely needs a common scale.

**The radar is percentile-based on purpose, and it survives mixed positions.** A first
pass hid it whenever the compared players didn't share a position — which was exactly
backwards. Percentile normalisation is what *licenses* a cross-position comparison: a
tight end at the 80th percentile and a receiver at the 80th are genuinely comparable
where their raw numbers are not. So the radar now picks its axes from what the
comparison actually returned:

- **Same axis set** (including WR-vs-TE, which share one) → that position's curated axes.
- **Genuinely different positions** (QB vs WR) → shared axes: PPG, expected PPG, snap
  share, and whatever else survived the applicability intersection.

Signed metrics (points over expected) and lower-is-better ones (fumbles) are excluded
from radar axes in both cases: a radar reads "further out = more", and neither obeys that.

**Metric applicability is now intersected across the compared players.** A comparison
shows only metrics whose `applies_to` covers *every* position involved, so QB-vs-WR
drops passing and receiving and keeps fantasy output, rushing, and shared usage. Before
this, the metric set came from the first player's position and a mixed comparison was
mostly empty rows.

### 9.4 The custom-metric builder UI is deferred

`custom=` and `app/custom_metrics.py` remain — the registry's `composite` metrics
(High-Value Touches / Game, Touches Per Snap) are evaluated by that engine, and the
request config still works. What was removed is the **builder UI** and its frontend
mirror (`constants/custom.js`, `hooks/useCustomMetrics.js`,
`components/CustomMetricControl.jsx`), on the same "curation over configurability"
reasoning as §9.1. Re-adding it is a UI task against an engine that already exists and
is exercised in production by the two built-ins.
