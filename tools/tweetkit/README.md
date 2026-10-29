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
   week after it (previews), rebuilds the page and checks every card. To refresh before
   Monday night is in, name the week (`refresh.sh --week 7`): games not yet played are left
   out of the recap picker.
3. Ask Claude to publish `tools/tweetkit/index.html` to the review page below with
   `capabilities: {downloads: true}`. Publishing to the same link keeps it; publishing
   without the link makes a new page.

For a change to the cards themselves, ask Claude in any session; the code is here and
this README is the catalog.

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
node render.mjs B9 --game 2026_08_BAL_BUF --opt who="Derrick Henry"
node render.mjs B7 --game 2026_08_BAL_BUF --opt qb1="Drake Maye" --opt qb2="Matthew Stafford"
node render.mjs C1,C3,C4,C5,C6
node render.mjs C8 --opt pos=RB --highlight "Bijan Robinson,Jahmyr Gibbs"
node render.mjs D1,D3 --player "Jaxon Smith-Njigba"
node render.mjs D6 --player "Puka Nacua" --opt vs="Jaxon Smith-Njigba"
node render.mjs E1,E2,E3,E4 --team DET
node render.mjs A12 --game 2026_07_GB_DET --opt who="Jahmyr Gibbs"
node render.mjs F1 --opt qb="Jared Goff" --opt tf=last4 --opt sit=red_zone
node render.mjs F2 --opt grp=TE --opt view=ridge --opt tf=last3
node render.mjs F3 --opt stat=rush_yds --opt pos=RB --opt per=game
node render.mjs C12 --opt chart=wr-yprr --opt tf=last1
```

A player control (`who`, `vs`, `qb`) takes a name or an id. Timeframes are `season`, `last4`, `last3`,
`last2` and `last1` (the newest week).

`--themes dark` renders one theme, `--scale 1` a quick small copy, `--out DIR` somewhere
else. A player can be named or given by id. `--highlight ""` clears a chart's faces. Files are
`<card>-<game, player, team or week>-<chart or position>-<theme>.png`, so a batch of charts never overwrites itself.

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
| A7 | Points against expected | 1600x900 | Every player in the game: points against what his targets and carries were worth | Faces | Added Oct 21 |
| A8 | Score and scoring plays | 1600x900 | Each team's score through the game as a step line, every scoring play numbered and listed | | Added Oct 28, no fantasy |
| A9 | Box score | 1200x1500 | Passing, rushing and receiving lines for both teams, then yards, first downs, third downs, turnovers, sacks and possession | | Added Oct 28, no fantasy |
| A10 | Passing networks | 1600x900 | Both quarterbacks' networks for the game: each receiver's share, depth and side, coloured by EPA per target | | Added Oct 28, no fantasy |
| A11 | Passing charts | 1600x900 | Every targeted pass from both quarterbacks by depth and side, with completions, touchdowns and picks | | Added Oct 28, no fantasy |
| A12 | Standout | 1600x900 | One player's line with his rank among the position that week, then every touch on the game clock (a quarterback's throws on the field) | Player | Added Oct 28, no fantasy |

On every chart, hovering a dot on the page shows who it is and his numbers, and clicking it
adds or removes his face (on C1, highlights the team). The hover targets draw nothing in a PNG.

### B. Game previews (Week N+1, `--game`)

| Card | Name | Size | What it shows | Controls | Status |
|---|---|---|---|---|---|
| B1 | Matchup | 1200x1500 | Line, implied totals, each team's last five results, both offenses' matchups at every position (PPR points allowed, rank of 32), and passing and running unit against unit (reworked Oct 28: no ATS lines, no last meeting, no players to watch) | | |
| B2 | Fantasy matchup | 1200x1500 | PPG, expected PPG, weekly finishes, soft or tough matchup tag | | |
| B3 | Tale of the tape | 1600x900 | Offense against offense on the left, defense against defense on the right: both teams on one rank track per stat, 32nd on the left and 1st on the right (reworked Oct 28). Titled with the matchup only | | Picked Oct 20 |
| B4 | Usage by week | 1600x900 | Target share (receivers) or carry share (backs) every week, snap share under it | | Picked Oct 20 |
| B6 | EPA by game | 1600x900 | Both offenses and both defenses game by game, against the league's middle half | | Added Oct 21 |
| B7 | Quarterback matchup | 1200x1500 | Two quarterbacks as D9 without the rushing totals, with its own percentile rows (`QB_MATCHUP_PCT`: yards per completion added, passing first downs dropped): passing box score with ranks, then percentiles (EPA total, EPA per play, CPOE first; Sack % from sacks over dropbacks, derived in `build_data.py`), the better one bold | Quarterback, Against (this game's starters by default; any two) | Added Oct 28, no fantasy |
| B8 | How they play | 1600x900 | Tendencies on rank tracks (the most on the right): pass rate, pace, motion, play action and more on offense; blitz, rushers, stacked boxes and what opponents do against them on defense | | Added Oct 28, no fantasy |
| B9 | Player matchup | 1200x1500 | One player's spot: where the defense ranks in PPR points allowed to his position (and in expected points), nine stats it allows to the position on rank tracks (toughest left, softest right), and every game against it with the top scorer | Player | Added Oct 28 |
| B10 | Team matchup | 1200x1500 | One offense against the other defense: eight unit-against-unit rows with the edge to the better ranked, the four position matchups, and each player's matchup tag | Offense | Added Oct 28 |
| B11 | Game environment | 1600x900 | Titled with the matchup only. The game ranked 1st to last against the week's others (total, plays, neutral pass rate, EPA, both defenses' points and explosive plays allowed), and every player on both teams by PPG against his matchup | Faces | Added Oct 28 |

B9 to B11 read `DATA.allowed`: every QB, RB, WR and TE stat line against each defense, summed
by week and position in `build_data.py` (it matches the site's matchup ranks exactly). Every
rank on them is for the offense: 1st is the softest matchup.

### C. Weekly series (no argument)

| Card | Name | Size | What it shows | Controls | Status |
|---|---|---|---|---|---|
| C1 | Team landscape | 1600x900 | Offensive EPA per play versus defensive EPA per play for all 32 teams, as logos | Highlight teams (the rest fade) | Picked Oct 20 |
| C2 | Implied team totals | 1200x1500 | Every offense on next week's slate ranked by implied total, with line and total | | |
| C3 | Matchups by position | 1200x1500 | Points each opponent allows to QB, RB, WR and TE, for every offense on the slate | | Picked Oct 20 |
| C4 | Top scorers | 1200x1500 | The week's top ten at each position | | Picked Oct 20 |
| C5 | Usage risers and fallers | 1200x1500 | Biggest moves in expected points per game, last three weeks against the three before | | Picked Oct 20 |
| C6 | Running back workload | 1600x900 | Carry share against target share; faces default to the top 20 in expected points | Faces | Picked Oct 20 |
| C7 | Who is earning targets | 1600x900 | Route participation against targets per route run, receivers with 50+ routes and 50%+ participation | Faces | Added Oct 21 |
| C8 | Points against expected | 1600x900 | Points per game against expected points per game, by position | Position, faces | Added Oct 21 |
| C9 | Weekly finishes | 1200x1500 and up | A position's top scorers (QB 20, RB 30, WR 36, TE 20) and every week's finish | Position | Added Oct 21 |
| C10 | QB scatter plots | 1600x900 | The site's Scatter page, quarterbacks: CPOE vs EPA, expected vs actual, depth vs CPOE | Chart, timeframe, players, faces | Added Oct 21 |
| C11 | RB scatter plots | 1600x900 | Carry share vs route %, expected vs actual, inside-5 carries vs TDs, yards after contact vs RYOE, target share vs YPRR | Chart, timeframe, players, faces | Added Oct 21 |
| C12 | WR scatter plots | 1600x900 | aDOT vs target share, expected vs actual, target share vs YPRR, TPRR vs YPRR, red zone targets vs TDs, route % vs TPRR | Chart, timeframe, players, faces | Added Oct 21 |
| C13 | TE scatter plots | 1600x900 | The same six charts as C12, for tight ends | Chart, timeframe, players, faces | Added Oct 21 |

C10 to C13 are the presets in `frontend/src/constants/scatters.js`, mirrored in `SCATTERS` in
`src/weekly.js`: add a chart to the site and it needs adding here too. Each plots the top 50
qualified players in points by default (25, 100 or all), titled with the chart's question,
dashed medians (or the scoring-as-expected diagonal) and the site's corner names. Quarterbacks
also need 15+ pass attempts a game, since games played alone qualifies a backup with one throw.
The timeframe (Oct 28) re-reads the qualified players for those weeks, as the site's timeframe filter does.

### D. Player reply cards (`--player`)

| Card | Name | Size | What it shows | Controls | Status |
|---|---|---|---|---|---|
| D1 | Player profile | 1200x1500 (backs 1200x1550) | Stat tiles grouped by phase with positional ranks (backs: Fantasy points, Rushing, Receiving), percentile rows set per position on Oct 21 (`TILE_GROUPS` and `PCT_LIST` in `src/player.js`), every week's finish | | Picked Oct 20 |
| D2 | Week by week | 1600x900 | Each week's points against expected points, finish and usage | | |
| D3 | Usage by week | 1600x900 | Snap, route, target and air yards share (backs: carries; QBs: attempts and carries), with his headshot | | Picked Oct 20 |
| D5 | Every target | 1200x1500 | Every target by depth and side. QBs get every targeted pass, backs every carry by gap | | |
| D6 | Head to head | 1200x1500 and up | Two players at one position: D1's numbers and percentiles side by side, the better one bold | Opponent | Added Oct 21 |
| D7 | Where the points come from | 1600x900 | Each week's points split into yards, catches, touchdowns and turnovers, with the season's split | | Added Oct 21 |
| D8 | Player card, real stats | 1200x1500 and up | D1 with no fantasy points: the box score as tiles with ranks, real-life percentile rows (`NFL_TILES`, `NFL_PCT_LIST` in `src/player.js`, `NFL_PERCENTILES` in `pull.py`), and yards game by game | | Added Oct 28, no fantasy |
| D9 | Head to head, real stats | 1200x1500 and up | D6 with D8's numbers | Opponent | Added Oct 28, no fantasy |
| D10 | Game by game | 1600x900 | Yards every game (backs split rushing and receiving) with touchdowns, the opponent and the result, and the season line with ranks | | Added Oct 28, no fantasy |

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

### F. League and Explore (no argument)

None of these uses fantasy points. Each takes a timeframe: the season, the last 4, 3 or 2 weeks, or the newest week.

| Card | Name | Size | What it shows | Controls | Status |
|---|---|---|---|---|---|
| F1 | Passing network | 1600x900 | The Explore tab's network for one quarterback: each receiver by depth (height) and side, line width targets, colour EPA per target, with a table of every receiver | Quarterback, timeframe, situation, receivers | Added Oct 28 |
| F2 | Target analysis | 1200x1500 and up | The Explore tab's target analysis: each player's depth mix, or his air-yard curve, against the position average | Position, timeframe, min targets, sort, view, players | Added Oct 28 |
| F3 | League leaders | 1200x1500 | The top 10 to 20 in any box-score stat or rate, as a total or per game | Stat, position, timeframe, measure, players | Added Oct 28 |
| F4 | The race | 1600x900 | Season totals after every week for the leaders in a stat | Stat, position, players | Added Oct 28 |
| F5 | Team rankings | 1200x1500 | All 32 teams in one team stat, as bars in team colours | Stat, timeframe | Added Oct 28 |
| F6 | Team scatter plots | 1600x900 | Six team questions as logo scatters: passing vs running, pass vs run defense, PROE vs EPA, points for vs against, success vs explosive, pace vs pass rate | Chart, timeframe, highlight | Added Oct 28 |

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
  cleared for production; E1 uses the free numbers only.
- **Ranks and percentiles** come from the API (`ranks=` and `percentiles=` on `/stats/intelligence`), so
  they match the site. A quarterback's rushing yards per game has no registry metric; `build_data.py`
  derives it with the API's own rule (the qualified players at the position; rank = players strictly
  better + 1; percentile = mid-rank), which reproduces the API exactly on rushing yards (129 backs).
- **Timeframes** add weeks up where the numbers are sums (the network, target analysis, leaders and the race:
  `pull.py` asks the Explore endpoints one week at a time), and read a window the API computed where they are not
  (the scatters and team cards: one `/stats/intelligence` and `/teams/stats` request per window). A rate leader needs
  the NFL's kind of minimum, per team game in the window (6.25 carries, 5 targets, 14 attempts).
- **Cards marked No fantasy** carry no fantasy points, finishes or expected points anywhere on them.
- **Consensus ranks** for the coming week usually post Tuesday or Wednesday. Before that,
  B2 has no rank column.
- Fact-check any card that names a reason (C5's target and carry share lines) against
  the game logs before posting.

## How it is built

| File | Does |
|---|---|
| `refresh.sh` | The weekly rebuild: checks the backend is up, then runs the five steps below in order |
| `pull.py` | Calls the local API for the week's recaps, previews, team stats and breakdowns, every week's player board, Insight boards and the reply-card players, each timeframe window, and the Explore target boards and passing networks one week at a time. Writes `raw/*.json` |
| `build_data.py` | Trims `raw/` into `data.json`: risers and fallers, bye weeks, team cards, scatter pools, weekly finishes, and the images needed |
| `fetch_img.py` | Downloads headshots (220px WebP from the NFL CDN), both ESPN logo variants and the Inter and JetBrains Mono fonts |
| `build.py` | Inlines the brand mark (from `components/Brand.jsx`), the fonts, data, images and `src/` into `index.html` and `preview.html` |
| `src/core.js` | Frame, text, faces, logos, chips, grouped tiles, the shared scatter plot, team colours, formats |
| `src/recap.js`, `preview.js`, `weekly.js`, `player.js`, `team.js`, `explore.js` | One function per card, each returning an SVG string. `explore.js` also holds the timeframe windows and the network and target sums |
| `src/app.js` | The page: pickers, each card's controls (`GROUPS`), theme, Save PNG and Copy image, the lightbox, and the solo mode `render.mjs` uses (`?card=C8&theme=dark&opt.pos=RB&hl=...`) |
| `render.mjs` | Headless Chrome over its DevTools protocol: one PNG per card and theme, and warns about text outside the card |
| `check.mjs` | Runs every card against every game, player, team and option |

To add a card: write a `cardX(arg, opts)` function in the right `src/` file, add it to
`GROUPS` in `src/app.js` with an id, a one-line note and any `controls`, rebuild, and add a
row above. A chart with faces should draw through `scatterPlot` in `core.js` and take a
`highlight` control, so every chart lets you pick who gets a face the same way.
