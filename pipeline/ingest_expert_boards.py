"""Ingest expert ranking boards dropped in as CSVs (M9).

Boards in `data/rankings/` are blended **anonymously** into the GridironIQ Consensus.
Several are paywalled, and the backend's source registry is fail-closed: a source id
that is not explicitly published there can only ever leave the server as one un-named
input to an average. That property is what makes this script safe to run, and it is
worth restating here because the temptation to "just add it to the dropdown" is exactly
what must not happen.

Two guards enforce it from this end:

* the script **refuses to write a source id the API publishes** (`fantasypros`,
  `consensus`), so a mis-named file cannot smuggle a private board onto a public one;
* nothing here writes a label. A source id is an opaque key, never a display name.

**A single expert's rank is stored in `ecr` with no dispersion.** ECR means *expert
consensus rank* and one person is not a consensus, but the column is what every reader
of this table means by "this source's ordering", and inventing a parallel column would
mean every query learning about two. `sd`, `best` and `worst` stay NULL — a single
board genuinely has no spread, and a zero there would claim perfect agreement.

The format is documented in `data/rankings/README.md`, which is also the format the
in-app upload accepts.
"""

import argparse
import csv
import logging
import re
import unicodedata
from pathlib import Path

import nflreadpy as nfl
import polars as pl
from sqlalchemy import text

from db import get_engine, upsert
from seasons import ROSTER, latest_season

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("pipeline.expert_boards")

DATA_DIR = Path(__file__).parent / "data" / "rankings"
SCOPE_POSITIONS = {"QB", "RB", "WR", "TE"}
DRAFT_WEEK = 0
DEFAULT_RANKING_TYPE = "redraft-overall"

# Source ids the API publishes by name. A dropped board may never claim one: doing so
# would either collide with the FantasyPros feed or masquerade as the blend itself.
RESERVED_SOURCES = {"fantasypros", "consensus"}

# `<source-id>_<YYYY-MM-DD>.csv`
FILENAME_PATTERN = re.compile(r"^(?P<source>[a-z0-9][a-z0-9._-]*)_(?P<date>\d{4}-\d{2}-\d{2})$")

_SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}
_PUNCTUATION = re.compile(r"[^a-z0-9\s]")
_WHITESPACE = re.compile(r"\s+")


def normalize_name(value: str) -> str:
    """Fold a name to the form two sources will agree on.

    Mirrors `backend/app/ranking_import.py`. The two live in separate deployables with
    separate dependencies, so the *format* is shared and stated once in the README
    while the code is not — but they must fold names the same way or a board would
    import differently depending on which door it came through.
    """
    folded = unicodedata.normalize("NFKD", value or "")
    folded = "".join(char for char in folded if not unicodedata.combining(char))
    folded = _PUNCTUATION.sub(" ", folded.lower())
    parts = [part for part in _WHITESPACE.split(folded) if part and part not in _SUFFIXES]
    return " ".join(parts)


def _player_index() -> dict[tuple[str, str], list[dict]]:
    """Every in-scope player keyed by (normalised name, position).

    Carries the current team and the last season each player recorded a stat line —
    which is what separates the current Mike Williams from the three before him.
    """
    with get_engine().connect() as connection:
        rows = connection.execute(
            text(
                """
                SELECT p.player_id, p.name, p.position, t.abbreviation AS team,
                       (SELECT MAX(s.season) FROM player_stats s
                         WHERE s.player_id = p.player_id) AS last_season
                  FROM players p
                  LEFT JOIN teams t ON t.team_id = p.team_id
                 WHERE p.position IN ('QB', 'RB', 'WR', 'TE')
                """
            )
        ).mappings().all()

    index: dict[tuple[str, str], list[dict]] = {}
    for row in rows:
        index.setdefault((normalize_name(row["name"]), row["position"]), []).append(dict(row))
    return index


def _resolve(candidates: list[dict], team: str | None) -> dict | None:
    """Narrow a name collision to one player, or None if it genuinely cannot be."""
    if len(candidates) == 1:
        return candidates[0]
    if team:
        on_team = [row for row in candidates if row["team"] == team]
        if len(on_team) == 1:
            return on_team[0]
        if on_team:
            candidates = on_team
    seasons = [row["last_season"] for row in candidates if row["last_season"] is not None]
    if seasons:
        recent = [row for row in candidates if row["last_season"] == max(seasons)]
        if len(recent) == 1:
            return recent[0]
    return None


def _crosswalk_by_name() -> dict[tuple[str, str], str]:
    """FantasyPros' own (merge name, position) -> gsis id map, as a second chance.

    Used only when the local players table has no match: it covers a player whose
    nflverse name differs from the one an expert wrote.
    """
    ids = nfl.load_ff_playerids().filter(pl.col("gsis_id").is_not_null())
    return {
        (normalize_name(str(row["merge_name"])), row["position"]): row["gsis_id"]
        for row in ids.filter(pl.col("merge_name").is_not_null()).iter_rows(named=True)
    }


def parse_board(path: Path) -> list[dict]:
    """Read one CSV in the strict template. Raises ValueError on a bad file."""
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise ValueError(f"{path.name}: the file is empty.")
        headers = {(name or "").strip().lower(): (name or "") for name in reader.fieldnames}
        missing = [column for column in ("rank", "player", "position") if column not in headers]
        if missing:
            raise ValueError(f"{path.name}: missing column(s) {', '.join(missing)}.")

        rows = []
        for line_number, raw in enumerate(reader, start=2):
            def cell(column: str) -> str:
                return (raw.get(headers.get(column, ""), "") or "").strip()

            name = cell("player")
            if not name:
                continue
            try:
                rank = int(float(cell("rank")))
            except ValueError as exc:
                raise ValueError(
                    f"{path.name} line {line_number}: '{cell('rank')}' is not a rank."
                ) from exc
            rows.append({
                "rank": rank,
                "name": name,
                "position": cell("position").upper(),
                "team": cell("team").upper() or None,
                "line_number": line_number,
            })
    if not rows:
        raise ValueError(f"{path.name}: a header but no rows.")
    return rows


def source_and_date(path: Path, source: str | None, as_of: str | None) -> tuple[str, str]:
    """Work out the source id and as-of date, from the filename unless overridden."""
    match = FILENAME_PATTERN.match(path.stem)
    resolved_source = source or (match.group("source") if match else None)
    resolved_date = as_of or (match.group("date") if match else None)
    if not resolved_source or not resolved_date:
        raise ValueError(
            f"{path.name}: name the file <source-id>_<YYYY-MM-DD>.csv, or pass "
            "--source and --as-of."
        )
    if resolved_source in RESERVED_SOURCES:
        raise ValueError(
            f"{path.name}: '{resolved_source}' is a source the API publishes by name. "
            "A dropped board must use an id of its own."
        )
    return resolved_source, resolved_date


def ingest_board(
    path: Path,
    season: int,
    ranking_type: str,
    source: str | None = None,
    as_of: str | None = None,
) -> int:
    """Ingest one CSV board. Returns rows written."""
    resolved_source, scraped_at = source_and_date(path, source, as_of)
    rows = parse_board(path)
    index = _player_index()
    fallback = _crosswalk_by_name()

    written_rows: dict[str, dict] = {}
    unmatched: list[str] = []
    out_of_scope = 0
    rank = 0

    for row in sorted(rows, key=lambda entry: (entry["rank"], entry["line_number"])):
        if row["position"] not in SCOPE_POSITIONS:
            out_of_scope += 1
            continue

        key = (normalize_name(row["name"]), row["position"])
        player = _resolve(index.get(key, []), row["team"])
        player_id = player["player_id"] if player else fallback.get(key)
        if player_id is None:
            unmatched.append(f"#{row['rank']} {row['name']} ({row['position']})")
            continue
        if player_id in written_rows:
            continue  # listed twice; the better rank already won

        rank += 1
        written_rows[player_id] = {
            "player_id": player_id,
            "source": resolved_source,
            "ranking_type": ranking_type,
            "season": season,
            "week": DRAFT_WEEK,
            "scraped_at": scraped_at,
            # The board's own ordering, densified. See the note at the top on why a
            # single expert's rank lives in `ecr` and carries no dispersion.
            "ecr": float(rank),
            "sd": None,
            "best": None,
            "worst": None,
            "rank_delta": None,
            "player_owned_avg": None,
        }

    written = upsert(
        "player_rankings",
        list(written_rows.values()),
        conflict_columns=["player_id", "source", "ranking_type", "season", "week", "scraped_at"],
    )
    logger.info(
        "%s: %d ranked (%d unmatched, %d out of scope) as of %s",
        path.name, written, len(unmatched), out_of_scope, scraped_at,
    )
    if unmatched:
        # Named with their ranks: an unmatched name inside the top 100 is a hole worth
        # fixing by hand, one at the tail is a camp body and does not matter.
        logger.warning("%s: no match for %s", path.name, "; ".join(unmatched[:25]))
    return written


def ingest_all(season: int | None = None, ranking_type: str = DEFAULT_RANKING_TYPE) -> int:
    """Ingest every board in the drop folder. Returns total rows written."""
    season = season or latest_season(ROSTER)
    if not DATA_DIR.exists():
        logger.warning("no drop folder at %s", DATA_DIR)
        return 0

    boards = sorted(
        path for path in DATA_DIR.glob("*.csv") if path.stem.upper() != "TEMPLATE"
    )
    if not boards:
        logger.info("no boards to ingest in %s", DATA_DIR)
        return 0

    total = 0
    for path in boards:
        try:
            total += ingest_board(path, season, ranking_type)
        except ValueError as exc:
            # One malformed file must not stop the rest: these are dropped by hand.
            logger.error("%s", exc)
    logger.info("ingested %d expert-board rows across %d file(s)", total, len(boards))
    return total


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest expert ranking boards from CSV.")
    parser.add_argument("--file", type=Path, default=None, help="One board (default: all).")
    parser.add_argument("--source", default=None, help="Override the source id.")
    parser.add_argument("--as-of", default=None, help="Override the board's date (YYYY-MM-DD).")
    parser.add_argument("--season", type=int, default=None, help="Season the board ranks.")
    parser.add_argument("--ranking-type", default=DEFAULT_RANKING_TYPE)
    args = parser.parse_args()

    target_season = args.season or latest_season(ROSTER)
    if args.file:
        ingest_board(args.file, target_season, args.ranking_type, args.source, args.as_of)
    else:
        ingest_all(target_season, args.ranking_type)
