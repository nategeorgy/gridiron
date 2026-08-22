"""The Draft Value Board (M6.1) — the market's ranking against our own valuation.

Every other board here answers "what happened". This one answers "where is the
consensus wrong", and it does that by putting two orderings of the same players side
by side:

**The market** — FantasyPros expert consensus rank (`player_rankings`). Note what this
is not: the feed publishes *rankings*, never projections. A projection is stat
components the M1 engine could rescore into any league; a rank is an opinion already
frozen in someone else's scoring, so it is shown as the market's number and never
recomputed into the user's league. What *is* league-aware is the choice of variant — a
superflex league gets the superflex consensus board without being asked.

**Us** — expected VORP per game, in the user's scoring and league size. Expected rather
than actual on purpose: actual VORP ranks last season's *results*, so a twelve-touchdown
fluke rides straight into the gap and the board ends up recommending variance. Expected
VORP ranks the opportunity that produced them, which is the thing that tends to repeat.

**The gap** is `market_rank - value_rank`, so a positive gap means we rate a player
higher than the consensus does. **Both ranks are dense orderings over exactly the same
players** — the ones inside draftable depth that we can actually value. That equality is
not a detail; getting it wrong is the one way this board lies. Ranking the market over
434 names while ranking ourselves over the 319 who played last season compresses every
value rank upward, so the tail of the consensus board shows enormous fake "value" (in a
first build of this: Zach Ertz at consensus 384 and 83rd by us, a +301 gap that is
purely an artefact of the two populations being different sizes).

The raw `ecr` travels alongside, so the consensus's own published number is never
hidden behind our re-ranking of it.

**The board stops at draftable depth.** Beyond roughly `teams x starters x 2` picks the
consensus is not really an opinion — it is a list of camp bodies — while our valuation
is still reading last season's box scores, and the disagreement between those two is
noise dressed as signal. Coverage measured on the 2026 board: 93% of the consensus top
150 can be valued, against ~60% past pick 200.

**Players with no NFL history keep their place and get no gap.** A rookie ranked 18th
has no expected VORP and never will until they play, so both rank columns are empty and
they sit at their consensus position with a tag. Imputing them to replacement level
would manufacture a large "the market overvalues this rookie" claim on every single
rookie, from data we do not have.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.intelligence import Window, build_intelligence
from app.league import LeagueConfig
from app.models import Player, PlayerRanking, Team
from app.scoring import ScoringConfig
from app.sos import team_summary
from app.utils.dates import age_in_years

DEFAULT_SOURCE = "fantasypros"
REDRAFT_STANDARD = "redraft-overall"
REDRAFT_SUPERFLEX = "redraft-op"

# Why a player has no value rank. Surfaced so the UI can say which, rather than
# rendering the same empty cell for two quite different situations.
NO_HISTORY = "no_history"
SMALL_SAMPLE = "small_sample"

# A redraft roster is roughly the starting lineup again over on the bench, and kickers
# and defenses (two of those bench spots) are outside our scope — so this lands close
# to the number of skill players a league actually drafts. 12-team standard: 8 starters
# -> 192. It moves with the league rather than being a fixed 200, because a superflex
# 10-teamer drafts a different pool.
DRAFTABLE_MULTIPLIER = 2


def draftable_depth(league: LeagueConfig) -> int:
    """How deep a board this league actually drafts."""
    starters = league.qb + league.rb + league.wr + league.te + league.flex + league.superflex
    return league.teams * starters * DRAFTABLE_MULTIPLIER


def default_ranking_type(league: LeagueConfig) -> str:
    """The consensus variant matching this league.

    The league config already knows whether a second quarterback starts, so a
    superflex league gets the superflex board without a second question being asked.
    """
    return REDRAFT_SUPERFLEX if league.superflex else REDRAFT_STANDARD


def latest_ranking(
    db: Session, source: str, ranking_type: str
) -> tuple[int, date] | None:
    """The newest ``(season, scraped_at)`` held for a variant, or None if we hold none.

    The upstream file is overwritten in place, so "latest" is whatever our most recent
    ingest captured — see the note on `scraped_at` in the model.
    """
    row = db.execute(
        select(PlayerRanking.season, func.max(PlayerRanking.scraped_at).label("scraped_at"))
        .where(PlayerRanking.source == source, PlayerRanking.ranking_type == ranking_type)
        .group_by(PlayerRanking.season)
        .order_by(PlayerRanking.season.desc())
        .limit(1)
    ).first()
    return (row.season, row.scraped_at) if row else None


def fetch_rankings(
    db: Session, source: str, ranking_type: str, season: int, scraped_at: date
) -> list[dict]:
    """One snapshot of a ranking variant, with each player's current identity.

    Identity is joined here rather than taken from the stat rows because a ranked
    rookie has no stat row at all, and a board that silently dropped them would be
    missing the first round.
    """
    rows = db.execute(
        select(
            PlayerRanking.player_id,
            PlayerRanking.ecr,
            PlayerRanking.sd,
            PlayerRanking.best,
            PlayerRanking.worst,
            PlayerRanking.rank_delta,
            PlayerRanking.player_owned_avg,
            Player.name,
            Player.position,
            Player.birth_date,
            Player.headshot_url,
            Player.years_of_experience,
            Player.team_id,
            Team.abbreviation.label("team_abbreviation"),
        )
        .join(Player, PlayerRanking.player_id == Player.player_id)
        .outerjoin(Team, Player.team_id == Team.team_id)
        .where(
            PlayerRanking.source == source,
            PlayerRanking.ranking_type == ranking_type,
            PlayerRanking.season == season,
            PlayerRanking.scraped_at == scraped_at,
            PlayerRanking.ecr.is_not(None),
        )
        .order_by(PlayerRanking.ecr)
    ).mappings().all()
    return [dict(row) for row in rows]


def build_draft_board(
    db: Session,
    window: Window,
    config: ScoringConfig,
    league: LeagueConfig,
    ranking_type: str,
    source: str = DEFAULT_SOURCE,
    min_games: int | None = None,
    position: str | None = None,
    depth: int | None = None,
) -> tuple[list[dict], dict]:
    """Join a consensus snapshot to our valuation. Returns ``(rows, context)``.

    ``window`` is the *valuation* season — the last one actually played — while the
    rankings are for the season about to start. Those are different years for most of
    the calendar, and conflating them is the easiest mistake to make here.

    ``depth`` caps the board at the picks a league actually makes; pass 0 for the whole
    consensus list.
    """
    latest = latest_ranking(db, source, ranking_type)
    if latest is None:
        return [], {
            "ranking_type": ranking_type, "source": source,
            "ranking_season": None, "scraped_at": None, "ranked_players": 0,
        }
    ranking_season, scraped_at = latest
    rankings = fetch_rankings(db, source, ranking_type, ranking_season, scraped_at)

    cutoff = draftable_depth(league) if depth is None else depth
    if cutoff:
        rankings = rankings[:cutoff]

    # Our valuation of everyone who played. Positions are never filtered here: the
    # pools that produce expected VORP have to be whole, exactly as on the Insight
    # boards, or a percentile silently changes meaning.
    stat_rows, context = build_intelligence(db, window, config, league, min_games=min_games)
    valuation = {record["player_id"]: record for record in stat_rows}

    # Strength of schedule for the season being drafted, in the same scoring (M6.3).
    # A draft board is where a schedule tiebreaker is actually acted on, so the number
    # belongs here rather than only on its own page.
    sos, _ = team_summary(db, ranking_season, config, ("full",))

    rows: list[dict] = []
    for consensus_rank, ranking in enumerate(rankings, start=1):
        record = valuation.get(ranking["player_id"])
        qualified = bool(record and record.get("qualified"))
        if record is None:
            missing_reason = NO_HISTORY
        elif not qualified:
            missing_reason = SMALL_SAMPLE
        else:
            missing_reason = None

        rows.append({
            "player_id": ranking["player_id"],
            "name": ranking["name"],
            "position": ranking["position"],
            "team_abbreviation": ranking["team_abbreviation"],
            "headshot_url": ranking["headshot_url"],
            "age": age_in_years(ranking["birth_date"]),
            "years_of_experience": ranking["years_of_experience"],
            # Their team's schedule difficulty at their position, 0-100, higher is
            # harder. None for a free agent, who has no schedule to be graded on.
            "sos": (
                sos.get(ranking["team_id"], {}).get(ranking["position"], {}).get("full", {}).get("difficulty")
                if ranking["team_id"] else None
            ),
            # The market. `consensus_rank` is their place on the published board;
            # `market_rank` (below) is their place among the players we can compare.
            "consensus_rank": consensus_rank,
            "market_rank": None,
            "ecr": ranking["ecr"],
            "ecr_sd": ranking["sd"],
            "ecr_best": ranking["best"],
            "ecr_worst": ranking["worst"],
            "ecr_delta": ranking["rank_delta"],
            "player_owned_avg": ranking["player_owned_avg"],
            # Us — filled in below for players we can value
            "value_rank": None,
            "gap": None,
            "missing_reason": missing_reason,
            "expected_vorp_ppg": record.get("expected_vorp_ppg") if record else None,
            "expected_vorp": record.get("expected_vorp") if record else None,
            "vorp": record.get("vorp") if record else None,
            "expected_fantasy_ppg": record.get("expected_fantasy_ppg") if record else None,
            "fantasy_ppg": record.get("fantasy_ppg") if record else None,
            "games_played": record.get("games_played") if record else None,
            # The gap's usual explanations, so the board can show its working.
            "fantasy_points_over_expected": (
                record.get("fantasy_points_over_expected") if record else None
            ),
            "tds_over_expected": record.get("tds_over_expected") if record else None,
            "fantasy_opportunity_rating": (
                record.get("fantasy_opportunity_rating") if record else None
            ),
        })

    # Both ranks are assigned over the same population — the players we can value —
    # so the gap between them counts positions, not populations. Doing this over two
    # differently-sized sets is the mistake described at the top of this module.
    rankable = [
        row for row in rows
        if row["missing_reason"] is None and row["expected_vorp_ppg"] is not None
    ]
    for market_rank, row in enumerate(
        sorted(rankable, key=lambda row: row["ecr"]), start=1
    ):
        row["market_rank"] = market_rank
    for value_rank, row in enumerate(
        sorted(rankable, key=lambda row: row["expected_vorp_ppg"], reverse=True), start=1
    ):
        row["value_rank"] = value_rank
        row["gap"] = row["market_rank"] - value_rank

    if position:
        wanted = position.upper()
        rows = [row for row in rows if row["position"] == wanted]

    return rows, {
        **context,
        "ranking_type": ranking_type,
        "source": source,
        "ranking_season": ranking_season,
        "scraped_at": scraped_at.isoformat(),
        "ranked_players": len(rankings),
        "valued_players": len(rankable),
        "depth": cutoff,
    }
