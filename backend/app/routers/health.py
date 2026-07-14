"""Health-check endpoint used to verify the API and database are reachable."""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check(db: Session = Depends(get_db)) -> dict[str, str]:
    """Return API status and confirm the database connection is live."""
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "connected"}
