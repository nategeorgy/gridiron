"""Ingest head coaches and coordinators from data/staff/team_staff.csv.

No feed publishes coordinators, and the schedule feed's head coach field was wrong for
three of 2026's ten head coach changes (it carried the old coach forward), so the staff
is kept by hand in a CSV: one row per person per role per team season, in order, with an
optional note ("fired after Week 10", "interim"). It was seeded from Wikipedia's season
pages for 2022-2026. Add a season's rows each offseason, and a midseason change as a
second row with ``order`` 2.

A role with no row means nobody held the title, which usually means the head coach
called it; the page says "None listed" rather than guessing.

Replaces each team season it contains (the file is the whole truth for those seasons).
"""

import csv
import logging
from collections import defaultdict
from pathlib import Path

from db import load_team_id_map, replace_scoped

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("pipeline.staff")

STAFF_CSV = Path(__file__).parent / "data" / "staff" / "team_staff.csv"
ROLES = {"hc": "head_coach", "oc": "offensive_coordinator", "dc": "defensive_coordinator"}


def ingest_staff(path: Path = STAFF_CSV) -> int:
    """Load the staff CSV into team_staff. Returns rows written."""
    team_ids = load_team_id_map()
    staff: dict[tuple[int, int], dict[str, list]] = defaultdict(lambda: {column: [] for column in ROLES.values()})
    with path.open(newline="") as handle:
        for row in sorted(csv.DictReader(handle), key=lambda r: int(r["order"])):
            team_id = team_ids.get(row["team"])
            if team_id is None:
                logger.warning("unknown team %r in %s; skipped", row["team"], path.name)
                continue
            staff[(team_id, int(row["season"]))][ROLES[row["role"]]].append([row["name"], row["note"] or None])
    rows = [{"team_id": team, "season": season, **{k: (v or None) for k, v in roles.items()}}
            for (team, season), roles in staff.items()]
    return replace_scoped("team_staff", rows, scope_columns=["team_id", "season"])


if __name__ == "__main__":
    ingest_staff()
