"""Team stats: ranks, week windows, and aggregate-first rates (no database needed)."""

from app.models.team_game_stats import SUM_COLUMNS
from app.team_stats import BY_ID, METRICS, _rank, _value, _windows, parse_weeks


def _row(team, week, side, opponent, **values):
    base = {c: None for c in SUM_COLUMNS}
    base.update(team_id=team, week=week, side=side, opponent_id=opponent, game_id=f"g{week}", pf=20, pa=10, total=44.0, spread=3.0)
    base.update(values)
    return base


def test_rank_one_is_best_either_direction():
    assert _rank({1: 0.3, 2: 0.1, 3: 0.2}, 1) == {1: 1, 3: 2, 2: 3}
    assert _rank({1: 0.3, 2: 0.1, 3: 0.2}, -1) == {2: 1, 3: 2, 1: 3}
    # no better direction: rank 1 is the most
    assert _rank({1: 0.3, 2: 0.1}, 0) == {1: 1, 2: 2}
    # ties share a rank
    assert _rank({1: 0.2, 2: 0.2, 3: 0.1}, 1) == {1: 1, 2: 1, 3: 3}


def test_parse_weeks_drops_unplayed_and_defaults_to_all():
    assert parse_weeks("", [1, 2, 3]) == {1, 2, 3}
    assert parse_weeks("2,9", [1, 2, 3]) == {2}
    assert parse_weeks("9", [1, 2, 3]) == {1, 2, 3}


def test_rates_are_summed_before_dividing():
    # week 1: 1.0 EPA on 10 plays; week 2: 9.0 EPA on 90 plays. Mean of the weekly
    # rates would be 0.1; the true rate over both weeks is 10 / 100 = 0.1 as well, so
    # use unequal rates: week 2 is 4.5 EPA on 90 plays (0.05).
    rows = [
        _row(1, 1, "o", 2, plays=10.0, epa=1.0), _row(1, 1, "d", 2, plays=10.0, epa=0.0),
        _row(1, 2, "o", 2, plays=90.0, epa=4.5), _row(1, 2, "d", 2, plays=90.0, epa=0.0),
        _row(2, 1, "o", 1, plays=10.0, epa=0.0), _row(2, 1, "d", 1, plays=10.0, epa=1.0),
    ]
    data = {"rows": rows, "personnel": {}, "teams": {}, "weeks": [1, 2]}
    windows = _windows(data, {1, 2}, {})
    epa = _value(BY_ID["epa"], windows[1], "o")
    assert round(epa, 4) == round(5.5 / 100, 4)  # not (0.1 + 0.05) / 2


def test_every_metric_survives_an_empty_window():
    data = {"rows": [_row(1, 1, "o", 2), _row(1, 1, "d", 2)], "personnel": {}, "teams": {}, "weeks": [1]}
    window = _windows(data, {1}, {})[1]
    for metric in METRICS:
        for side in ("o",) if metric.single else metric.sides:
            _value(metric, window, side)  # must not raise
