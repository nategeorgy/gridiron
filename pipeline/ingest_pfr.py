"""Ingest Pro Football Reference advanced stats (M12 enrichment pass).

Source: ``load_pfr_advstats(stat_type="pass" | "rush" | "rec", summary_level="week")``
— nflverse's mirror of Pro Football Reference's charting, 2018 onwards.

**What this feed is for.** Every other source here describes what a player did with the
ball. PFR is the only free source that describes *what the defense did to the play*:
how often a quarterback was pressured and blitzed, how many yards a back gained before
anyone touched him versus after, how many tackles were broken, and how many catchable
balls were dropped. Yards before contact is a measurement of the offensive line;
yards after contact is a measurement of the back. Splitting a rushing line into those
two halves is the single most useful thing in this file.

**Coverage compared with Next Gen Stats.** PFR is *broader* and *shallower*. In 2024 it
charts 497 receivers and 335 backs against NGS's 212 and 80 — because it has no volume
qualifier, so a third-string tight end with two targets still appears — but it starts in
2018 against NGS's 2016. The two are complements rather than substitutes.

**Percentages arrive as 0-1 fractions** (``times_pressured_pct`` is 0.367 for 36.7%),
which already matches how every share in this database is stored. This is worth stating
because the NGS feed is the opposite: half of *its* percentages arrive 0-100 and are
divided at ingest. Both were measured against real data before either was written.

**It keys on ``pfr_player_id``, not GSIS**, so this reuses the same crosswalk
``ingest_usage.py`` builds from ``load_players`` for snap counts. A PFR id with no GSIS
counterpart is skipped and counted rather than guessed at.

Three rates are deliberately **not** stored even though PFR publishes them:
``rushing_yards_before_contact_avg``, ``rushing_yards_after_contact_avg`` and
``receiving_drop_pct``. A stored per-game rate has to be re-derived to aggregate
correctly anyway (see the ``weight_by`` work in 062e97d), so they are registry
``derived`` metrics dividing the stored totals by our own carries and targets —
``Σ yards / Σ carries``, never the mean of per-game averages.

This is an **enrichment pass**: it only updates stat lines ``ingest_stats.py`` has
already created, and it is idempotent (``INSERT ... ON CONFLICT DO UPDATE``).
"""

import argparse
import logging

import nflreadpy as nfl

from availability import mask_unavailable
from db import load_stat_keys, upsert
from seasons import PFR, clamp_seasons, default_seasons

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("pipeline.pfr")


# PFR column -> our player_stats column, per stat type. The `pass` file also carries
# times_hit and times_hurried; both are components of times_pressured, so storing them
# would be storing the same event three times.
COLUMN_MAP: dict[str, dict[str, str]] = {
    "pass": {
        "times_pressured_pct": "pressure_rate",
        "times_blitzed": "times_blitzed",
        "passing_bad_throw_pct": "bad_throw_rate",
        "passing_drops": "drops_by_receivers",
    },
    "rush": {
        "rushing_yards_before_contact": "rush_yards_before_contact",
        "rushing_yards_after_contact": "rush_yards_after_contact",
        "rushing_broken_tackles": "rush_broken_tackles",
    },
    "rec": {
        "receiving_drop": "receiving_drops",
        "receiving_broken_tackles": "rec_broken_tackles",
        "receiving_rat": "passer_rating_when_targeted",
    },
}

# Columns that are counts in the database and floats in the feed.
INTEGER_COLUMNS: frozenset[str] = frozenset({
    "times_blitzed", "drops_by_receivers", "rush_yards_before_contact",
    "rush_yards_after_contact", "rush_broken_tackles", "receiving_drops",
    "rec_broken_tackles",
})


def pfr_to_gsis() -> dict[str, str]:
    """Build a ``pfr_id -> gsis_id`` crosswalk from the nflverse players file.

    The same mapping ``ingest_usage.py`` needs for snap counts. Rebuilt here rather
    than imported so each ingest script stays independently runnable.
    """
    players = nfl.load_players().select(["gsis_id", "pfr_id"])
    crosswalk = {
        row["pfr_id"]: row["gsis_id"]
        for row in players.iter_rows(named=True)
        if row["pfr_id"] and row["gsis_id"]
    }
    logger.info("crosswalk: %d PFR ids mapped to GSIS ids", len(crosswalk))
    return crosswalk


def collect(
    stat_type: str, seasons: list[int], crosswalk: dict[str, str],
    stat_keys: set[tuple[str, str]],
) -> dict[tuple, dict]:
    """Return ``(player_id, game_id) -> {pfr columns}`` for one PFR stat type.

    PFR charts every player on the field, including the offensive linemen and
    defenders this project does not track, so a row whose ``(player_id, game_id)``
    has no stat line of ours is skipped. Enrichment never *creates* a row — the
    same rule as ingest_expected.py, and without it the insert trips the
    ``players`` foreign key on the first lineman PFR charted.
    """
    frame = nfl.load_pfr_advstats(
        seasons=seasons, stat_type=stat_type, summary_level="week"
    )
    mapping = COLUMN_MAP[stat_type]

    collected: dict[tuple, dict] = {}
    unmapped = 0
    for record in frame.iter_rows(named=True):
        player_id = crosswalk.get(record.get("pfr_player_id"))
        game_id = record.get("game_id")
        if player_id is None or game_id is None or (player_id, game_id) not in stat_keys:
            unmapped += 1
            continue

        row = {"player_id": player_id, "game_id": game_id}
        for source, target in mapping.items():
            value = record.get(source)
            if value is not None and target in INTEGER_COLUMNS:
                value = int(value)
            row[target] = value

        season = record.get("season")
        collected[(player_id, game_id)] = (
            mask_unavailable(row, season) if season else row
        )

    logger.info(
        "%s: %d player-games collected (%d rows skipped: unmapped id, or a player "
        "outside QB/RB/WR/TE scope)",
        stat_type, len(collected), unmapped,
    )
    return collected


def ingest_pfr(seasons: list[int]) -> int:
    """Load all three PFR stat types and update the advanced columns on player_stats."""
    seasons = clamp_seasons(seasons, PFR)
    if not seasons:
        logger.info(
            "nothing to ingest: no requested season is inside the Pro Football "
            "Reference window %s", PFR.window(),
        )
        return 0

    crosswalk = pfr_to_gsis()
    stat_keys = load_stat_keys()

    # Merged per player-game before writing: a running back appears in both the rush
    # and rec files, and two separate upserts would each carry only their own columns.
    merged: dict[tuple, dict] = {}
    for stat_type in COLUMN_MAP:
        for key, row in collect(stat_type, seasons, crosswalk, stat_keys).items():
            merged.setdefault(key, {"player_id": key[0], "game_id": key[1]}).update(row)

    # Every row carries all ten columns, explicitly NULL where this player has no PFR
    # line for that phase — the upsert builds its SET clause from the union of keys
    # across the batch, so a partial row would make the write depend on who else is in
    # the run. Same reasoning as ingest_nextgen.py.
    blank = {c: None for mapping in COLUMN_MAP.values() for c in mapping.values()}
    rows = [{**blank, **row} for row in merged.values()]

    written = upsert("player_stats", rows, conflict_columns=["player_id", "game_id"])
    logger.info("pfr advanced: updated %d stat lines for seasons %s", written, seasons)
    return written


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Ingest Pro Football Reference advanced stats (pressure, contact, drops)."
    )
    parser.add_argument(
        "--seasons", type=int, nargs="+", default=default_seasons(PFR),
        help="Seasons to ingest (default: 2018 — PFR's first season — onwards).",
    )
    args = parser.parse_args()
    ingest_pfr(args.seasons)
