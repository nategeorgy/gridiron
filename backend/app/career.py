"""Career season-by-season rows with their position finishes (M13).

The player page opens with "what did every season of this career actually finish as",
which is a different question from anything the leaderboard answers. The leaderboard
ranks one season; this ranks *every* season the player played, and reports where he
landed among his own position in each — the WR7 / RB12 shorthand a fantasy manager
already thinks in.

**One pass, not one per season.** Ranking a season means aggregating the whole position
for it, and a long career is 20+ seasons. Doing that as N leaderboard queries would be
N full-table aggregations; instead a single query groups by ``(player_id, season)``
across every season the player appears in, and the ranking happens in Python over rows
already in memory.

**The ranks are scoring-aware**, computed through the same engine as every other fantasy
number here, so a superflex or TE-premium league re-ranks the career rather than showing
someone else's PPR finish.

**Two finishes, two pools.** Total points ranks everyone who played at all: a season cut
short still produced what it produced, and hiding it would misrepresent the career. Per
game ranks only players who cleared the qualification bar, because a two-game cameo at
28 PPG is not a season anybody finished — it is a sample. That is the same
``QUALIFY_FRACTION`` rule the Insight pools and the percentile pools use, so "qualified"
means one thing across the product.
"""

from __future__ import annotations

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.aggregation import (
    AVG_METRICS,
    POSITIONS,
    SUM_METRICS,
    avg_expr,
    finalize_row,
    games_expr,
)
from app.metrics import REGISTRY_BY_ID
from app.models import Player, PlayerStats, Team
from app.models.plays import PlayTarget
from app.percentiles import PercentileIndex, qualify_games
from app.scoring import ScoringConfig

from sqlalchemy.dialects.postgresql import aggregate_order_by


def _career_select(position: str, seasons: list[int], season_type: str) -> Select:
    """One aggregated row per (player, season) for everyone at ``position``.

    Mirrors ``aggregate_select`` but groups by season as well as player, so a single
    execution covers the whole career. The team is taken from the player's latest game
    *in that season* — the same rule a season row follows everywhere else, and the
    reason a mid-season trade shows the club he finished with rather than the club that
    employs him today.
    """
    labeled = [func.sum(getattr(PlayerStats, name)).label(name) for name in SUM_METRICS]
    labeled += [avg_expr(name).label(name) for name in AVG_METRICS]

    latest_team = func.array_agg(
        aggregate_order_by(Team.abbreviation, PlayerStats.week.desc())
    )[1].label("team_abbreviation")

    return (
        select(
            PlayerStats.season.label("season"),
            Player.player_id,
            Player.name.label("name"),
            Player.position.label("position"),
            latest_team,
            func.count(func.distinct(PlayerStats.team_id)).label("teams_played_for"),
            games_expr().label("games_played"),
            *labeled,
        )
        .join(Player, PlayerStats.player_id == Player.player_id)
        .outerjoin(Team, PlayerStats.team_id == Team.team_id)
        .where(
            PlayerStats.season.in_(seasons),
            PlayerStats.season_type == season_type,
            Player.position == position,
        )
        .group_by(PlayerStats.season, Player.player_id, Player.name, Player.position)
    )


def _dense_rank(rows: list[dict], metric: str) -> dict[str, int]:
    """Rank ``rows`` by ``metric``, best first. Players with no value are unranked.

    Ties share a rank, and the next rank continues the count rather than skipping — two
    players tied for WR3 are both WR3 and the next is WR5, which is how a finish is
    quoted.
    """
    ranked = sorted(
        (row for row in rows if row.get(metric) is not None),
        key=lambda row: row[metric],
        reverse=True,
    )
    result: dict[str, int] = {}
    previous: float | None = None
    rank = 0
    for index, row in enumerate(ranked, start=1):
        value = row[metric]
        if value != previous:
            rank = index
            previous = value
        result[row["player_id"]] = rank
    return result


def _better_first(rows: list[dict], metric: str) -> list[float]:
    """The qualified values of ``metric``, best first, direction-corrected."""
    definition = REGISTRY_BY_ID.get(metric)
    higher = definition.higher_is_better if definition is not None else True
    values = [row[metric] for row in rows if row.get(metric) is not None]
    return sorted(values, reverse=higher)


def _pooled(rows: list[dict], metric: str) -> float | None:
    """The position's rate over a pool of season rows, aggregated first: Σ/Σ.

    ``fantasy_ppg`` is every point over every game; a ``derived`` rate is its base over
    its denominator; a weighted average weights each player's rate by his own weight
    column (exact, since rate x weight recovers the total); a flat average weights by
    games. Never the mean of the players' rates, which would let a three-game season
    count as much as a seventeen-game one.
    """
    definition = REGISTRY_BY_ID.get(metric)
    if metric == "fantasy_ppg":
        games = sum(row.get("games_played") or 0 for row in rows)
        return sum(row.get("fantasy_points") or 0 for row in rows) / games if games else None
    if definition is None:
        return None
    if definition.aggregation == "derived" and definition.base:
        denominators = definition.per or ("games_played",)
        numerator = sum(row.get(definition.base) or 0 for row in rows)
        denominator = sum(sum(row.get(name) or 0 for name in denominators) for row in rows)
        return numerator / denominator if denominator else None
    weight_name = definition.weight_by or "games_played"
    pairs = [(row[metric], row.get(weight_name) or 0) for row in rows if row.get(metric) is not None]
    weight = sum(w for _, w in pairs)
    return sum(v * w for v, w in pairs) / weight if weight else None


def _passer_adot(db: Session, seasons: list[int], season_type: str) -> dict[int, float]:
    """Every quarterback's depth of target per season, from every charted throw."""
    rows = db.execute(
        select(PlayTarget.season, func.sum(PlayTarget.air_yards), func.count(PlayTarget.air_yards))
        .join(Player, PlayTarget.passer_id == Player.player_id)
        .where(PlayTarget.season.in_(seasons), PlayTarget.season_type == season_type, Player.position == "QB")
        .group_by(PlayTarget.season)
    ).all()
    return {season: float(total) / count for season, total, count in rows if count}


def career_seasons(
    db: Session,
    player_id: str,
    position: str,
    config: ScoringConfig,
    season_type: str = "REG",
    percentile_ids: tuple[str, ...] = (),
    line_ids: tuple[str, ...] = (),
    line_rank: int | None = None,
) -> list[dict]:
    """Every season this player played, with his finish among his position in each.

    Returns newest first. Each row is a full aggregated season — the same shape the
    leaderboard returns — plus the two finishes and the size of the pool each was
    measured against, so a surface can say how many players the rank is out of.

    ``percentile_ids`` adds each season's percentile among the qualified players at his
    position (the career profile and this-season-against-last). ``line_ids`` adds, per
    season, the position's pooled rate for each stat and the value of the
    ``line_rank``-th best qualified season (the dashed lines on the game charts: WR24,
    the average back). Both come from the rows this function already aggregates for
    the finishes, so they cost no further pass over the table. ``pass_adot`` is the one
    line read elsewhere: a quarterback's depth of target comes from every charted throw.
    """
    if position not in POSITIONS:
        return []

    seasons = [
        row[0]
        for row in db.execute(
            select(PlayerStats.season)
            .where(
                PlayerStats.player_id == player_id,
                PlayerStats.season_type == season_type,
            )
            .group_by(PlayerStats.season)
            .order_by(PlayerStats.season.desc())
        ).all()
    ]
    if not seasons:
        return []

    # Weeks per season, for the per-game qualification bar. A season still in progress
    # has fewer weeks and therefore a lower bar, which is the intent: the threshold is
    # a fraction of what has been played, not of a full schedule.
    weeks_by_season = dict(
        db.execute(
            select(PlayerStats.season, func.count(func.distinct(PlayerStats.week)))
            .where(
                PlayerStats.season.in_(seasons),
                PlayerStats.season_type == season_type,
            )
            .group_by(PlayerStats.season)
        ).all()
    )

    by_season: dict[int, list[dict]] = {season: [] for season in seasons}
    for record in db.execute(_career_select(position, seasons, season_type)).mappings().all():
        row = finalize_row(dict(record), config)
        by_season[row["season"]].append(row)

    out: list[dict] = []
    for season in seasons:
        rows = by_season.get(season) or []
        min_games = qualify_games(weeks_by_season.get(season, 0))
        qualified = [row for row in rows if (row.get("games_played") or 0) >= min_games]

        total_ranks = _dense_rank(rows, "fantasy_points")
        ppg_ranks = _dense_rank(qualified, "fantasy_ppg")

        mine = next((row for row in rows if row["player_id"] == player_id), None)
        if mine is None:
            continue
        mine["position_rank"] = total_ranks.get(player_id)
        mine["position_rank_ppg"] = ppg_ranks.get(player_id)
        mine["pool_size"] = len(rows)
        mine["ppg_pool_size"] = len(qualified)
        mine["ppg_qualified"] = player_id in ppg_ranks
        mine["min_games"] = min_games
        if percentile_ids:
            index = PercentileIndex(rows, percentile_ids, min_games)
            mine["percentiles"] = index.for_row(mine)
            mine["ranks"] = index.ranks_for_row(mine, percentile_ids)
        if line_ids:
            lines = {}
            for metric in line_ids:
                if metric == "pass_adot":
                    continue
                best = _better_first(qualified, metric)
                lines[metric] = {
                    "avg": _pooled(qualified, metric),
                    "rank": best[line_rank - 1] if line_rank and len(best) >= line_rank else None,
                }
            mine["lines"] = lines
        out.append(mine)

    if "pass_adot" in line_ids and out:
        adot = _passer_adot(db, [row["season"] for row in out], season_type)
        for row in out:
            row["lines"]["pass_adot"] = {"avg": adot.get(row["season"]), "rank": None}
    return out
