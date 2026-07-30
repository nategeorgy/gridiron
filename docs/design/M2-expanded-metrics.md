# M2 Design — Expanded Metrics & Expected Points

Status: **shipped to production** · Milestone: M2 (see [ROADMAP](../ROADMAP.md)) · 2026-07-29

Goal: add the *opportunity* layer. M1 made fantasy points scoring-aware; M2 answers
**"was that production earned, and is it repeatable?"** — expected fantasy points in
your league scoring, market share, goal-line carries, and the snap/route columns the
pipeline had been leaving NULL.

---

## 1. The core decision — store expected *components*, never expected points

`load_ff_opportunity` (nflverse **ffopportunity**) publishes both expected
*components* (`receptions_exp`, `rec_yards_gained_exp`, `rush_touchdown_exp`, …) and
its own precomputed `total_fantasy_points_exp`. Storing the precomputed total would
have been less work and would have broken the product's core promise: it is fixed to
one scoring system, so in a TE-premium or 6-point-passing-TD league, "expected points"
and "actual points" would be measured on different rulers and the gap between them
would be meaningless.

So we store the components and run them through the **same engine as actual points**
(M1 spine A):

```
xFP = Σ config_weight[stat] · expected_component[stat]
```

One consequence worth naming: the actual side uses "standard baseline + linear deltas"
(it inherits nflreadpy's `fantasy_points_std`), while the expected side has no such
baseline and is built from **full weights**. Different construction, identical inputs
and identical config — verified below.

### Verification (2024, local DB)

| Scoring | Trey McBride xFPTS | Δ from PPR | Expected receptions |
|---|---|---|---|
| PPR | 267.965 | — | 105.85 |
| Standard | 162.115 | −105.85 | 105.85 |
| PPR + TE-premium (1.5) | 320.890 | +52.925 | 105.85 |

The deltas are *exactly* `xREC × Δrec_weight` (105.85 and 52.925 = 105.85 × 0.5), so
xFP responds to league scoring with the same precision as actual points.

### Known bias

ffopportunity models no expected fumbles, so xFP carries no fumble penalty while
actual points do. This is a small, consistent upward bias in xFP (worth ~2 points per
fumble lost). Documented rather than corrected — inventing an expected-fumble rate
would be less honest than the gap.

---

## 2. What was added

### Database (one migration, `521f727f5461`)

| Group | Columns |
|---|---|
| Expected components | `passing_yards_exp`, `passing_tds_exp`, `interceptions_exp`, `rushing_yards_exp`, `rushing_tds_exp`, `receiving_yards_exp`, `receiving_tds_exp`, `receptions_exp`, `two_point_conv_exp` |
| Market share | `rush_attempt_share`, `opportunity_share`, `market_share` |
| Goal-line rushing | `rush_att_inside_10`, `rush_att_inside_5`, `rush_att_inside_2` |

No expected *points* column, per §1. Two-point conversions arrive split by play type
and are stored combined (they are not a configurable weight, so xFP scores them at the
standard 2.0).

### Market-share definitions

Three complementary reads on workload, all averaged over a season the way
`target_share` already is:

```
rush_attempt_share = carries / team carries
opportunity_share  = (carries + targets) / team (carries + targets)
market_share       = (rushing + receiving yards) / team (rushing + receiving yards)
```

Both numerator and denominator come from the ffopportunity feed itself, so each share
is internally consistent rather than mixing sources. Team totals were validated
against the per-player sums (2024 wk1 BUF: 33 carries and 23 targets both reconcile
exactly). A non-positive denominator yields NULL, not zero — a team *can* finish with
negative net yards, and "undefined" is not "none".

### Backend

- `app/scoring.py` — `EXPECTED_WEIGHT_COLUMNS`, `expected_points_expr()` (SQL, for
  ranking) and `compute_expected_points()` (Python, for display). Returns `None` when
  a row has no expected data at all, so "not modelled" stays distinct from
  "expected zero".
- `app/metrics.py` — a new `expected` aggregation kind and a `modelled: bool` flag on
  `MetricDef`, so the UI can label model estimates. New metrics: `expected_fantasy_points`,
  `expected_fantasy_ppg`, `fantasy_points_over_expected`, the expected components, the
  three market shares, and the inside-10/5/2 carries.
- `app/routers/stats.py` — `_fantasy_order_expr()` resolves ranking for every
  scoring-aware and expected metric in both season and single-week mode.
- `app/routers/players.py` — the game log now accepts `scoring` and returns
  `fantasy_points` + `expected_fantasy_points` per game, so the player page is
  scoring-aware too.

### Pipeline

| Script | Fills |
|---|---|
| `ingest_expected.py` *(new)* | expected components, three market shares |
| `ingest_usage.py` *(new)* | `snap_count`, `snap_share`, `routes_run`, `route_participation`, `targets_per_route_run`, `yards_per_route_run` |
| `ingest_stats.py` *(extended)* | `rush_att_inside_10/5/2`, `unrealized_air_yards` (same pbp pass as red zone; `compute_red_zone` → `compute_pbp_derived`, `--skip-red-zone` → `--skip-pbp`) |

Both new scripts are **enrichment passes**: `db.load_stat_keys()` restricts them to
`(player_id, game_id)` pairs `ingest_stats.py` already created, so an enrichment run
can never insert a half-empty stat line.

---

## 3. The stale-data-source finding

The roadmap recorded that the nflverse participation feed was "frozen by the NFL after
~2023", which would have made routes-run data impossible for current seasons. That is
no longer true: `load_participation` returns fully-populated `offense_players` for
**2020–2025** (45,919 plays in 2024; 45,184 in 2025), and those are GSIS ids that join
directly to our `player_id` — no crosswalk needed.

That unlocked the route metrics for all six seasons, which M2 as originally scoped had
left out. ROADMAP's data table has been corrected.

### Routes: what the number actually is

`routes_run` here is **pass-play participation** — the count of the player's own team's
pass plays (`play_type == "pass"`, which includes sacks and excludes designed runs and
QB scrambles) that he was on the field for. It is *not* charted routes: a back who
stays in to block counts as having run a route. So it slightly overstates routes for
run-blocking backs and tight ends, and therefore slightly understates their TPRR. It is
accurate for receivers and directionally right for everyone. True route counts need
charting data no free source publishes. QBs are excluded entirely.

Spot check (Ja'Marr Chase, 2024 wk1): 43 snaps, 84% snap share, 28 routes, 87.5% route
participation, 0.214 TPRR — all in the right range.

### Snaps

From `load_snap_counts` (PFR, `offense_snaps` / `offense_pct`, already a 0–1 fraction).
PFR keys players by its own id, so the script builds a `pfr_id → gsis_id` crosswalk
from `load_players` (22,553 mappings; 175 unmapped rows across six seasons).

### `slot_snaps` remains NULL

No free nflverse feed carries per-player alignment — participation has formation and
personnel groupings, PFR advanced receiving has no alignment column, and FTN charting
is play-level with no player attribution. Left NULL rather than approximated.

---

## 4. Coverage after the backfill (local, 2020–2025)

| Season | Rows | Expected | Market share | Snaps | Routes | Slot |
|---|---|---|---|---|---|---|
| 2020 | 5,817 | 5,298 | 5,298 | 5,817 | 4,849 | 0 |
| 2021 | 6,134 | 5,537 | 5,537 | 6,128 | 5,123 | 0 |
| 2022 | 6,083 | 5,508 | 5,508 | 6,082 | 5,105 | 0 |
| 2023 | 6,065 | 5,530 | 5,530 | 6,059 | 5,091 | 0 |
| 2024 | 6,125 | 5,479 | 5,479 | 6,119 | 5,066 | 0 |
| 2025 | 6,303 | 5,523 | 5,523 | 6,289 | 5,168 | 0 |

Every stat line without expected data was checked: **all** of them are players with
zero carries, zero targets and zero pass attempts in that game — no opportunity to
model. Route coverage is lower by design (QBs excluded, plus players who never took a
pass-play snap).

---

## 5. Frontend

- **New board** — `/fantasy/expected` ("Expected Points"), the fifth Fantasy
  Leaderboards item: xFPTS, xFPPG, FPTS, FPPG, FP±, and the expected components.
- **Existing boards** — xFPTS + FP± added to all four fantasy boards; routes /
  participation / TPRR / YPRR on the receiving boards; market share and inside-10/5/2
  on the rushing boards; snaps and shares on NFL All-Advanced.
- **Player page** — now scoring-aware end to end: an *Expected vs Actual* panel
  (actual, expected, difference, per-game, plus a plain-English read of the gap), the
  league-scoring editor, an xFP dashed-line overlay on the weekly trend chart, and
  `xFPTS` in the game log.

The per-game read uses a ±1.5 points-per-game threshold before it calls a gap
meaningful, and every surface labels expected points as a model estimate, not a
projection.

---

## 6. What this sets up for M3

The intelligence layer now has its inputs: **Positive-Regression Index** needs exactly
the negative FP± + high air-yards/target-share/red-zone-usage combination this ships;
**Sell-High Index** needs the positive-FP± side; **Fantasy Opportunity Rating** needs
opportunity share, route participation and snap share. None of it requires new data —
only formulas over what M2 now stores.
