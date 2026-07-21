# M1 Design — Scoring & Metric Foundation

Status: **for review** · Milestone: M1 (see [ROADMAP](../ROADMAP.md)) · 2026-07-16

Goal: make fantasy value **scoring-aware** everywhere (starting with the leaderboard),
and introduce a **single metric registry** so every future explore tool reads one
canonical metric definition. No migration; ships custom league scoring on the
leaderboard.

---

## 1. The core insight — "standard baseline + linear deltas"

Fantasy points are ingested from nflreadpy as canonical values:
- `fantasy_points_std` — standard scoring (all the fixed stuff: yards, TDs, INTs,
  fumbles lost, **2-pt conversions**, etc.), reception value = 0.
- `fantasy_points_ppr = fantasy_points_std + receptions` (PPR adds exactly 1/reception).
- Pipeline derives half as `(std + ppr) / 2 = std + 0.5·receptions`.

Every common league setting is a **linear function of stat components**, so any custom
score is:

```
custom_points = fantasy_points_std
              + Σ (config_weight[stat] − standard_weight[stat]) · component[stat]
```

Because it's linear, the season total equals the same formula applied to **summed**
components — so it works identically in season-aggregate and single-week modes, and
requires **no new columns**. It also inherits nflreadpy's exact numbers for things we
don't store as components (2-pt conversions, return TDs): those live inside the
`fantasy_points_std` baseline and are simply carried, not re-derived.

### Standard baseline weights (to be calibrated & locked — see §7 Task 0)
| Stat component | Column | Standard weight |
|---|---|---|
| Passing yards | `passing_yards` | 0.04 (1 / 25) |
| Passing TD | `passing_tds` | 4 |
| Interception | `interceptions` | −2 |
| Rushing yards | `rushing_yards` | 0.1 |
| Rushing TD | `rushing_tds` | 6 |
| Receiving yards | `receiving_yards` | 0.1 |
| Receiving TD | `receiving_tds` | 6 |
| Reception | `receptions` | 0 |
| Fumble lost | `fumbles_lost` | −2 |
| 2-pt conversions, return TDs | *(not stored)* | fixed inside `fantasy_points_std` |

> **Task 0 is a calibration test**: recompute `std` from components with these weights
> and confirm it equals stored `fantasy_points_std` across the dataset. If any weight is
> off, the test reveals it before we build on the baseline.

---

## 2. Scoring-config schema

Canonical form (JSON). **Every key optional**; omitted → standard weight. So a PPR
config is just `{"rec": 1}`.

```jsonc
{
  "rec": 1.0,          // points per reception
  "te_rec": 1.5,       // optional TE-premium; if absent, TEs use "rec"
  "pass_yd": 0.04,     // points per passing yard
  "pass_td": 4,        // points per passing TD
  "pass_int": -2,      // points per interception
  "rush_yd": 0.1,      // points per rushing yard
  "rush_td": 6,        // points per rushing TD
  "rec_yd": 0.1,       // points per receiving yard
  "rec_td": 6,         // points per receiving TD
  "fumble_lost": -2    // points per fumble lost
}
```

### Presets (defined in code, not the DB)
| Preset | Config |
|---|---|
| `std` | `{}` |
| `half` | `{ "rec": 0.5 }` |
| `ppr` | `{ "rec": 1 }` |
| `ppr_te` | `{ "rec": 1, "te_rec": 1.5 }` |

### Compact URL transport (proposed — Open Decision A)
`scoring = <preset>[:<key>=<value>[,<key>=<value>…]]`
- `ppr` · `half` · `std`
- `ppr:pass_td=6` · `std:rec=0.5,rec_td=6` · `ppr:te_rec=1.5`

One short, shareable, cache-friendly query param. Default when absent: `ppr`.

### Validation
- Unknown preset or key → `400`.
- Non-numeric value → `400`.
- Out-of-range value (guard `|weight| ≤ 100`) → `400`.
- Resolved config is echoed back in the response for transparency.

### Bounds of v1 (explicitly out of scope)
Non-linear scoring is **not** in M1 because it can't be derived from season aggregates:
yardage/point milestones (e.g. 100-yard game bonus), TD-length bonuses, first-down
points, per-position kicker/DST scoring. These need per-game evaluation *before*
aggregation — a later enhancement. 2-pt-conversion and return-TD values are fixed at
standard in v1 (components not stored; addable in M2).

---

## 3. Backend — the fantasy engine

New module `backend/app/scoring.py`:

```python
STANDARD_WEIGHTS: dict[str, float] = { ... }          # the table in §1
PRESETS: dict[str, dict[str, float]] = { ... }         # §2

class ScoringConfig(BaseModel):                        # all fields default to standard
    rec: float = 0.0
    te_rec: float | None = None
    pass_yd: float = 0.04
    ...

def parse_scoring(spec: str) -> ScoringConfig: ...     # preset[:overrides] → config (validated)

def points_expr(config: ScoringConfig, col) -> ColumnElement:
    """Linear fantasy-points SQL expression.

    `col(name)` returns the SQL expr for a stat: func.sum(PlayerStats.x) in season
    mode, PlayerStats.x in week mode. One formula, both modes.
    """
```

`points_expr` builds:
```
col("fantasy_points_std")
+ rec_term                                   # CASE WHEN position='TE' THEN te_rec ELSE rec END · col("receptions")
+ (pass_td   − 4)    · col("passing_tds")
+ (pass_yd   − 0.04) · col("passing_yards")
+ (pass_int  + 2)    · col("interceptions")
+ (rush_yd   − 0.1)  · col("rushing_yards")
+ (rush_td   − 6)    · col("rushing_tds")
+ (rec_yd    − 0.1)  · col("receiving_yards")
+ (rec_td    − 6)    · col("receiving_tds")
+ (fumble_lost + 2)  · col("fumbles_lost")
```
(TE-premium is a `CASE` on `Player.position`; constant when the view is filtered to one
position, correct across an "all positions" view.)

### Leaderboard endpoint contract

`GET /api/v1/stats/leaderboard` — additions in **bold**, everything else unchanged:

| Param | Default | Notes |
|---|---|---|
| `season` | — (required) | |
| `week` | — | omit → season aggregate |
| `season_type` | `REG` | |
| `position` | — | QB/RB/WR/TE |
| `metric` | **`fantasy_points`** | now defaults to the scoring-aware metric |
| **`scoring`** | **`ppr`** | preset[:overrides] (§2) |
| `order` `min_games` `limit` `offset` | as today | |

- New rankable metrics: **`fantasy_points`** (config total) and **`fantasy_ppg`**
  (`fantasy_points / games`). When `metric` is one of these, `ORDER BY` uses
  `points_expr`.
- Legacy `metric=fantasy_points_ppr|half|std|fantasy_ppg_ppr` still works (maps to the
  fixed preset) for backward compatibility.
- Every data row gains `fantasy_points` and `fantasy_ppg` computed from the active
  config (the stored `_ppr/_half/_std` columns can still be returned as fixed-preset
  references).
- Response `meta` gains `"scoring": { …resolved config… }`.

Example: `?season=2024&position=QB&scoring=ppr:pass_td=6&metric=fantasy_points`
re-ranks QBs for a 6-pt-passing-TD league.

### `/metrics` registry endpoint
`GET /api/v1/metrics` → the metric registry (§4) as JSON. Static per deploy; cacheable.

---

## 4. Metric registry shape (spine B)

Single source of truth in `backend/app/metrics.py`, served at `/api/v1/metrics`.
One entry per metric:

```jsonc
{
  "id": "target_share",
  "label": "Target Share",
  "short": "TGT%",
  "description": "Share of the team's targets while on the field.",
  "format": "pct",                 // int | one | two | three | pct
  "category": "receiving",         // fantasy | passing | rushing | receiving | efficiency
  "applies_to": ["WR", "RB", "TE"],// or "all"
  "aggregation": "avg",            // sum | avg | derived
  "higher_is_better": true,
  "rankable": true
}
```

- `aggregation` replaces today's hard-coded `SUM_METRICS` / `AVG_METRICS` / `PPG_METRICS`
  lists in `stats.py` — the leaderboard derives its sum/avg/derived handling from the
  registry, so adding a metric is one registry entry, not edits in four places.
- `fantasy_points` / `fantasy_ppg` are registry entries flagged as scoring-aware.
- Serves scatter/compare/custom-metric builders later for free.

### Frontend consumption (Open Decision B)
Backend owns the registry; frontend loads it once via React Query and caches it. The
current `METRICS` map in `frontend/src/constants/index.js` becomes a thin adapter over
the fetched registry. Presentation-only bits (`COLUMN_SETS`, position views) stay in the
frontend for now.

---

## 5. Frontend changes

- **`useScoring` hook** — reads `scoring` from the URL query (source of truth), falls
  back to `localStorage` then `ppr`; updating scoring writes the URL (shareable link)
  and mirrors to `localStorage`.
- **Scoring editor** — preset dropdown (Std / Half / PPR / TE-PPR / Custom) with an
  expandable custom panel (reception pt, pass-TD, etc.). Emits a `scoring` string.
- **Leaderboard** — passes `scoring` through the stats service; default columns show
  `fantasy_points` / `fantasy_ppg` (config-aware) instead of hard-coded `_ppr`; a small
  caption states the active scoring.
- **Metrics module** — fed by `/metrics`; components read label/format from it.
- **Services** — `stats.js` adds the `scoring` param.

No changes required to player-profile or team pages in M1 (they can adopt `useScoring`
later); their existing `_ppr` columns keep working.

---

## 6. Database & migrations

**None.** No new columns, no Alembic migration. Presets and weights live in code. (The
optional `scoring_presets` table from the roadmap is deferred — code presets are enough
until users save named custom scoring in M5.)

---

## 7. Build plan (tasks, in order)

0. **Calibrate baseline weights** — recompute `std` from components; assert equals stored
   `fantasy_points_std` across the dataset; lock `STANDARD_WEIGHTS`. *(correctness gate)*
1. `scoring.py` — config model, presets, `parse_scoring`, `points_expr` (+ unit tests).
2. Leaderboard — wire `scoring`, add `fantasy_points`/`fantasy_ppg`, keep legacy metrics.
3. `metrics.py` + `/metrics` endpoint; refactor `stats.py` sum/avg/derived off the
   registry.
4. Frontend — `useScoring`, scoring editor, service param, metrics module, leaderboard
   columns.
5. Verify in-browser (preview workflow) + the correctness checks in §8.

## 8. Testing / validation

- **Unit**: `parse_scoring` grammar, bounds, error cases.
- **Correctness (the proof)**: for `scoring=ppr`, computed `fantasy_points` equals stored
  `SUM(fantasy_points_ppr)` within 0.01 across a broad sample (e.g. 2024 all positions);
  same for `half` and `std`. Validates the baseline-delta model end-to-end.
- **Behavioral**: `scoring=ppr:pass_td=6` measurably reorders the QB board vs `ppr`;
  `ppr` vs `std` reorders pass-catching RBs.
- **Regression**: legacy `metric=fantasy_points_ppr` unchanged.

## 9. Decisions (signed off 2026-07-16)

- **A — Scoring transport**: ✅ **compact `scoring=preset:overrides` GET param**.
  Shareable and cache-friendly; fits the stateless-first spine.
- **B — Registry delivery**: ✅ **`/metrics` fetched at runtime**, cached via React
  Query. Backend is the single source of truth; new metrics need no frontend rebuild.
- **C — v1 scoring scope**: ✅ 10 linear weights + TE-premium. Bonuses (non-linear)
  deferred to a later milestone.
- **D — Default scoring**: ✅ site-wide `ppr` (matches today).
