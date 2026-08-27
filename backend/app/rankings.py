"""Ranking boards (M9) — the source registry, the blend, and one board's rows.

This module answers "which board, and what is on it". The Draft Value Board (M6.1,
`app/draft_board.py`) answers a different question — where one board and our valuation
disagree — and is deliberately left alone.

**The registry is fail-closed, and that is the security property of this file.** We
hold FantasyPros ECR plus a handful of expert boards dropped in as CSVs, several of
them paywalled. Only sources listed as ``public`` here can be named in a request or
returned by name; everything else is private and can leave the server *only* as one
un-named input to a blended average. A new CSV dropped into the pipeline with a source
id nobody registered is therefore invisible by default, rather than exposed by default
— which is the right way round for this to fail.

**Blending ranks needs care**, and the trap is the same one M6.1 fell into: a rank
comparison must count the same players on both sides. Two boards of different depths,
averaged naively, weight the deeper one twice. So every source is densely re-ranked
over the players *it* lists before anything is averaged, and a player absent from a
board that covers their position is imputed at that board's depth rather than skipped.
See ``build_blend`` for the full rules.

See docs/design/M9-draft.md §4.1–4.2.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from statistics import pstdev
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.intelligence import Window, build_intelligence
from app.league import LeagueConfig
from app.models import Game, Player, PlayerRanking, RankingBoard, RankingBoardEntry, Team
from app.scoring import ScoringConfig
from app.sos import team_summary
from app.utils.dates import age_in_years

# Positions the whole product covers.
SCOPE_POSITIONS: tuple[str, ...] = ("QB", "RB", "WR", "TE")

# Last season's box score, carried on every board row. These are already computed by
# the season aggregate the valuation columns are built from — they were simply not
# being passed through. The draft room shows them because "what did he actually do
# last year" is the question a ranking provokes, and there is no projection to answer
# it with: nflverse publishes ranks, never projected points (see M9 §3).
BOX_SCORE_COLUMNS: tuple[str, ...] = (
    "passing_yards",
    "passing_tds",
    "rushing_yards",
    "rushing_tds",
    "receptions",
    "receiving_yards",
    "receiving_tds",
)

# Prefix that marks a user's own board in the `source` parameter, e.g.
# `board:9f3c…`. Namespaced rather than bare so a user board id can never collide
# with — or be mistaken for — a global source id.
USER_BOARD_PREFIX = "board:"

BLEND_ID = "consensus"


@dataclass(frozen=True)
class Source:
    """A global ranking source the API may name.

    ``public`` is the whole point of this dataclass. A source that is not public is
    never listed, never selectable, and never returned with its rows attributable to
    it — it exists only inside :func:`build_blend`.
    """

    id: str
    label: str
    public: bool
    blend: bool = False
    # Shown wherever this board is displayed on its own. The M6 rule: ECR is
    # FantasyPros' work and is labelled as such.
    attribution: str | None = None
    description: str | None = None


# The only sources that may be named in a request. Order is display order.
GLOBAL_SOURCES: dict[str, Source] = {
    BLEND_ID: Source(
        id=BLEND_ID,
        label="GridironIQ Consensus",
        public=True,
        blend=True,
        description=(
            "Every expert board we hold, averaged. Each board is re-ranked over the "
            "players it lists before averaging, so a deep board does not count twice."
        ),
    ),
    "fantasypros": Source(
        id="fantasypros",
        label="FantasyPros ECR",
        public=True,
        attribution="Expert consensus rankings by FantasyPros.",
        description="The published expert consensus rank, with its dispersion.",
    ),
}


def public_source(source_id: str) -> Source | None:
    """The registered source for an id, or None if it is private or unknown.

    Private and unknown collapse to the same answer on purpose: a caller probing for
    source names learns nothing about which private boards exist.
    """
    source = GLOBAL_SOURCES.get(source_id)
    return source if source and source.public else None


# --- Ranking variants ---------------------------------------------------------------
# Which board a league should see, and how that changes once the season starts.

DRAFT_STANDARD = "redraft-overall"
DRAFT_SUPERFLEX = "redraft-op"

# The only overall weekly board still published. `weekly-offense` existed once and was
# **discontinued in October 2020** — measured in the ECR archive, which carries 7,148
# rows of it ending 2020-10-12 against 43,907 rows of `weekly-op` running to the end of
# last season. So a one-quarterback league gets an overall board shaped for superflex
# in-season, which is why the position filter switches to the positional boards below:
# ranking receivers against receivers is what a weekly board is for anyway.
WEEKLY_OVERALL = "weekly-op"

DRAFT_WEEK = 0


def default_ranking_type(
    league: LeagueConfig, week: int, position: str | None = None
) -> str:
    """The variant matching this league, in the right context for the week.

    Three switches in one:

    * **Week 0 means the preseason draft boards**, any later week means that week's.
    * **A superflex league gets a superflex draft board** without being asked — the
      league config already knows whether a second quarterback starts.
    * **In-season, a position filter selects that position's weekly board** rather than
      filtering the overall one. Drafting is the opposite: filtering the overall board
      to running backs preserves the overall ordering, which is the thing being drafted.
      Weekly, there is no non-superflex overall board at all, and "who are my best
      receivers this week" is the actual question.

    There is no rest-of-season variant because no free source publishes one (M9 §3).
    """
    if week == DRAFT_WEEK:
        return DRAFT_SUPERFLEX if league.superflex else DRAFT_STANDARD
    if position and position.upper() in SCOPE_POSITIONS:
        return f"weekly-{position.lower()}"
    return WEEKLY_OVERALL


def latest_context(db: Session, league: LeagueConfig) -> tuple[int, int, str]:
    """The newest ``(season, week, ranking_type)`` we actually hold for this league.

    Data-driven rather than calendar-driven: the page turns into a weekly board the
    moment `ingest_rankings.py` starts writing weekly rows, and falls back to the
    draft board when it has not. Nothing here needs editing in September.
    """
    season = db.scalar(select(func.max(PlayerRanking.season)))
    if season is None:
        return (0, DRAFT_WEEK, default_ranking_type(league, DRAFT_WEEK))

    weekly_type = WEEKLY_OVERALL
    week = db.scalar(
        select(func.max(PlayerRanking.week)).where(
            PlayerRanking.season == season, PlayerRanking.ranking_type == weekly_type
        )
    )
    if week:
        return (season, week, weekly_type)
    return (season, DRAFT_WEEK, default_ranking_type(league, DRAFT_WEEK))


# --- Reading one source -------------------------------------------------------------


def held_sources(db: Session, ranking_type: str, season: int, week: int) -> dict[str, date]:
    """Every source holding rows for this context, mapped to its newest scrape date.

    Includes private sources — this is the blend's input list, not a public listing.
    """
    rows = db.execute(
        select(PlayerRanking.source, func.max(PlayerRanking.scraped_at))
        .where(
            PlayerRanking.ranking_type == ranking_type,
            PlayerRanking.season == season,
            PlayerRanking.week == week,
            PlayerRanking.ecr.is_not(None),
        )
        .group_by(PlayerRanking.source)
    ).all()
    return {source: scraped_at for source, scraped_at in rows}


def source_rows(
    db: Session, source: str, ranking_type: str, season: int, week: int, scraped_at: date
) -> list[dict]:
    """One source's snapshot, in its own rank order, with each player's position.

    Position travels with the row because the blend needs to know which positions a
    board actually covers — imputing a receiver into a running-back-only board would
    invent a ranking nobody published.
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
            Player.position,
        )
        .join(Player, PlayerRanking.player_id == Player.player_id)
        .where(
            PlayerRanking.source == source,
            PlayerRanking.ranking_type == ranking_type,
            PlayerRanking.season == season,
            PlayerRanking.week == week,
            PlayerRanking.ecr.is_not(None),
            Player.position.in_(SCOPE_POSITIONS),
        )
        .order_by(PlayerRanking.ecr)
    ).mappings().all()
    return [{**row, "rank": index} for index, row in enumerate(rows, start=1)]


# --- The blend ----------------------------------------------------------------------


def build_blend(db: Session, ranking_type: str, season: int, week: int) -> list[dict]:
    """Average every source we hold into one anonymous board.

    The rules, all of which exist because averaging orderings is easy to get wrong:

    1. **Each source is densely re-ranked over the players it lists.** A source's own
       numbering is not comparable across boards — ECR carries decimals, an expert's
       list carries gaps — but its ordering is.
    2. **A player missing from a board that covers their position is imputed at that
       board's depth + 1**, not skipped. Averaging only over the boards that list
       someone would float a fringe player who appears on exactly one deep list — and
       it is also what lets boards of different depths be blended at all, since the
       constant penalty leaves the deeper board's ordering intact below the shallower
       board's floor.
    3. **One source is enough to appear**, because of rule 2. An earlier version
       required two, which quietly truncated the whole consensus to the depth of the
       shallowest board: blending a 434-name board with a 150-name one produced a
       150-name consensus. `sources_count` travels with every row instead, so a
       player only one board has an opinion about is visible as that.
    4. **Dispersion is measured over real placements only** — the imputed values are
       there to place a player correctly, not to manufacture disagreement about them.

    Returns rows carrying no source names. That is the point: several inputs are
    paywalled, and an aggregate that never attributes or reproduces a single board is
    a different thing from republishing one.
    """
    held = held_sources(db, ranking_type, season, week)
    if not held:
        return []

    per_source: dict[str, dict[str, int]] = {}
    covered_positions: dict[str, set[str]] = {}
    depth: dict[str, int] = {}
    positions: dict[str, str] = {}
    own_dispersion: dict[str, float] = {}

    for source, scraped_at in held.items():
        rows = source_rows(db, source, ranking_type, season, week, scraped_at)
        if not rows:
            continue
        per_source[source] = {row["player_id"]: row["rank"] for row in rows}
        covered_positions[source] = {row["position"] for row in rows}
        depth[source] = len(rows)
        for row in rows:
            positions[row["player_id"]] = row["position"]
            # Kept as a fallback for a single-source blend, where there is no
            # cross-board disagreement to measure but the source published its own.
            if row["sd"] is not None:
                own_dispersion.setdefault(row["player_id"], row["sd"])

    if not per_source:
        return []

    blended: list[dict] = []

    for player_id, position in positions.items():
        placements = [
            ranks[player_id] for ranks in per_source.values() if player_id in ranks
        ]
        scored: list[float] = []
        for source, ranks in per_source.items():
            if player_id in ranks:
                scored.append(float(ranks[player_id]))
            elif position in covered_positions[source]:
                scored.append(float(depth[source] + 1))

        mean_rank = sum(scored) / len(scored)
        blended.append({
            "player_id": player_id,
            "mean_rank": mean_rank,
            "sources_count": len(placements),
            # Population sd: these are the placements, not a sample of them.
            "rank_sd": round(pstdev(placements), 2) if len(placements) > 1 else None,
            "best_rank": min(placements),
            "worst_rank": max(placements),
            "own_sd": own_dispersion.get(player_id),
        })

    blended.sort(key=lambda row: row["mean_rank"])
    for rank, row in enumerate(blended, start=1):
        row["rank"] = rank
        # One dispersion number for callers that just need "how contested is this
        # player" — the mock-draft bots being the caller that matters. Cross-board
        # disagreement when we have it, the source's own when we hold only one board.
        row["dispersion"] = row["rank_sd"] if row["rank_sd"] is not None else row["own_sd"]
    return blended


# --- Resolving a board --------------------------------------------------------------


@dataclass
class Board:
    """A resolved board: its ordered entries plus what it is, for the UI to say."""

    id: str
    label: str
    entries: list[dict]
    ranking_type: str
    season: int
    week: int
    kind: str = "global"  # 'global' | 'user'
    attribution: str | None = None
    sources_count: int = 0
    scraped_at: date | None = None


def user_board_entries(db: Session, board: RankingBoard) -> list[dict]:
    """A user board's rows, in the order they saved them."""
    rows = db.execute(
        select(
            RankingBoardEntry.player_id,
            RankingBoardEntry.rank,
            RankingBoardEntry.tier,
            RankingBoardEntry.note,
        )
        .where(RankingBoardEntry.board_id == board.board_id)
        .order_by(RankingBoardEntry.rank)
    ).mappings().all()
    return [dict(row) for row in rows]


def resolve_board(
    db: Session,
    source: str,
    ranking_type: str,
    season: int,
    week: int,
    user_id: UUID | None = None,
) -> Board | None:
    """Turn a `source` parameter into an ordered board, or None if it is not readable.

    Private sources, unknown sources, another user's board and a board that does not
    exist all return None, and every one of them becomes the same 404. A caller cannot
    use this endpoint to learn that a private board exists.
    """
    if source.startswith(USER_BOARD_PREFIX):
        if user_id is None:
            return None
        try:
            board_id = UUID(source[len(USER_BOARD_PREFIX):])
        except ValueError:
            return None
        # Filtered on owner *and* key, so a guessed id 404s exactly like a missing one.
        record = db.scalar(
            select(RankingBoard).where(
                RankingBoard.board_id == board_id, RankingBoard.user_id == user_id
            )
        )
        if record is None:
            return None
        return Board(
            id=f"{USER_BOARD_PREFIX}{record.board_id}",
            label=record.name,
            entries=user_board_entries(db, record),
            ranking_type=record.ranking_type,
            season=season,
            week=week,
            kind="user",
        )

    registered = public_source(source)
    if registered is None:
        return None

    if registered.blend:
        entries = build_blend(db, ranking_type, season, week)
        counts = {entry["sources_count"] for entry in entries}
        return Board(
            id=registered.id,
            label=registered.label,
            entries=entries,
            ranking_type=ranking_type,
            season=season,
            week=week,
            sources_count=max(counts) if counts else 0,
        )

    held = held_sources(db, ranking_type, season, week)
    scraped_at = held.get(registered.id)
    if scraped_at is None:
        return Board(
            id=registered.id, label=registered.label, entries=[],
            ranking_type=ranking_type, season=season, week=week,
            attribution=registered.attribution,
        )
    rows = source_rows(db, registered.id, ranking_type, season, week, scraped_at)
    for row in rows:
        # The published dispersion, under the name every caller reads.
        row["dispersion"] = row.get("sd")
    return Board(
        id=registered.id,
        label=registered.label,
        entries=rows,
        ranking_type=ranking_type,
        season=season,
        week=week,
        attribution=registered.attribution,
        sources_count=1,
        scraped_at=scraped_at,
    )


def list_boards(
    db: Session, ranking_type: str, season: int, week: int, user_id: UUID | None = None
) -> list[dict]:
    """Every board this caller may pick: public globals we hold, then their own.

    A public source with no rows for this context is omitted rather than offered and
    then found empty.
    """
    held = held_sources(db, ranking_type, season, week)
    boards: list[dict] = []

    for source in GLOBAL_SOURCES.values():
        if not source.public:
            continue
        if source.blend:
            if not held:
                continue
        elif source.id not in held:
            continue
        boards.append({
            "id": source.id,
            "label": source.label,
            "kind": "global",
            "description": source.description,
            "attribution": source.attribution,
            "scraped_at": held.get(source.id).isoformat() if held.get(source.id) else None,
        })

    if user_id is not None:
        records = db.execute(
            select(RankingBoard)
            .where(RankingBoard.user_id == user_id)
            .order_by(RankingBoard.updated_at.desc())
        ).scalars().all()
        for record in records:
            boards.append({
                "id": f"{USER_BOARD_PREFIX}{record.board_id}",
                "label": record.name,
                "kind": "user",
                "description": None,
                "attribution": None,
                "origin": record.origin,
                "seeded_from": record.seeded_from,
                "updated_at": record.updated_at.isoformat() if record.updated_at else None,
            })

    return boards


# --- The board, with our numbers on it ----------------------------------------------


def bye_weeks(db: Session, season: int) -> dict[int, int]:
    """Each team's bye week for a season, derived from the schedule.

    A bye is an *absence*, so it cannot be read off a row — it is the regular-season
    week between the season's first and last in which a team has no fixture. Derived
    rather than stored for the same reason implied totals are: it is one cheap query
    over data we already hold, and a stored copy would be another thing to keep true
    when the schedule is re-ingested.

    Returns an empty mapping for a season with no schedule, and omits any team with
    no gap (or more than one, which would mean an incomplete schedule rather than two
    byes — better to say nothing than to pick one).
    """
    rows = db.execute(
        select(Game.season, Game.week, Game.home_team_id, Game.away_team_id).where(
            Game.season == season, Game.season_type == "REG", Game.week.is_not(None)
        )
    ).all()
    if not rows:
        return {}

    weeks = sorted({row.week for row in rows})
    playing: dict[int, set[int]] = {}
    for row in rows:
        for team_id in (row.home_team_id, row.away_team_id):
            if team_id is not None:
                playing.setdefault(team_id, set()).add(row.week)

    byes: dict[int, int] = {}
    for team_id, played in playing.items():
        missing = [week for week in weeks if week not in played]
        if len(missing) == 1:
            byes[team_id] = missing[0]
    return byes


def player_identity(db: Session, player_ids: list[str]) -> dict[str, dict]:
    """Name, position, team, headshot and bio for a set of players.

    Joined from `players` rather than from the stat rows because a ranked rookie has
    no stat row at all, and a board that dropped them would be missing its first round.
    """
    if not player_ids:
        return {}
    rows = db.execute(
        select(
            Player.player_id,
            Player.name,
            Player.position,
            Player.birth_date,
            Player.headshot_url,
            Player.years_of_experience,
            Player.team_id,
            Team.abbreviation.label("team_abbreviation"),
        )
        .outerjoin(Team, Player.team_id == Team.team_id)
        .where(Player.player_id.in_(player_ids))
    ).mappings().all()
    return {row["player_id"]: dict(row) for row in rows}


def build_rankings(
    db: Session,
    board: Board,
    window: Window | None,
    config: ScoringConfig,
    league: LeagueConfig,
    min_games: int | None = None,
    position: str | None = None,
) -> tuple[list[dict], dict]:
    """Attach identity, our valuation, and schedule difficulty to a board's rows.

    The board supplies the *order*; everything else here is context for judging it.
    Our valuation is **expected** VORP per game, for the M6.1 reason: actual VORP
    ranks last season's results, so touchdown luck rides into every comparison and the
    board quietly recommends variance.

    Two seasons are in play and they are different for most of the calendar — the
    board is for the season about to be played, ``window`` is the last one played.

    ``window`` may be **None**, and then every valuation column comes back empty while
    the board itself renders normally. The board is the content and the valuation is a
    column beside it — a personal cheat sheet, or any board at all in a database with
    no completed season, is still a board.
    """
    entries = board.entries
    identity = player_identity(db, [entry["player_id"] for entry in entries])

    # Our numbers. Positions are never filtered before this: the pools that produce a
    # percentile have to be whole, exactly as on the Insight boards.
    if window is None:
        valuation, context = {}, {}
    else:
        stat_rows, context = build_intelligence(
            db, window, config, league, min_games=min_games
        )
        valuation = {record["player_id"]: record for record in stat_rows}

    # Schedule difficulty for the season being drafted, in the same scoring (M6.3).
    sos, _ = team_summary(db, board.season, config, ("full",))

    # Bye weeks for the season being drafted — the one piece of schedule a drafter
    # acts on pick by pick ("my quarterback and my tight end are both out in week 7").
    byes = bye_weeks(db, board.season)

    rows: list[dict] = []
    for entry in entries:
        player = identity.get(entry["player_id"])
        if player is None:
            # Ranked by a source but not in `players` — a board should not invent a
            # row it cannot name.
            continue
        record = valuation.get(entry["player_id"])
        qualified = bool(record and record.get("qualified"))

        rows.append({
            "player_id": entry["player_id"],
            "name": player["name"],
            "position": player["position"],
            "team_abbreviation": player["team_abbreviation"],
            "headshot_url": player["headshot_url"],
            "age": age_in_years(player["birth_date"]),
            "years_of_experience": player["years_of_experience"],
            # The board
            "rank": entry["rank"],
            "tier": entry.get("tier"),
            "note": entry.get("note"),
            "dispersion": entry.get("dispersion"),
            "sources_count": entry.get("sources_count"),
            "best_rank": entry.get("best_rank") or entry.get("best"),
            "worst_rank": entry.get("worst_rank") or entry.get("worst"),
            # Only a single public source publishes an ECR of its own; the blend
            # deliberately carries none, since an averaged ECR would be a number no
            # expert ever said.
            "ecr": entry.get("ecr"),
            "sos": (
                sos.get(player["team_id"], {}).get(player["position"], {})
                   .get("full", {}).get("difficulty")
                if player["team_id"] else None
            ),
            "bye_week": byes.get(player["team_id"]) if player["team_id"] else None,
            # Us
            "expected_vorp_ppg": record.get("expected_vorp_ppg") if qualified else None,
            "expected_fantasy_ppg": record.get("expected_fantasy_ppg") if qualified else None,
            "fantasy_ppg": record.get("fantasy_ppg") if qualified else None,
            # Last season's total, in the caller's scoring. Not gated on `qualified`:
            # a player who managed four games still scored what he scored, and a total
            # is a fact rather than a rate that a small sample would distort.
            "fantasy_points": record.get("fantasy_points") if record else None,
            "fantasy_points_over_expected": (
                record.get("fantasy_points_over_expected") if qualified else None
            ),
            "fantasy_opportunity_rating": (
                record.get("fantasy_opportunity_rating") if qualified else None
            ),
            "games_played": record.get("games_played") if record else None,
            # Last season's box score. Counting stats rather than rates, so none of
            # them is gated on `qualified` the way the valuation columns are: a player
            # who managed four games still caught what he caught, and a total is a
            # fact that a small sample cannot distort the way a per-game rate can.
            **{
                column: (record.get(column) if record else None)
                for column in BOX_SCORE_COLUMNS
            },
        })

    # Our rank over exactly the players on this board that we can value — the M6.1
    # invariant. Never a rank over a different population from the board's own.
    rankable = [row for row in rows if row["expected_vorp_ppg"] is not None]
    rankable.sort(key=lambda row: row["expected_vorp_ppg"], reverse=True)
    for value_rank, row in enumerate(rankable, start=1):
        row["value_rank"] = value_rank
    for row in rows:
        row.setdefault("value_rank", None)

    if position:
        wanted = position.upper()
        rows = [row for row in rows if row["position"] == wanted]

    return rows, {
        **context,
        "board": board.id,
        "board_label": board.label,
        "board_kind": board.kind,
        "attribution": board.attribution,
        "ranking_type": board.ranking_type,
        "ranking_season": board.season,
        "week": board.week,
        "sources_count": board.sources_count,
        "scraped_at": board.scraped_at.isoformat() if board.scraped_at else None,
        "ranked_players": len(entries),
        "valued_players": len(rankable),
    }
