"""Which team code a franchise actually used in a given season (M8).

**The feeds disagree, and only historical seasons expose it.** ``load_schedules``
records the code a team used *at the time* — the 2004 Rams are ``STL`` — while
``load_player_stats`` normalises every franchise to the code it uses *today*, so the
same team's stat lines arrive as ``LA``. Both are defensible; storing both is not.

Left unreconciled it is worse than a labelling problem, because ``games`` and
``player_stats`` end up pointing at different rows of ``teams`` for the same team:

- Strength of schedule derives the opposing defense by asking which side of the game
  the player was *not* on. With the stat line on ``LA`` and the fixture on ``STL``,
  that test is false for both sides, so every Rams stat line from 1999–2015 is
  credited to the wrong defense.
- The team page joins fixtures by one id and production by the other, so St. Louis
  renders a schedule with no players.
- A leaderboard calls Torry Holt's 2004 a Los Angeles season, eleven years early.

This module resolves the two onto the schedule's answer, because a historical product
should say St. Louis. **The mapping is derived, never hardcoded.** A franchise is
identified by its nickname — ``load_teams`` publishes 36 codes under 32 nicknames, and
the three with more than one code are exactly the three relocations (Rams, Chargers,
Raiders). Which of a franchise's codes was in use is then whichever one appears in
that season's schedule. Both halves come from the data, so this stays correct the next
time a team moves, with no list for anyone to remember to update.
"""

import logging

import nflreadpy as nfl

logger = logging.getLogger("pipeline.franchises")


def _alias_groups() -> dict[str, set[str]]:
    """Nickname -> every code that franchise has ever used."""
    teams = nfl.load_teams().select(["team_abbr", "team_nick"])
    groups: dict[str, set[str]] = {}
    for abbr, nick in teams.iter_rows():
        if abbr and nick:
            groups.setdefault(nick, set()).add(abbr)
    return groups


def season_team_codes(seasons: list[int]) -> dict[int, set[str]]:
    """Season -> the team codes that actually appear in that season's schedule."""
    schedules = nfl.load_schedules(seasons).select(["season", "home_team", "away_team"])
    played: dict[int, set[str]] = {}
    for season, home, away in schedules.iter_rows():
        bucket = played.setdefault(int(season), set())
        for code in (home, away):
            if code:
                bucket.add(code)
    return played


def contemporary_code_map(seasons: list[int]) -> dict[tuple[int, str], str]:
    """``(season, any code for a franchise) -> the code it used that season``.

    Only relocated franchises produce entries; every other code maps to itself and is
    simply absent, so :func:`resolve` can fall through to the code it was given.
    """
    groups = _alias_groups()
    played = season_team_codes(seasons)

    mapping: dict[tuple[int, str], str] = {}
    for nick, codes in groups.items():
        if len(codes) == 1:
            continue  # never moved; nothing to reconcile
        for season, season_codes in played.items():
            in_use = codes & season_codes
            if len(in_use) != 1:
                # Either the franchise did not play that season, or the schedule is
                # ambiguous. Both are better left alone than guessed at.
                if in_use:
                    logger.warning(
                        "%s has %d codes in the %d schedule (%s); not remapping",
                        nick, len(in_use), season, sorted(in_use),
                    )
                continue
            current = in_use.pop()
            for alias in codes:
                if alias != current:
                    mapping[(season, alias)] = current

    if mapping:
        moved = sorted({f"{alias}->{code}" for (_, alias), code in mapping.items()})
        logger.info(
            "franchise codes: %d season/alias remappings across %s",
            len(mapping), ", ".join(moved),
        )
    return mapping


def resolve(mapping: dict[tuple[int, str], str], season: int | None, code: str | None) -> str | None:
    """The code this franchise used in ``season``, or ``code`` unchanged."""
    if code is None or season is None:
        return code
    return mapping.get((int(season), code), code)
