"""Player response schemas."""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, computed_field

from app.utils.dates import age_in_years


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


class DepthChartSlot(BaseModel):
    """Where a player currently sits on their team's depth chart (M6.2).

    Carries its own ``as_of``: this is the most perishable thing on a player page, and
    a depth-chart position with no date on it is a claim with no shelf life.
    """

    team_abbreviation: str | None = None
    pos_abb: str
    pos_rank: int | None = None
    season: int
    as_of: datetime | None = None


class PlayerDetailOut(PlayerOut):
    """One player's full record, including the M6 roster-bio columns.

    Separate from ``PlayerOut`` on purpose: search returns many rows at a time and has
    no use for a college or a draft slot, while the profile page and the draft board
    do. Age is derived here rather than stored — it is the only thing anyone actually
    reads a birth date for, and a stored age is wrong the day after it is written.
    """

    birth_date: date | None = None
    height: int | None = None
    weight: int | None = None
    college_name: str | None = None
    college_conference: str | None = None
    draft_year: int | None = None
    draft_round: int | None = None
    draft_pick: int | None = None
    draft_team: str | None = None
    rookie_season: int | None = None
    years_of_experience: int | None = None
    depth_chart: DepthChartSlot | None = None

    @computed_field
    @property
    def age(self) -> float | None:
        """Age in years to one decimal, or None without a birth date."""
        return age_in_years(self.birth_date)
