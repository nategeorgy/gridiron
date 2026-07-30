# M3 Design — Fantasy Intelligence

Status: **shipped (local)** · Milestone: M3 (see [ROADMAP](../ROADMAP.md)) · 2026-07-29

Goal: the **moat layer**. M1 made fantasy points scoring-aware, M2 answered "was that
production earned?" — M3 answers the questions a manager actually asks: **who's worth
the most, who should I buy, who should I sell?** Four derived signals, all rule-based
and fully explainable, computed at query time from data we already store.

No new database columns. No projections. Every number on these boards can be traced
back to its inputs on the page itself.

---

## 1. The core decision — league context is a second config, alongside scoring

Fantasy points are only half of "value". Twelve points per game is a star at tight end
and a bench player at running back, and the 36th receiver is nearly free in a 12-team
league while the 13th already matters in a 6-team one. So value has to be measured
against **replacement level**, and replacement level depends on the league.

We could have hard-coded the conventional baselines (QB12 / RB24 / WR36 / TE12). That
would have been the one place where GridironIQ was *less* custom than its own pitch —
"your league scoring everywhere" is the product, and a fixed 12-team assumption
contradicts it. So league context became a first-class per-request config, built
exactly like `ScoringConfig`:

```
league = "12"                            12 teams, standard lineup
league = "10:rb=2,wr=3,flex=2"           10 teams, two flex spots
league = "12:superflex=1"                a superflex league
```

`app/league.py` resolves that into one **replacement rank** per position:

| Rule | Why |
|---|---|
| `dedicated = teams × starters[position]` | The floor: every team starts this many. |
| Flex slots are shared across RB/WR/TE **in proportion to the flex-eligible starters the lineup already uses** | A lineup starting 3WR/2RB/1TE fills its flex with receivers about 3/6 of the time. Matches how flex is actually used, and needs no external assumptions. |
| Superflex slots are credited entirely to QB | That is what they get used on. |

For the standard 12-team lineup this yields **QB12 / RB28 / WR42 / TE14** — within a
player or two of the conventional baselines, but now derived rather than assumed, so a
14-team 2-flex league gets its own numbers instead of the same ones.

**Replacement value** is the mean PPG of a **3-player band centred on the replacement
rank**, not that single player. One player at a specific rank is a coin flip away from
moving the whole baseline; a band of three is stable and still describes "the last
startable guy". This is computed in the user's own scoring, so a TE-premium league
raises the TE baseline before any player is compared to it.

---

## 2. The four scores

### The shared method: percentiles within position

Every input is converted to a **mid-rank percentile within the player's own position
pool** (ties share a percentile), and each score is a weighted mean of those
percentiles × 100.

Percentiles rather than z-scores because these distributions are skewed and
long-tailed — one Lamar Jackson season would drag a z-score-based composite around —
and because "84th percentile among receivers" is a sentence a fantasy manager can act
on. When an input is missing for a player its weight is dropped and the remaining
weights are renormalised, so a rookie with no career baseline still gets scored on
everything else.

### VORP — Value Over Replacement

```
vorp_ppg = fantasy_ppg − replacement_ppg[position]      (in your scoring & league)
vorp     = vorp_ppg × games_played
```

Both are reported: the per-game figure doesn't punish an injured star for the weeks
they missed, the total is what a manager actually banked.

### Fantasy Opportunity Rating (FOR) — 0–100

How much of an offense runs through a player, *regardless of what it produced*.

| Input | QB | RB | WR / TE |
|---|---|---|---|
| Expected fantasy PPG (M2, scoring-aware) | 0.50 | 0.50 | 0.50 |
| Pass attempts / game | 0.30 | — | — |
| Carries / game | 0.20 | — | — |
| Opportunity share | — | 0.20 | — |
| Carries inside the 10 / game | — | 0.15 | — |
| Route participation | — | 0.15 | 0.15 |
| Target share | — | — | 0.20 |
| Air yards share | — | — | 0.15 |

Half the score is expected fantasy points because xFP is already a scoring-aware model
of what a player's usage was *worth* — the other half is the raw usage shares that
matter at that position, so a back who gets goal-line work and a receiver who draws
deep targets are both credited for the kind of opportunity they have.

### Positive-Regression Index (PRI) — the buy-low signal, 0–100

| Input | Weight | Direction |
|---|---|---|
| Points over expected / game | 0.40 | lower is better |
| Fantasy Opportunity Rating | 0.30 | higher |
| TDs over expected / game | 0.15 | lower is better |
| Fantasy PPG | 0.15 | lower is better |

The 0.30 on opportunity is the load-bearing weight: a points-under-expected gap on
*no* usage is just a bad player, not a buy. The PPG term is the "still cheap" part —
a manager can't buy low on someone who already looks expensive.

### Sell-High Index (SHI) — 0–100

| Input | Weight | Direction |
|---|---|---|
| Points over expected / game | 0.35 | higher |
| TDs over expected / game | 0.20 | higher |
| Points per opportunity vs the player's own earlier seasons | 0.20 | higher |
| Usage trend (2nd half of window − 1st half) | 0.15 | lower is better |
| Fantasy PPG | 0.10 | higher |

Touchdown rate and per-touch efficiency are the two most volatile inputs to fantasy
scoring, so they carry the most weight. Usage trend is the tiebreak — outproducing
your opportunity *while losing snaps* is the clearest sell there is. The small PPG
weight exists because sell-high only means something for a player who currently has
trade value.

Two supporting definitions:

- **Career-baseline efficiency** is fantasy points per opportunity (carries + targets +
  pass attempts) across *all earlier seasons in the database*, regular season only, and
  only for players with ≥50 prior opportunities. Rookies have no baseline, which the
  renormalisation handles.
- **Usage trend** is opportunity share, second half of the window minus the first. For
  quarterbacks it is the *relative* change in pass attempts per game — a QB's share of
  the offense barely moves, their volume does — which keeps it on the same scale as the
  skill-position version.

### Where a score is deliberately withheld

PRI and SHI are both built around the expected-points gap. With no ffopportunity
coverage for a player, the remaining inputs describe usage, not regression, so **no
score is reported** rather than a misleading one. VORP and FOR are unaffected.

---

## 3. Pools, windows, and qualification

- **The pool** is the qualified players at a position. Percentiles and replacement
  levels are computed from it, and it is always built from **all** covered positions
  even when the caller filters to one — a receiver's percentile must not change because
  someone asked only about receivers.
- **Qualification** is one rule: `games ≥ max(2, round(0.35 × weeks_in_window))`. A
  full 18-week season needs 6 games; a last-8 window needs 3; a last-4 window needs 2.
  Overridable via `min_games`.
- **Any player can be scored against the pool**, qualified or not, so a player page
  shows real numbers with a "Small Sample" badge rather than an empty panel.
- **Trailing windows** are anchored to the last week that actually has data, so "last 4
  weeks" means the last four *played* weeks — not weeks 15–18 of a season that has only
  reached week 9.

---

## 4. Verification (local DB, 2020–2025)

### Replacement levels respond to both configs

2024, PPR, default lineup: **QB 17.32 / RB 11.39 / WR 11.60 / TE 9.86** PPG.

| Change | Effect |
|---|---|
| PPR → Standard | WR baseline 11.60 → 7.77, TE 9.86 → 5.81 (receptions were most of it) |
| PPR + TE-premium (1.5) | TE baseline 9.86 → **11.74**, others unchanged |
| 12-team → 8-team | WR#42 → WR#28, baseline 10.39 → 11.97 (2025) |
| Add a superflex | QB#12 → QB#24, baseline 17.32 → **14.20**; top VORP flips from Ja'Marr Chase to Lamar Jackson |

That last row is the whole point of the milestone: in a superflex league the engine
says the quarterback is the most valuable asset, and in a 1QB league it doesn't.

### Face validity (2024, PPR, 12-team)

Top buy-low: **Travis Kelce, T.J. Hockenson, Trey McBride, Aaron Jones** — the
canonical 2024 "enormous usage, no touchdowns" names (McBride: 2 TDs against 8.2
modelled). Top sell-high: **James Cook, Lamar Jackson, Baker Mayfield, George
Kittle** — the canonical touchdown-luck names (Cook: +6.1 TDs over expected).

### Backtest — do the signals predict?

Players were scored on **weeks 1–9 only**, then measured on **weeks 10–18** of the same
season. Mean change in fantasy PPG, by score quintile:

| Quintile | BUY 2022 | BUY 2023 | BUY 2024 | SELL 2022 | SELL 2023 | SELL 2024 |
|---|---|---|---|---|---|---|
| Q1 (lowest) | −1.85 | −1.19 | −1.27 | **+0.75** | **+0.84** | **+0.86** |
| Q5 (highest) | **+0.07** | **+0.30** | −0.29 | −2.65 | −1.60 | −1.87 |

FOR predicts the *level* of rest-of-season scoring almost perfectly monotonically, in
all three seasons:

| FOR quintile | 2022 | 2023 | 2024 |
|---|---|---|---|
| Q1 | 2.35 PPG | 2.75 | 2.38 |
| Q3 | 6.43 | 6.12 | 6.49 |
| Q5 | 12.53 | 13.25 | 13.45 |

The raw quintile view **understates PRI**, because it is confounded: buy-low candidates
start with low PPG (room to rise) and sell-high candidates start high (room to fall),
so some of the SELL effect is plain mean reversion. Controlling for that — comparing
the top third against the bottom third of each index *within* terciles of first-half
production, pooled across 2022–2024:

| First-half production | BUY spread (high − low) | SELL spread (high − low) |
|---|---|---|
| Low (−0.2 – 3.6 PPG) | **+0.28** | **−0.53** |
| Mid (3.6 – 9.6 PPG) | **+1.02** | **−1.44** |
| High (9.6 – 26.9 PPG) | **+1.96** | **−1.96** |

Both indices carry signal in the right direction in every production band, and the
effect is largest among the high producers — the players actually being traded. Roughly
±2 PPG of rest-of-season swing at the top of the range.

These are descriptive tendencies over three seasons, not guarantees, and the UI says so.

---

## 5. What was added

### Database

**Nothing.** Every score is derived at query time. This was a design goal: the scores
depend on the scoring config *and* the league config, so materialising them would mean
storing one row per player per scoring-context — the same trap M2 avoided by storing
expected components instead of expected points.

### Backend

| File | Role |
|---|---|
| `app/league.py` | `LeagueConfig`, `parse_league`, `replacement_ranks`, `lineup_label` |
| `app/intelligence.py` | The engine: percentile pools, the four scores, windows, career baselines, usage trend, and the explanation breakdown |
| `app/aggregation.py` | **New shared layer** — the season/window aggregate and the computed-column logic, extracted from `routers/stats.py` so the leaderboard and the intelligence board cannot drift apart |
| `app/metrics.py` | Nine new registry entries under a new `insight` category and `intelligence` aggregation |
| `routers/stats.py` | `GET /stats/intelligence` |
| `routers/players.py` | `GET /players/{id}/intelligence` — one player's scores plus the per-input breakdown |

### Frontend

| File | Role |
|---|---|
| `constants/league.js`, `hooks/useLeague.js` | League spec + URL/`localStorage` state (spine C, same pattern as scoring) |
| `components/LeagueControl.jsx` | League size + starting lineup editor, showing the resulting replacement level per position |
| `components/StatTable.jsx` | **Extracted** ranked table + pager, now shared by the leaderboard and Insight boards |
| `pages/InsightView.jsx` | The Insight board, driven by a board config |
| `components/InsightPanel.jsx` | Player-page panel: four scores, badges, and collapsible per-score breakdowns |
| `constants/boards.js` | `INSIGHT_BOARDS` (VORP / Opportunity Rating / Buy Low / Sell High) + a third nav group |
| `pages/Home.jsx` | The M3 teaser cards replaced with **live** buy-low / sell-high signal tiles |

The Insight nav group is listed **first**, ahead of the leaderboard dropdowns: these
boards are the reason to come back.

### Also fixed along the way

- `config.py` now allows any `localhost` port in development. A dev server on an
  auto-assigned port was being blocked by CORS, which is indistinguishable from a
  broken API. Production is unaffected (`ENVIRONMENT` is not `development` there).
- `vite.config.js` honours `PORT`, so a second dev server can run alongside the first.

---

## 6. Known limits

- **The weights are judgement, not fit.** They are informed defaults, documented in one
  place (`app/intelligence.py`), validated by the backtest above — not optimised. A
  fitted model is a Dream-tail item, and fitting these weights on three seasons would
  mostly produce overfitting.
- **xFP's known biases carry through.** ffopportunity models no expected fumbles, so
  xFP runs slightly high (see the M2 note), and anything built on the expected gap
  inherits that. It is consistent across players, so the *ranking* is largely unaffected.
- **Career-baseline efficiency is thin for young players** and absent for rookies. It
  carries 20% of SHI and renormalises away when missing, so a rookie's SHI leans harder
  on touchdown luck.
- **Usage trend needs both halves of the window.** A player who missed the back half of
  the window has no trend, and that weight renormalises away — which is correct but
  means an injured player never looks like a "shrinking role".
- **Small windows are noisy by nature.** A last-4-weeks board qualifies players at 2
  games. That is the right threshold for the question being asked, but the page states
  the threshold rather than hiding it.
- **VORP uses in-window PPG, not rest-of-season value.** It is a descriptive measure of
  what a player *was* worth. A forward-looking version is what the trade calculator
  (Dream tail) would need.

---

## 7. Performance

A full-season board is one aggregate query plus two small supporting queries, then the
pool math in Python: **~90 ms** for a 600-player season on the local database, ~40 ms
for a trailing window. Well inside the budget, so nothing is cached or materialised
yet.

If it does become slow (many concurrent users, or a season-spanning window), the fix in
order of preference: cache the aggregate rows per `(season, window, position)` and apply
scoring in Python; then materialise per-week aggregates. Materialising the *scores*
themselves is the wrong answer — they are league- and scoring-dependent by design.
