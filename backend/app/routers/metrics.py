"""Metrics endpoint — serves the canonical metric registry.

The registry (``app.metrics.REGISTRY``) is the single source of truth for metric
metadata. The frontend fetches this once and caches it, so labels, formats, and
aggregation behaviour live in one place.

It also carries each metric's **availability** (M8) — which seasons actually have data
behind it. Project scope reaches back to 1999, but charted passing data starts in 2006,
snap counts in 2013 and routes in 2016, and 2003–2005 has no targets at all. The UI
uses this to grey out a metric for a season that cannot support it, and to say why,
instead of rendering an empty column and looking broken.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.metrics import REGISTRY, MetricDef

router = APIRouter(prefix="/metrics", tags=["metrics"])


def _data_ceilings(db: Session, columns: set[str]) -> dict[str, int | None]:
    """The newest season each column still has data in.

    For feeds that have *stopped* — routes come from a participation file nflverse no
    longer publishes — the end of the window is a fact about the data, not a year
    anyone should be hardcoding. Reading it back means the registry stays correct if
    the feed resumes, and equally if it never does.
    """
    ceilings: dict[str, int | None] = {}
    for column in sorted(columns):
        # The column name comes from the registry, never from a request.
        ceilings[column] = db.execute(
            text(
                f"SELECT MAX(season) FROM player_stats WHERE {column} IS NOT NULL"  # noqa: S608
            )
        ).scalar()
    return ceilings


@router.get("")
def list_metrics(db: Session = Depends(get_db)) -> dict:
    """Return every metric definition in the registry."""
    metrics: list[MetricDef] = REGISTRY

    wanted = {
        metric.availability.data_ceiling_column
        for metric in metrics
        if metric.availability and metric.availability.data_ceiling_column
    }
    ceilings = _data_ceilings(db, wanted) if wanted else {}

    payload = []
    for metric in metrics:
        record = metric.model_dump()
        availability = record.get("availability")
        column = availability and availability.get("data_ceiling_column")
        if column and availability.get("last_season") is None:
            availability["last_season"] = ceilings.get(column)
        payload.append(record)

    return {"data": payload, "total": len(payload)}
