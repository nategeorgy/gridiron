"""Player response schemas."""

from pydantic import BaseModel, ConfigDict


class PlayerOut(BaseModel):
    """A player in list/search results and on the profile page."""

    model_config = ConfigDict(from_attributes=True)

    player_id: str
    name: str | None = None
    position: str | None = None
    team_id: int | None = None
    team_abbreviation: str | None = None
    jersey_number: int | None = None
    status: str | None = None
    headshot_url: str | None = None
