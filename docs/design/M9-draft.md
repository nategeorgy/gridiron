# M9 — Draft: Rankings & Mock Draft

> **Status: shipped.** Ships ahead of M7 (games) — draft season is now, games are not.
> **Read this before changing any of it.** Milestone numbering follows the design docs,
> not the calendar: `M7-games.md` and `M8-historical-depth.md` were written first and
> keep their numbers.

---

## 1. What ships

A fourth product surface — **Draft ▾** in the header — holding three pages:

| Page | Route | What it is |
|---|---|---|
| **Rankings** | `/draft/rankings` | The board. Consensus by default, switchable to any other board including your own, with our valuation alongside. |
| **Mock Draft** | `/draft/mock` | Practise your draft against bots, from any board, in your scoring and league. |
| **Value Board** | `/draft/value` | The M6.1 Draft Value Board, **moved** from `/insight/draft` (redirected). |

The Draft Value Board moves because it was always a draft tool sitting in an insight
menu; `/insight/draft` redirects so shared links and saved views survive.

---

## 2. Decisions taken up front

These were settled before any code and are the reason the shapes below look the way
they do. Where a decision cuts against a rule elsewhere in the project, the
reconciliation is stated.

**The default board is the market, not us.** Rankings opens on a *consensus* ordering
with our expected-VORP valuation as a column beside it — never a re-ranking of the
consensus by our own numbers. That board already exists as the Value Board, and having
two pages that both claim to be "the ranking" is how a user stops trusting either.

**"Consensus" means a blend, and the blend is anonymous.** We hold FantasyPros ECR plus
a handful of expert boards dropped in as CSVs, several of them paywalled. Those blend
into one **GridironIQ Consensus** and are *never individually selectable, labelled, or
returned*. The source registry (§4.1) is **fail-closed**: a source the backend does not
explicitly publish can only ever leave the server as one un-named input to an average.
FantasyPros keeps its own selectable board and its attribution, per the M6 rule that
ECR is labelled as FantasyPros' work wherever it is shown on its own.

**Custom and uploaded boards require sign-in.** This does not breach "accounts are a
persistence layer, never a gate" — *browsing* every consensus board and our valuation
works fully signed out; what needs an account is **saving a board of your own**, which
is the same class of thing as a favorite or a saved view. The create/upload controls
render **disabled with a tooltip** when signed out, never as a prompt to sign up.

**Mock drafts do not require sign-in.** They are the feature, not the persistence, so
the draft engine runs client-side over a board fetched from the API and resumes from
`localStorage` for everyone. Signed-in users additionally get their finished mocks
stored server-side (§4.4). This is also why the engine is client-side rather than
server-authoritative: a mock is ~150 picks, there is nothing to cheat at, and a round
trip per pick would make the room feel like a form.

**Uploads take one strict CSV format** (`rank, player, position, team, tier`), stated
once in `pipeline/data/rankings/README.md` and accepted identically by the in-app upload
and the expert-board drop folder. The *format* is shared; the code is not, because the
backend and the pipeline are separate deployables with separate dependencies and the
name-matching differs anyway (the pipeline has the nflverse crosswalk, the backend has
only the database). No column sniffing, no paste box.

**Kickers and defenses are out.** We hold no K/DST players at all, so mocks draft
QB/RB/WR/TE plus bench and say so. A placeholder round would be a fake.

**In-season, the page becomes weekly consensus.** There is no free rest-of-season
consensus ranking — measured, not assumed: `load_ff_rankings` publishes draft boards
and **weekly** boards (`weekly-offense`, `weekly-op`, per-position) and nothing else.
So Rankings switches to weekly ECR once the season starts and is labelled as weekly.
**We do not build a GridironIQ ROS ranking** in this milestone; that is a projection
model by another name, and the roadmap defers it.

---

## 3. What the data actually supports

Measured 2026-08-23 against `nflreadpy`, not assumed:

| Question | Answer |
|---|---|
| Consensus ROS rankings? | ❌ **None.** Draft + weekly only. |
| Weekly consensus? | ✅ but only from the **archive**. `load_ff_rankings("week")` is positional-only (`ppr-rb`, `qb`, … — no overall board). The archive carries `weekly-op`, the one overall weekly board still published: **`weekly-offense` was discontinued in October 2020** (7,148 rows ending 2020-10-12, against 43,907 rows of `weekly-op` running to the end of last season). `weekly-op` is superflex-shaped, which is why an in-season *position filter* switches to that position's weekly board instead of filtering the overall one. |
| ADP? | ❌ Still none — unchanged from M6. Bot behaviour is built on ECR + expert disagreement instead (§4.4). |
| ECR history? | ✅ **Yes, and this corrects an M6 note.** `load_ff_rankings("all")` (`db_fpecr`) is a real time series — 1,818,620 rows, 2019-12-27 → 2026-08-21. M6 concluded history accrues only from our first ingest; that is true of the *latest* snapshot file we ingest, not of the archive. Backfilling it is out of scope here but is now known to be possible. |
| Projected points? | 🟡 The weekly file carries `r2p_pts`. Not used: a single frozen-PPR number is not a projection we can rescore, and treating it as one would breach the M6.1 rule. |

---

## 4. Design

### 4.1 Ranking sources — one registry, fail-closed

`app/rankings.py` owns a registry of every board a request may name:

```python
GLOBAL_SOURCES = {
    "consensus":   Source(label="GridironIQ Consensus", public=True,  blend=True),
    "fantasypros": Source(label="FantasyPros ECR",      public=True,  blend=False),
}
```

Anything in `player_rankings` whose `source` is **not** a public entry here is private:
it participates in the blend and is otherwise invisible. That is the safety property,
and it is the default rather than a flag — dropping a new paywalled CSV in without
touching any code exposes nothing.

No new table. `player_rankings` was built multi-source from day one (`source` +
`ranking_type` in the key), which is exactly what this needs.

### 4.2 The blend

Averaging ranks across boards of different depths is the same trap the Draft Value
Board fell into in M6.1 — *a rank comparison must count the same players on both
sides* — so the blend states its rules:

1. Each source is **densely re-ranked** over the players it lists, within the requested
   `ranking_type`. A source's own numbering (ECR's decimals, an expert's gaps) is not
   comparable across boards; its *ordering* is.
2. A player missing from a source that *does* list their position is imputed at that
   source's depth + 1, not skipped. Averaging only over the boards that list someone
   would let one deep board float a fringe player into the top 100 — and the constant
   penalty is also what lets boards of different depths blend at all, since it leaves
   the deeper board's ordering intact below the shallower board's floor.
3. **One source is enough to appear**, because of rule 2. The plan said two; see the
   correction below.
4. The blended board carries **`sources_count`** and **`rank_sd`** (dispersion across
   boards) — the honest expression of "the experts disagree here", and the input the
   mock-draft bots use for reach/fall (§4.4). Dispersion is measured over *real*
   placements only; the imputed values are there to place a player, not to manufacture
   disagreement about them. With a single source held, it falls back to that source's
   own published `sd`, which is what keeps the bot model working before any expert CSV
   has been dropped.

> **Correction found while building: "at least two sources" truncated the consensus.**
> Blending a 434-name FantasyPros board with a 150-name expert board produced a
> **150-name** consensus — every player the shallow board had never heard of was
> dropped entirely, rather than placed below its floor. Rule 2 already handles the case
> rule 3 was guarding (one board's lone opinion lands at the average of its rank and the
> other boards' depth, which is a sensible place), so the minimum is now one and
> `sources_count` travels on every row instead.

Computed at query time. It is a few hundred rows across a handful of sources, and a
stored blend would need a row per source set — the same argument that keeps Insight
scores and implied totals underived-until-asked.

### 4.3 User boards

Two new tables, both **RLS-locked** in the migration per the standing rule:

```sql
ranking_boards (
  board_id     UUID PRIMARY KEY,
  user_id      UUID REFERENCES users(user_id) ON DELETE CASCADE,
  name         VARCHAR(60),
  ranking_type VARCHAR(40),   -- which board this is a version of: redraft-overall, …
  origin       VARCHAR(20),   -- 'upload' | 'custom'
  seeded_from  VARCHAR(60),   -- the source/board it was cloned from, for provenance
  created_at, updated_at,
  UNIQUE(user_id, name)
)

ranking_board_entries (
  board_id   UUID REFERENCES ranking_boards(board_id) ON DELETE CASCADE,
  player_id  VARCHAR(50) REFERENCES players(player_id),
  rank       INT,
  tier       INT NULL,
  note       VARCHAR(200) NULL,
  PRIMARY KEY (board_id, player_id)
)
```

`rank` is stored densely and rewritten on every save — a board is edited by
drag-and-drop, so "the whole board" is the unit of change, not a row.

**Upload matching** runs server-side against `players`, normalised name + position,
with team as the tiebreak for duplicate names. Unmatched rows are **returned to the
user with their rank** rather than dropped silently, so a board that lost its third-
round pick to a nickname is visible as that rather than as a hole.

### 4.4 Mock draft

**Client-side engine, server-side inputs.** The room fetches one board (up to ~400
rows with position, team, ECR dispersion and our valuation), runs the draft in React
state, mirrors to `localStorage` after every pick, and calls the API twice: once for
the board, once for the grade.

**Two independent board settings**, because they answer different questions:
- **The bots' board** — set at draft setup. This is the market you are practising
  against.
- **Your board** — switchable *inside* the room, in the available-players panel. This
  is your cheat sheet, and changing it never changes what the bots do.

**Bot model.** No ADP, so reach and fall are drawn from the consensus's own
disagreement: a bot picks from the top of its board with a displacement scaled by that
player's `rank_sd`, so genuinely contested players wobble and clear-cut ones do not.
On top of that: positional need against the league's starting lineup, a light
positional-run effect (a bot is likelier to take a position two bots just took), and a
**randomness slider** (0 = strict board order, 1 = your league's worst drafter) that
scales the displacement.

**Grading** is `POST /api/v1/draft/mock-grade` with the finished rosters: the server
returns each team's total expected VORP in the user's scoring and league, the ranking
of the teams, and each pick's value against the board it was taken from. Expected, not
actual, for the M6.1 reason — a draft graded on last season's touchdown luck rewards
variance.

**The room is a board, not a feed.** Teams across, rounds down, every pick in its own
cell, tinted by position — the layout every drafter already knows from Sleeper and ESPN,
and the only one that answers the questions people actually have while drafting: whether
quarterbacks have started going, whether the team picking before you needs a back, how
far it is until you are up again. A first build used a "recent picks" list and answered
none of them. Columns are teams (a column is a roster); the pick *numbers* snake, and
each cell carries an arrow for where the order goes next.

Two consequences worth stating:

* **The board's cell math must stay the exact inverse of `snakeOrder()`.** One decides
  whose turn it is, the other decides which cell a pick lands in. If they drift, every
  pick renders in the wrong place while the draft itself runs correctly — a bug that
  throws nothing.
* **Position colour needed new tokens**, `--position-qb/rb/wr/te`, aliasing four series
  hues rather than inventing colours to re-validate. The *tint strength* had to become a
  per-theme token as well (`--cell-tint`): mixing a hue with `transparent` darkens over
  a dark surface and lightens over a light one, so the dark theme's 42% read as a wash
  on light. Measured after tuning: 5.0–10.7:1 for cell text in both themes.

**What the pool shows, and what it deliberately does not.** Age, bye week, and last
season's whole box score in the caller's scoring — games, points, PPG, then passing,
rushing and receiving under grouped headers. **There is no projection
column**, because there are no projections: every nflreadpy loader was checked, and the
only forward points figure anywhere in the ecosystem is `r2p_pts` in the weekly ECR file
— per-week, in-season only, and frozen in PPR. A "2026 PROJ" column would be one we
invented, and the roadmap defers homemade projection models. The header says so on hover,
and the compare dialog says so on its face. A **dash** in a stat column means the stat
does not apply to that position rather than that it is unknown — a receiver's passing
yards genuinely are zero, but twelve zeroes on every row is noise, so the convention
every fantasy table uses applies here too.

**The player row is stacked, and the Draft button sits beside it.** With twelve stat
columns in the row, a button at the far right is a long journey from the name that
prompted the click. Name over tag-and-team keeps the identity to one column; the button
takes the next one so every button shares an x. The layout rule underneath: *the
identity columns are shrink-to-fit and the stats absorb the slack.* Both other
arrangements fail — a stretching name column strands the tag against the window edge,
and making every column shrink-to-fit leaves nothing to absorb, so the browser shares
the spare width evenly and drifts the row toward the middle.

**The reader owns the split.** A draft room is two surfaces competing for one screen,
and which one matters flips every few minutes — the board while you wait, the pool on
the clock. Rather than pick a ratio and defend it, a handle between them resizes the
board, from folded to just the team headers all the way down to filling the view, with
Expand/Collapse buttons for the two ends. The height persists with the draft, because
it is a preference about *this* room.

For that to mean anything the room has to be **viewport-locked**: its height is the
window minus its own measured top, the board takes the chosen height, and the bottom
section is `flex-1`. Otherwise dragging the board up just reveals empty page — the
first build of the handle did exactly that, because the pool still had a fixed
`max-height` and had no reason to grow. The floor under the bottom section is measured
too: below about 280px the pool card cannot shrink past its own padding, filter bar and
table header, so it overflows its grid row and pushes the page into a scrollbar instead
of clipping.

**The Draft button is filled on light and outlined on dark.** The frosted pill with
accent text measures 5.0:1 on the dark card and **2.7:1 on the light one** — and it is
the control the room is built around. Light therefore fills it with the accent and puts
the page's own text colour on top (6.3:1). Deliberately *not* `--accent-ink`, which is
white and would be the same trap in the other direction on this hue.

**The queue is draft-local, not the account watchlist.** The heart in the pool writes to
the mock's own `localStorage` payload. Using the app-wide watchlist would have been one
less concept, but it would have put a sign-in wall inside the one surface this milestone
promised would never have one.

**Persistence.** In-progress mocks live in `localStorage` for everyone. Finished mocks
are stored for signed-in users in `mock_drafts` + `mock_draft_picks` (RLS-locked), so
a mock history and "how did my last five drafts grade" become possible later.

### 4.5 In-season switch

`ingest_rankings.py` grows a weekly mode writing `weekly-*` variants at the real week
number — the `week` column in `player_rankings` has been waiting for exactly this since
M6.1. The Rankings page picks its context from the season clock: **week 0 (draft
boards) until the first game of the season has been played, weekly boards after**,
labelled either way. `GET /api/v1/seasons` already answers "has this season started".

---

## 5. Endpoints

```
GET  /api/v1/draft/sources                  ← boards this caller may pick: public
                                              globals + the blend + their own
GET  /api/v1/draft/rankings                 ← one board's rows + our valuation columns.
                                              ?source=consensus|fantasypros|board:<uuid>
POST /api/v1/draft/mock-grade               ← grade finished mock rosters
GET  /api/v1/stats/draft-board              ← unchanged (M6.1)

# Account-scoped. Token subject only, never a user id in the request.
GET/POST        /api/v1/me/ranking-boards
GET/PATCH/DELETE /api/v1/me/ranking-boards/{board_id}
PUT             /api/v1/me/ranking-boards/{board_id}/entries   ← the whole board
POST            /api/v1/me/ranking-boards/import               ← CSV upload (JSON body)
GET/POST        /api/v1/me/mock-drafts
GET/DELETE      /api/v1/me/mock-drafts/{mock_id}
```

---

## 6. Invariants this milestone adds

- **A private ranking source may never leave the server on its own.** Fail-closed
  registry; the only path out is the blend. Locked by a test that asserts every
  source the API lists is `public=True`, and that a request naming a private source
  404s with a **byte-identical** body to a source that does not exist — so the
  endpoint cannot be used to probe which paywalled boards we hold.
- **Blended ranks are densified per source before averaging.** Averaging raw ECR
  against an expert's 1–200 list weights the deeper board twice.
- **Bots draft from the setup board; the user's board is a view.** Switching the
  available-players ordering mid-draft must not alter a single bot decision.
- **A mock draft never requires an account.** The room degrades to `localStorage`,
  never to a sign-in wall.

---

## 7. What shipped, and what the build changed

All six slices shipped: the rankings foundation, user boards (migration `0fd5c30c9287`,
four RLS-locked tables), the pipeline (`ingest_expert_boards.py` plus
`ingest_rankings.py --weekly`), the Rankings page and board editor, the mock draft room,
and the docs.

Four things the plan did not anticipate:

**The blend truncated to its shallowest source.** Described in §4.2 — the one failure
here that produces a plausible-looking board rather than an error, and the reason
`tests/test_rankings.py` pins it.

**`weekly-offense` no longer exists.** The plan named it as the in-season overall board
on the strength of its presence in the archive. It was discontinued in October 2020;
`weekly-op` is what is published now, and it is superflex-shaped. So an in-season
position filter switches to that position's *weekly board* rather than filtering the
overall one — which is the better read anyway, since "who are my best receivers this
week" is what a weekly board is for. Drafting is the opposite: filtering the overall
board to running backs preserves the ordering being drafted.

**A latent import cycle, exposed rather than introduced.** `app/metrics.py` resolved
composite metrics' availability at import time by importing the formula grammar from
`app/custom_metrics.py`, which imports `app/metrics.py`. That only ever worked because
`app/main.py` happened to import the metrics router first — `import app.custom_metrics`,
`import app.intelligence` and `import app.routers.stats` each failed outright on their
own. Adding a router that reaches the chain in a different order broke the app.
`finalize_availability()` now does the work from whichever module finishes second.

**A grade with no name in it.** An unvaluable pick (a rookie) came back with a blank
player name, because identity was being read off the valuation rather than off
`players`. It reads as a bug rather than as "we cannot value this pick yet", which is
the thing the column is supposed to say.
