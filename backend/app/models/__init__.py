"""SQLAlchemy ORM models.

Importing the model classes here ensures they are all registered on ``Base``
metadata, which Alembic autogeneration relies on.
"""

from app.models.account import Favorite, LeagueProfile, SavedView, User
from app.models.base import Base
from app.models.depth_chart import DepthChartEntry
from app.models.draft import (
    MockDraft,
    MockDraftPick,
    RankingBoard,
    RankingBoardEntry,
)
from app.models.game import Game
from app.models.player import Player
from app.models.player_ranking import PlayerRanking
from app.models.player_stats import PlayerStats
from app.models.player_target_depth import PlayerTargetDepth
from app.models.team import Team

__all__ = [
    "Base",
    "Team",
    "Player",
    "Game",
    "PlayerStats",
    "PlayerRanking",
    "DepthChartEntry",
    "PlayerTargetDepth",
    "User",
    "LeagueProfile",
    "Favorite",
    "SavedView",
    "RankingBoard",
    "RankingBoardEntry",
    "MockDraft",
    "MockDraftPick",
]
