# Tweet kit

Branded tweet images for @SecondLevelFF, drawn from the local API. Every card is a
template: give it a game, player or team and it draws that one. The frame (green bar,
2L mark, footer with the URL, handle and data credit) is the same one the site's chart
exports use (`frontend/src/utils/exportImage.js`).

## Every week

The cards are a snapshot: the page holds the data it was built with, so it moves to a new
week only when it is rebuilt and published again.

1. Once your local database has the new week (Tuesday, after Monday night's game is loaded),
   start the backend from the main checkout: `cd backend && .venv/bin/uvicorn app.main:app --port 8000`.
2. Run `tools/tweetkit/refresh.sh`. It pulls the newest fully played week (recaps) and the
   week after it (previews), rebuilds the page and checks every card.
3. Ask Claude to publish `tools/tweetkit/index.html` to the review page below with
   `capabilities: {downloads: true}`. Publishing to the same link keeps it; publishing
   without the link makes a new page.

For a change to the cards themselves, ask Claude in any session; the code is here and
this README is the catalog.

## Thursday night (and Monday morning)

The recaps do not have to wait for Tuesday. nflverse publishes a game's play-by-play,
stat lines, expected points, snaps and Next Gen numbers by the next morning (PFR and FTN
charting come later, and no recap card needs them). Load that week into your local
database, add the routes export, and refresh:

```bash
cd pipeline
python ingest_schedules.py
for s in ingest_stats ingest_expected ingest_usage ingest_team_stats ingest_plays; do python $s.py --seasons 2026 --weeks 7; done
python ingest_routes.py --file data/routes/2026-w07-tnf.xlsx --dry-run   # then without --dry-run
cd ../tools/tweetkit && ./refresh.sh
```

`pull.py` recaps the coming week's games already played alongside the last full week, and
the page opens on the newest one. Everything else stays on the last full week. Season
numbers, game logs and the weekly cards stop there, so "through Week 6" stays true, and the
slate cards (C2, C3) keep every team. On a week only partly played, A1 and A2 show no
finishes and A5 no "against the week" ranks, since they would rank one game; each card says
so.

## Two ways to make an image

**The page.** https://claude.ai/artifact/4L9cX5h9qxcWZnysXjVTG4 (private; publish `index.html`
with `capabilities: {downloads: true}` to update it). Pick the game, player or team, set the
card's controls (the faces on a chart, a position, an opponent), then **Save PNG** (the viewer
asks you to confirm the file) or **Copy image** (paste straight into a post). The image is the
theme you are viewing, at 2x. Where saving is not available, Save PNG shows the image to save
by hand.

**The command line**, for a batch. Needs the backend on `localhost:8000` and Google Chrome.
No npm or pip installs.

```bash
cd tools/tweetkit
python3 pull.py            # newest fully played week; --week 6 to pick one
python3 build_data.py
python3 fetch_img.py       # headshots, logos and the two fonts, cached in img/ and fonts/
python3 build.py           # index.html (to publish) and preview.html (to render)
node check.mjs             # every card x every game, player, team and option: no errors, no NaN
```

Then render the cards you want. Both themes at 2x by default, into the repo's
`tweets/<season>-w<week>/` folder, which `.git/info/exclude` keeps out of git:

```bash
node render.mjs A4,A5 --game 2026_06_BUF_LV
node render.mjs B3,B4 --game 2026_07_GB_DET
node render.mjs C1,C3,C4,C5,C6
node render.mjs C8 --opt pos=RB --highlight "Bijan Robinson,Jahmyr Gibbs"
node render.mjs C12 --numbers "Puka Nacua,Jaxon Smith-Njigba"
node render.mjs C14 --opt chart=bend --highlight "DET,PHI"
node render.mjs C17 --opt chart=qb-pressure --numbers "Josh Allen"
node render.mjs D1,D3 --player "Jaxon Smith-Njigba"
node render.mjs D6 --player "Puka Nacua" --opt vs="Jaxon Smith-Njigba"
node render.mjs E1,E2,E3,E4 --team DET
```

`--themes dark` renders one theme, `--scale 1` a quick small copy, `--out DIR` somewhere
else. A player can be named or given by id. `--highlight ""` clears a chart's faces;
`--numbers` prints the named players' actual values on a chart (see below). Files are
`<card>-<game, player, team or week>-<chart or position>-<theme>.png`, so a batch of charts never overwrites itself.

## Picking players and teams on a chart

Every player scatter (A7, C6, C7, C8, C10 to C13, C17) has two picks under it:

- **Faces**: who gets a headshot and a name. Defaults to the chart's notable players.
- **Numbers**: who also gets his actual values printed in a tag ("aDOT 11.2 · TGT 31.5%",
  in the chart's own short labels). Empty by default. A pick here gets a face too.

Clicking a dot cycles it: first his face, then his numbers, then neither. The hover says
which comes next. The team charts (C1, C14) have one **Highlight** pick: a picked team stays
bright and carries its values and ranks of 32, and the rest fade. Picks survive a change of
chart, so one player can be followed across all of a position's charts. Picking moves no
other face or logo; each tag goes in whichever spot beside its marker covers the least.

## The cards

Sizes are the image in points; renders are twice that. Portrait is 1200x1500, wide is
1600x900; a card with a long list grows taller instead of shrinking its type. **Picked**
means Nate chose it to post. **Controls** are what the page and `render.mjs` let you set.

### A. Game recaps (Week N, `--game`)

| Card | Name | Size | What it shows | Controls | Status |
|---|---|---|---|---|---|
| A1 | Final | 1200x1500 | Score, quarters, line result, win probability, each team's top 3 scorers | | |
| A2 | Fantasy box score | 1200x1500 | Everyone who touched the ball: points against his average coming in, finish | | |
| A3 | Win probability | 1600x900 | Win probability with the five biggest swings numbered and described | | |
| A4 | Who got the ball | 1600x900 | Every target and carry for both teams on the game clock. Titled with the matchup ("Bills at Raiders") | | Picked Oct 20 |
| A5 | Team stats | 1200x1500 | Team box, each number ranked against the week, plus EPA per play by quarter | | Picked Oct 20 |
| A6 | Drive chart | 1200x1500 | Every possession from where it started toward the end zone, with how it ended | | Added Oct 21 |
| A7 | Points against expected | 1600x900 | Every player in the game: points against what his targets and carries were worth | Faces, numbers | Added Oct 21 |
| A8 | Every snap | 1600x900 | The EPA of every pass and run on the game clock, one lane per offense, EPA per play and success rate beside each, the four biggest plays numbered and described | | Added Oct 23 |
| A9 | Passing charts | 1600x900 | Both starting quarterbacks' targeted throws by depth and side, with each one's line, depth of throw and EPA per target | | Added Oct 23 |
| A10 | Routes and targets | 1600x900 | Every route runner: routes and share of the team's dropbacks, targets, targets and yards per route run. Needs that week's routes export loaded | | Added Oct 23 |

On every chart, hovering a dot on the page shows who it is and his numbers, and clicking it
adds or removes his face (on C1, highlights the team). The hover targets draw nothing in a PNG.

### B. Game previews (Week N+1, `--game`)

| Card | Name | Size | What it shows | Controls | Status |
|---|---|---|---|---|---|
| B1 | Matchup | 1200x1500 | Line, implied totals, last five against the spread, four players to watch a side | | |
| B2 | Fantasy matchup | 1200x1500 | PPG, expected PPG, weekly finishes, soft or tough matchup tag | | |
| B3 | Tale of the tape | 1600x900 | Both offenses' ranks on one side, both defenses' on the other, each scale running worst to best (Oct 22). Titled with the matchup only (Oct 21) | | Picked Oct 20 |
| B4 | Usage by week | 1600x900 | Target share (receivers) or carry share (backs) every week, snap share under it | | Picked Oct 20 |
| B6 | EPA by game | 1600x900 | Both offenses and both defenses game by game, against the league's middle half | | Added Oct 21 |
| B7 | How they play | 1600x900 | Both teams' tendencies on strips of all 32: pass rate over expected, pace, shotgun, motion, play action, screens, depth on offense; blitzes, rushers, stacked boxes on defense | | Added Oct 23 |

### C. Weekly series (no argument)

| Card | Name | Size | What it shows | Controls | Status |
|---|---|---|---|---|---|
| C1 | Team landscape | 1600x900 | Offensive EPA per play versus defensive EPA per play for all 32 teams, as logos | Highlight teams (with their numbers; the rest fade) | Picked Oct 20 |
| C2 | Implied team totals | 1200x1500 | Every offense on next week's slate ranked by implied total, with line and total | | |
| C3 | Matchups by position | 1200x1500 | Points each opponent allows to QB, RB, WR and TE, for every offense on the slate | | Picked Oct 20 |
| C4 | Top scorers | 1200x1500 | The week's top ten at each position | | Picked Oct 20 |
| C5 | Usage risers and fallers | 1200x1500 | Biggest moves in expected points per game, last three weeks against the three before | | Picked Oct 20 |
| C6 | Running back workload | 1600x900 | Carry share against target share; faces default to the top 20 in expected points | Faces, numbers | Picked Oct 20 |
| C7 | Who is earning targets | 1600x900 | Route participation against targets per route run, receivers with 50+ routes and 50%+ participation | Faces, numbers | Added Oct 21 |
| C8 | Points against expected | 1600x900 | Points per game against expected points per game, by position | Position, faces, numbers | Added Oct 21 |
| C9 | Weekly finishes | 1200x1500 and up | A position's top scorers (QB 20, RB 30, WR 36, TE 20) and every week's finish | Position | Added Oct 21 |
| C10 | QB scatter plots | 1600x900 | The site's Scatter page, quarterbacks: CPOE vs EPA, expected vs actual, depth vs CPOE | Chart, players, faces, numbers | Added Oct 21 |
| C11 | RB scatter plots | 1600x900 | Carry share vs route %, expected vs actual, inside-5 carries vs TDs, yards after contact vs RYOE, target share vs YPRR | Chart, players, faces, numbers | Added Oct 21 |
| C12 | WR scatter plots | 1600x900 | aDOT vs target share, expected vs actual, target share vs YPRR, TPRR vs YPRR, red zone targets vs TDs, route % vs TPRR | Chart, players, faces, numbers | Added Oct 21 |
| C13 | TE scatter plots | 1600x900 | The same six charts as C12, for tight ends | Chart, players, faces, numbers | Added Oct 21 |
| C14 | Team scatter plots | 1600x900 | Nine team questions as logos: passing vs rushing EPA, pass rate over expected vs EPA per dropback, success vs explosive plays (offense and defense), pass vs run defense, big plays for and against, sack rate vs EPA, pace vs neutral pass rate, motion vs play action | Chart, highlight teams | Added Oct 23 |
| C15 | Quarterback efficiency | 1200x1500 | Every quarterback with 15+ attempts a game: EPA per play beside CPOE, best to worst | | Added Oct 23 |
| C16 | Before and after contact | 1200x1500 | The 30 backs with the most carries: yards per carry split at first contact (the blocking, then the back), with RYOE and broken tackles | | Added Oct 23 |
| C17 | Next Gen scatter plots | 1600x900 | Tracking and charting questions: time to throw vs aggressiveness, air yards past the sticks, pressure, bad throws (QB); stacked boxes, contact, time to the line (RB); cushion vs separation, YAC over expected, catch rate by depth (WR, TE) | Chart, players, faces, numbers | Added Oct 23 |
| C18 | How every offense plays | 1200x1500 | All 32 offenses' tendencies in one table: pass rate over expected, neutral pass rate, pace, shotgun, motion, play action, RPO, screens, no huddle, depth | Sort by | Added Oct 23 |

C10 to C13 are the presets in `frontend/src/constants/scatters.js`, mirrored in `SCATTERS` in
`src/weekly.js`: add a chart to the site and it needs adding here too. C14 and C17 are the
tweet kit's own (`TEAM_SCATTERS` and `NGS_SCATTERS` in `src/weekly.js`) and mirror nothing. Each plots the top 50
qualified players in points by default (25, 100 or all), titled with the chart's question,
dashed medians (or the scoring-as-expected diagonal) and the site's corner names. Quarterbacks
also need 15+ pass attempts a game, since games played alone qualifies a backup with one throw.

### D. Player reply cards (`--player`)

| Card | Name | Size | What it shows | Controls | Status |
|---|---|---|---|---|---|
| D1 | Player profile | 1200x1500 (backs 1200x1550) | Stat tiles grouped by phase with positional ranks (backs: Fantasy points, Rushing, Receiving), percentile rows set per position on Oct 21 (`TILE_GROUPS` and `PCT_LIST` in `src/player.js`), every week's finish | | Picked Oct 20 |
| D2 | Week by week | 1600x900 | Each week's points against expected points, finish and usage | | |
| D3 | Usage by week | 1600x900 | Snap, route, target and air yards share (backs: carries; QBs: attempts and carries), with his headshot | | Picked Oct 20 |
| D5 | Every target | 1200x1500 | Every target by depth and side. QBs get every targeted pass, backs every carry by gap | | |
| D6 | Head to head | 1200x1500 and up | Two players at one position: D1's numbers and percentiles side by side, the better one bold | Opponent | Added Oct 21 |
| D7 | Where the points come from | 1600x900 | Each week's points split into yards, catches, touchdowns and turnovers, with the season's split | | Added Oct 21 |
| D8 | Advanced percentiles | 1200x1500 | NFL numbers, not fantasy ones, grouped by what they measure: efficiency, Next Gen tracking, PFR charting. Each a percentile and rank among the position; style rows (depth, time to throw, cushion) in one neutral blue, with what each end means | | Added Oct 23 |
| D9 | Passing network | 1600x900 | A quarterback's targets by receiver as a tree: line width for targets, colour for EPA per target, each receiver's line, aDOT and depth mix. A receiver's card shows his quarterback's network with him marked | | Added Oct 23 |

D1 and D6 are also on the site (Oct 21): the player page's player card and head-to-head, and the
home page's Head to Head (`frontend/src/components/player/PlayerCard.jsx` and `HeadToHead.jsx`).
Their stats are `CARD_TILES` and `CARD_PERCENTILES` in `frontend/src/constants/playerPage.js`, which
mirror `TILE_GROUPS`, `PCT_LIST` and `STAT` here: change a card's stats in both places. The site's
quarterback rushing yards per game is a registry metric (`rushing_yards_per_game`), so `build_data.py`'s
derived copy could read it from the API instead.

D4 (season by season) was removed on Oct 21. The reply-card pool is the top 36 QBs, 64 RBs,
90 WRs and 36 TEs by points (`CARD_DEPTH` in `pull.py`).

### E. Teams (`--team`)

| Card | Name | Size | What it shows | Controls | Status |
|---|---|---|---|---|---|
| E1 | Team profile | 1200x1530 | Points and EPA, offense against defense, how they play, fantasy points by position scored and allowed, top scorers. All ranked of 32 | | Added Oct 21 |
| E2 | Who gets the work | 1600x900 | Each week's share of the targets and carries, by player | | Added Oct 21 |
| E3 | EPA game by game | 1600x900 | Offense and defense EPA per play in every game, with the result | | Added Oct 21 |
| E4 | Red zone pecking order | 1600x900 | Targets and carries inside the 20 by player, and each one's share | | Added Oct 21 |
| E5 | Where they rank | 1200x1500 | Eleven efficiency numbers on offense and on defense, each a strip of all 32 teams with this one's logo on it, its value and rank | | Added Oct 23 |
| E6 | Where they throw | 1600x900 | Every target in twelve zones (four depths, three sides): EPA per target against the league in that zone, share, catch rate and who gets the ball there | | Added Oct 23 |
| E7 | Where they run | 1600x900 | Designed runs by gap along the line: share against the league, EPA per run and its rank, yards per carry and success rate | | Added Oct 23 |

## Rules the cards follow

- **Copy:** no em dashes, short plain titles. Show the scoring preset (PPR), never "your scoring".
- **Finish chips** use the site's five bands, set per position by Nate on Oct 22 (QB 1-6,
  7-12, 13-18, 19-24, 25+; RB 8/14/20/26; WR 12/24/32/38; TE 5/10/15/20): `BANDS` in
  `src/core.js` mirrors `FINISH_BANDS` in `components/player/FinishChip.jsx`, so change both
  together. Never a pool percentile. Team ranks of 32 are tinted
  green toward 1st, as on the team pages; for a tendency 1st means "does this the most".
- **Two teams on one card** get the game page's colours (`components/game/colors.js`), so
  two blue teams never draw in the same blue. On D6 the better number is bold, not coloured:
  a red team colour would read as the worse value.
- **Risers and fallers (C5) count only full games.** A game where a player played under
  60% of his own median snap share is left out, and each window needs two full games.
  Without that, the fallers were all injuries (a 10% snap game reads as lost work).
  Same rule as an on/off split in CLAUDE.md.
- **In-season routes** (route participation, TPRR, YPRR on C7, D1 and D3) come from the
  hand-loaded charting export. Nate has OK'd them on tweets; the credit stays
  "Data: nflverse", as on the site.
- **No 2026 personnel groupings** (11, 12, 13). That file is Sharp Football's and is not
  cleared for production; E1 uses the free numbers only, and so do C14, C18, B7 and E5.
- **A tendency is not a grade.** Pass rate, pace, motion, depth and the like have no better
  direction, so C18 shades them in one hue (darker does it more), B7 and C14 colour no corner
  for them, and D8 draws style rows in neutral blue with what each end means and no rank.
  A grade (EPA, success, sack rate) keeps the red to green scale, turned so better is right
  and up even where a lower number is better (a defense's EPA allowed, sack rate).
- **Next Gen numbers describe a player's busier games.** The weekly feed only publishes a
  week a player cleared its volume bar (CLAUDE.md), so C17 and D8 inherit that bias.
- **Ranks and percentiles** come from the API (`ranks=` and `percentiles=` on `/stats/intelligence`), so
  they match the site. A quarterback's rushing yards per game has no registry metric; `build_data.py`
  derives it with the API's own rule (the qualified players at the position; rank = players strictly
  better + 1; percentile = mid-rank), which reproduces the API exactly on rushing yards (129 backs).
- **Consensus ranks** for the coming week usually post Tuesday or Wednesday. Before that,
  B2 has no rank column.
- Fact-check any card that names a reason (C5's target and carry share lines) against
  the game logs before posting.

## How it is built

| File | Does |
|---|---|
| `refresh.sh` | The weekly rebuild: checks the backend is up, then runs the five steps below in order |
| `pull.py` | Calls the local API for the week's recaps (with every play and each passer's throws), previews, team stats and breakdowns, every week's player board, Insight boards, the reply-card players, every passer's network and every team's targets. Writes `raw/*.json` |
| `build_data.py` | Trims `raw/` into `data.json`: risers and fallers, bye weeks, team cards (with run gaps and pass depth), scatter pools, weekly finishes, every team's metrics with ranks (`team_league`), passing networks, passing zones, the advanced rows (D8) and pools (C15 to C17), and the images needed |
| `fetch_img.py` | Downloads headshots (220px WebP from the NFL CDN), both ESPN logo variants and the Inter and JetBrains Mono fonts |
| `build.py` | Inlines the brand mark (from `components/Brand.jsx`), the fonts, data, images and `src/` into `index.html` and `preview.html` |
| `src/core.js` | Frame, text, faces, logos, chips, grouped tiles, the shared scatter plot and its team twin (`scatterPlot`, `logoScatter`), value tags and where they go (`valueTag`, `placeTags`), team colours, formats |
| `src/recap.js`, `preview.js`, `weekly.js`, `player.js`, `team.js` | One function per card, each returning an SVG string |
| `src/app.js` | The page: pickers, each card's controls (`GROUPS`), the click cycle on a chart point (`clickStep`), theme, Save PNG and Copy image, the lightbox, and the solo mode `render.mjs` uses (`?card=C8&theme=dark&opt.pos=RB&hl=...&nums=...`) |
| `render.mjs` | Headless Chrome over its DevTools protocol: one PNG per card and theme, and warns about text outside the card |
| `check.mjs` | Runs every card against every game, player, team and option, and every scatter with three players' or teams' numbers on |

To add a card: write a `cardX(arg, opts)` function in the right `src/` file, add it to
`GROUPS` in `src/app.js` with an id, a one-line note and any `controls`, rebuild, and add a
row above. A chart with faces should draw through `scatterPlot` in `core.js` and take a
`highlight` control (for players, `facesAndNumbers` in `src/app.js` gives it the Numbers pick
too), so every chart lets you pick who gets a face, and whose numbers show, the same way. A
team chart draws through `logoScatter` and takes one `highlight` control.
