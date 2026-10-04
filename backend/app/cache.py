"""An in-process cache for query-time engine results, invalidated by the data itself.

Why it exists
-------------
Nothing the scoring engine produces is stored (the M3 stance), so every Insight board,
player page and draft page used to rebuild the same position pools from ``player_stats``
on every request. On Supabase's smallest instance that table does not fit in memory, so
each rebuild is disk IO, and in September 2026 it exhausted the project's Disk IO budget.
The inputs only change when something writes to the NFL tables, which is at most daily,
so almost every one of those rebuilds recomputed an answer the process already had.

How it stays correct
--------------------
Every entry is keyed on a **data version** as well as its arguments: the insert, update
and delete counters Postgres keeps for the NFL tables (``pg_stat_user_tables``). A write
by the scheduled pipeline, a migration, or a hand-loaded routes file moves them, so the
next request misses and recomputes. There is no TTL to tune and no ingest-side hook to
remember. A writing session's counters become visible to others within seconds of its
commit. ``MAX_AGE_SECONDS`` is a backstop for what the counters cannot promise: a
``TRUNCATE`` (which they do not count, and nothing here issues today), or a stats reset
that happens to land the counters back on a version still held.

⚠️ **Only for results that contain no user data.** A key never names a user, so anything
that depends on who is asking (a watchlist, a private ranking board) must be applied
*after* the cached value is read, never inside the computation.

⚠️ **The cached value is shared between requests.** A caller that modifies what it gets
back must copy it first; see ``build_intelligence`` for the pattern.

⚠️ **Disabled when ``ENVIRONMENT=test``.** Each test runs inside a transaction that is
rolled back, so its fixture rows never reach the counters, and one test's cached pools
would be served to the next. ``tests/test_engine_cache.py`` switches it back on to test
the cache itself.
"""

from __future__ import annotations

import functools
import threading
import time
from collections import OrderedDict
from collections.abc import Callable, Hashable
from typing import Generic, TypeVar

from fastapi import Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings

T = TypeVar("T")

# The tables the cached computations read. Account tables are deliberately absent: a
# user starring a player must not throw away every pool in the process.
DATA_TABLES = ("player_stats", "players", "teams", "games", "team_game_stats", "team_personnel",
               "team_personnel_season", "team_staff", "play_targets", "player_run_lanes")

# Backstop only. Correctness comes from the data version.
MAX_AGE_SECONDS = 60 * 60

# How long a request waits for another request already computing the same entry before
# computing it itself, as every request did before entries were shared. A backstop
# against a computation that never returns, not a tuning knob: on a starved database a
# cold Insight board can take minutes, and waiting out the one already running is still
# cheaper than starting a second beside it.
WAIT_SECONDS = 5 * 60

# Read at call time rather than bound at import, so a test can switch it on.
ENABLED = settings.environment != "test"

_VERSION_SQL = text(
    """
    SELECT coalesce(sum(n_tup_ins + n_tup_upd + n_tup_del), 0)
    FROM pg_stat_user_tables
    WHERE schemaname = 'public' AND relname = ANY(:tables)
    """
)


def data_version(db: Session) -> int:
    """A number that changes whenever the NFL tables are written to.

    Read once per session (so once per request) and remembered on ``Session.info``:
    several cached calls in one request should agree on the version they are keyed to.
    The probe reads shared-memory statistics, not table pages, so it costs no disk IO.
    """
    if "data_version" not in db.info:
        db.info["data_version"] = int(
            db.execute(_VERSION_SQL, {"tables": list(DATA_TABLES)}).scalar_one()
        )
    return db.info["data_version"]


class _InFlight:
    """One computation of an entry, which other requests for the same entry wait on."""

    __slots__ = ("done", "owner", "value", "error")

    def __init__(self) -> None:
        self.done = threading.Event()
        self.owner = threading.get_ident()
        self.value = None
        self.error: BaseException | None = None


class VersionedCache(Generic[T]):
    """A bounded LRU of computed values, each valid for one data version.

    Entries left behind by an older version are never served again; they fall out of
    the LRU as new ones arrive, so memory stays bounded by ``max_entries`` either way.

    **Requests missing the same entry at once share one computation.** The first one
    computes and the rest wait for its answer. They used to all compute: harmless on a
    warm process, but a cold one (every restart, and every time Render's free instance
    wakes from sleep) takes the home page's 23 requests at once, and duplicated work
    doubled what that visit read from the database, ~500 MB against ~250 MB measured in
    October 2026, on an instance whose Disk IO budget had run out. A failure is shared
    too: a request waiting on a computation that raised raises the same error, rather
    than repeating work that is likely to fail the same way. No lock is held while a
    computation runs, and a request never waits on a computation it is itself running.
    """

    def __init__(self, max_entries: int) -> None:
        self._max_entries = max_entries
        self._entries: OrderedDict[Hashable, tuple[float, T]] = OrderedDict()
        self._in_flight: dict[Hashable, _InFlight] = {}
        # FastAPI runs sync endpoints on a thread pool, so requests really do overlap.
        self._lock = threading.Lock()

    def get_or_compute(self, db: Session, key: Hashable, compute: Callable[[], T]) -> T:
        """Return the cached value for ``key`` at the current data version, computing
        and storing it on a miss, or waiting for a request already computing it."""
        if not ENABLED:
            return compute()

        versioned_key = (key, data_version(db))
        with self._lock:
            entry = self._entries.get(versioned_key)
            if entry is not None and time.monotonic() - entry[0] < MAX_AGE_SECONDS:
                self._entries.move_to_end(versioned_key)
                return entry[1]
            flight = self._in_flight.get(versioned_key)
            leading = flight is None
            if leading:
                flight = _InFlight()
                self._in_flight[versioned_key] = flight

        if not leading:
            # A computation calling back into its own entry would wait on itself.
            if flight.owner != threading.get_ident() and flight.done.wait(WAIT_SECONDS):
                if flight.error is not None:
                    raise flight.error
                return flight.value
            # Re-entered, or the computation is stuck: compute alone, as before.
            return self._store(versioned_key, compute())

        try:
            value = compute()
            flight.value = value
            return self._store(versioned_key, value)
        except BaseException as error:
            flight.error = error
            raise
        finally:
            # Stored (or failed) before the waiters wake, so a request arriving now
            # finds the entry rather than starting a computation of its own.
            with self._lock:
                self._in_flight.pop(versioned_key, None)
            flight.done.set()

    def _store(self, versioned_key: Hashable, value: T) -> T:
        with self._lock:
            self._entries[versioned_key] = (time.monotonic(), value)
            self._entries.move_to_end(versioned_key)
            while len(self._entries) > self._max_entries:
                self._entries.popitem(last=False)
        return value

    def clear(self) -> None:
        """Drop every entry. A computation still running finishes and stores its own."""
        with self._lock:
            self._entries.clear()


def cached_response(
    store: VersionedCache[bytes],
) -> Callable[[Callable[..., dict]], Callable[..., Response]]:
    """Serve a GET endpoint from ``store``, keyed on the query string it was sent.

    For endpoints whose whole answer is a function of the URL and the data. The home
    page asks the leaderboard, the scatter and the comparison for the same URLs on every
    visit, and each of those re-aggregated ``player_stats`` from scratch: about 110 MB
    of pages per visit even with every engine cache warm, measured in September 2026.

    The key is the path plus every query parameter as sent, so a parameter added to an
    endpoint later is part of the key without anyone having to remember it. ``store``
    adds the data version, as for every other entry. Two spellings of one request (the
    same parameters in another order are fine, since they are sorted; ``weeks=3,7``
    against ``weeks=7,3`` is not) are two entries: wasted memory, never a wrong answer.

    The endpoint must declare ``request: Request`` and a ``db`` session, and must not
    depend on who is asking. A ``player_ids`` filter passes that test: the ids arrive in
    the query string, so they sit in the key, and the value holds only public stats that
    anyone sending the same URL would be given anyway.

    What is stored is the encoded body, not the dict. Bytes cannot be changed by the
    request that reads them, which settles the copying rule above, and they are several
    times smaller than the dicts they came from. An error the endpoint raises (a 400, a
    404) is never stored, because it never returns a body to store.
    """

    def decorate(endpoint: Callable[..., dict]) -> Callable[..., Response]:
        # functools.wraps matters here: FastAPI reads the endpoint's parameters through
        # __wrapped__, so query parameters and dependencies resolve exactly as before.
        @functools.wraps(endpoint)
        def serve(*args, **kwargs) -> Response:
            request: Request = kwargs["request"]
            key = (request.url.path, tuple(sorted(request.query_params.multi_items())))
            body = store.get_or_compute(
                kwargs["db"],
                key,
                # The same encoding FastAPI would apply to the returned dict, so a hit
                # and a miss send identical bytes.
                lambda: JSONResponse(jsonable_encoder(endpoint(*args, **kwargs))).body,
            )
            return Response(content=body, media_type="application/json")

        return serve

    return decorate
