"""Reading an uploaded ranking board (M9) — parse the CSV, match the names.

The format is deliberately **strict**: `rank, player, position` required, `team` and
`tier` optional, header row mandatory, column order free. No sniffing, no paste box.
Column-guessing is where an importer silently produces a board that is subtly not what
the user uploaded, and a wrong cheat sheet is worse than a rejected file. The same
format is documented for the expert-board drop folder in
`pipeline/data/rankings/README.md`.

**Names are matched, never guessed.** A row that cannot be resolved to exactly one
player is returned to the caller with its rank and the reason — unknown, or ambiguous
between several — rather than dropped. A board that quietly lost its third-round pick
to a nickname should show that, not a hole.

The hard case is real: `players` holds four Mike Williamses at receiver. Resolution
runs name → position → team → who has played most recently, and gives up honestly
rather than picking one.
"""

from __future__ import annotations

import csv
import io
import re
import unicodedata
from dataclasses import dataclass, field

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Player, PlayerStats, Team

SCOPE_POSITIONS: frozenset[str] = frozenset({"QB", "RB", "WR", "TE"})

REQUIRED_COLUMNS: tuple[str, ...] = ("rank", "player", "position")
OPTIONAL_COLUMNS: tuple[str, ...] = ("team", "tier")

# A board is a draft board, not a phone book. Well above any real cheat sheet, low
# enough that a mis-uploaded spreadsheet fails fast.
MAX_ROWS = 800

# Suffixes that appear on one source and not another, which is exactly the kind of
# difference that should not decide whether a player is found.
_SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}
_PUNCTUATION = re.compile(r"[^a-z0-9\s]")
_WHITESPACE = re.compile(r"\s+")


def normalize_name(value: str) -> str:
    """Fold a name to the form two sources will agree on.

    Accents stripped, punctuation removed, generational suffixes dropped, whitespace
    collapsed: ``D.K. Metcalf`` and ``DK Metcalf`` land on the same key, as do
    ``Marvin Harrison Jr.`` and ``Marvin Harrison``.
    """
    folded = unicodedata.normalize("NFKD", value or "")
    folded = "".join(char for char in folded if not unicodedata.combining(char))
    folded = _PUNCTUATION.sub(" ", folded.lower())
    parts = [part for part in _WHITESPACE.split(folded) if part and part not in _SUFFIXES]
    return " ".join(parts)


@dataclass
class ParsedRow:
    """One row as the file stated it, before any matching."""

    rank: int
    name: str
    position: str
    team: str | None
    tier: int | None
    line_number: int


@dataclass
class Unmatched:
    """A row we refused to guess at, with why."""

    rank: int
    name: str
    position: str
    team: str | None
    reason: str  # 'unknown' | 'ambiguous'


@dataclass
class ImportResult:
    """What an upload produced: the board, plus an honest account of the rest."""

    entries: list[dict] = field(default_factory=list)
    unmatched: list[Unmatched] = field(default_factory=list)
    out_of_scope: int = 0
    total_rows: int = 0


class ImportError_(ValueError):
    """A file we will not read at all — bad header, no rows, unusable ranks."""


def parse_csv(content: str) -> list[ParsedRow]:
    """Parse the strict template into rows. Raises ``ImportError_`` on a bad file.

    Ranks are taken as *ordering*, not as gospel: gaps are fine and ties break on file
    order, because the board is re-densified on save. What is not fine is a rank that
    is not a number, since that means the column is not the column we think it is.
    """
    reader = csv.DictReader(io.StringIO(content))
    if reader.fieldnames is None:
        raise ImportError_("The file is empty.")

    headers = {(name or "").strip().lower(): (name or "") for name in reader.fieldnames}
    missing = [column for column in REQUIRED_COLUMNS if column not in headers]
    if missing:
        raise ImportError_(
            f"Missing required column(s): {', '.join(missing)}. "
            f"The header must include {', '.join(REQUIRED_COLUMNS)}."
        )

    def cell(row: dict, column: str) -> str:
        return (row.get(headers.get(column, ""), "") or "").strip()

    rows: list[ParsedRow] = []
    for line_number, raw in enumerate(reader, start=2):  # line 1 is the header
        name = cell(raw, "player")
        if not name:
            continue
        rank_text = cell(raw, "rank")
        try:
            rank = int(float(rank_text))
        except ValueError as exc:
            raise ImportError_(
                f"Line {line_number}: '{rank_text}' is not a rank. "
                "The rank column must be a number."
            ) from exc

        tier_text = cell(raw, "tier")
        try:
            tier = int(float(tier_text)) if tier_text else None
        except ValueError:
            tier = None

        rows.append(
            ParsedRow(
                rank=rank,
                name=name,
                position=cell(raw, "position").upper(),
                team=(cell(raw, "team").upper() or None),
                tier=tier,
                line_number=line_number,
            )
        )

    if not rows:
        raise ImportError_("The file has a header but no rows.")
    if len(rows) > MAX_ROWS:
        raise ImportError_(f"That is {len(rows)} rows; the limit is {MAX_ROWS}.")
    return rows


def _match_index(db: Session) -> dict[tuple[str, str], list[dict]]:
    """Every in-scope player, keyed by (normalised name, position).

    Carries the team and the last season each player recorded a stat line, which is
    what separates the current Mike Williams from the three who came before him.
    """
    last_season = (
        select(PlayerStats.player_id, func.max(PlayerStats.season).label("last_season"))
        .group_by(PlayerStats.player_id)
        .subquery()
    )
    rows = db.execute(
        select(
            Player.player_id,
            Player.name,
            Player.position,
            Player.status,
            Team.abbreviation.label("team_abbreviation"),
            last_season.c.last_season,
        )
        .outerjoin(Team, Player.team_id == Team.team_id)
        .outerjoin(last_season, last_season.c.player_id == Player.player_id)
        .where(Player.position.in_(SCOPE_POSITIONS))
    ).mappings().all()

    index: dict[tuple[str, str], list[dict]] = {}
    for row in rows:
        key = (normalize_name(row["name"]), row["position"])
        index.setdefault(key, []).append(dict(row))
    return index


def _resolve(candidates: list[dict], team: str | None) -> dict | None:
    """Narrow a name collision to one player, or None if it genuinely cannot be.

    Team first, since that is what the uploader actually told us. Then recency: a
    board published this August is about the player who is currently playing, and a
    2011 namesake is not a real ambiguity. Only a tie between two *current* players
    is unresolvable, and that is reported rather than guessed.
    """
    if len(candidates) == 1:
        return candidates[0]

    if team:
        on_team = [row for row in candidates if row["team_abbreviation"] == team]
        if len(on_team) == 1:
            return on_team[0]
        if on_team:
            candidates = on_team

    seasons = [row["last_season"] for row in candidates if row["last_season"] is not None]
    if seasons:
        newest = max(seasons)
        recent = [row for row in candidates if row["last_season"] == newest]
        if len(recent) == 1:
            return recent[0]
        candidates = recent

    active = [row for row in candidates if row["status"] == "ACT"]
    if len(active) == 1:
        return active[0]
    return None


def match_players(db: Session, rows: list[ParsedRow]) -> ImportResult:
    """Resolve parsed rows to player ids, densifying rank in file order.

    Out-of-scope positions (K, DST, IDP) are counted and dropped rather than reported
    as failures — the product holds no data for them, and an uploader who included
    their kickers has not made a mistake.
    """
    index = _match_index(db)
    result = ImportResult(total_rows=len(rows))
    seen: set[str] = set()

    for row in sorted(rows, key=lambda parsed: (parsed.rank, parsed.line_number)):
        if row.position not in SCOPE_POSITIONS:
            result.out_of_scope += 1
            continue

        candidates = index.get((normalize_name(row.name), row.position), [])
        if not candidates:
            result.unmatched.append(
                Unmatched(row.rank, row.name, row.position, row.team, "unknown")
            )
            continue

        player = _resolve(candidates, row.team)
        if player is None:
            result.unmatched.append(
                Unmatched(row.rank, row.name, row.position, row.team, "ambiguous")
            )
            continue
        if player["player_id"] in seen:
            continue  # the same player listed twice keeps their better rank
        seen.add(player["player_id"])

        result.entries.append({
            "player_id": player["player_id"],
            "rank": len(result.entries) + 1,  # densified in file order
            "tier": row.tier,
            "note": None,
        })

    return result
