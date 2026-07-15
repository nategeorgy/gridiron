"""Team response schemas."""

from pydantic import BaseModel, ConfigDict


class TeamOut(BaseModel):
    """A team as returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    team_id: int
    name: str | None = None
    abbreviation: str | None = None
    conference: str | None = None
    division: str | None = None
