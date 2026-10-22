"""Weekly finishes: one position's top scorers, with where each finished every week.

"Top" is total points by default (``sort="total"``), or points per game.

``FLEX`` pools backs, receivers and tight ends, for the home page's Floor and Ceiling
card (October 2026), which reads each game's points from the same response. A finish
is still at the player's own position: "WR12 that week" means the same thing in the
pool as it does on the receivers' grid.

The home page's Weekly Finishes card (October 2026) draws a player-by-week grid: each
cell is the player's finish at his position that week, coloured by how deep a league
starts the position. The finish is the Query Builder's (``app/query_builder.py``), which
is the game log's ``RANK()`` reimplemented and pinned against it in
``tests/test_explore.py``, so a cell here, a row in the Query Builder and a line in the
player's game log are one number.

It reads the Query Builder's in-memory frame and its cached scoring, so a request costs
no reads of ``player_stats``. The only query is the season's schedule, for bye weeks.

**What is returned is ranks, not tiers.** Whether WR30 is a start depends on the
league's lineup, which the client owns (``startingDepth`` in FinishChip.jsx); the same
response serves every lineup.

**A bye is read from the schedule, not inferred from a missing line.** A week with no
stat line is a bye only if the team the player was on that week had no game, and still
to come if that game has no score yet; otherwise he did not play. The team for a week he missed is the one he played for most recently
before it (or, before his first game, the one he first played for), so a traded player's
byes follow him.
"""

from __future__ import annotations

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Game
from app.query_builder import POSITIONS, get_frame, get_scored
from app.scoring import ScoringConfig

# The positions a request may name, and what each pools.
POOLS = {**{position: (position,) for position in POSITIONS}, "FLEX": ("RB", "WR", "TE")}


def _team_weeks(
    db: Session, season: int, season_type: str,
) -> tuple[dict[int, set[int]], dict[int, set[int]], list[int]]:
    """Which weeks each team plays, which of those are still to be played, and every week."""
    rows = db.execute(
        select(Game.week, Game.home_team_id, Game.away_team_id, Game.home_score)
        .where(Game.season == season, Game.season_type == season_type)
    ).all()
    playing: dict[int, set[int]] = {}
    unplayed: dict[int, set[int]] = {}
    for row in rows:
        for team_id in (row.home_team_id, row.away_team_id):
            playing.setdefault(team_id, set()).add(row.week)
            if row.home_score is None:
                unplayed.setdefault(team_id, set()).add(row.week)
    return playing, unplayed, sorted({row.week for row in rows})


def build_weekly_finishes(
    db: Session,
    config: ScoringConfig,
    season: int,
    position: str,
    season_type: str = "REG",
    min_games: int = 1,
    limit: int = 30,
    sort: str = "total",
) -> dict:
    """The top ``limit`` players at ``position`` by total points (or points per game), week by week."""
    frame = get_frame(db)
    scored = get_scored(db, config)
    codes = [POSITIONS.index(member) for member in POOLS[position]]
    mask = (
        (frame.season == season)
        & np.isin(frame.position, codes)
        & (frame.post == (season_type == "POST"))
    )
    rows = np.flatnonzero(mask)
    playing, unplayed, schedule_weeks = _team_weeks(db, season, season_type)
    last_week = int(frame.week[rows].max()) if len(rows) else 0

    by_player: dict[int, list[int]] = {}
    for row in rows:
        by_player.setdefault(int(frame.player[row]), []).append(int(row))

    players = []
    for person, lines in by_player.items():
        if len(lines) < min_games:
            continue
        lines.sort(key=lambda row: frame.week[row])
        points = float(scored.points[lines].sum())
        finishes = {int(frame.week[row]): int(scored.finish[row]) for row in lines}
        week_points = {int(frame.week[row]): round(float(scored.points[row]), 2) for row in lines}
        teams = [(int(frame.week[row]), int(frame.team[row])) for row in lines]

        def team_for(week: int) -> int:
            earlier = [team for played, team in teams if played <= week]
            return earlier[-1] if earlier else teams[0][1]

        byes = [week for week in schedule_weeks
                if week not in finishes and week not in playing.get(team_for(week), set())]
        # Weeks his team has not played yet: Monday night's game on a Monday, and every
        # week after the last one with stats. Neither is a game he missed.
        upcoming = [week for week in schedule_weeks
                    if week not in finishes and week in unplayed.get(team_for(week), set())]
        person_row = frame.people[person]
        players.append({
            "player_id": person_row["player_id"],
            "name": person_row["name"],
            "position": person_row["position"],
            "headshot_url": person_row["headshot_url"],
            "team": frame.teams.get(teams[-1][1]),
            "games": len(lines),
            "fantasy_points": round(points, 2),
            "fantasy_ppg": round(points / len(lines), 2),
            "finishes": {str(week): rank for week, rank in finishes.items()},
            "points": {str(week): value for week, value in week_points.items()},
            "byes": byes,
            "upcoming": upcoming,
        })

    first, second = ("fantasy_points", "fantasy_ppg") if sort == "total" else ("fantasy_ppg", "fantasy_points")
    players.sort(key=lambda player: (-player[first], -player[second], player["name"]))
    return {
        "data": players[:limit],
        "total": len(players),
        "season": season,
        "season_type": season_type,
        "position": position,
        "min_games": min_games,
        "sort": sort,
        "weeks": schedule_weeks,
        "last_week": last_week,
    }
