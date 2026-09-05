"""Shared database helpers for the ingestion pipeline.

The pipeline is decoupled from the backend's SQLAlchemy models: it reflects the
table definitions straight from the database, so the migrated schema is the
single source of truth. Upserts use PostgreSQL ``INSERT ... ON CONFLICT DO
UPDATE`` to stay idempotent — safe to run repeatedly without duplicating rows.
"""

import logging
import os
from functools import lru_cache
from math import isfinite

from dotenv import load_dotenv
from sqlalchemy import Engine, MetaData, Table, create_engine
from sqlalchemy.dialects.postgresql import insert as pg_insert

load_dotenv()

logger = logging.getLogger("pipeline")


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    """Return a cached SQLAlchemy engine built from DATABASE_URL."""
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError(
            "DATABASE_URL is not set. Copy pipeline/.env from the template."
        )
    return create_engine(database_url, pool_pre_ping=True)


@lru_cache(maxsize=None)
def _reflect_table(table_name: str) -> Table:
    """Reflect and cache a table's definition from the live database."""
    metadata = MetaData()
    return Table(table_name, metadata, autoload_with=get_engine())


def scrub_non_finite(rows: list[dict]) -> int:
    """Replace every NaN and ±Infinity in ``rows`` with None. Returns how many.

    **PostgreSQL's FLOAT accepts IEEE NaN, and NaN is contagious in a way NULL is
    not.** `AVG(col)` over a set containing one NaN returns NaN for the whole set —
    not an error, not a skipped row, just a silently poisoned aggregate. `MAX` returns
    NaN too, because NaN compares greater than everything. A single bad value at the
    bottom of a 150,000-row table is enough to make a season leaderboard, an Insight
    percentile pool or a scatter axis return nothing usable, and nothing anywhere
    raises. NULL, by contrast, is what every aggregate here already knows how to skip.

    This is the same class of problem as the availability masking in
    ``availability.py`` — a feed reporting something it does not have — one layer
    down. There the wrong value is a plausible-looking ``0``; here it is a value that
    is not a number at all.

    ⚠️ **It belongs at the write boundary, not at a division site.** We do not compute
    these: ``load_player_stats`` publishes ``target_share``, ``air_yards_share`` and
    ``wopr`` with NaN already in them — 305,000 rows of it across 1999-2008, plus six
    infinities — and we store the column verbatim. Our *own* divisions have been
    guarded all along (``_safe_div`` in ingest_stats.py, ``_share`` in
    ingest_expected.py). So the only place that can be complete is the one every
    ingest passes through on its way to the database, which is here. A new ingest
    script inherits the guard instead of having to remember it.
    """
    scrubbed = 0
    for row in rows:
        for key, value in row.items():
            if isinstance(value, float) and not isfinite(value):
                row[key] = None
                scrubbed += 1
    return scrubbed


def _scrub_and_log(table_name: str, rows: list[dict]) -> None:
    """Scrub non-finite values in place, logging when any were found."""
    scrubbed = scrub_non_finite(rows)
    if scrubbed:
        logger.warning(
            "%s: replaced %d non-finite value(s) (NaN/Infinity) with NULL before "
            "writing — the upstream feed published them",
            table_name, scrubbed,
        )


def upsert(table_name: str, rows: list[dict], conflict_columns: list[str]) -> int:
    """Insert rows, updating existing ones on a conflict of ``conflict_columns``.

    Only columns actually present in the supplied rows are updated on conflict,
    so partial-column ingests (e.g. an enrichment pass) don't overwrite existing
    values with NULL.

    Returns the number of rows sent to the database.
    """
    if not rows:
        logger.info("upsert %s: no rows to write", table_name)
        return 0

    _scrub_and_log(table_name, rows)
    table = _reflect_table(table_name)
    present_columns = {key for row in rows for key in row}

    statement = pg_insert(table)
    update_columns = {
        column.name: statement.excluded[column.name]
        for column in table.columns
        if column.name in present_columns and column.name not in conflict_columns
    }

    if update_columns:
        statement = statement.on_conflict_do_update(
            index_elements=conflict_columns, set_=update_columns
        )
    else:
        statement = statement.on_conflict_do_nothing(index_elements=conflict_columns)

    with get_engine().begin() as connection:
        connection.execute(statement, rows)

    logger.info("upsert %s: wrote %d rows", table_name, len(rows))
    return len(rows)


def replace_scoped(table_name: str, rows: list[dict], scope_columns: list[str]) -> int:
    """Replace whole groups of rows in one transaction. Returns rows written.

    For tables holding **current state** rather than accumulated history, an upsert is
    not enough: a row that should no longer exist simply stops appearing in the source,
    so nothing ever updates it and it survives forever. A depth chart is the clear case
    — a cut player would still be listed as the WR3.

    So each distinct combination of ``scope_columns`` present in ``rows`` (e.g. every
    season+team in this snapshot) is deleted and rewritten. Scopes *absent* from ``rows``
    are left alone on purpose: a team missing from a feed is far more likely to be an
    upstream glitch than a team that has released its entire roster, and deleting on
    that basis would turn a bad download into data loss.

    Delete and insert share one transaction, so a failure mid-run leaves the previous
    contents intact rather than an empty table.
    """
    if not rows:
        logger.info("replace %s: no rows to write", table_name)
        return 0

    _scrub_and_log(table_name, rows)
    table = _reflect_table(table_name)
    scopes = {tuple(row[column] for column in scope_columns) for row in rows}

    with get_engine().begin() as connection:
        for scope in scopes:
            connection.execute(
                table.delete().where(
                    *[
                        table.c[column] == value
                        for column, value in zip(scope_columns, scope)
                    ]
                )
            )
        connection.execute(table.insert(), rows)

    logger.info(
        "replace %s: wrote %d rows across %d %s groups",
        table_name, len(rows), len(scopes), "+".join(scope_columns),
    )
    return len(rows)


def load_stat_keys() -> set[tuple[str, str]]:
    """Return every existing ``(player_id, game_id)`` pair in player_stats.

    Enrichment passes (expected points, snaps, routes) only *update* stat lines that
    ``ingest_stats.py`` already created. Filtering to these keys keeps an enrichment
    run from inserting half-empty rows for players outside our scope.
    """
    table = _reflect_table("player_stats")
    with get_engine().connect() as connection:
        result = connection.execute(
            table.select().with_only_columns(table.c.player_id, table.c.game_id)
        )
        return {(player_id, game_id) for player_id, game_id in result}


def load_team_id_map() -> dict[str, int]:
    """Return a mapping of team abbreviation -> team_id from the teams table."""
    table = _reflect_table("teams")
    with get_engine().connect() as connection:
        result = connection.execute(
            table.select().with_only_columns(table.c.abbreviation, table.c.team_id)
        )
        return {abbr: team_id for abbr, team_id in result if abbr is not None}
