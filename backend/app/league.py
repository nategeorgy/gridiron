"""League context (M3) — league size and starting lineup.

M1 made fantasy points scoring-aware; this module makes *value* league-aware. A
player's worth depends on what a manager could get instead, and that depends on how
many of each position the league starts. Twelve teams starting three receivers means
the 36th receiver is roughly free; six teams starting two means the 13th already is.

The spec grammar mirrors ``app.scoring``: ``teams[:slot=value,...]``::

    "12"                              12 teams, default lineup
    "10:rb=2,wr=3,flex=2"             10 teams, two flex spots
    "12:superflex=1"                  a superflex (2QB-ish) league

From that we derive one **replacement rank** per position: the ordinal of the last
startable player at that position across the whole league. Flex slots are shared out
among the flex-eligible positions in proportion to how many of each the lineup already
starts, which is what actually happens in practice — a lineup that starts three
receivers and two backs fills its flex with receivers about three-fifths of the time.
Superflex slots are credited to QB, since that is what they are used on.
"""

from __future__ import annotations

from pydantic import BaseModel

# Positions a flex slot can be filled with (a superflex is handled separately).
FLEX_ELIGIBLE: tuple[str, ...] = ("RB", "WR", "TE")

# Starting-lineup slots, mapped to the position they draw from.
LINEUP_SLOTS: dict[str, str] = {"qb": "QB", "rb": "RB", "wr": "WR", "te": "TE"}

DEFAULT_LEAGUE = "12"
_MAX_TEAMS = 32
_MAX_SLOTS = 6  # per-slot sanity bound (e.g. no 9-receiver lineups)
_MAX_BENCH = 20  # deep-bench dynasty leagues exist; 20 is past all of them


class LeagueConfig(BaseModel):
    """A resolved league: how many teams, and what each team starts.

    Kicker and defense slots are deliberately absent — GridironIQ covers QB/RB/WR/TE,
    and neither slot affects the replacement level at those positions.
    """

    teams: int = 12
    qb: int = 1
    rb: int = 2
    wr: int = 3
    te: int = 1
    flex: int = 1
    superflex: int = 0
    # Bench spots per team. Not a lineup slot — nobody *starts* a bench player — but it
    # moves replacement level more than any starting slot does, because it decides how
    # many players are off the waiver wire at all. See :func:`replacement_ranks`.
    bench: int = 0


# Slots a caller may override via ``parse_league``. ``bench`` is here even though it
# is not a lineup slot, because it is set in the same editor and carried in the same
# spec string.
_LINEUP_OVERRIDABLE = set(LINEUP_SLOTS) | {"flex", "superflex"}
_OVERRIDABLE = _LINEUP_OVERRIDABLE | {"bench"}


def parse_league(spec: str | None) -> LeagueConfig:
    """Parse a ``teams[:slot=value,...]`` league spec into a LeagueConfig.

    Examples: ``"12"``, ``"10:rb=2,wr=3,flex=2"``, ``"12:superflex=1"``.

    Raises ``ValueError`` on a non-integer team count, an unknown slot, a
    non-integer slot value, or an out-of-range value (the router turns this
    into a 400).
    """
    if not spec:
        spec = DEFAULT_LEAGUE

    teams_part, _, override_part = spec.partition(":")
    teams_part = teams_part.strip()
    try:
        teams = int(teams_part)
    except ValueError as exc:
        raise ValueError(f"League team count '{teams_part}' must be a whole number.") from exc
    if not 2 <= teams <= _MAX_TEAMS:
        raise ValueError(f"League team count must be between 2 and {_MAX_TEAMS}.")

    values: dict[str, int] = {"teams": teams}

    if override_part:
        for clause in override_part.split(","):
            clause = clause.strip()
            if not clause:
                continue
            key, sep, raw_value = clause.partition("=")
            key = key.strip().lower()
            if not sep:
                raise ValueError(f"Malformed league override '{clause}' (expected slot=value).")
            if key not in _OVERRIDABLE:
                raise ValueError(
                    f"Unknown lineup slot '{key}'. "
                    f"Valid slots: {', '.join(sorted(_OVERRIDABLE))}."
                )
            try:
                value = int(raw_value)
            except ValueError as exc:
                raise ValueError(f"Lineup value for '{key}' must be a whole number.") from exc
            ceiling = _MAX_BENCH if key == "bench" else _MAX_SLOTS
            if not 0 <= value <= ceiling:
                raise ValueError(f"Lineup value for '{key}' must be between 0 and {ceiling}.")
            values[key] = value

    config = LeagueConfig(**values)
    if not any(getattr(config, slot) for slot in _LINEUP_OVERRIDABLE):
        raise ValueError("A league lineup must start at least one player.")
    return config


def replacement_ranks(config: LeagueConfig) -> dict[str, int]:
    """League-wide replacement rank per position (1-based ordinal).

    ``{"QB": 12, "RB": 28, "WR": 42, "TE": 14}`` for a default 12-team lineup with no
    bench: the dedicated starters plus that position's share of the flex slots.

    **Bench spots move this more than any starting slot does.** Replacement level is
    "the best player a manager could pick up instead", and that is not the last
    *startable* player — it is the last *rostered* one. A 12-team league with six bench
    spots has 72 more players off the waiver wire than the same league with none, and
    every one of those makes the true alternative worse. Ignoring the bench is what
    made VORP flatter than the draft rooms it was meant to describe.

    ⚠️ **How bench spots are shared out is a model, and this is the one we chose**:
    proportionally to how each position is *started*, which is the same assumption the
    flex allocation above already makes. The alternative — allocating by observed draft
    behaviour — needs ADP we deliberately do not have (see the M9 notes on bot
    behaviour). The known weakness is quarterbacks in a one-QB league: this model gives
    QB a twelfth of the bench when in practice most managers roster one and stream, so
    QB replacement runs a little deeper here than it does in a real room. It is right
    for superflex, where the bench genuinely fills with quarterbacks.
    """
    dedicated = {position: config.teams * getattr(config, slot)
                 for slot, position in LINEUP_SLOTS.items()}

    ranks = {"QB": float(dedicated["QB"] + config.teams * config.superflex)}

    flex_slots = config.teams * config.flex
    eligible_starters = sum(dedicated[position] for position in FLEX_ELIGIBLE)
    for position in FLEX_ELIGIBLE:
        if flex_slots and eligible_starters:
            share = dedicated[position] / eligible_starters
        elif flex_slots:  # a flex-only lineup: split the slots evenly
            share = 1 / len(FLEX_ELIGIBLE)
        else:
            share = 0.0
        ranks[position] = float(dedicated[position] + flex_slots * share)

    # Bench spots, shared out in proportion to the starting depth computed above — so a
    # lineup that starts three receivers and two backs benches them in that ratio too.
    bench_slots = config.teams * config.bench
    started = sum(ranks.values())
    if bench_slots and started:
        for position in ranks:
            ranks[position] += bench_slots * (ranks[position] / started)

    # A position nobody starts still needs a baseline to measure against; fall back to
    # the shallowest possible one rather than rank 0.
    return {position: max(round(rank), 1) for position, rank in ranks.items()}


def lineup_label(config: LeagueConfig) -> str:
    """Human-readable lineup summary, e.g. ``"12-team · 1QB/2RB/3WR/1TE/1FLEX"``."""
    parts = [f"{getattr(config, slot)}{slot.upper()}" for slot in ("qb", "rb", "wr", "te")]
    if config.flex:
        parts.append(f"{config.flex}FLEX")
    if config.superflex:
        parts.append(f"{config.superflex}SFLEX")
    bench = f" · {config.bench} bench" if config.bench else ""
    return f"{config.teams}-team · {'/'.join(parts)}{bench}"
