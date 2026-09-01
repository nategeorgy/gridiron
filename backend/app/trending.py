"""Trending usage (M10) — who is gaining work, and who is losing it.

Every other board here ranks a season. This one ranks a **change**: the last few weeks
against the pace a player set before them. That is the question a fantasy manager
actually asks in October, and a season total is the one number that cannot answer it —
a back who has taken over a backfield since Week 12 looks average all year.

**A delta alone is a bad board, and it took real data to see why.** Ranked purely on the
snap-share swing, the top of the riser list was backup tight ends going from nothing to
garbage time: the largest *relative* moves in the league belong to players nobody can
start. Two rules fix it, and both are the point rather than a filter bolted on:

  * a riser must clear a **fantasy floor in the recent window** — he has to matter now;
  * the move must show up in **opportunity share**, not only snaps. Snaps go up when a
    game gets out of hand. Carries and targets go up when a coach changes his mind.

The falling side is the mirror, and needs the mirror of the floor: the player must have
**mattered before**. Otherwise "trending down" is a list of deep reserves whose usage
fell from almost nothing to nothing.

**QB is deliberately out of scope.** A starting quarterback plays every snap, so his
snap share is ~1.00 in both windows and his route participation is undefined; the
signal this module is built on does not exist for the position. A quarterback losing
his job is a depth-chart event, which the M6.2 chart already reports.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.aggregation import aggregate_select, finalize_row, games_expr, window_filters
from app.models import Player, PlayerStats
from app.scoring import ScoringConfig

DIRECTIONS = ("up", "down")

# The recent window. Three weeks is short enough to catch a change of role and long
# enough that one blowout does not define it.
DEFAULT_WINDOW = 3

# A player needs a real baseline to have moved away from, and more than one recent game
# to have moved at all.
MIN_PRIOR_GAMES = 4
MIN_RECENT_GAMES = 2

# The relevance floors, in the caller's own scoring. A riser has to be startable now; a
# faller has to have been startable before. These are PPG, not totals, so a player who
# missed time is judged on the games he played.
RISER_MIN_RECENT_PPG = 9.0
FALLER_MIN_PRIOR_PPG = 10.0

# Opportunity share is weighted double against snap share when ranking. Snaps are
# availability; carries and targets are intent, and intent is what carries forward.
OPPORTUNITY_WEIGHT = 2.0

# The usage measures that move together when a role changes. All four are returned so a
# surface can pick the one that reads for the position (opportunity share for a back,
# route participation for a receiver) without a second request.
USAGE_METRICS = ("snap_share", "route_participation", "opportunity_share", "target_share")

POSITIONS = ("RB", "WR", "TE")


def _window_rows(
    db: Session,
    season: int,
    season_type: str,
    week_from: int,
    week_to: int,
    config: ScoringConfig,
) -> dict[str, dict]:
    """Aggregate one week range into a row per player, in the caller's scoring.

    Goes through the same engine as every other board, so a TE-premium league sees a
    tight end's rise in TE-premium points rather than somebody else's PPR.
    """
    games = games_expr()
    filters = window_filters(
        season, season_type, positions=POSITIONS, week_from=week_from, week_to=week_to
    )
    rows = db.execute(aggregate_select(filters, games)).mappings().all()
    return {row["player_id"]: finalize_row(dict(row), config) for row in rows}


def build_trending(
    db: Session,
    season: int,
    season_type: str,
    config: ScoringConfig,
    direction: str = "up",
    window: int = DEFAULT_WINDOW,
    position: str | None = None,
    limit: int = 6,
) -> dict:
    """Rank players by how much their usage has moved over the last ``window`` weeks.

    Returns the movers plus the context needed to caption them honestly: which weeks
    each side of the comparison covers, and what floors were applied.
    """
    bounds = db.execute(
        select(func.min(PlayerStats.week), func.max(PlayerStats.week)).where(
            PlayerStats.season == season, PlayerStats.season_type == season_type
        )
    ).one()
    first_week, last_week = bounds[0], bounds[1]

    context = {
        "season": season,
        "season_type": season_type,
        "direction": direction,
        "window": window,
        "recent_from": None, "recent_to": None,
        "prior_from": None, "prior_to": None,
        "min_recent_ppg": RISER_MIN_RECENT_PPG if direction == "up" else None,
        "min_prior_ppg": FALLER_MIN_PRIOR_PPG if direction == "down" else None,
    }
    if first_week is None or last_week is None:
        return {"data": [], "context": context}

    recent_from = max(first_week, last_week - window + 1)
    prior_to = recent_from - 1
    if prior_to < first_week:
        # Not enough season yet for a before-and-after to mean anything. An empty board
        # that says why beats a board comparing week 2 with week 1.
        context.update(recent_from=recent_from, recent_to=last_week)
        return {"data": [], "context": context}

    context.update(
        recent_from=recent_from, recent_to=last_week,
        prior_from=first_week, prior_to=prior_to,
    )

    recent = _window_rows(db, season, season_type, recent_from, last_week, config)
    prior = _window_rows(db, season, season_type, first_week, prior_to, config)

    rows = []
    for player_id, now in recent.items():
        was = prior.get(player_id)
        if was is None:
            continue
        if (was.get("games_played") or 0) < MIN_PRIOR_GAMES:
            continue
        if (now.get("games_played") or 0) < MIN_RECENT_GAMES:
            continue
        if position and now.get("position") != position:
            continue

        deltas, usage = {}, {}
        for metric in USAGE_METRICS:
            before, after = was.get(metric), now.get(metric)
            usage[metric] = {"prior": before, "recent": after}
            deltas[metric] = (
                None if before is None or after is None else round(after - before, 4)
            )

        snap_delta = deltas["snap_share"]
        opp_delta = deltas["opportunity_share"]
        if snap_delta is None or opp_delta is None:
            continue

        recent_ppg, prior_ppg = now.get("fantasy_ppg"), was.get("fantasy_ppg")
        if recent_ppg is None or prior_ppg is None:
            continue

        # The floors described at the top of this module.
        if direction == "up":
            if opp_delta <= 0 or recent_ppg < RISER_MIN_RECENT_PPG:
                continue
        else:
            if opp_delta >= 0 or snap_delta >= 0 or prior_ppg < FALLER_MIN_PRIOR_PPG:
                continue

        rows.append({
            "player_id": player_id,
            "name": now.get("name"),
            "position": now.get("position"),
            "team_abbreviation": now.get("team_abbreviation"),
            "recent_games": now.get("games_played"),
            "prior_games": was.get("games_played"),
            "fantasy_ppg": {"prior": prior_ppg, "recent": recent_ppg},
            "fantasy_ppg_delta": round(recent_ppg - prior_ppg, 2),
            "usage": usage,
            "usage_delta": deltas,
            "score": round(snap_delta + OPPORTUNITY_WEIGHT * opp_delta, 4),
        })

    rows.sort(key=lambda row: row["score"], reverse=(direction == "up"))
    top = rows[:limit]

    # Headshots for the handful that survived, rather than widening aggregate_select —
    # that select is on every board's hot path and none of the others want the column.
    if top:
        shots = dict(db.execute(
            select(Player.player_id, Player.headshot_url).where(
                Player.player_id.in_([row["player_id"] for row in top])
            )
        ).all())
        for row in top:
            row["headshot_url"] = shots.get(row["player_id"])

    return {"data": top, "context": context}
