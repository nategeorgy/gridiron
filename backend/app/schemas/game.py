"""Game response schemas."""

from datetime import date, time

from pydantic import BaseModel


class GameOut(BaseModel):
    """One game: the fixture, the result if it has been played, and the market's view.

    ``kickoff_time`` is a naive wall-clock time that always means **Eastern** — the
    timezone nflverse publishes and every scoreboard in the sport quotes. It is None
    before 2000, where the feed carries no kickoff at all.

    ``home_implied`` / ``away_implied`` are derived here rather than stored: they are
    arithmetic on ``spread_line`` and ``total_line``, which always move together.
    """

    game_id: str
    season: int | None = None
    week: int | None = None
    season_type: str | None = None
    game_date: date | None = None
    kickoff_time: time | None = None

    home_team_id: int | None = None
    home_abbreviation: str | None = None
    home_name: str | None = None
    home_score: int | None = None

    away_team_id: int | None = None
    away_abbreviation: str | None = None
    away_name: str | None = None
    away_score: int | None = None

    # None until both scores are in. "played" is not the same as "has a score":
    # a postponed game keeps its fixture row and never gets one.
    played: bool = False
    winner: str | None = None   # home | away | tie

    spread_line: float | None = None
    total_line: float | None = None
    favorite: str | None = None       # the favoured team's abbreviation
    favorite_spread: float | None = None  # always negative, e.g. -3.5
    home_implied: float | None = None
    away_implied: float | None = None

    roof: str | None = None
    surface: str | None = None
    div_game: bool | None = None


class ScoreboardWindow(BaseModel):
    """One week of the two-week home scoreboard."""

    season: int
    week: int
    label: str
    games: list[GameOut]


class ScoreboardOut(BaseModel):
    """The week just played and the week coming up.

    They are usually consecutive weeks of one season. From January to September they
    straddle two — last season's Week 18 beside the coming season's Week 1 — which is
    why each window names its own season rather than the response naming one.
    """

    last: ScoreboardWindow | None = None
    next: ScoreboardWindow | None = None
