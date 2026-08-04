"""SQLAlchemy ORM models.

Importing the model classes here ensures they are all registered on ``Base``
metadata, which Alembic autogeneration relies on.
"""

from app.models.base import Base
from app.models.game import Game
from app.models.player import Player
from app.models.player_stats import PlayerStats
from app.models.player_target_depth import PlayerTargetDepth
from app.models.team import Team

__all__ = ["Base", "Team", "Player", "Game", "PlayerStats", "PlayerTargetDepth"]
