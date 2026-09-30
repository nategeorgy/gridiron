# Team pages and team leaderboards (September 2026)

Teams was a single link to a one-table leaderboard, and the team page was a record, a
schedule and a depth chart. This rebuild makes both real surfaces. The layout was chosen
over three rounds of mockups built on real 2025 and 2026 data.

## What shipped

**Teams ▾** in the header: Team Leaderboards, Team Pages, and all 32 logos by division.

**Team Pages index** (`/teams`): every team by division in standing order, with record,
net EPA rank and next game.

**Team page** (`/teams/:teamId`), one long page. Season and weeks filters sit near the
top, and every number follows them except the record, the schedule and the depth chart.

| Section | What it shows |
| --- | --- |
| Header | Identity, staff line, next game with its line and implied total, and NET / OFF / DEF EPA per play as strips of all 32 teams |
| Season trend | Net, offense or defense EPA per play: each game as a connected line, the team's season to date, the league's season to date (dashed), and the league's middle half that week as a band. Defense is flipped so up is always better |
| Players | Everyone who played for the team in the window, by position, per game or totals |
| Team stats | Strips for efficiency, scoring and drives, passing and rushing, offense on the left and defense on the right, better to the right, rank on the badge |
| Rank table | Offense only: pace and tendencies, then personnel, play type and formation, with a rank and the league average |
| Passing by depth | A field, one band per depth, coloured by how often the team throws there against the league; EPA per attempt and its rank on the right |
| Running by direction | Seven lane columns sized by share of designed runs, coloured by EPA rank, with inside / off tackle / outside totals |
| Personnel | A formation card per grouping used on 3% of plays or more: usage and rank, EPA and rank, success |
| Depth chart | The listed chart drawn as a formation, snap share and fantasy points per game under each starter |
| Schedule | Fixtures with results or lines, and fantasy strength of schedule by position |
| Coaching staff | Head coach and coordinators by season |

Below the players the cards run in two columns. The wide cards open the left and the
chart panels the right, and the rest are split so both columns end together: every split
is scored with each card's measured height in that column, and the closest wins.

**Team Leaderboards** (`/teams/leaderboards/:tab`): Overview, Efficiency, Passing,
Rushing, Drives and situations, Pace and tendencies, Fantasy (Scored / Allowed) and
Personnel, plus Custom with Edit Columns. Sided tabs switch offense and defense. Every
stat has one home tab. The table is the player boards' table with the rank of 32 under
each value.

## Decisions

- **Sums stored, rates computed.** `team_game_stats` holds only sums per team, game and
  side, so any week window divides exactly, and a season rate is never the mean of game
  rates. Pass-depth and run-lane buckets are columns on the same row rather than their
  own tables: a team page reads a whole window in one query.
- **Side `d` is the opponent's plays against the team.** A defense has no numbers of its
  own, only what was done to it, so defense is the same sums read from the other side.
- **One rank colour everywhere.** The player boards' percentile colour, green toward 1st
  and red toward last. The API ranks 1 = best, or 1 = most for a tendency with no better
  direction, so the UI never needs to know which way a stat points. For tendencies green
  means "does this the most", which was flagged when the design was approved.
- **Offense only for tendencies, depth, lanes and personnel.** How a team lines up and
  where it throws is a question about the team with the ball.
- **Fantasy follows the request's scoring.** Points scored and allowed by position go
  through `points_expr`, like every other fantasy number.
- **The depth chart is current state.** `depth_chart_entries` holds today's listing
  only, so a past season shows today's chart with that season's numbers, and says so.
- **Staff is a hand-kept CSV.** The schedule feed's 2026 head coaches are wrong and no
  free feed names coordinators, so `pipeline/data/staff/team_staff.csv` is kept from
  Wikipedia's season pages.

## Coverage

| Data | From |
| --- | --- |
| EPA, success, drives, downs, depth and lanes (play-by-play) | 2009 |
| Snaps | 2013 |
| Coverage and personnel (participation) | 2016, one season behind |
| Personnel, season in progress (hand-supplied season totals, `team_personnel_season`) | 2026; full-season windows only |
| Play action, RPO, screens, motion, huddle, box counts, blitz (FTN charting) | 2022 |
| Staff | 2022 |

A stat outside its window shows a dash and says which season it starts in.

## Open

- The old `GET /teams/leaderboard` endpoint is no longer called by the frontend and can
  be removed.
