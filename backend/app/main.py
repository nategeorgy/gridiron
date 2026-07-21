"""FastAPI application entry point for the GridironIQ API."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import health, metrics, players, stats, teams

API_V1_PREFIX = "/api/v1"

app = FastAPI(
    title="GridironIQ API",
    version="0.1.0",
    description="Advanced NFL analytics API.",
)

# Allowed origins come from settings: localhost in dev, the deployed frontend
# URL(s) in production (set via the CORS_ORIGINS environment variable).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix=API_V1_PREFIX)
app.include_router(players.router, prefix=API_V1_PREFIX)
app.include_router(teams.router, prefix=API_V1_PREFIX)
app.include_router(stats.router, prefix=API_V1_PREFIX)
app.include_router(metrics.router, prefix=API_V1_PREFIX)


@app.get("/")
def root() -> dict[str, str]:
    """Root endpoint pointing clients at the API docs."""
    return {"service": "GridironIQ API", "docs": "/docs", "api": API_V1_PREFIX}
