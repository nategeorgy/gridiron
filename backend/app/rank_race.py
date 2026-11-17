"""The rank race: where a position's leaders ranked in season points after every week.

The home page's Rank Race card (November 2026, replacing Floor and Ceiling) and the tweet
kit's rank race card draw a bump chart: the position's top ``limit`` by season points, and
each one's rank after Week 1, after Week 2, and so on.

**A rank after week N counts everyone at the position who has played by then**, not only
the players shown. Ranking the leaders among themselves would put a receiver who was WR40
in Week 3 at "12th" because only twelve lines are drawn. A player who has not played yet
has no rank that week (``None``), and a week he sits out keeps his total and lets others
pass him, which is the point of the chart.

Ties share a rank (competition ranking: two players level at 4th are both 4th and the next
is 6th). Points are the Query Builder's scoring (``app/query_builder.py``), so every number
is in the request's scoring and agrees with the weekly finishes and the game log. Like
``app/weekly_finishes.py`` it reads the in-memory frame, so a request costs no reads of
``player_stats``.
"""

from __future__ import annotations

import numpy as np
from sqlalchemy.orm import Session

from app.query_builder import POSITIONS, get_frame, get_scored
from app.scoring import ScoringConfig


def build_rank_race(
    db: Session,
    config: ScoringConfig,
    season: int,
    position: str,
    season_type: str = "REG",
    limit: int = 12,
) -> dict:
    """The top ``limit`` at ``position`` by season points, with their rank after every week."""
    frame = get_frame(db)
    scored = get_scored(db, config)
    mask = (frame.season == season) & (frame.position == POSITIONS.index(position)) & (frame.post == (season_type == "POST"))
    rows = np.flatnonzero(mask)
    if not len(rows):
        return {"data": [], "weeks": [], "season": season, "season_type": season_type, "position": position}

    weeks = sorted({int(w) for w in frame.week[rows]})
    people = sorted({int(p) for p in frame.player[rows]})
    index = {person: i for i, person in enumerate(people)}
    column = {week: j for j, week in enumerate(weeks)}

    # Points each week (0 where he did not play), then the running total.
    points = np.zeros((len(people), len(weeks)))
    played = np.zeros((len(people), len(weeks)), dtype=bool)
    team: dict[int, tuple[int, int]] = {}  # player -> (latest week, team that week)
    for row in rows:
        person, week = int(frame.player[row]), int(frame.week[row])
        i, j = index[person], column[week]
        points[i, j] += float(scored.points[row])
        played[i, j] = True
        if week >= team.get(person, (0, 0))[0]:
            team[person] = (week, int(frame.team[row]))
    total = np.cumsum(points, axis=1)
    started = np.cumsum(played, axis=1) > 0

    # Competition rank among everyone who has played by that week.
    ranks = np.full((len(people), len(weeks)), -1, dtype=int)
    for j in range(len(weeks)):
        who = np.flatnonzero(started[:, j])
        values = total[who, j]
        ascending = np.sort(values)
        ahead = len(ascending) - np.searchsorted(ascending, values, side="right")  # strictly ahead
        ranks[who, j] = ahead + 1

    leaders = sorted(range(len(people)), key=lambda i: (-total[i, -1], frame.people[people[i]]["name"]))[:limit]
    out = []
    for i in leaders:
        person = frame.people[people[i]]
        out.append({
            "player_id": person["player_id"],
            "name": person["name"],
            "position": person["position"],
            "headshot_url": person["headshot_url"],
            "team": frame.teams.get(team[people[i]][1]),
            "games": int(played[i].sum()),
            "fantasy_points": round(float(total[i, -1]), 2),
            "ranks": [int(r) if r > 0 else None for r in ranks[i]],
            "totals": [round(float(v), 2) if started[i, j] else None for j, v in enumerate(total[i])],
            "played": [bool(p) for p in played[i]],
        })
    return {"data": out, "weeks": weeks, "season": season, "season_type": season_type, "position": position,
            "pool": int(started[:, -1].sum())}
