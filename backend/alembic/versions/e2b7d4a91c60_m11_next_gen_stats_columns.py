"""M11: Next Gen Stats columns on player_stats

The NFL's Next Gen Stats are player-tracking derivatives — separation, cushion, time
to throw, yards over expected — computed from the chips in the ball and the shoulder
pads. The official NGS API (docs.ngs.nfl.com) is a credentialed club/partner portal
with no open signup, and the licensed resale path is enterprise-priced. **Neither is
needed.** nflverse scrapes the public NGS site weekly and publishes the aggregates to
GitHub releases under MIT, which ``nflreadpy.load_nextgen_stats`` reads — the same
library every other feed in this pipeline already comes from.

**Twenty-three columns, all FLOAT, all prefixed ``ngs_``.** The prefix is not
decoration: NGS publishes its own CPOE and its own average depth of target, and those
are *different numbers* from the ``cpoe`` and ``adot`` this table already holds, which
are computed from nflverse play-by-play. Two columns named ``cpoe`` sourced from two
models would be a permanent invitation to compare them by accident. The phase prefix
(``ngs_pass_`` / ``ngs_rec_`` / ``ngs_rush_``) follows ffopportunity's own convention
and disambiguates the two ``intended_air_yards`` — one is thrown by a quarterback, the
other caught by a receiver.

**Three facts about this feed that shape everything downstream:**

1. **It starts in 2016.** Sixteen seasons of project scope have no NGS at all, which is
   why both availability tables gain an entry in the same change. Below 2016 the
   columns are NULL, not zero.
2. **It only covers *qualified* players.** In 2025 that is 65 quarterbacks, 212 WR/TE
   and 80 RB/FB — a median of 65 receivers in a week where 200+ take a snap. NGS also
   files running backs under rushing only and receivers under receiving only, so a
   pass-catching back has no NGS receiving line. Most rows in this table will hold
   NULL in these columns even inside the window, and that is the feed's shape rather
   than a failed ingest.
3. **Every ``avg_*`` column is already a per-week mean**, so summing is meaningless and
   averaging flat repeats the CPOE bug fixed in 062e97d — a three-target game would
   count as much as a twelve-target one. Each of these lands in the registry with a
   ``weight_by`` (targets, receptions, attempts or carries). The four genuine totals —
   expected rush yards and rush yards over expected — are stored as sums.

No RLS clause here: ``player_stats`` is an NFL reference table, and adding columns does
not change the enablement that 69b660509e58 already applied to it.

Revision ID: e2b7d4a91c60
Revises: c4e1a72b9f30
Create Date: 2026-09-01 10:14:52.117430

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e2b7d4a91c60"
down_revision: Union[str, None] = "c4e1a72b9f30"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Every NGS column is a FLOAT: even the counting-flavoured ones (expected rush yards)
# arrive as model output with decimals.
NGS_COLUMNS: tuple[str, ...] = (
    # --- Passing (QB), weighted by attempts ---
    "ngs_pass_time_to_throw",
    "ngs_pass_completed_air_yards",
    "ngs_pass_intended_air_yards",
    "ngs_pass_air_yards_differential",
    "ngs_pass_aggressiveness",
    "ngs_pass_air_yards_to_sticks",
    "ngs_pass_expected_completion_pct",
    "ngs_pass_completion_pct_above_expectation",
    # --- Receiving (WR/TE), weighted by targets or receptions ---
    "ngs_rec_cushion",
    "ngs_rec_separation",
    "ngs_rec_intended_air_yards",
    "ngs_rec_pct_share_intended_air_yards",
    "ngs_rec_catch_pct",
    "ngs_rec_yac",
    "ngs_rec_expected_yac",
    "ngs_rec_yac_above_expectation",
    # --- Rushing (RB/FB), weighted by carries, except the two totals ---
    "ngs_rush_efficiency",
    "ngs_rush_time_to_los",
    "ngs_rush_pct_attempts_eight_defenders",
    "ngs_rush_expected_yards",
    "ngs_rush_yards_over_expected",
    "ngs_rush_yards_over_expected_per_att",
    "ngs_rush_pct_over_expected",
)


def upgrade() -> None:
    for column in NGS_COLUMNS:
        op.add_column("player_stats", sa.Column(column, sa.Float(), nullable=True))


def downgrade() -> None:
    for column in reversed(NGS_COLUMNS):
        op.drop_column("player_stats", column)
