"""Team stats: ranks, week windows, and aggregate-first rates (no database needed)."""

from app.models.team_game_stats import SUM_COLUMNS
from app.team_stats import BY_ID, METRICS, _personnel_cards, _personnel_through_week, _rank, _value, _windows, parse_weeks


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


# Hand-supplied season-to-date personnel (team_personnel_season)
def _snapshot(through_week, weeks, **groups):
    """A team's season total as _personnel_season builds it: rates times plays."""
    out = {}
    for g, (plays, share, epa_pp, success) in groups.items():
        out[g] = {"plays": plays, "share": share,
                  "epa": None if epa_pp is None else epa_pp * plays,
                  "successes": None if success is None else success * plays}
    return {"through_week": through_week, "weeks": frozenset(weeks), "groups": out}


def _season_data(snapshot, weeks=(1, 2, 3), personnel=None):
    rows = []
    for week in weeks:
        rows += [_row(1, week, "o", 2, plays=60.0, epa=3.0), _row(1, week, "d", 2, plays=60.0, epa=0.0),
                 _row(2, week, "o", 1, plays=60.0, epa=0.0), _row(2, week, "d", 1, plays=60.0, epa=3.0)]
    return {"rows": rows, "personnel": personnel or {}, "personnel_season": {1: snapshot}, "teams": {}, "weeks": list(weeks)}


def test_season_personnel_fills_a_window_holding_every_game_it_counts():
    data = _season_data(_snapshot(3, {1, 2, 3}, **{"11": (122, 0.62, 0.10, 0.541), "13": (11, 0.057, None, None)}))
    window = _windows(data, {1, 2, 3}, {})[1]
    # share as the file states it, not 122 / (122 + 11)
    assert _value(BY_ID["pers_11_share"], window, "o") == 0.62
    assert round(_value(BY_ID["pers_11_epa"], window, "o"), 4) == 0.10
    assert round(_value(BY_ID["pers_11_suc"], window, "o"), 4) == 0.541
    # withheld under 20 plays: a dash, never a zero
    assert _value(BY_ID["pers_13_epa"], window, "o") is None
    # a grouping the team never used is 0% usage, not missing
    assert _value(BY_ID["pers_22_share"], window, "o") == 0.0
    assert window["o"]["pers_through_week"] == 3


def test_season_personnel_is_not_used_for_a_narrower_window():
    data = _season_data(_snapshot(3, {1, 2, 3}, **{"11": (122, 0.62, 0.10, 0.541)}))
    window = _windows(data, {2, 3}, {})[1]
    assert _value(BY_ID["pers_11_share"], window, "o") is None
    assert window["o"]["pers_through_week"] is None


def test_season_personnel_survives_a_later_week_and_says_how_far_it_runs():
    data = _season_data(_snapshot(3, {1, 2, 3}, **{"11": (122, 0.62, 0.10, 0.541)}), weeks=(1, 2, 3, 4))
    windows = _windows(data, {1, 2, 3, 4}, {})
    assert _value(BY_ID["pers_11_share"], windows[1], "o") == 0.62
    assert _personnel_through_week(windows) == 3


def test_per_game_personnel_wins_over_a_season_total():
    per_game = {(1, w): {"11": {"plays": 30.0, "epa": 3.0, "successes": 15.0}, "12": {"plays": 10.0, "epa": 0.0, "successes": 5.0}}
                for w in (1, 2, 3)}
    data = _season_data(_snapshot(3, {1, 2, 3}, **{"11": (122, 0.62, 0.10, 0.541)}), personnel=per_game)
    window = _windows(data, {1, 2, 3}, {})[1]
    assert _value(BY_ID["pers_11_share"], window, "o") == 0.75
    assert window["o"]["pers_through_week"] is None


def test_personnel_cards_leave_withheld_success_blank():
    data = _season_data(_snapshot(3, {1, 2, 3}, **{"11": (122, 0.62, 0.10, 0.541), "13": (11, 0.057, None, None)}))
    cards = {c["grouping"]: c for c in _personnel_cards(_windows(data, {1, 2, 3}, {}), 1)}
    assert cards["11"]["success"] == 0.541 and cards["11"]["epa_rank"] == 1
    assert cards["13"]["success"] is None and cards["13"]["epa"] is None
