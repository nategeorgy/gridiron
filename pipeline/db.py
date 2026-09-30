"""Shared database helpers for the ingestion pipeline.

The pipeline is decoupled from the backend's SQLAlchemy models: it reflects the
table definitions straight from the database, so the migrated schema is the
single source of truth. Upserts use PostgreSQL ``INSERT ... ON CONFLICT DO
UPDATE`` to stay idempotent: safe to run repeatedly without duplicating rows, and a
row that already holds the incoming values is not rewritten at all.
"""

import json
import logging
import os
import time
from collections import Counter
from collections.abc import Iterator, Mapping
from functools import lru_cache
from math import isfinite

from dotenv import load_dotenv
from sqlalchemy import (
    ColumnElement, Connection, Engine, MetaData, Table, cast, create_engine,
    literal_column, select, text, tuple_,
)
from sqlalchemy.dialects.postgresql import JSON, JSONB, Insert
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import OperationalError

load_dotenv()

logger = logging.getLogger("pipeline")

# How long to keep trying for a first connection. The contention this covers is
# transient by nature, so a failure here is usually a wait rather than a fault.
CONNECT_ATTEMPTS = int(os.environ.get("PIPELINE_CONNECT_ATTEMPTS", "5"))
CONNECT_RETRY_DELAY = int(os.environ.get("PIPELINE_CONNECT_RETRY_DELAY", "15"))

# ⚠️ Rows per write statement. Production cancels any single statement that runs past
# about two minutes (`statement_timeout`, measured from the failed runs' logs), and the
# limit is per statement, not per transaction. Handed every row at once, SQLAlchemy packs
# up to ~32,700 parameters into each INSERT, so on 2026-09-30 the season's player_stats
# upsert went out as a 667-row statement, hit the limit, and cost production its Week 3
# stats. The same upsert took four seconds the Wednesday before, at 716 rows: the data
# had not changed shape, the database had slowed down (the Disk IO budget, see the
# "Disk IO" entry in CLAUDE.md), and the size of the statement decided how much slowdown
# it could absorb. Small statements inside one transaction keep the all-or-nothing write
# and give each piece its own two minutes. The only cost is round trips: 42 statements
# for the 8,300-row players table.
WRITE_CHUNK_ROWS = int(os.environ.get("PIPELINE_WRITE_CHUNK_ROWS", "200"))


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    """Return a cached SQLAlchemy engine built from DATABASE_URL."""
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError(
            "DATABASE_URL is not set. Copy pipeline/.env from the template."
        )
    # ⚠️ The pool is bounded for the same reason the backend's is (app/database.py),
    # and the pipeline is the process that had never been capped. SQLAlchemy defaults
    # to pool_size=5 with max_overflow=10, so one ingest script could hold **fifteen**
    # connections against Supabase's free session-mode pooler while Render's instance
    # is serving from the same one. That is what failed the scheduled run on
    # 2026-09-18, on the very first script of the day:
    #
    #   FATAL: (ECHECKOUTTIMEOUT) unable to check out connection from the pool
    #          after 15000ms in Session mode
    #
    # The failure is quiet in a way the Render one is not: a failed deploy leaves the
    # previous version serving, but a failed pipeline run just leaves the site stale,
    # and nothing surfaces that until someone notices a missing score.
    #
    # Every ingest is serial, so two connections plus one spare is ample: the scripts
    # open a connection, do their work and close it. `pool_recycle` matches the backend,
    # because Supavisor closes idle connections server-side and a pool holding one it
    # believes is alive fails the *next* statement rather than this one.
    engine = create_engine(
        database_url,
        pool_pre_ping=True,
        pool_size=2,
        max_overflow=1,
        pool_recycle=1800,
        pool_timeout=30,
    )
    _wait_for_database(engine)
    return engine


def _wait_for_database(engine: Engine) -> None:
    """Block until the database hands out a connection, or raise after every attempt.

    The pool cap above is the real fix for pooler contention; this covers the rest,
    exactly as backend/scripts/migrate.sh does for migrations. A burst of traffic or a
    deploy overlapping the 6am run can exhaust the pooler for a few seconds, and an
    unattended job should wait it out rather than skip a day of data. A genuinely
    unreachable database still raises once the attempts are spent, so the workflow
    still fails loudly.
    """
    for attempt in range(1, CONNECT_ATTEMPTS + 1):
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            return
        except OperationalError as error:
            if attempt == CONNECT_ATTEMPTS:
                logger.error("database unreachable after %d attempts", CONNECT_ATTEMPTS)
                raise
            logger.warning(
                "database connection attempt %d/%d failed (%s); retrying in %ds",
                attempt, CONNECT_ATTEMPTS, type(error.orig).__name__, CONNECT_RETRY_DELAY,
            )
            time.sleep(CONNECT_RETRY_DELAY)


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


def _chunks(items: list, size: int) -> Iterator[list]:
    """Split ``items`` into consecutive lists of at most ``size``."""
    for start in range(0, len(items), size):
        yield items[start:start + size]


def _differs(table: Table, statement: Insert, columns: list[str]) -> ColumnElement[bool]:
    """``stored IS DISTINCT FROM incoming`` across ``columns``: true only for a real change.

    IS DISTINCT FROM is the null-safe comparison (NULL against NULL is no change, NULL
    against 0 is one), and both sides are already in the column's type, so a float sent
    again matches the float stored from it exactly. ``json`` has no equality operator in
    Postgres, so a json column is compared as jsonb.
    """
    stored, incoming = [], []
    for name in columns:
        column, value = table.c[name], statement.excluded[name]
        if isinstance(column.type, JSON) and not isinstance(column.type, JSONB):
            column, value = cast(column, JSONB), cast(value, JSONB)
        stored.append(column)
        incoming.append(value)
    return tuple_(*stored).is_distinct_from(tuple_(*incoming))


def upsert(table_name: str, rows: list[dict], conflict_columns: list[str]) -> int:
    """Insert rows, updating existing ones on a conflict of ``conflict_columns``.

    Only columns actually present in the supplied rows are updated on conflict,
    so partial-column ingests (e.g. an enrichment pass) don't overwrite existing
    values with NULL.

    **A row that already holds the incoming values is not rewritten.** Most of what the
    pipeline sends on any given day is what it sent the day before: the roster job sends
    all 8,297 players and all 4,902 games every morning, and each of the six stats
    passes re-sends every stat line of the season. Without a guard each of those became
    a new row version plus a new entry in every index (player_stats has seven), which
    autovacuum then had to clean up, and each one moved the counters
    ``backend/app/cache.py`` keys its data version on, so the backend threw its whole
    cache away every morning whether or not anything had changed. Measured on a local
    copy with the rows the scheduled jobs actually send, on a day nothing changed:

      players       116,363 buffer touches -> 40,824    WAL 7.08 MB -> 2.87 MB
      games          68,648 -> 24,540                   WAL 3.25 MB -> 0.94 MB
      player_stats   15,331 -> 7,850  (1,078 rows)      WAL 2.41 MB -> 0.65 MB

    What remains is Postgres locking each unchanged row, which ON CONFLICT does even
    when the WHERE declines the update. A lock writes no new row version and no index
    entry, and it does not count as a write in ``pg_stat_user_tables``.

    Rows go out ``WRITE_CHUNK_ROWS`` at a time, all in one transaction (see the
    constant for why). Returns the number of rows sent to the database.
    """
    if not rows:
        logger.info("upsert %s: no rows to write", table_name)
        return 0

    _scrub_and_log(table_name, rows)
    table = _reflect_table(table_name)
    present_columns = {key for row in rows for key in row}

    statement = pg_insert(table)
    update_columns = [
        column.name
        for column in table.columns
        if column.name in present_columns and column.name not in conflict_columns
    ]

    if update_columns:
        statement = statement.on_conflict_do_update(
            index_elements=conflict_columns,
            set_={name: statement.excluded[name] for name in update_columns},
            where=_differs(table, statement, update_columns),
        )
    else:
        statement = statement.on_conflict_do_nothing(index_elements=conflict_columns)
    # One returned row per row inserted or changed, none for a row left alone. rowcount
    # would say the same for a single statement, but SQLAlchemy reports only the last
    # batch's when it splits one.
    statement = statement.returning(literal_column("1"))

    written = 0
    with get_engine().begin() as connection:
        for chunk in _chunks(rows, WRITE_CHUNK_ROWS):
            written += len(connection.execute(statement, chunk).all())

    logger.info(
        "upsert %s: %d rows, %d written, %d already up to date",
        table_name, len(rows), written, len(rows) - written,
    )
    return len(rows)


def _in_scopes(table: Table, scope_columns: list[str], scopes: list[tuple]) -> ColumnElement[bool]:
    """``(scope columns) IN (scopes)``: one condition covering many groups at once."""
    if len(scope_columns) == 1:
        return table.c[scope_columns[0]].in_([scope[0] for scope in scopes])
    return tuple_(*(table.c[column] for column in scope_columns)).in_(scopes)


def _scope_chunks(by_scope: dict[tuple, list[dict]], size: int) -> Iterator[list[tuple]]:
    """Group scopes into chunks of about ``size`` rows, never splitting a scope."""
    chunk: list[tuple] = []
    rows_in_chunk = 0
    for scope, scope_rows in by_scope.items():
        chunk.append(scope)
        rows_in_chunk += len(scope_rows)
        if rows_in_chunk >= size:
            yield chunk
            chunk, rows_in_chunk = [], 0
    if chunk:
        yield chunk


def _fingerprint(row: Mapping, names: list[str]) -> tuple:
    """A row as a hashable tuple over ``names``, so a group can be counted as a multiset.

    A json column arrives as lists and dicts, which do not hash, so those are compared
    by their canonical JSON text instead.
    """
    return tuple(
        json.dumps(value, sort_keys=True, default=str) if isinstance(value, (list, dict)) else value
        for value in (row.get(name) for name in names)
    )


def _stale_scopes(
    connection: Connection,
    table: Table,
    scope_columns: list[str],
    incoming: dict[tuple, list[dict]],
) -> list[tuple]:
    """The scopes in ``incoming`` whose stored rows differ from the incoming ones.

    Compared as multisets over every column of the table, a column the incoming rows
    leave out counting as NULL, because that is what the rewrite would store. Python's
    equality decides, and the mistake it can make is the safe one: two values the
    database would store identically but Python calls different (a naive timestamp
    against an aware one, say) make a group look changed, and it is rewritten exactly as
    every group was before this check existed.
    """
    names = [column.name for column in table.columns]
    stored: dict[tuple, list[tuple]] = {}
    query = select(table).where(_in_scopes(table, scope_columns, list(incoming)))
    for row in connection.execute(query).mappings():
        scope = tuple(row[column] for column in scope_columns)
        stored.setdefault(scope, []).append(_fingerprint(row, names))
    return [
        scope
        for scope, scope_rows in incoming.items()
        if Counter(stored.get(scope, [])) != Counter(_fingerprint(row, names) for row in scope_rows)
    ]


def replace_scoped(table_name: str, rows: list[dict], scope_columns: list[str]) -> int:
    """Replace whole groups of rows in one transaction. Returns the rows supplied.

    For tables holding **current state** rather than accumulated history, an upsert is
    not enough: a row that should no longer exist simply stops appearing in the source,
    so nothing ever updates it and it survives forever. A depth chart is the clear case:
    a cut player would still be listed as the WR3.

    So each distinct combination of ``scope_columns`` present in ``rows`` (e.g. every
    season+team in this snapshot) is deleted and rewritten. Scopes *absent* from ``rows``
    are left alone on purpose: a team missing from a feed is far more likely to be an
    upstream glitch than a team that has released its entire roster, and deleting on
    that basis would turn a bad download into data loss.

    **A group whose stored rows already match is skipped**, for the same reasons an
    upsert leaves an unchanged row alone (see ``upsert``). The Wednesday job replaces
    every game of the season in ``play_targets`` and ``player_run_lanes``, and by
    December nearly all of those games were settled weeks earlier.

    **Groups are deleted many at a time.** One DELETE per group meant one statement per
    game for ``ingest_plays.py``, and ``player_run_lanes`` has no index that leads with
    ``game_id``, so every one of them was a sequential scan of the whole table: 1,447
    pages per game on a local copy holding 2009-2026. Groups now go through in chunks of
    about ``WRITE_CHUNK_ROWS`` rows (never splitting a group): one read to find the
    stale groups, one DELETE for them, then their inserts.

    Delete and insert share one transaction, so a failure mid-run leaves the previous
    contents intact rather than an empty table.
    """
    if not rows:
        logger.info("replace %s: no rows to write", table_name)
        return 0

    _scrub_and_log(table_name, rows)
    table = _reflect_table(table_name)
    by_scope: dict[tuple, list[dict]] = {}
    for row in rows:
        by_scope.setdefault(tuple(row[column] for column in scope_columns), []).append(row)

    rewritten = 0
    with get_engine().begin() as connection:
        for scopes in _scope_chunks(by_scope, WRITE_CHUNK_ROWS):
            stale = _stale_scopes(
                connection, table, scope_columns, {scope: by_scope[scope] for scope in scopes}
            )
            if not stale:
                continue
            connection.execute(table.delete().where(_in_scopes(table, scope_columns, stale)))
            fresh = [row for scope in stale for row in by_scope[scope]]
            for chunk in _chunks(fresh, WRITE_CHUNK_ROWS):
                connection.execute(table.insert(), chunk)
            rewritten += len(stale)

    logger.info(
        "replace %s: %d rows across %d %s groups, %d rewritten, %d already up to date",
        table_name, len(rows), len(by_scope), "+".join(scope_columns),
        rewritten, len(by_scope) - rewritten,
    )
    return len(rows)


def load_stat_keys(seasons: list[int] | None = None) -> set[tuple[str, str]]:
    """Return existing ``(player_id, game_id)`` pairs in player_stats.

    Enrichment passes (expected points, snaps, routes) only *update* stat lines that
    ``ingest_stats.py`` already created. Filtering to these keys keeps an enrichment
    run from inserting half-empty rows for players outside our scope.

    ⚠️ **Always pass the seasons being ingested.** Unfiltered this is a sequential scan
    of the whole table, and it is called once per enrichment script, so a one-week
    refresh used to read the full 27-season history four times over. On Supabase's free
    tier, where player_stats does not fit in memory, that is what failed the 2026-09-19
    stats run with ``canceling statement due to statement timeout``: ~2 minutes to read
    98,186 rows in order to filter a feed covering 379 of them. Measured on a full copy,
    scoping to one season takes it from 5,802 buffer pages to 106, a sequential scan to
    an index scan on ``ix_player_stats_season``.

    Scoping is exact rather than an approximation, because a ``game_id`` encodes its own
    season: a feed row for 2026 cannot match a stat line from any other year. Note this
    is the "measure pages, not rows" lesson again. The row count was never the problem;
    the pages those rows sat across were.
    """
    table = _reflect_table("player_stats")
    query = table.select().with_only_columns(table.c.player_id, table.c.game_id)
    if seasons is not None:
        query = query.where(table.c.season.in_(list(seasons)))
    with get_engine().connect() as connection:
        result = connection.execute(query)
        return {(player_id, game_id) for player_id, game_id in result}


def load_team_id_map() -> dict[str, int]:
    """Return a mapping of team abbreviation -> team_id from the teams table."""
    table = _reflect_table("teams")
    with get_engine().connect() as connection:
        result = connection.execute(
            table.select().with_only_columns(table.c.abbreviation, table.c.team_id)
        )
        return {abbr: team_id for abbr, team_id in result if abbr is not None}
