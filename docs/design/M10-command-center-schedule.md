# M10 — Command Center rebuild, the Schedule tab, and trending usage

> **Status: shipped 2026-08-31.** Four things that turned out to be one thing: the home
> page needed a scoreboard, which needed the games endpoint `CLAUDE.md` has listed as a
> target since the first milestone and nothing had built.

---

## 1. What ships

| Surface | Route | What it is |
|---|---|---|
| **Command Center** | `/` | Rebuilt as a two-column **Fantasy Desk**. The visible heading is "Highlighted Data"; "Command Center" remains the internal name for the page. |
| **Games** | `/schedule/games` | The whole schedule, filterable by season, week and team. |
| **By Team** | `/schedule/by-team` | One season as a team × week grid. |
| **Vegas Board** | `/schedule/vegas` | The M6.4 board, **moved** from `/insight/vegas` (redirected). |

Plus four endpoints — `GET /api/v1/games`, `/games/weeks`, `/games/scoreboard`,
`GET /api/v1/stats/trending` — one migration, and one new metric.

The Vegas board moves for the M9 reason: it answers "what happens this week", not "who
should I start". `/insight/vegas` redirects, so shared links and saved views survive.

---

## 2. Decisions taken up front

**Live scores are not in scope, and the reason is architectural.** nflverse publishes
finals, not a play-by-play feed, and the pipeline refreshes on a schedule — so an
in-progress score is not something this stack can honestly render. The scoreboard shows
the week just played beside the week coming up, and a game with no result shows its
kickoff rather than a fake zero. An ESPN proxy was considered and rejected for now: it
would be the first unofficial upstream in the project.

**The migration adds one column, not four.** `load_schedules` also carries `weekday`,
`stadium` and an `espn` game id. `weekday` is a pure function of `game_date` — storing
it would create a second way to be wrong, the same reasoning that keeps implied team
totals derived at query time (M6.4). `stadium` and `espn` have no surface asking for
them, and `roof` / `surface` already answer the game-environment question.

**Kickoff is stored as a naive `TIME` meaning Eastern.** That is the timezone nflverse
publishes for every game, London included, and the one every scoreboard in the sport
quotes. A `TIMESTAMPTZ` would mean resolving EDT vs EST per row at ingest and handing
clients an instant they would convert straight back for display. Surfaces render it with
an explicit "ET" so it is never ambiguous. Present from 2000; the feed carries no
kickoff for 1999, which renders as no time rather than as midnight.

**"Which two weeks" is a server decision.** `/games/scoreboard` returns the newest
regular-season week with a final score and the earliest without one. The rule depends on
the season clock, so a client reimplementing it would drift — and from January to
September the two windows **straddle different seasons**, which is why each names its
own rather than the response naming one.

---

## 3. Trending usage — the floors are the feature

`app/trending.py` ranks a **change** rather than a season: the last few weeks of usage
against the pace set before them. A season total is the one number that cannot answer
that question — a back who took over a backfield in Week 12 looks average all year.

**A delta alone is a bad board, and it took real data to see why.** Ranked purely on the
snap-share swing, the top of the riser list was backup tight ends going from nothing to
garbage time: the largest *relative* moves in the league belong to players nobody can
start. Two rules fix it, and both are the point rather than a filter bolted on:

- a riser must clear a **fantasy floor in the recent window** — he has to matter *now*;
- the move must appear in **opportunity share**, not only snaps. Snaps rise in a
  blowout; carries and targets rise when a coach changes his mind.

The falling side takes the mirror floor: the player must have **mattered before**, or
"trending down" is a list of reserves whose usage fell from almost nothing to nothing.

**QB is out of scope.** A starter plays every snap, so his snap share is ~1.00 in both
windows and route participation is undefined — the signal this module is built on does
not exist for the position. A quarterback losing his job is a depth-chart event, which
the M6.2 chart already reports.

---

## 4. The preseason problem, and the outlook mode

Before roughly Week 5 there is no trailing window to rank, so the Trending card would be
empty for the two months of the year when draft interest peaks. It therefore has **two
modes and picks between them itself**: the live board once the newest scheduled season
has kicked off *and* the endpoint has rows, and a hand-picked **2026 opportunity
outlook** otherwise. Nothing needs editing in September.

The outlook set lives in `frontend/src/constants/signals.js` and uses **three kinds of
evidence, each only where it is actually valid**:

| Kind | When it is honest | Example |
|---|---|---|
| `split` | Enough clean games with a teammate on and off the field | Michael Wilson with/without Marvin Harrison Jr. |
| `trajectory` | A role that grew across a season, confirmed past Week 18 | Colston Loveland, Jalen Coker |
| `vacated` | There is **no** on/off sample at all | Ladd McConkey |

⚠️ **An on/off split must exclude games the *subject* did not play in full.** DeVonta
Smith's two 2025 games without A.J. Brown average to a 52% snap share — one is a genuine
90%-snap game in which he took 45% of the targets, the other a Week 18 he played 14% of.
The mean of those describes neither. Filtered on Smith's own participation and widened to
the full 2022–25 partnership, three games qualify and all three agree (34.5%, 27.8%,
45.0% of targets).

⚠️ **When there is no sample, say so rather than manufacturing one.** Keenan Allen played
all 17 games, so no query produces a "McConkey without Allen" split. The honest
substitute is **vacated share** — target share that has physically left the roster, which
is a fact about the team rather than a projection about the player. Deliberately no
projection: vacated share is what left, not what this player is assumed to inherit.

⚠️ **Week 18 alone proves nothing** — starters rest. A trajectory card's late window
therefore includes the playoff games, which is what makes Loveland's ramp credible
(15 targets and 137 yards in the divisional round).

**The numbers are hardcoded, and that is safe here where it would not be elsewhere:**
they describe a closed season, so they are frozen facts rather than a snapshot of
something moving. Only the *selection* is hand-picked; a card may set `tone: "warn"` when
the movement is a warning rather than a promotion (Wilson reads without → with, in amber,
because the news is that Harrison is back).

---

## 5. `epa_per_play`, and a small generalisation

The QB board wants a rate, not a volume: total EPA separates a quarterback who threw a
lot from one who threw well only after you divide it.

`derived` metrics had **games** hardcoded as their denominator, so a rate per
*opportunity* had no way to exist. `MetricDef.per` now names its own denominator columns
— `epa_per_play` is `base="epa", per=("attempts", "carries")` — and aggregates first
exactly like a composite: `Σepa / Σplays`, never the mean of per-game rates. Availability
intersects numerator and denominator, since a rate is only answerable where both sides
are.

Counting carries in the denominator is deliberate: `player_stats.epa` is passing **plus**
rushing, so a running quarterback's legs should count toward the rate rather than dilute
it. Sacks are not in the denominator — no free feed publishes them per player — so this
is per *play*, not per dropback, and the metric description says so.

---

## 6. Things that cost time, kept so they cost it once

- **`compute_points` starts from the stored `fantasy_points_std`** and adds only the
  *difference* between the caller's weights and standard ones. Real ingested rows always
  carry it, so this is invisible in production and lethal in a fixture: a test stat line
  without it scores as though the player gained no yards, and a scoring-aware assertion
  silently tests nothing but receptions.
- **A table with no `min-width` shrinks instead of overflowing.** `overflow-x: auto`
  around a bare `<table>` does nothing in a narrow column — the columns collapse into
  each other and the scrollbar never appears. Everything narrow goes through
  `ScrollTable`.
- **`--series-4` (gold) cannot take white text**: 2.17:1 in the light theme. Badge inks
  are chosen per hue rather than inheriting one white.
- **A "before" bar stacked under an "after" bar is invisible** when every row moves in one
  direction — the longer bar covers the shorter one completely. Hence dumbbells.
- **`<CardState />` is always a truthy element**, even when it renders `null`, so
  `state ?? list` silently swallowed the list. Decide with a boolean.

---

## 7. What this deliberately does not do

- **No live scores**, for the reason in §2.
- **No projection anywhere.** Vacated share is what left; the outlook cards state
  measured facts and stop.
- **No `/games/{id}` detail page.** Nothing asks for one yet.
- **The outlook set is not computed.** A later pass decides whether it should be driven
  by the M3 regression indices or by something new; the constants file states that
  expiry rather than pretending to be permanent.

---

## 8. Deploying this

`render.yaml` does **not** run migrations. `c4e1a72b9f30` is additive and nullable, so
the safe order is: apply it to Supabase *first* (invisible to the deployed code), then
merge, then let `ingest_schedules.py` backfill kickoff times on its next run. Merging
first would leave `/games` returning 500 until the column existed, taking out both the
home scoreboard and the whole Schedule tab.
