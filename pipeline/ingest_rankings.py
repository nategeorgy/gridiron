"""Ingest consensus expert rankings (FantasyPros ECR) into player_rankings.

**This ingests rankings, not projections.** `load_ff_rankings` publishes expert
consensus rank plus its dispersion — no projected points, no ADP — so there is nothing
here to run through the scoring engine. The Draft Value Board treats a rank as what it
is: the market's opinion, to be *contrasted* with our own expected-points valuation
rather than displayed as a number in the user's league scoring.

Two things about the feed shape drive this script:

**It is a snapshot, not a history.** The file carries a single `scrape_date` and is
overwritten upstream. Storing `scraped_at` as part of the key means history accrues
from our first run — so "his ECR moved 20 spots in a fortnight" becomes answerable, but
only from today forward. Nothing is backfillable.

**Weekly rankings come from the archive, not the latest-weekly file.** `fp_latest_weekly`
publishes only positional pages (`ppr-rb`, `qb`, …) with no overall board, while
`load_ff_rankings("all")` — the full ECR archive, 1.8M rows back to 2019 — carries
`weekly-op` as well, the one overall weekly board still published. (`weekly-offense`
existed and was discontinued in October 2020: 7,148 rows ending 2020-10-12, against
43,907 rows of `weekly-op` running to the end of last season.) The archive is also a
real time series rather than a snapshot, so weekly history is backfillable — which the
M6.1 note about history accruing only from our first ingest got wrong: that is true of
the *latest* file, not of the archive beside it.

**The archive carries no week number**, only a scrape date, so the week is derived from
the schedule: a board scraped on date D belongs to the first week whose games have not
all finished by D.

**It has no gsis id.** Rankings carry FantasyPros ids, so the join runs through
`load_ff_playerids`. Measured on redraft-overall: 436 of 440 skill players matched,
with **zero** misses inside the top 200 — the failures are deep free agents. A
normalised name + position fallback catches some of the rest; anything still unmatched
is logged rather than guessed at.
"""

import argparse
import logging
from datetime import date, timedelta

import nflreadpy as nfl
import polars as pl
from sqlalchemy import text

from db import get_engine, upsert
from seasons import ROSTER, in_season, latest_season

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("pipeline.rankings")

SOURCE = "fantasypros"
SCOPE_POSITIONS = {"QB", "RB", "WR", "TE"}

# Draft rankings are preseason, so they carry week 0 — a primary-key column cannot be
# NULL. In-season weekly rankings use the real week number.
DRAFT_WEEK = 0

# Archive page types that are weekly rankings, narrowed to what this product can use:
# the overall board plus the four in-scope positions.
WEEKLY_PAGES = ("weekly-op", "weekly-qb", "weekly-rb", "weekly-wr", "weekly-te")


def _existing_player_ids() -> set[str]:
    """Player ids already in the players table (player_rankings has a real FK)."""
    with get_engine().connect() as connection:
        return {row[0] for row in connection.execute(text("SELECT player_id FROM players"))}


def _crosswalk() -> tuple[dict[str, str], dict[tuple[str, str], str]]:
    """FantasyPros id -> gsis id, plus a (merge name, position) -> gsis fallback."""
    ids = nfl.load_ff_playerids().filter(pl.col("gsis_id").is_not_null())

    by_fantasypros = {
        str(row["fantasypros_id"]): row["gsis_id"]
        for row in ids.filter(pl.col("fantasypros_id").is_not_null()).iter_rows(named=True)
    }
    by_name = {
        (str(row["merge_name"]).lower(), row["position"]): row["gsis_id"]
        for row in ids.filter(pl.col("merge_name").is_not_null()).iter_rows(named=True)
    }
    return by_fantasypros, by_name


def _resolve_player(record: dict, by_fantasypros: dict, by_name: dict) -> str | None:
    """A ranking row's gsis id, by FantasyPros id then by normalised name + position."""
    fantasypros_id = record.get("id")
    player_id = by_fantasypros.get(str(fantasypros_id)) if fantasypros_id else None
    if player_id is None:
        merge_name = record.get("mergename")
        if merge_name:
            player_id = by_name.get((str(merge_name).lower(), record.get("pos")))
    return player_id


def _shift_days(iso_date: str, days: int) -> str:
    """Shift an ISO date string by whole days, staying in ISO form."""
    return (date.fromisoformat(iso_date) + timedelta(days=days)).isoformat()


def ingest_rankings(season: int | None = None) -> int:
    """Load the current consensus draft rankings and upsert them. Returns rows written."""
    season = season or latest_season(ROSTER)
    rankings = nfl.load_ff_rankings("draft").filter(pl.col("pos").is_in(SCOPE_POSITIONS))
    by_fantasypros, by_name = _crosswalk()
    known_players = _existing_player_ids()

    rows: dict[tuple, dict] = {}
    unmatched: list[str] = []
    untracked = 0

    for record in rankings.iter_rows(named=True):
        player_id = _resolve_player(record, by_fantasypros, by_name)
        if player_id is None:
            unmatched.append(f"{record.get('player')} ({record.get('pos')})")
            continue
        # A ranked player we do not carry — a position outside scope on this page, or
        # someone who has never appeared in load_players. The FK would reject them.
        if player_id not in known_players:
            untracked += 1
            continue

        scraped_at = record.get("scrape_date")
        key = (player_id, SOURCE, record.get("page_type"), season, DRAFT_WEEK, scraped_at)
        rows[key] = {
            "player_id": player_id,
            "source": SOURCE,
            "ranking_type": record.get("page_type"),
            "season": season,
            "week": DRAFT_WEEK,
            "scraped_at": scraped_at,
            "ecr": record.get("ecr"),
            "sd": record.get("sd"),
            "best": record.get("best"),
            "worst": record.get("worst"),
            "rank_delta": record.get("rank_delta"),
            "player_owned_avg": record.get("player_owned_avg"),
        }

    written = upsert(
        "player_rankings",
        list(rows.values()),
        conflict_columns=["player_id", "source", "ranking_type", "season", "week", "scraped_at"],
    )
    logger.info(
        "ingested %d rankings for season %d (%d unmatched, %d untracked players)",
        written, season, len(unmatched), untracked,
    )
    if unmatched:
        # Named rather than counted: an unmatched *ranked* player is a hole in the
        # board, and the names make it obvious whether it matters (a top-50 pick) or
        # not (a camp body ranked 340th).
        logger.warning("no id match for: %s", ", ".join(sorted(set(unmatched))[:20]))
    return written



def _week_boundaries(season: int) -> list[tuple[int, str]]:
    """``(week, last game date)`` for a season's regular-season weeks, in order.

    The schedule is the only thing that knows when a week is, and it is already in the
    database — so the mapping stays right for a season with a different number of weeks
    or an international kickoff, without a calendar constant anywhere.
    """
    with get_engine().connect() as connection:
        rows = connection.execute(
            text(
                "SELECT week, MAX(game_date) AS last_game FROM games "
                "WHERE season = :season AND season_type = 'REG' AND week IS NOT NULL "
                "GROUP BY week ORDER BY week"
            ),
            {"season": season},
        ).all()
    return [(int(week), str(last_game)) for week, last_game in rows if last_game]


def _week_for(scrape_date: str, boundaries: list[tuple[int, str]]) -> int | None:
    """Which week a board scraped on ``scrape_date`` is about.

    Rankings are published ahead of the games they rank, so a scrape belongs to the
    first week that has not finished yet. Returns None for a date outside the season,
    which is skipped rather than forced into week 1 or 18.
    """
    for week, last_game in boundaries:
        if scrape_date <= last_game:
            return week
    return None


def ingest_weekly_rankings(season: int | None = None) -> int:
    """Load weekly consensus rankings for a season from the ECR archive.

    Idempotent over the whole season rather than just the current week: the archive is
    a time series, the scrape date is part of the key, and re-running simply rewrites
    rows that already match. That also means a week the scheduled job missed is
    recoverable here, which is not true of the draft file.
    """
    explicit = season is not None
    season = season or latest_season(ROSTER)

    # The archive is a 1.8M-row download and there are no weekly boards before kickoff,
    # so the scheduled run must not fetch it every morning from March to September just
    # to write nothing. An explicit --season is always honoured: that is someone
    # backfilling on purpose.
    if not explicit and not in_season():
        logger.info("preseason — no weekly rankings published yet for %d", season)
        return 0

    boundaries = _week_boundaries(season)
    if not boundaries:
        logger.warning("no regular-season schedule held for %d; nothing to ingest", season)
        return 0

    first_date, last_date = boundaries[0][1], boundaries[-1][1]
    archive = nfl.load_ff_rankings("all").filter(
        pl.col("page_type").is_in(WEEKLY_PAGES)
        & pl.col("pos").is_in(SCOPE_POSITIONS)
        # A board is scraped before the week it ranks, so the window opens a fortnight
        # early; the exact bound does not matter because _week_for is the real filter.
        & (pl.col("scrape_date") <= last_date)
        & (pl.col("scrape_date") >= _shift_days(first_date, -14))
    )
    by_fantasypros, by_name = _crosswalk()
    known_players = _existing_player_ids()

    rows: dict[tuple, dict] = {}
    unmatched: list[str] = []
    untracked = out_of_season = 0

    for record in archive.iter_rows(named=True):
        week = _week_for(str(record.get("scrape_date")), boundaries)
        if week is None:
            out_of_season += 1
            continue
        player_id = _resolve_player(record, by_fantasypros, by_name)
        if player_id is None:
            unmatched.append(f"{record.get('player')} ({record.get('pos')})")
            continue
        if player_id not in known_players:
            untracked += 1
            continue

        key = (
            player_id, SOURCE, record.get("page_type"), season, week,
            record.get("scrape_date"),
        )
        rows[key] = {
            "player_id": player_id,
            "source": SOURCE,
            "ranking_type": record.get("page_type"),
            "season": season,
            "week": week,
            "scraped_at": record.get("scrape_date"),
            "ecr": record.get("ecr"),
            "sd": record.get("sd"),
            "best": record.get("best"),
            "worst": record.get("worst"),
            "rank_delta": record.get("rank_delta"),
            "player_owned_avg": record.get("player_owned_avg"),
        }

    written = upsert(
        "player_rankings",
        list(rows.values()),
        conflict_columns=["player_id", "source", "ranking_type", "season", "week", "scraped_at"],
    )
    logger.info(
        "ingested %d weekly rankings for season %d (%d unmatched, %d untracked, "
        "%d outside the season)",
        written, season, len(unmatched), untracked, out_of_season,
    )
    return written


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest consensus expert rankings.")
    parser.add_argument(
        "--season", type=int, default=None,
        help="Season the rankings apply to (default: the current roster year).",
    )
    parser.add_argument(
        "--weekly", action="store_true",
        help="Ingest in-season weekly rankings from the ECR archive instead of the "
             "preseason draft boards.",
    )
    args = parser.parse_args()
    if args.weekly:
        ingest_weekly_rankings(args.season)
    else:
        ingest_rankings(args.season)
