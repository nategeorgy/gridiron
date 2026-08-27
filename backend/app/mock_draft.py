"""Grading a finished mock draft (M9).

**The draft itself does not happen here.** The room runs client-side — a mock is ~150
picks with nothing to cheat at, and a round trip per pick would make it feel like a
form rather than a draft. What the server owns is the part the browser cannot do
honestly: valuing the rosters that came out of it, in the user's scoring and league.

**Graded on expected points, not actual**, for the M6.1 reason. A draft graded on last
season's results rewards whoever drafted the most touchdown luck, which is precisely
the advice this product exists not to give.

Two different questions get two different measures, and conflating them is the easy
mistake:

* **Who to start** is a points question — you start the player who scores most, not
  the one who beats their position's replacement by most.
* **Who won the draft** is a value question — a quarterback scoring 22 a game in a
  one-quarterback league has bought you less than a tight end scoring 14, because of
  what you could have had instead.

So the lineup is filled by expected *points* and then scored by expected *VORP*.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.intelligence import Window, build_intelligence
from app.league import FLEX_ELIGIBLE, LeagueConfig
from app.rankings import player_identity
from app.scoring import ScoringConfig

# Slots in the order they are filled. Dedicated slots first, then the flexes, because
# a flex can take what a dedicated slot cannot and filling it early would strand a
# starter on the bench.
SUPERFLEX_ELIGIBLE: tuple[str, ...] = ("QB", *FLEX_ELIGIBLE)


@dataclass
class Slot:
    """One starting-lineup slot and the positions that may fill it."""

    label: str
    eligible: tuple[str, ...]


def lineup_slots(league: LeagueConfig) -> list[Slot]:
    """The league's starting lineup, expanded into individual slots."""
    slots: list[Slot] = []
    for count, position in (
        (league.qb, "QB"), (league.rb, "RB"), (league.wr, "WR"), (league.te, "TE")
    ):
        slots.extend(Slot(position, (position,)) for _ in range(count))
    slots.extend(Slot("FLEX", FLEX_ELIGIBLE) for _ in range(league.flex))
    slots.extend(Slot("SUPERFLEX", SUPERFLEX_ELIGIBLE) for _ in range(league.superflex))
    return slots


def fill_lineup(roster: list[dict], league: LeagueConfig) -> tuple[list[dict], list[dict]]:
    """Split a roster into (starters, bench).

    Greedy by expected points within each slot, dedicated slots before flexes. Greedy
    is not merely an approximation here — filling dedicated slots first and flexes
    from what remains is exactly what a manager does on Sunday morning.
    """
    remaining = sorted(
        roster, key=lambda row: row.get("expected_fantasy_ppg") or 0.0, reverse=True
    )
    starters: list[dict] = []

    for slot in lineup_slots(league):
        for candidate in remaining:
            if candidate["position"] in slot.eligible:
                starters.append({**candidate, "slot": slot.label})
                remaining.remove(candidate)
                break

    return starters, remaining


def grade_rosters(
    db: Session,
    window: Window,
    config: ScoringConfig,
    league: LeagueConfig,
    rosters: dict[int, list[str]],
    min_games: int | None = None,
) -> tuple[list[dict], dict]:
    """Value every team in a finished mock. Returns ``(teams, context)``.

    ``rosters`` maps a 1-based draft slot to the player ids that team drafted.

    A player we cannot value — a rookie, or someone with too few games — scores zero
    rather than being imputed to replacement level. Imputing would turn "we have no
    information about this pick" into "this pick was worth exactly the waiver wire",
    which is a claim, and on a rookie-heavy roster it would be the whole grade. Each
    team's count of unvalued picks travels with its score so the number can be read
    with that in mind.
    """
    stat_rows, context = build_intelligence(db, window, config, league, min_games=min_games)
    valuation = {record["player_id"]: record for record in stat_rows}

    # Identity comes from `players`, not from the valuation. A drafted rookie has no
    # stat row at all, and a grade that showed a blank where his name should be would
    # read as a bug rather than as "we cannot value this pick yet".
    drafted = [player_id for roster in rosters.values() for player_id in roster]
    identity = player_identity(db, drafted)

    teams: list[dict] = []
    for slot, player_ids in sorted(rosters.items()):
        roster: list[dict] = []
        unvalued = 0
        for player_id in player_ids:
            record = valuation.get(player_id)
            qualified = bool(record and record.get("qualified"))
            if not qualified:
                unvalued += 1
            named = identity.get(player_id, {})
            roster.append({
                "player_id": player_id,
                "name": named.get("name") or (record.get("name") if record else None),
                "position": named.get("position")
                or (record.get("position") if record else None)
                or "",
                "team_abbreviation": named.get("team_abbreviation"),
                "expected_fantasy_ppg": record.get("expected_fantasy_ppg") if qualified else 0.0,
                "expected_vorp_ppg": record.get("expected_vorp_ppg") if qualified else None,
                "fantasy_ppg": record.get("fantasy_ppg") if qualified else None,
                "valued": qualified,
            })

        starters, bench = fill_lineup(roster, league)
        starter_value = sum(player["expected_vorp_ppg"] or 0.0 for player in starters)
        # Only positive bench VORP counts as depth: a bench player who is below
        # replacement is not a liability, he is simply someone you would not start.
        bench_depth = sum(
            value for player in bench
            if (value := player["expected_vorp_ppg"] or 0.0) > 0
        )

        by_position: dict[str, float] = {}
        for player in starters:
            by_position[player["position"]] = round(
                by_position.get(player["position"], 0.0)
                + (player["expected_vorp_ppg"] or 0.0),
                2,
            )

        teams.append({
            "draft_slot": slot,
            "expected_vorp": round(starter_value, 2),
            "bench_depth": round(bench_depth, 2),
            "unvalued_picks": unvalued,
            "starters": starters,
            "bench": bench,
            "by_position": by_position,
        })

    for rank, team in enumerate(
        sorted(teams, key=lambda team: team["expected_vorp"], reverse=True), start=1
    ):
        team["rank"] = rank
    teams.sort(key=lambda team: team["draft_slot"])

    return teams, {
        "min_games": context.get("min_games"),
        "replacement": context.get("replacement"),
        "lineup": [slot.label for slot in lineup_slots(league)],
    }


def grade_picks(
    picks: list[dict], board_ranks: dict[str, int], teams: list[dict]
) -> list[dict]:
    """Annotate each pick with how it compared to the board it was drafted from.

    ``value`` is ``pick_number - board_rank``: positive means the player was still
    there later than the board said they should be, i.e. a steal. It is stated against
    *the board the bots used*, because that is the market this draft actually had —
    grading a pick against a board nobody in the room was reading would measure
    nothing.
    """
    valued: dict[str, dict] = {
        player["player_id"]: player
        for team in teams
        for player in (*team["starters"], *team["bench"])
    }

    annotated: list[dict] = []
    for pick in picks:
        player_id = pick["player_id"]
        board_rank = board_ranks.get(player_id)
        record = valued.get(player_id, {})
        annotated.append({
            **pick,
            "name": record.get("name"),
            "position": record.get("position"),
            "board_rank": board_rank,
            "value": (pick["pick_number"] - board_rank) if board_rank else None,
            "expected_vorp_ppg": record.get("expected_vorp_ppg"),
        })
    return annotated
