"""Positional ranks read from the percentile pools (M13).

A rank goes wrong silently in exactly two ways, and both look plausible on screen:
pointing the wrong way (a quarterback "QB1" in interceptions for throwing the most), and
breaking ties arbitrarily (two receivers on 8 touchdowns reading WR9 and WR10 depending on
row order). These pin both, plus the rule that a rank and a percentile for the same metric
come from the same qualified pool.

Pure: builds a ``PercentileIndex`` from dicts, so it needs no database.
"""

from app.percentiles import PercentileIndex


def _qb(player_id: str, interceptions: int, passing_tds: int, games: int = 17) -> dict:
    return {
        "player_id": player_id,
        "position": "QB",
        "games_played": games,
        "interceptions": interceptions,
        "passing_tds": passing_tds,
    }


POOL = [
    _qb("a", interceptions=4, passing_tds=30),
    _qb("b", interceptions=8, passing_tds=25),
    _qb("c", interceptions=8, passing_tds=25),
    _qb("d", interceptions=12, passing_tds=20),
    # A one-game backup. He is below the qualification bar, so he must not shape the
    # pool — otherwise his zero interceptions would push every starter down a place.
    _qb("backup", interceptions=0, passing_tds=1, games=1),
]
METRICS = ("interceptions", "passing_tds")


def _index() -> PercentileIndex:
    return PercentileIndex(POOL, METRICS, min_games=6)


def test_higher_is_better_ranks_the_most_first() -> None:
    index = _index()
    assert index.ranks_for_row(POOL[0], METRICS)["passing_tds"] == 1
    assert index.ranks_for_row(POOL[3], METRICS)["passing_tds"] == 4


def test_lower_is_better_ranks_the_fewest_first() -> None:
    """Interceptions are registry ``higher_is_better=False``: rank 1 is the fewest."""
    index = _index()
    assert index.ranks_for_row(POOL[0], METRICS)["interceptions"] == 1
    assert index.ranks_for_row(POOL[3], METRICS)["interceptions"] == 4


def test_ties_share_a_rank_and_the_next_one_skips() -> None:
    index = _index()
    tied = [index.ranks_for_row(row, METRICS)["interceptions"] for row in POOL[1:3]]
    assert tied == [2, 2]
    assert index.ranks_for_row(POOL[3], METRICS)["interceptions"] == 4


def test_an_unqualified_player_is_ranked_but_does_not_shape_the_pool() -> None:
    index = _index()
    # The backup's zero picks would be the best in the league — he is ranked against the
    # qualified pool rather than left out, the same stance the percentile takes...
    assert index.ranks_for_row(POOL[4], METRICS)["interceptions"] == 1
    # ...but the starter with four picks is still QB1, because the backup is not in it.
    assert index.ranks_for_row(POOL[0], METRICS)["interceptions"] == 1


def test_a_metric_ranked_only_at_other_positions_gets_no_rank() -> None:
    """Rushing is ranked among backs and quarterbacks only (``PERCENTILE_POSITIONS``)."""
    receiver = {"player_id": "wr", "position": "WR", "games_played": 17, "rushing_yards": 90}
    index = PercentileIndex([receiver], ("rushing_yards",), min_games=6)
    assert index.ranks_for_row(receiver, ("rushing_yards",)) == {}
