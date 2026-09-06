"""Database engine, session factory, and FastAPI dependency."""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings

# ⚠️ The pool is bounded deliberately. SQLAlchemy defaults to pool_size=5 with
# max_overflow=10, so a single instance can hold **fifteen** connections — and this
# database is behind Supabase's session-mode pooler on the free plan, where that is a
# large share of what exists. A build competing with the running instance for one spare
# connection is what killed the migration attempt in 5d111be:
#
#   FATAL: (ECHECKOUTTIMEOUT) unable to check out connection from the pool
#          after 15000ms in Session mode
#
# Five is ample for this workload — every endpoint holds one connection for one
# request — and it leaves headroom for the pipeline and for migrations. `pool_recycle`
# is set because Supavisor closes idle connections server-side, and a pool holding one
# it thinks is alive produces an error on the *next* request rather than this one.
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=3,
    max_overflow=2,
    pool_recycle=1800,
    pool_timeout=30,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """Yield a database session and ensure it is closed after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
