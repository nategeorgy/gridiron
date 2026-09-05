"""Leaderboard rebuild: first downs, sacks, and Pro Football Reference advanced stats

Nineteen stored columns from three feeds, added together because the leaderboard
rebuild needs all of them and they share one availability story: each has a floor, and
none of them reaches 1999 except the ones that were in `load_player_stats` all along.

## 1. Five columns that were free the whole time (1999+)

`passing_first_downs`, `rushing_first_downs`, `receiving_first_downs`,
`sacks_suffered` and `sack_fumbles_lost` come from `load_player_stats` — the same file
`ingest_stats.py` has downloaded on every run since the first milestone. They were
simply never read. Note what this retires: CLAUDE.md has claimed since M10 that "no
free feed publishes [sacks] per player", which is why `epa_per_play` divides by
attempts + carries rather than dropbacks. That claim was wrong.

First downs matter to a fantasy site beyond curiosity — a growing minority of leagues
score them (0.5 PPFD), and a first down is a better read on whether a target *mattered*
than yardage alone.

## 2. Four expected columns from a feed already downloaded (2009+)

`passing_first_downs_exp`, `rushing_first_downs_exp`, `receiving_first_downs_exp` and
`completions_exp` come from `load_ff_opportunity`, which publishes 159 columns and from
which we have been taking twelve. They take the **2009** floor of the rest of the
expected family rather than the model's own 2006 start — the existing rule, and for
the existing reason: nothing consumes an expected component alone, and a sum treats a
missing part as zero.

## 3. Ten columns from Pro Football Reference advanced stats (2018+)

A genuinely new feed (`load_pfr_advstats`), and the only source here for what a
defender did to the play: pressure and blitz counts, yards before and after contact,
broken tackles, and drops. Its coverage is *broader* than Next Gen Stats — 497
receivers and 335 backs in 2024 against NGS's 212 and 80 — but it starts two seasons
later, and it keys on `pfr_player_id`, so the ingest reuses the crosswalk
`ingest_usage.py` already builds for snap counts.

Percentages from this feed arrive as 0-1 fractions (`times_pressured_pct` is 0.367 for
36.7%), which already matches how every share in this database is stored — unlike NGS,
where half the percentages arrive 0-100 and are divided at ingest. Measured before it
was written, not assumed.

Three rates are deliberately **not** stored — yards before/after contact per attempt,
and drop rate. PFR publishes its own averages, but a stored per-game rate has to be
re-derived to aggregate correctly anyway (see 062e97d), so they are registry `derived`
metrics dividing the stored totals by our own carries and targets.

No RLS clause: `player_stats` is an NFL reference table and adding columns does not
change the enablement 69b660509e58 applied.

Revision ID: a91f3c5e7d02
Revises: b3f81a5c2d47
Create Date: 2026-09-03 09:22:41.883104

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a91f3c5e7d02"
down_revision: Union[str, None] = "b3f81a5c2d47"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (column, type) — counts are INTEGER, model output and rates are FLOAT.
COLUMNS: tuple[tuple[str, sa.types.TypeEngine], ...] = (
    # load_player_stats, 1999+
    ("passing_first_downs", sa.Integer()),
    ("rushing_first_downs", sa.Integer()),
    ("receiving_first_downs", sa.Integer()),
    ("sacks_suffered", sa.Integer()),
    ("sack_fumbles_lost", sa.Integer()),
    # load_ff_opportunity, 2009+
    ("passing_first_downs_exp", sa.Float()),
    ("rushing_first_downs_exp", sa.Float()),
    ("receiving_first_downs_exp", sa.Float()),
    ("completions_exp", sa.Float()),
    # load_pfr_advstats, 2018+
    ("pressure_rate", sa.Float()),
    ("times_blitzed", sa.Integer()),
    ("bad_throw_rate", sa.Float()),
    ("drops_by_receivers", sa.Integer()),
    ("rush_yards_before_contact", sa.Integer()),
    ("rush_yards_after_contact", sa.Integer()),
    ("rush_broken_tackles", sa.Integer()),
    ("receiving_drops", sa.Integer()),
    ("rec_broken_tackles", sa.Integer()),
    ("passer_rating_when_targeted", sa.Float()),
)


def upgrade() -> None:
    for name, type_ in COLUMNS:
        op.add_column("player_stats", sa.Column(name, type_, nullable=True))


def downgrade() -> None:
    for name, _ in reversed(COLUMNS):
        op.drop_column("player_stats", name)
