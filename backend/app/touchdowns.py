"""Every offensive touchdown in a window, from the spot the play started (November 2026).

The Highlighted Viz option "Every Touchdown" and the tweet kit's touchdown cards draw each
touchdown as an arc from its starting yard line into the end zone, so this returns one row
per touchdown play: how far out it started, whether it was a pass or a run, who threw it and
who scored, and for a pass how far the ball travelled in the air (from ``play_targets``).

It reads ``game_plays``, so it starts where the game pages do (``FIRST_GAME_PAGE_SEASON``).
Only offensive touchdowns are returned: a return or a fumble recovered for a score has no
starting spot the offense chose, and no fantasy owner's receiver scored it.

A run's gap (left end, up the middle, ...) is read from play-by-play's own text, which is
the only place it is stored per play; ``player_run_lanes`` holds it summed by game.
"""

from __future__ import annotations

import re

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import Game, GamePlay, Player, PlayTarget, Team

GAP = re.compile(r"\b(left end|left tackle|left guard|up the middle|right guard|right tackle|right end|scrambles)\b")


def touchdown_list(
    db: Session,
    season: int,
    season_type: str = "REG",
    weeks: tuple[int, ...] | None = None,
    team_id: int | None = None,
    game_id: str | None = None,
) -> dict:
    """The offensive touchdowns in a season (or some weeks of it, one team's, or one game's)."""
    abbr = {team.team_id: team.abbreviation for team in db.scalars(select(Team))}
    query = (
        select(GamePlay, PlayTarget.air_yards, PlayTarget.yards_after_catch, PlayTarget.location,
               Game.home_team_id, Game.away_team_id)
        .join(Game, Game.game_id == GamePlay.game_id)
        .outerjoin(PlayTarget, (PlayTarget.game_id == GamePlay.game_id) & (PlayTarget.play_id == GamePlay.play_id))
        .where(GamePlay.season == season, GamePlay.season_type == season_type,
               or_(GamePlay.pass_touchdown.is_(True), GamePlay.rush_touchdown.is_(True)))
        .order_by(GamePlay.week, GamePlay.game_id, GamePlay.sequence)
    )
    if weeks:
        query = query.where(GamePlay.week.in_(weeks))
    if team_id is not None:
        query = query.where(GamePlay.team_id == team_id)
    if game_id:
        query = query.where(GamePlay.game_id == game_id)

    rows, ids = [], set()
    for play, air, yac, location, home_id, away_id in db.execute(query):
        is_pass = bool(play.pass_touchdown)
        scorer = play.receiver_id if is_pass else play.rusher_id
        passer = play.passer_id if is_pass else None
        ids.update(i for i in (scorer, passer) if i)
        gap = None if is_pass else (match.group(1) if (match := GAP.search(play.description or "")) else None)
        rows.append({
            "game_id": play.game_id, "play_id": play.play_id, "week": play.week,
            "quarter": play.quarter, "clock": play.clock,
            "team": abbr.get(play.team_id),
            "opponent": abbr.get(away_id if play.team_id == home_id else home_id),
            "home": play.team_id == home_id,
            "kind": "pass" if is_pass else "rush",
            "from": play.yardline_100, "yards": play.yards,
            "down": play.down, "distance": play.distance,
            "scorer_id": scorer, "passer_id": passer,
            "air_yards": air if is_pass else None, "yards_after_catch": yac if is_pass else None,
            "location": location if is_pass else None, "gap": gap,
        })

    people = {}
    if ids:
        for person in db.scalars(select(Player).where(Player.player_id.in_(ids))):
            people[person.player_id] = {"name": person.name, "position": person.position,
                                        "headshot_url": person.headshot_url}
    return {"data": rows, "players": people, "total": len(rows)}
