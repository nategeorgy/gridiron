"""Metrics endpoint — serves the canonical metric registry.

The registry (``app.metrics.REGISTRY``) is the single source of truth for metric
metadata. The frontend fetches this once and caches it, so labels, formats, and
aggregation behaviour live in one place.
"""

from fastapi import APIRouter

from app.metrics import REGISTRY, MetricDef

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("")
def list_metrics() -> dict:
    """Return every metric definition in the registry."""
    metrics: list[MetricDef] = REGISTRY
    return {"data": [metric.model_dump() for metric in metrics], "total": len(metrics)}
