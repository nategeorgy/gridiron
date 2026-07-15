"""Shared response schemas and pagination helpers."""

from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    """Standard envelope for list endpoints."""

    data: list[T]
    total: int
    page: int
    limit: int
    offset: int


def paginated(items: list[T], total: int, limit: int, offset: int) -> PaginatedResponse[T]:
    """Build a PaginatedResponse, deriving the 1-based page number."""
    page = (offset // limit) + 1 if limit else 1
    return PaginatedResponse(data=items, total=total, page=page, limit=limit, offset=offset)
