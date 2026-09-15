"""The engine cache (app/cache.py) and the career baseline it made scoring-independent.

The cache went in because the Insight engine was exhausting Supabase's Disk IO budget
(September 2026), and it fails in quiet ways: a stale pool looks exactly like a fresh
one, and a row one request decorates shows up decorated on the next. Pinned here:

- a repeat call is served without recomputing, and a write to the data forces a miss
- the scored rows ``build_intelligence`` returns are copies, so a caller cannot
  change what the next request gets
- the career baseline, now summed once and priced in Python, is still priced in the
  caller's scoring, TE premium included

The cache is off under ``ENVIRONMENT=test`` (see the module docstring for why), so the
tests that need it switch it on and clear it on both sides.
"""

from datetime import date

import pytest
from sqlalchemy.orm import Session

from app import cache
from app.cache import VersionedCache, data_version
from app.intelligence import (
    _CAREER_TOTALS,
    _SCORED_WINDOWS,
    build_intelligence,
    fetch_career_efficiency,
    resolve_window,
)
from app.league import parse_league
from app.models import Game, Player, PlayerStats, Team
from app.scoring import parse_scoring
from app.seasons import _SUMMARY, _WEEK_BOUNDS


@pytest.fixture
def cache_on(monkeypatch):
    """Enable caching for one test, starting and ending empty."""
    monkeypatch.setattr(cache, "ENABLED", True)
    stores = (_WEEK_BOUNDS, _SUMMARY, _CAREER_TOTALS, _SCORED_WINDOWS)
    for store in stores:
        store.clear()
    yield
    for store in stores:
        store.clear()


@pytest.fixture
def fixed_version(monkeypatch, cache_on) -> dict:
    """A data version the test controls, instead of Postgres's counters."""
    state = {"version": 1}
    monkeypatch.setattr(cache, "data_version", lambda db: state["version"])
    return state


class _Counter:
    """A compute function that records how often it ran."""

    def __init__(self) -> None:
        self.calls = 0

    def __call__(self) -> int:
        self.calls += 1
        return self.calls


# --- The cache itself ----------------------------------------------------------------


def test_a_repeat_call_is_served_without_recomputing(fixed_version: dict) -> None:
    store: VersionedCache[int] = VersionedCache(max_entries=4)
    compute = _Counter()

    assert store.get_or_compute(None, "key", compute) == 1
    assert store.get_or_compute(None, "key", compute) == 1
    assert compute.calls == 1


def test_a_write_to_the_data_forces_a_miss(fixed_version: dict) -> None:
    store: VersionedCache[int] = VersionedCache(max_entries=4)
    compute = _Counter()

    store.get_or_compute(None, "key", compute)
    fixed_version["version"] = 2
    assert store.get_or_compute(None, "key", compute) == 2


def test_an_entry_past_the_backstop_age_is_recomputed(
    fixed_version: dict, monkeypatch
) -> None:
    store: VersionedCache[int] = VersionedCache(max_entries=4)
    compute = _Counter()
    monkeypatch.setattr(cache, "MAX_AGE_SECONDS", 0)

    store.get_or_compute(None, "key", compute)
    assert store.get_or_compute(None, "key", compute) == 2


def test_the_least_recently_used_entry_is_evicted(fixed_version: dict) -> None:
    store: VersionedCache[str] = VersionedCache(max_entries=2)
    store.get_or_compute(None, "a", lambda: "a")
    store.get_or_compute(None, "b", lambda: "b")
    store.get_or_compute(None, "a", lambda: "a")  # "b" is now the oldest
    store.get_or_compute(None, "c", lambda: "c")

    assert store.get_or_compute(None, "a", lambda: "recomputed") == "a"
    assert store.get_or_compute(None, "b", lambda: "recomputed") == "recomputed"


def test_it_is_off_under_the_test_environment() -> None:
    """Off by default here, because a rolled-back test transaction never moves the
    counters: one test's pools would be served to the next."""
    store: VersionedCache[int] = VersionedCache(max_entries=4)
    compute = _Counter()

    store.get_or_compute(None, "key", compute)
    store.get_or_compute(None, "key", compute)
    assert cache.ENABLED is False
    assert compute.calls == 2


def test_the_data_version_is_read_once_per_session(db: Session) -> None:
    version = data_version(db)
    assert isinstance(version, int)

    db.info["data_version"] = version + 1
    assert data_version(db) == version + 1


# --- Seed data -----------------------------------------------------------------------

PRIOR, CURRENT = 2024, 2025


@pytest.fixture
def tight_ends(db: Session, team: Team) -> dict[str, Player]:
    """A tight end with a real career behind him, and one without enough of one.

    The veteran's 2024: 40 catches on 60 targets, 350 yards, 2 touchdowns, so 47
    standard points. PPR adds 40 (87 over 60 opportunities = 1.45); a 1.5 TE premium
    adds 60 (107 over 60).
    """
    opponent = Team(name="Denver Broncos", abbreviation="DEN", conference="AFC", division="AFC West")
    db.add(opponent)
    db.flush()

    def game(season: int, week: int) -> str:
        game_id = f"{season}_{week:02d}_TEST"
        db.add(Game(
            game_id=game_id, season=season, week=week, season_type="REG",
            home_team_id=team.team_id, away_team_id=opponent.team_id,
            home_score=24, away_score=17, game_date=date(season, 9, 7 + 7 * (week - 1)),
        ))
        return game_id

    def make(player_id: str, name: str) -> Player:
        player = Player(player_id=player_id, name=name, position="TE",
                        team_id=team.team_id, status="ACT")
        db.add(player)
        return player

    veteran = make("00-0000021", "Veteran Tight End")
    newcomer = make("00-0000022", "Second-Year Tight End")
    games = [game(PRIOR, 1), game(PRIOR, 2), game(CURRENT, 1), game(CURRENT, 2)]
    db.flush()

    def line(player: Player, game_id: str, *, receptions: int, targets: int,
             yards: int, tds: int) -> PlayerStats:
        season, week = int(game_id[:4]), int(game_id[5:7])
        return PlayerStats(
            player_id=player.player_id, game_id=game_id, team_id=team.team_id,
            season=season, week=week, season_type="REG",
            receptions=receptions, targets=targets, receiving_yards=yards,
            receiving_tds=tds, fantasy_points_std=round(yards * 0.1 + tds * 6, 2),
        )

    db.add_all([
        line(veteran, games[0], receptions=20, targets=30, yards=200, tds=1),
        line(veteran, games[1], receptions=20, targets=30, yards=150, tds=1),
        line(veteran, games[2], receptions=6, targets=8, yards=70, tds=0),
        line(veteran, games[3], receptions=5, targets=7, yards=60, tds=1),
        # 20 prior opportunities: under MIN_BASELINE_OPPORTUNITIES, so no baseline.
        line(newcomer, games[0], receptions=8, targets=10, yards=80, tds=0),
        line(newcomer, games[1], receptions=8, targets=10, yards=90, tds=0),
        line(newcomer, games[2], receptions=4, targets=6, yards=40, tds=0),
        line(newcomer, games[3], receptions=3, targets=5, yards=30, tds=0),
    ])
    db.flush()
    return {"veteran": veteran, "newcomer": newcomer}


# --- The career baseline -------------------------------------------------------------


def test_the_baseline_is_priced_in_the_callers_scoring(
    db: Session, tight_ends: dict
) -> None:
    veteran = tight_ends["veteran"].player_id

    ppr = fetch_career_efficiency(db, CURRENT, parse_scoring("ppr"))
    premium = fetch_career_efficiency(db, CURRENT, parse_scoring("ppr_te"))

    assert ppr[veteran] == pytest.approx(87 / 60)
    assert premium[veteran] == pytest.approx(107 / 60)


def test_the_baseline_reuses_one_read_across_scoring_configs(
    db: Session, tight_ends: dict, cache_on: None
) -> None:
    veteran = tight_ends["veteran"].player_id

    fetch_career_efficiency(db, CURRENT, parse_scoring("ppr"))
    premium = fetch_career_efficiency(db, CURRENT, parse_scoring("ppr_te"))

    assert premium[veteran] == pytest.approx(107 / 60)
    assert len(_CAREER_TOTALS._entries) == 1


def test_the_baseline_counts_only_earlier_seasons_with_enough_volume(
    db: Session, tight_ends: dict
) -> None:
    baseline = fetch_career_efficiency(db, CURRENT, parse_scoring("ppr"))

    assert tight_ends["newcomer"].player_id not in baseline
    assert fetch_career_efficiency(db, PRIOR, parse_scoring("ppr")) == {}


# --- Scored windows ------------------------------------------------------------------


def test_scored_rows_are_copies_a_caller_cannot_change(
    db: Session, tight_ends: dict, cache_on: None
) -> None:
    """The Insight endpoint writes percentiles onto the rows it returns and sorts the
    list in place. Neither may reach the next request."""
    window = resolve_window(db, CURRENT, "REG", None)
    config, league = parse_scoring("ppr"), parse_league("12")

    first, _ = build_intelligence(db, window, config, league)
    first[0]["percentiles"] = {"targets": 0.99}
    first.reverse()
    first.pop()

    second, _ = build_intelligence(db, window, config, league)
    assert len(_SCORED_WINDOWS._entries) == 1
    assert len(second) == 2
    assert all("percentiles" not in row for row in second)


def test_a_position_filter_narrows_a_cached_window(
    db: Session, tight_ends: dict, cache_on: None
) -> None:
    window = resolve_window(db, CURRENT, "REG", None)
    config, league = parse_scoring("ppr"), parse_league("12")

    build_intelligence(db, window, config, league)
    receivers, _ = build_intelligence(db, window, config, league, position="WR")
    tight, _ = build_intelligence(db, window, config, league, position="TE")

    assert receivers == []
    assert len(tight) == 2
