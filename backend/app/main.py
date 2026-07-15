"""FastAPI application entry point for the GridironIQ API."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import health, players, stats, teams

API_V1_PREFIX = "/api/v1"

app = FastAPI(
    title="GridironIQ API",
    version="0.1.0",
    description="Advanced NFL analytics API.",
)

# The React dev server (Vite) runs on localhost:5173 during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix=API_V1_PREFIX)
app.include_router(players.router, prefix=API_V1_PREFIX)
app.include_router(teams.router, prefix=API_V1_PREFIX)
app.include_router(stats.router, prefix=API_V1_PREFIX)


@app.get("/")
def root() -> dict[str, str]:
    """Root endpoint pointing clients at the API docs."""
    return {"service": "GridironIQ API", "docs": "/docs", "api": API_V1_PREFIX}
