"""Ingest team-level sums for the team pages and team leaderboards.

Writes two tables:

``team_game_stats``  one row per team, per game, per side of the ball (``o`` = the team's
                     own plays, ``d`` = its opponent's plays against it). Sums and counts
                     only, so the API can compute any rate over any set of weeks exactly.
``team_personnel``   one row per team, per game, per offensive personnel grouping, from
                     participation data.

Sources, and where each one stops:

- ``load_pbp`` (2009+): efficiency, passing, rushing, drives, situations, pass depth,
  run lanes, neutral pass rate over expected and pace.
- ``load_team_stats`` (weekly): penalties, giveaways, takeaways.
- ``load_snap_counts`` (2013+): offensive snaps, and the snaps played by backs, tight
  ends and receivers (``snap_sums``).
- ``load_ftn_charting`` (2022+): formation, motion, play action, RPO, screens, blitzes,
  box counts, catchable throws, drops.
- ``load_participation`` (2016 to the season before last): personnel groupings and
  man/zone coverage.

A column from a feed that does not cover a season is written NULL, never 0, so a board
can tell "not measured" from "none".

Team codes: play-by-play normalises every franchise to today's code (``LA``), while the
``games`` table uses the code of the day (``STL``). Rows are resolved onto the
schedule's code with ``franchises.py`` so they join to the same ``teams`` row as the game.

Idempotent: ``INSERT ... ON CONFLICT DO UPDATE`` on each table's key. ``--snaps-only``
refreshes just the snap-count columns on rows that already exist, which a backfill of
those columns needs no play-by-play for.
"""

import argparse
import logging

import nflreadpy as nfl
import polars as pl
from sqlalchemy import text

from db import get_engine, load_team_id_map, upsert
from franchises import contemporary_code_map, resolve
from seasons import FTN, PARTICIPATION, PBP, SNAPS, clamp_seasons, default_seasons

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("pipeline.team_stats")

c = pl.col
OFFENSE_PLAY_TYPES = ["pass", "run", "punt", "field_goal", "qb_kneel", "qb_spike"]
DEPTHS = {"behind": (None, 0), "short": (0, 10), "intermediate": (10, 20), "deep": (20, None)}
LANES = ("left_end", "left_tackle", "left_guard", "middle", "right_guard", "right_tackle", "right_end")
BACKS = ("RB", "FB", "HB")
SNAP_COLUMNS = ("snaps", "back_snaps", "te_snaps", "wr_snaps", "two_back_snaps")


def _plays(pbp: pl.DataFrame) -> pl.DataFrame:
    """Scrimmage plays with an EPA, with the flags every aggregate below uses."""
    p = pbp.filter(
        c("posteam").is_not_null() & c("defteam").is_not_null()
        & ((c("pass") == 1) | (c("rush") == 1)) & c("epa").is_not_null()
        & (c("qb_kneel").fill_null(0) == 0) & (c("qb_spike").fill_null(0) == 0)
    ).sort(["game_id", "play_id"])
    p = p.with_columns(
        (c("game_seconds_remaining") - c("game_seconds_remaining").shift(-1).over(["game_id", "posteam", "fixed_drive"])).alias("gap_next"),
        c("play_id").cast(pl.Int64),
    )
    p = p.with_columns(
        db=(c("qb_dropback") == 1),
        ru=(c("rush") == 1) & (c("qb_dropback") != 1),
        att=(c("pass_attempt") == 1) & (c("sack").fill_null(0) == 0),
        neutral=c("wp").is_between(0.2, 0.8) & (c("down") <= 3) & (c("half_seconds_remaining") > 120),
        yg=c("yards_gained").fill_null(0),
    )
    depth = pl.when(~c("att") | c("air_yards").is_null()).then(None)
    for name, (lo, hi) in DEPTHS.items():
        cond = pl.lit(True)
        if lo is not None:
            cond = cond & (c("air_yards") >= lo)
        if hi is not None:
            cond = cond & (c("air_yards") < hi)
        depth = depth.when(cond).then(pl.lit(name))
    lane = (pl.when(~c("ru")).then(None)
            .when(c("run_location") == "middle").then(pl.lit("middle"))
            .when(c("run_location").is_in(["left", "right"]) & c("run_gap").is_in(["end", "tackle", "guard"]))
            .then(pl.concat_str([c("run_location"), pl.lit("_"), c("run_gap")]))
            .otherwise(None))
    return p.with_columns(cmp=c("att") & (c("complete_pass") == 1), depth=depth.otherwise(None), lane=lane)


def _play_aggs() -> list[pl.Expr]:
    db, ru, att, cmp, nt, yg = c("db"), c("ru"), c("att"), c("cmp"), c("neutral"), c("yg")
    has = lambda col, cond: cond & c(col).is_not_null()  # noqa: E731
    aggs = [
        pl.len().alias("plays"), db.sum().alias("dropbacks"), ru.sum().alias("designed_runs"),
        c("epa").sum().alias("epa"), c("success").sum().alias("successes"),
        c("epa").filter(db).sum().alias("dropback_epa"), c("success").filter(db).sum().alias("dropback_successes"),
        c("epa").filter(ru).sum().alias("run_epa"), c("success").filter(ru).sum().alias("run_successes"),
        yg.sum().alias("yards"),
        (db & (yg >= 20)).sum().alias("explosive_passes"), (ru & (yg >= 10)).sum().alias("explosive_runs"),
        att.sum().alias("pass_attempts"), cmp.sum().alias("completions"),
        c("passing_yards").fill_null(0).filter(att).sum().alias("passing_yards"),
        (c("pass_touchdown") == 1).sum().alias("passing_tds"),
        (c("interception") == 1).sum().alias("interceptions"), (c("sack") == 1).sum().alias("sacks"),
        c("cpoe").filter(has("cpoe", att)).sum().alias("cpoe_sum"), has("cpoe", att).sum().alias("cpoe_attempts"),
        c("air_yards").filter(has("air_yards", att)).sum().alias("air_yards_sum"), has("air_yards", att).sum().alias("air_yards_attempts"),
        c("yards_after_catch").filter(has("yards_after_catch", cmp)).sum().alias("yac_sum"), has("yards_after_catch", cmp).sum().alias("yac_completions"),
        yg.filter(ru).sum().alias("rushing_yards"), (ru & (c("rush_touchdown") == 1)).sum().alias("rushing_tds"),
        (ru & (yg <= 0)).sum().alias("stuffs"), (c("first_down") == 1).sum().alias("first_downs"),
        nt.sum().alias("neutral_plays"), (nt & db).sum().alias("neutral_dropbacks"),
        c("pass_oe").filter(has("pass_oe", nt)).sum().alias("neutral_pass_oe_sum"), has("pass_oe", nt).sum().alias("neutral_pass_oe_plays"),
        c("gap_next").filter(nt & c("gap_next").is_between(1, 60)).sum().alias("neutral_seconds_sum"),
        (nt & c("gap_next").is_between(1, 60)).sum().alias("neutral_seconds_snaps"),
        c("third_down_converted").fill_null(0).sum().alias("third_down_conversions"),
        (c("third_down_converted").fill_null(0) + c("third_down_failed").fill_null(0)).sum().alias("third_down_attempts"),
        c("fourth_down_converted").fill_null(0).sum().alias("fourth_down_conversions"),
        (c("fourth_down_converted").fill_null(0) + c("fourth_down_failed").fill_null(0)).sum().alias("fourth_down_attempts"),
    ]
    for name in DEPTHS:
        m = c("depth") == name
        aggs += [m.sum().alias(f"depth_{name}_attempts"), c("epa").filter(m).sum().alias(f"depth_{name}_epa"),
                 c("success").filter(m).sum().alias(f"depth_{name}_successes"), (m & c("cmp")).sum().alias(f"depth_{name}_completions"),
                 c("passing_yards").fill_null(0).filter(m).sum().alias(f"depth_{name}_yards")]
    for name in LANES:
        m = c("lane") == name
        aggs += [m.sum().alias(f"lane_{name}_runs"), c("epa").filter(m).sum().alias(f"lane_{name}_epa"),
                 c("success").filter(m).sum().alias(f"lane_{name}_successes"), yg.filter(m).sum().alias(f"lane_{name}_yards")]
    return aggs


def _drives(pbp: pl.DataFrame) -> pl.DataFrame:
    """One row per offensive drive: first snap, deepest point, result, points."""
    rows = pbp.filter(c("posteam").is_not_null() & c("defteam").is_not_null() & c("fixed_drive").is_not_null()).sort(["game_id", "play_id"])
    is_off = c("play_type").is_in(OFFENSE_PLAY_TYPES)
    d = rows.group_by(["game_id", "posteam", "defteam", "fixed_drive"]).agg(
        c("yardline_100").filter(is_off).first().alias("first_yl"),
        c("yardline_100").filter(is_off).min().alias("best"),
        c("fixed_drive_result").drop_nulls().first().alias("result"),
        c("drive_first_downs").max().alias("first_downs"),
        ((c("touchdown") == 1) & (c("td_team") == c("posteam")) & c("play_type").is_in(["pass", "run"])).any().alias("offense_td"),
        (c("extra_point_result") == "good").sum().alias("xp"),
        (c("two_point_conv_result") == "success").sum().alias("two"),
        (c("field_goal_result") == "made").sum().alias("fg"),
        is_off.sum().alias("n_off"),
    ).filter(c("n_off") > 0)
    td = c("offense_td").cast(pl.Int32)
    return d.with_columns((6 * td + (c("xp") + 2 * c("two")) * td + 3 * c("fg")).alias("points"))


def _drive_aggs() -> list[pl.Expr]:
    return [
        pl.len().alias("drives"), c("points").sum().alias("drive_points"),
        (c("best") <= 20).sum().alias("red_zone_trips"), ((c("best") <= 20) & (c("result") == "Touchdown")).sum().alias("red_zone_tds"),
        ((c("result") == "Punt") & (c("first_downs").fill_null(0) == 0)).sum().alias("three_and_outs"),
        c("result").is_in(["Turnover", "Opp touchdown"]).sum().alias("turnover_drives"),
        (100 - c("first_yl")).filter(c("first_yl").is_not_null()).sum().alias("start_yardline_sum"),
        c("first_yl").is_not_null().sum().alias("start_yardline_drives"),
    ]


def _ftn_aggs() -> list[pl.Expr]:
    db, ru, att = c("db"), c("ru"), c("att")
    return [
        pl.len().alias("ftn_plays"), c("qb_location").is_in(["S", "P"]).sum().alias("shotgun_plays"),
        (c("qb_location") == "U").sum().alias("under_center_plays"), c("is_motion").sum().alias("motion_plays"),
        c("is_no_huddle").sum().alias("no_huddle_plays"), (c("n_offense_backfield") == 0).sum().alias("empty_plays"),
        c("is_rpo").sum().alias("rpo_plays"), db.sum().alias("ftn_dropbacks"),
        (db & c("is_play_action")).sum().alias("play_action_dropbacks"), (db & c("is_screen_pass")).sum().alias("screen_dropbacks"),
        (db & (c("n_blitzers") > 0)).sum().alias("blitzed_dropbacks"),
        c("n_pass_rushers").filter(db & c("n_pass_rushers").is_not_null()).sum().alias("pass_rushers_sum"),
        (db & c("n_pass_rushers").is_not_null()).sum().alias("pass_rushers_dropbacks"),
        ru.sum().alias("ftn_designed_runs"), (ru & (c("n_defense_box") >= 8)).sum().alias("stacked_box_runs"),
        att.sum().alias("ftn_attempts"), (att & c("is_throw_away")).sum().alias("throwaways"),
        (att & c("is_catchable_ball")).sum().alias("catchable_throws"), (att & c("is_drop")).sum().alias("drops"),
        (att & c("is_interception_worthy")).sum().alias("interception_worthy"),
    ]


def _personnel_code(col: str) -> pl.Expr:
    def n(pos: str) -> pl.Expr:
        return c(col).str.extract(rf"(\d+) {pos}(?:,|$)").cast(pl.Int32).fill_null(0)
    return pl.format("{}{}", n("RB") + n("FB"), n("TE"))


def snap_sums(season: int) -> pl.DataFrame:
    """Per team and game: offensive snaps, and the snaps backs, tight ends and receivers played.

    Summed over a window and divided by the team's snaps, each gives the average number of
    those players on the field, which snap counts give exactly: against 2025 participation
    every team came within 0.01 of a back and 0.03 of a tight end. How those players were
    grouped (11 vs 12 vs 13) they cannot give, since two tight ends rotating in 11 look the
    same as a real 12 set. The one split they can give is the second back: a team almost
    never has zero or three backs on the field, so backs' snaps beyond one per snap are the
    snaps with two (within a point of participation's 21 + 22 share for every team in 2025).
    """
    sc = nfl.load_snap_counts([season]).filter(c("offense_snaps") > 0)
    snaps = sc.filter(c("offense_pct") > 0.5).group_by(["game_id", "team"]).agg(
        (c("offense_snaps") / c("offense_pct")).max().round(0).alias("snaps"))
    by_position = sc.group_by(["game_id", "team"]).agg(
        c("offense_snaps").filter(c("position").is_in(BACKS)).sum().cast(pl.Float64).alias("back_snaps"),
        c("offense_snaps").filter(c("position") == "TE").sum().cast(pl.Float64).alias("te_snaps"),
        c("offense_snaps").filter(c("position") == "WR").sum().cast(pl.Float64).alias("wr_snaps"))
    return snaps.join(by_position, on=["game_id", "team"], how="inner").with_columns(
        (c("back_snaps") - c("snaps")).clip(lower_bound=0).alias("two_back_snaps"))


def _join_sides(out: pl.DataFrame, sums: pl.DataFrame, keys: list[str]) -> pl.DataFrame:
    """Attach snap sums to both sides: the team's own on ``o``, its opponent's on ``d``."""
    own = sums.select("game_id", "team", *[c(k).alias(f"own_{k}") for k in SNAP_COLUMNS])
    opp = sums.select("game_id", c("team").alias("opponent"), *[c(k).alias(f"opp_{k}") for k in SNAP_COLUMNS])
    return out.join(own, on=keys, how="left").join(opp, on=["game_id", "opponent"], how="left").with_columns(
        [pl.when(c("side") == "o").then(c(f"own_{k}")).otherwise(c(f"opp_{k}")).alias(k) for k in SNAP_COLUMNS]
    ).drop([f"{prefix}_{k}" for prefix in ("own", "opp") for k in SNAP_COLUMNS])


def collect_season(season: int) -> tuple[pl.DataFrame, pl.DataFrame | None]:
    """Team-game-side sums and team-game-grouping personnel rows for one season."""
    pbp = nfl.load_pbp([season])
    plays = _plays(pbp)
    drives = _drives(pbp)

    ftn = None
    if clamp_seasons([season], FTN):
        f = nfl.load_ftn_charting([season]).rename({"nflverse_game_id": "game_id", "nflverse_play_id": "play_id"})
        ftn = plays.join(f.with_columns(c("play_id").cast(pl.Int64)).select(
            "game_id", "play_id", "qb_location", "n_offense_backfield", "is_no_huddle", "is_motion", "is_play_action",
            "is_screen_pass", "is_rpo", "n_blitzers", "n_pass_rushers", "n_defense_box", "is_throw_away",
            "is_catchable_ball", "is_drop", "is_interception_worthy"), on=["game_id", "play_id"], how="inner")

    part = None
    if clamp_seasons([season], PARTICIPATION):
        pr = nfl.load_participation([season]).rename({"nflverse_game_id": "game_id"}).with_columns(c("play_id").cast(pl.Int64))
        part = plays.select("game_id", "play_id", "posteam", "defteam", "week", "season_type", "db", "epa", "success", "yg").join(
            pr.select("game_id", "play_id", "offense_personnel", "defense_man_zone_type"), on=["game_id", "play_id"], how="inner")

    keys = ["game_id", "team"]
    sides = []
    for side, team_col, opp_col in (("o", "posteam", "defteam"), ("d", "defteam", "posteam")):
        base = plays.group_by(["game_id", team_col, opp_col, "week", "season_type"]).agg(_play_aggs()).rename({team_col: "team", opp_col: "opponent"})
        dr = drives.group_by(["game_id", team_col]).agg(_drive_aggs()).rename({team_col: "team"})
        d4 = pbp.filter(c("posteam").is_not_null() & (c("down") == 4) & c("play_type").is_in(["pass", "run", "punt", "field_goal"])) \
            .group_by(["game_id", team_col]).agg(pl.len().alias("fourth_down_decisions"), c("play_type").is_in(["pass", "run"]).sum().alias("fourth_down_goes")).rename({team_col: "team"})
        rows = base.join(dr, on=keys, how="left").join(d4, on=keys, how="left")
        if ftn is not None:
            rows = rows.join(ftn.group_by(["game_id", team_col]).agg(_ftn_aggs()).rename({team_col: "team"}), on=keys, how="left")
        if part is not None:
            mz = part.filter(c("db") & c("defense_man_zone_type").is_in(["MAN_COVERAGE", "ZONE_COVERAGE"]))
            rows = rows.join(mz.group_by(["game_id", team_col]).agg(pl.len().alias("coverage_dropbacks"),
                                                                     (c("defense_man_zone_type") == "MAN_COVERAGE").sum().alias("man_dropbacks")).rename({team_col: "team"}), on=keys, how="left")
        sides.append(rows.with_columns(pl.lit(side).alias("side")))
    out = pl.concat(sides, how="diagonal")

    ts = nfl.load_team_stats([season], summary_level="week").select(
        "game_id", "team", "penalties", "penalty_yards",
        (c("passing_interceptions") + c("sack_fumbles_lost") + c("rushing_fumbles_lost") + c("receiving_fumbles_lost")).alias("giveaways"),
        (c("def_interceptions") + c("fumble_recovery_opp")).alias("takeaways"),
    )
    out = out.join(ts, on=keys, how="left")

    if clamp_seasons([season], SNAPS):
        out = _join_sides(out, snap_sums(season), keys)

    personnel = None
    if part is not None:
        personnel = part.with_columns(_personnel_code("offense_personnel").alias("grouping")).group_by(
            ["game_id", "posteam", "week", "season_type", "grouping"]).agg(
            pl.len().alias("plays"), c("db").sum().alias("dropbacks"), c("epa").sum().alias("epa"),
            c("success").sum().alias("successes"), c("yg").sum().alias("yards")).rename({"posteam": "team"})
    return out, personnel


def _existing_games(seasons: list[int]) -> set[str]:
    with get_engine().connect() as connection:
        return {g for (g,) in connection.execute(text("SELECT game_id FROM games WHERE season = ANY(:s)"), {"s": seasons})}


def ingest_team_stats(seasons: list[int]) -> int:
    """Write team_game_stats and team_personnel for the given seasons. Returns rows written."""
    seasons = clamp_seasons(seasons, PBP)
    if not seasons:
        logger.info("nothing to ingest: no requested season is available")
        return 0
    team_ids = load_team_id_map()
    codes = contemporary_code_map(seasons)
    games = _existing_games(seasons)
    written = 0
    for season in seasons:
        stats, personnel = collect_season(season)
        rows, skipped = [], 0
        for r in stats.iter_rows(named=True):
            team = team_ids.get(resolve(codes, season, r.pop("team")))
            opponent = team_ids.get(resolve(codes, season, r.pop("opponent")))
            if team is None or r["game_id"] not in games:
                skipped += 1
                continue
            r.update(team_id=team, opponent_id=opponent, season=season, week=int(r["week"]))
            rows.append({k: (float(v) if isinstance(v, (int, float)) and k not in ("team_id", "opponent_id", "season", "week") else v) for k, v in r.items()})
        written += upsert("team_game_stats", rows, conflict_columns=["team_id", "game_id", "side"])
        logger.info("team stats %d: wrote %d team-game-side rows (skipped %d)", season, len(rows), skipped)
        if personnel is not None:
            prow = []
            for r in personnel.iter_rows(named=True):
                team = team_ids.get(resolve(codes, season, r.pop("team")))
                if team is None or r["game_id"] not in games:
                    continue
                r.update(team_id=team, season=season, week=int(r["week"]))
                prow.append(r)
            written += upsert("team_personnel", prow, conflict_columns=["team_id", "game_id", "grouping"])
            logger.info("team personnel %d: wrote %d rows", season, len(prow))
    return written


def ingest_snap_sums(seasons: list[int]) -> int:
    """Refresh only the snap-count columns, on team rows that already exist.

    For backfilling those columns: one small feed per season and five narrow columns per
    row, instead of every season's play-by-play and every column. Rows the full ingest has
    not written yet are left for it. Returns rows written.
    """
    seasons = clamp_seasons(seasons, SNAPS)
    if not seasons:
        logger.info("nothing to ingest: no requested season has snap counts")
        return 0
    team_ids = load_team_id_map()
    codes = contemporary_code_map(seasons)
    written = 0
    for season in seasons:
        with get_engine().connect() as connection:
            existing = connection.execute(text(
                "SELECT team_id, game_id, side, opponent_id FROM team_game_stats WHERE season = :s"), {"s": season}).all()
        sums = {}
        for r in snap_sums(season).iter_rows(named=True):
            team = team_ids.get(resolve(codes, season, r["team"]))
            if team is not None:
                sums[(r["game_id"], team)] = {k: r[k] for k in SNAP_COLUMNS}
        rows = []
        for team_id, game_id, side, opponent_id in existing:
            values = sums.get((game_id, team_id if side == "o" else opponent_id))
            if values:
                rows.append({"team_id": team_id, "game_id": game_id, "side": side, **values})
        written += upsert("team_game_stats", rows, conflict_columns=["team_id", "game_id", "side"])
        logger.info("snap sums %d: wrote %d team-game-side rows (%d with no snap counts)", season, len(rows), len(existing) - len(rows))
    return written


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest team-level sums for the team pages and team leaderboards.")
    parser.add_argument("--seasons", type=int, nargs="+", default=default_seasons(PBP),
                        help="Seasons to ingest (default: 2009 through the latest played season).")
    parser.add_argument("--snaps-only", action="store_true",
                        help="Refresh only the snap-count columns on existing rows (no play-by-play).")
    args = parser.parse_args()
    if args.snaps_only:
        ingest_snap_sums(args.seasons)
    else:
        ingest_team_stats(args.seasons)
