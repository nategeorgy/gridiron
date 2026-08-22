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

**It has no gsis id.** Rankings carry FantasyPros ids, so the join runs through
`load_ff_playerids`. Measured on redraft-overall: 436 of 440 skill players matched,
with **zero** misses inside the top 200 — the failures are deep free agents. A
normalised name + position fallback catches some of the rest; anything still unmatched
is logged rather than guessed at.
"""

import argparse
import logging

import nflreadpy as nfl
import polars as pl
from sqlalchemy import text

from db import get_engine, upsert
from seasons import ROSTER, latest_season

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("pipeline.rankings")

SOURCE = "fantasypros"
SCOPE_POSITIONS = {"QB", "RB", "WR", "TE"}

# Draft rankings are preseason, so they carry week 0 — a primary-key column cannot be
# NULL. In-season weekly rankings (a later slice) use the real week number.
DRAFT_WEEK = 0


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
        fantasypros_id = record.get("id")
        player_id = by_fantasypros.get(str(fantasypros_id)) if fantasypros_id else None
        if player_id is None:
            merge_name = record.get("mergename")
            if merge_name:
                player_id = by_name.get((str(merge_name).lower(), record.get("pos")))
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


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest consensus expert rankings.")
    parser.add_argument(
        "--season", type=int, default=None,
        help="Season the rankings apply to (default: the current roster year).",
    )
    args = parser.parse_args()
    ingest_rankings(args.season)
