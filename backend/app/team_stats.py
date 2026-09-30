"""Team stats for the team pages and team leaderboards: sums in, rates and ranks out.

``team_game_stats`` holds sums per team, per game, per side of the ball. Everything a
team page or a team board shows is a rate over some set of weeks, so this module sums
the rows in the window first and divides last, never averaging per-game rates.

Two sides share one set of columns: ``o`` is the team's own plays, ``d`` its opponents'
plays against it. A metric states which way is better on each side (a high sack rate is
bad for an offense and good for a defense), and every rank is computed so **1 is the
best**. A tendency with no better direction (pass rate, shotgun rate) ranks 1 = most.

Nothing here is user-specific, so results are cached per data version like the rest of
the query-time engine (app/cache.py). The table is small (about 1,100 rows a season),
so a season is read once and every window is computed in Python.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.cache import VersionedCache
from app.models import Game, Player, PlayerStats, Team, TeamGameStats, TeamPersonnel, TeamPersonnelSeason, TeamStaff
from app.models.team_game_stats import DEPTHS, LANES, SUM_COLUMNS
from app.scoring import ScoringConfig, points_expr

POSITIONS = ("QB", "RB", "WR", "TE")
GROUPINGS = ("11", "12", "13", "21", "22")
LANE_GROUPS = {"inside": ("left_guard", "middle", "right_guard"), "off_tackle": ("left_tackle", "right_tackle"), "outside": ("left_end", "right_end")}
# A personnel grouping's EPA and success are ranked only with this many plays in it.
PERSONNEL_MIN_PLAYS = 20
# A pass depth or run lane's EPA is ranked only with this many plays in it.
ZONE_MIN_PLAYS = 3

_ROWS: VersionedCache[dict] = VersionedCache(max_entries=8)
_FANTASY: VersionedCache[dict] = VersionedCache(max_entries=16)
_BOARDS: VersionedCache[dict] = VersionedCache(max_entries=48)


def _per(a, b):
    return a / b if a is not None and b else None


# ---------------------------------------------------------------------------------
# The metric registry
# ---------------------------------------------------------------------------------
@dataclass(frozen=True)
class TeamMetric:
    """One team stat. ``get`` receives the side's sums (or the whole window for a
    ``single`` metric) and returns the value or None."""

    id: str
    label: str
    group: str
    fmt: str = "num1"
    short: str | None = None
    better_o: int = 1       # 1 higher is better, -1 lower is better, 0 no direction
    better_d: int = -1
    single: bool = False
    sides: tuple[str, ...] = ("o", "d")
    label_o: str | None = None
    label_d: str | None = None
    desc: str | None = None
    first_season: int | None = None  # the feed's first season, when later than 2009
    get: Callable = field(default=lambda s: None, compare=False)

    def better(self, side: str) -> int:
        return self.better_o if side == "o" or self.single else self.better_d

    def as_dict(self) -> dict:
        return {"id": self.id, "label": self.label, "short": self.short or self.label, "group": self.group, "fmt": self.fmt,
                "better": {"o": self.better_o, "d": self.better_d} if not self.single else {"o": self.better_o},
                "single": self.single, "sides": list(self.sides) if not self.single else ["o"],
                "label_o": self.label_o or self.label, "label_d": self.label_d or self.label, "desc": self.desc,
                "first_season": self.first_season}


FTN, PART, SNAPS = 2022, 2016, 2013


def _m(id, label, group, get, **kw) -> TeamMetric:
    return TeamMetric(id=id, label=label, group=group, get=get, **kw)


def _fp(pos=None):
    def get(s):
        fp = s["fp"]
        total = sum(fp.values()) if pos is None else fp.get(pos, 0.0)
        return _per(total, s["games"]) if s["fp_games"] else None
    return get


def _pers(g, what):
    def get(s):
        if not s["pers"]:
            return None
        p = s["pers"].get(g)
        if what == "share":
            return p["share"] if p else 0.0
        key = "epa" if what == "epa" else "successes"
        if not p or p["plays"] < PERSONNEL_MIN_PLAYS or p[key] is None:
            return None
        return p[key] / p["plays"]
    return get


METRICS: tuple[TeamMetric, ...] = (
    # results
    _m("record", "Win percentage", "results", lambda w: _per(w["wins"] + 0.5 * w["ties"], w["wins"] + w["losses"] + w["ties"]), single=True, fmt="pct1", short="Record"),
    _m("pdiff", "Point differential per game", "results", lambda w: _per(w["o"]["pf"] - w["o"]["pa"], w["o"]["scored_games"]), single=True, fmt="sgn1", short="Diff/G"),
    _m("ppg", "Points per game", "results", lambda s: _per(s["pf"] if s["side"] == "o" else s["pa"], s["scored_games"]), label_d="Points allowed per game", short="Pts/G"),
    _m("imp", "Implied team total", "results", lambda s: _per(s["imp_sum"] if s["side"] == "o" else s["opp_imp_sum"], s["lines"]), label_d="Opponent implied total", short="Implied",
       desc="Points the betting market expected, from the spread and the total."),
    _m("vs_imp", "Points vs implied total", "results", lambda s: _per((s["pf_lined"] - s["imp_sum"]) if s["side"] == "o" else (s["pa_lined"] - s["opp_imp_sum"]), s["lines"]),
       fmt="sgn1", short="vs Implied", label_d="Points allowed vs opponent implied", desc="Average points scored above or below what the market expected."),
    # efficiency
    _m("net_epa", "Net EPA per play", "eff", lambda w: (w["o"]["epa"] / w["o"]["plays"] - w["d"]["epa"] / w["d"]["plays"]) if w["o"]["plays"] and w["d"]["plays"] else None,
       single=True, fmt="sgn2", short="Net EPA", desc="Offense EPA per play minus defense EPA per play allowed."),
    _m("epa", "EPA per play", "eff", lambda s: _per(s["epa"], s["plays"]), fmt="sgn2", short="EPA/play"),
    _m("suc", "Success rate", "eff", lambda s: _per(s["successes"], s["plays"]), fmt="pct1", short="Success"),
    _m("p_epa", "EPA per dropback", "eff", lambda s: _per(s["dropback_epa"], s["dropbacks"]), fmt="sgn2", short="EPA/DB", desc="Sacks and scrambles count as dropbacks."),
    _m("p_suc", "Dropback success rate", "eff", lambda s: _per(s["dropback_successes"], s["dropbacks"]), fmt="pct1", short="DB success"),
    _m("r_epa", "EPA per designed run", "eff", lambda s: _per(s["run_epa"], s["designed_runs"]), fmt="sgn2", short="EPA/run"),
    _m("r_suc", "Rush success rate", "eff", lambda s: _per(s["run_successes"], s["designed_runs"]), fmt="pct1", short="Run success"),
    _m("explosive", "Explosive play rate", "eff", lambda s: _per((s["explosive_passes"] or 0) + (s["explosive_runs"] or 0), s["plays"]), fmt="pct1", short="Explosive",
       desc="Dropbacks gaining 20+ yards and designed runs gaining 10+."),
    _m("ypp", "Yards per play", "eff", lambda s: _per(s["yards"], s["plays"]), fmt="num2", short="Yds/play"),
    # drives and situations
    _m("pts_drive", "Points per drive", "drives", lambda s: _per(s["drive_points"], s["drives"]), fmt="num2", short="Pts/drive",
       desc="Offensive points only: touchdowns, the tries after them and field goals."),
    _m("drives_g", "Drives per game", "drives", lambda s: _per(s["drives"], s["games"]), better_o=0, better_d=0, short="Drives/G"),
    _m("three_out", "Three-and-out rate", "drives", lambda s: _per(s["three_and_outs"], s["drives"]), fmt="pct1", better_o=-1, better_d=1, short="3-and-out"),
    _m("to_drive", "Turnovers per drive", "drives", lambda s: _per(s["turnover_drives"], s["drives"]), fmt="pct1", better_o=-1, better_d=1, short="TO/drive"),
    _m("start", "Starting field position", "drives", lambda s: _per(s["start_yardline_sum"], s["start_yardline_drives"]), short="Start",
       label_d="Opponent starting field position", desc="Average yard line a drive starts on, counted from the offense's own goal line."),
    _m("rz_g", "Red zone trips per game", "drives", lambda s: _per(s["red_zone_trips"], s["games"]), short="RZ trips/G"),
    _m("rz_td", "Red zone TD rate", "drives", lambda s: _per(s["red_zone_tds"], s["red_zone_trips"]), fmt="pct1", short="RZ TD%",
       desc="Drives that reached the 20 and ended in a touchdown."),
    _m("d3", "Third down conversion rate", "drives", lambda s: _per(s["third_down_conversions"], s["third_down_attempts"]), fmt="pct1", short="3rd down"),
    _m("d4_go", "Fourth down go rate", "drives", lambda s: _per(s["fourth_down_goes"], s["fourth_down_decisions"]), fmt="pct1", better_o=0, better_d=0, short="4th go",
       desc="Share of fourth downs where the offense ran a play instead of punting or kicking."),
    _m("d4_conv", "Fourth down conversion rate", "drives", lambda s: _per(s["fourth_down_conversions"], s["fourth_down_attempts"]), fmt="pct1", short="4th conv"),
    _m("tov_g", "Turnovers per game", "drives", lambda s: _per(s["giveaways"] if s["side"] == "o" else s["takeaways"], s["games"]), better_o=-1, better_d=1,
       label_o="Giveaways per game", label_d="Takeaways per game", short="TO/G"),
    _m("pen_yds", "Penalty yards per game", "drives", lambda w: _per(w["o"]["penalty_yards"], w["o"]["games"]), single=True, better_o=-1, short="Pen yds/G"),
    # pace and volume
    _m("plays_g", "Plays per game", "pace", lambda s: _per(s["plays"], s["games"]), short="Plays/G", label_d="Plays faced per game"),
    _m("snaps_g", "Offensive snaps per game", "pace", lambda s: _per(s["snaps"], s["snap_games"]), short="Snaps/G", label_d="Opponent snaps per game", first_season=SNAPS),
    _m("sec_snap", "Seconds per snap, neutral", "pace", lambda s: _per(s["neutral_seconds_sum"], s["neutral_seconds_snaps"]), better_o=-1, better_d=0, short="Sec/snap",
       label_d="Opponent seconds per snap", desc="Time between snaps in neutral situations. Lower is faster."),
    _m("db_g", "Dropbacks per game", "pace", lambda s: _per(s["dropbacks"], s["games"]), better_o=0, better_d=0, short="DB/G"),
    # passing
    _m("p_yds_g", "Passing yards per game", "pass", lambda s: _per(s["passing_yards"], s["games"]), short="Pass yds/G"),
    _m("p_td_g", "Passing TDs per game", "pass", lambda s: _per(s["passing_tds"], s["games"]), fmt="num2", short="Pass TD/G"),
    _m("cpoe", "Completion % over expected", "pass", lambda s: _per(s["cpoe_sum"], s["cpoe_attempts"]), fmt="sgn1", short="CPOE"),
    _m("adot", "Air yards per attempt", "pass", lambda s: _per(s["air_yards_sum"], s["air_yards_attempts"]), better_o=0, better_d=0, short="aDOT"),
    _m("yac", "YAC per completion", "pass", lambda s: _per(s["yac_sum"], s["yac_completions"]), short="YAC/comp"),
    _m("x_pass", "Explosive pass rate", "pass", lambda s: _per(s["explosive_passes"], s["dropbacks"]), fmt="pct1", short="Expl. pass", desc="Dropbacks gaining 20+ yards."),
    _m("sack_rate", "Sack rate", "pass", lambda s: _per(s["sacks"], s["dropbacks"]), fmt="pct1", better_o=-1, better_d=1, short="Sack %"),
    _m("int_rate", "Interception rate", "pass", lambda s: _per(s["interceptions"], s["pass_attempts"]), fmt="pct1", better_o=-1, better_d=1, short="INT %"),
    _m("intw", "Interception-worthy throw rate", "pass", lambda s: _per(s["interception_worthy"], s["ftn_attempts"]), fmt="pct1", better_o=-1, better_d=1, short="INT-worthy",
       desc="FTN charting: throws that should have been intercepted.", first_season=FTN),
    _m("catchable", "Catchable throw rate", "pass", lambda s: _per(s["catchable_throws"], (s["ftn_attempts"] or 0) - (s["throwaways"] or 0)), fmt="pct1", short="Catchable",
       desc="FTN charting, throwaways excluded.", first_season=FTN),
    _m("drop", "Drop rate", "pass", lambda s: _per(s["drops"], s["catchable_throws"]), fmt="pct1", better_o=-1, better_d=1, short="Drop %",
       desc="FTN charting: drops per catchable throw.", first_season=FTN),
    # rushing
    _m("ru_g", "Designed runs per game", "rush", lambda s: _per(s["designed_runs"], s["games"]), better_o=0, better_d=0, short="Runs/G"),
    _m("r_yds_g", "Rushing yards per game", "rush", lambda s: _per(s["rushing_yards"], s["games"]), short="Rush yds/G"),
    _m("r_td_g", "Rushing TDs per game", "rush", lambda s: _per(s["rushing_tds"], s["games"]), fmt="num2", short="Rush TD/G"),
    _m("ypc", "Yards per carry", "rush", lambda s: _per(s["rushing_yards"], s["designed_runs"]), fmt="num2", short="YPC", desc="Designed runs only."),
    _m("stuff", "Stuff rate", "rush", lambda s: _per(s["stuffs"], s["designed_runs"]), fmt="pct1", better_o=-1, better_d=1, short="Stuff %", desc="Designed runs gaining zero yards or less."),
    _m("x_run", "Explosive run rate", "rush", lambda s: _per(s["explosive_runs"], s["designed_runs"]), fmt="pct1", short="Expl. run", desc="Designed runs gaining 10+ yards."),
    _m("box8", "Stacked box rate", "rush", lambda s: _per(s["stacked_box_runs"], s["ftn_designed_runs"]), fmt="pct1", better_o=0, better_d=0, short="8+ box",
       label_o="Runs into a stacked box", desc="FTN charting: designed runs with eight or more defenders in the box.", first_season=FTN),
    *[_m(f"gap_{k}", f"{label} run share", "rush", (lambda lanes: lambda s: _per(sum(s[f"lane_{x}_runs"] or 0 for x in lanes), sum(s[f"lane_{x}_runs"] or 0 for x in LANES)))(lanes),
         fmt="pct1", better_o=0, better_d=0, short=label) for k, label, lanes in (("in", "Inside", LANE_GROUPS["inside"]), ("tk", "Off tackle", LANE_GROUPS["off_tackle"]), ("out", "Outside", LANE_GROUPS["outside"]))],
    # tendencies (no better direction: rank 1 is the most)
    _m("pass_rate", "Pass rate", "tend", lambda s: _per(s["dropbacks"], s["plays"]), fmt="pct1", better_o=0, better_d=0, short="Pass %"),
    _m("n_pass", "Neutral pass rate", "tend", lambda s: _per(s["neutral_dropbacks"], s["neutral_plays"]), fmt="pct1", better_o=0, better_d=0, short="Neutral pass",
       desc="First to third down, win probability 20-80%, outside the last two minutes of a half."),
    _m("proe", "Pass rate over expected", "tend", lambda s: _per(s["neutral_pass_oe_sum"], s["neutral_pass_oe_plays"]), fmt="pp1", better_o=0, better_d=0, short="PROE",
       label_d="Opponent pass rate over expected", desc="Neutral situations. Against a defense, whether opponents chose to throw or run on it."),
    _m("gun", "Shotgun or pistol rate", "tend", lambda s: _per(s["shotgun_plays"], s["ftn_plays"]), fmt="pct1", better_o=0, better_d=0, short="Shotgun", first_season=FTN),
    _m("under", "Under center rate", "tend", lambda s: _per(s["under_center_plays"], s["ftn_plays"]), fmt="pct1", better_o=0, better_d=0, short="Under ctr", first_season=FTN),
    _m("empty", "Empty backfield rate", "tend", lambda s: _per(s["empty_plays"], s["ftn_plays"]), fmt="pct1", better_o=0, better_d=0, short="Empty", first_season=FTN),
    _m("motion", "Motion rate", "tend", lambda s: _per(s["motion_plays"], s["ftn_plays"]), fmt="pct1", better_o=0, better_d=0, short="Motion", first_season=FTN),
    _m("nohud", "No huddle rate", "tend", lambda s: _per(s["no_huddle_plays"], s["ftn_plays"]), fmt="pct1", better_o=0, better_d=0, short="No huddle", first_season=FTN),
    _m("pa", "Play action rate", "tend", lambda s: _per(s["play_action_dropbacks"], s["ftn_dropbacks"]), fmt="pct1", better_o=0, better_d=0, short="Play action", desc="Share of dropbacks.", first_season=FTN),
    _m("rpo", "RPO rate", "tend", lambda s: _per(s["rpo_plays"], s["ftn_plays"]), fmt="pct1", better_o=0, better_d=0, short="RPO", first_season=FTN),
    _m("screen", "Screen rate", "tend", lambda s: _per(s["screen_dropbacks"], s["ftn_dropbacks"]), fmt="pct1", better_o=0, better_d=0, short="Screen", desc="Share of dropbacks.", first_season=FTN),
    _m("blitz", "Blitz rate", "tend", lambda s: _per(s["blitzed_dropbacks"], s["ftn_dropbacks"]), fmt="pct1", better_o=0, better_d=0, short="Blitz",
       label_o="Blitzed rate", label_d="Blitz rate", desc="FTN charting, share of dropbacks.", first_season=FTN),
    _m("rushers", "Pass rushers per dropback", "tend", lambda s: _per(s["pass_rushers_sum"], s["pass_rushers_dropbacks"]), fmt="num2", better_o=0, better_d=0, short="Rushers", first_season=FTN),
    _m("man", "Man coverage rate", "tend", lambda s: _per(s["man_dropbacks"], s["coverage_dropbacks"]), fmt="pct0", better_o=0, better_d=0, short="Man %",
       label_o="Man coverage faced", label_d="Man coverage played", desc="Participation data: dropbacks with a charted coverage.", first_season=PART),
    # fantasy points by position, scored and allowed, in the request's scoring
    _m("fp", "Fantasy points per game", "fant", _fp(), short="FP/G", label_o="Fantasy points scored per game", label_d="Fantasy points allowed per game"),
    *[_m(f"fp_{p}", f"{p} fantasy points per game", "fant", _fp(p), short=f"{p} FP/G") for p in POSITIONS],
    # schedule strength: filled in after every window exists (see _sos)
    _m("sos", "Opponent strength", "sched", lambda s: s.get("sos"), fmt="sgn2", better_o=-1, better_d=1, short="Opp EPA",
       label_o="Opponent defenses, EPA allowed", label_d="Opponent offenses, EPA per play",
       desc="Average EPA per play of the opponents played, over the same weeks. Rank 1 is the hardest."),
    # personnel from snap counts (offense only, 2013+): players on the field per snap, and
    # the share of snaps with a second back. Exact as averages; the grouping split is not.
    _m("back_play", "Backs per play", "pers", lambda s: _per(s["back_snaps"], s["snaps"]), fmt="num2", better_o=0, sides=("o",),
       short="RB/play", first_season=SNAPS, desc="Running backs and fullbacks on the field per snap."),
    _m("te_play", "Tight ends per play", "pers", lambda s: _per(s["te_snaps"], s["snaps"]), fmt="num2", better_o=0, sides=("o",),
       short="TE/play", first_season=SNAPS, desc="Tight ends on the field per snap."),
    _m("wr_play", "Receivers per play", "pers", lambda s: _per(s["wr_snaps"], s["snaps"]), fmt="num2", better_o=0, sides=("o",),
       short="WR/play", first_season=SNAPS, desc="Wide receivers on the field per snap."),
    _m("two_back", "2-back rate", "pers", lambda s: _per(s["two_back_snaps"], s["snaps"]), fmt="pct1", better_o=0, sides=("o",),
       short="2-back %", first_season=SNAPS, desc="Share of snaps with two backs on the field (21 and 22 personnel)."),
    # personnel groupings (offense only)
    *[m for g in GROUPINGS for m in (
        _m(f"pers_{g}_share", f"{g} personnel usage", "pers", _pers(g, "share"), fmt="pct1", better_o=0, sides=("o",), short=f"{g} use", first_season=PART),
        _m(f"pers_{g}_epa", f"{g} personnel EPA per play", "pers", _pers(g, "epa"), fmt="sgn2", sides=("o",), short=f"{g} EPA", first_season=PART),
        _m(f"pers_{g}_suc", f"{g} personnel success rate", "pers", _pers(g, "suc"), fmt="pct0", sides=("o",), short=f"{g} succ", first_season=PART),
    )],
)
BY_ID = {m.id: m for m in METRICS}


# ---------------------------------------------------------------------------------
# Loading a season
# ---------------------------------------------------------------------------------
def _load_rows(db: Session, season: int, season_type: str) -> dict:
    """Every team-game-side row of a season, with its game's score and line, plus personnel."""
    def query() -> dict:
        rows = db.execute(select(TeamGameStats.__table__).where(
            TeamGameStats.season == season, TeamGameStats.season_type == season_type)).mappings().all()
        games = {g.game_id: g for g in db.execute(select(Game).where(Game.season == season, Game.season_type == season_type)).scalars()}
        out: list[dict] = []
        for r in rows:
            g = games.get(r["game_id"])
            row = dict(r)
            if g is not None:
                home = g.home_team_id == r["team_id"]
                pf, pa = (g.home_score, g.away_score) if home else (g.away_score, g.home_score)
                spread = None if g.spread_line is None else (g.spread_line if home else -g.spread_line)
                row.update(pf=pf, pa=pa, home=home, total=g.total_line, spread=spread, game_date=g.game_date)
            out.append(row)
        pers = db.execute(select(TeamPersonnel).where(TeamPersonnel.season == season, TeamPersonnel.season_type == season_type)).scalars().all()
        personnel: dict[tuple[int, int], dict] = {}
        for p in pers:
            bucket = personnel.setdefault((p.team_id, p.week), {})
            bucket[p.grouping] = {"plays": p.plays or 0.0, "epa": p.epa or 0.0, "successes": p.successes or 0.0}
        teams = {t.team_id: t for t in db.execute(select(Team)).scalars()}
        return {"rows": out, "personnel": personnel, "personnel_season": _personnel_season(db, season, season_type, out), "teams": {tid: {"team_id": tid, "abbreviation": t.abbreviation, "name": t.name,
                                                                     "conference": t.conference, "division": t.division, "logo_url": t.logo_url, "color": t.color}
                                                               for tid, t in teams.items() if any(r["team_id"] == tid for r in out)},
                "weeks": sorted({r["week"] for r in out})}
    return _ROWS.get_or_compute(db, ("rows", season, season_type), query)


def _personnel_season(db: Session, season: int, season_type: str, rows: list[dict]) -> dict[int, dict]:
    """team_id -> the hand-supplied season-to-date personnel, and the weeks it counts.

    Season totals cannot be split into games, so a window may use them only if it holds
    every game they count (``_personnel``). ``weeks`` is the team's played weeks up to
    ``through_week``, so a bye inside that range is not required.
    """
    out: dict[int, dict] = {}
    for p in db.execute(select(TeamPersonnelSeason).where(
            TeamPersonnelSeason.season == season, TeamPersonnelSeason.season_type == season_type)).scalars():
        team = out.setdefault(p.team_id, {"through_week": p.through_week, "groups": {}})
        team["through_week"] = min(team["through_week"], p.through_week)
        team["groups"][p.grouping] = {
            "plays": p.plays, "share": p.share,
            "epa": None if p.epa_per_play is None else p.epa_per_play * p.plays,
            "successes": None if p.success_rate is None else p.success_rate * p.plays,
        }
    for team_id, team in out.items():
        team["weeks"] = frozenset(r["week"] for r in rows
                                  if r["team_id"] == team_id and r["side"] == "o" and r["week"] <= team["through_week"])
    return out


def _fantasy(db: Session, season: int, season_type: str, config: ScoringConfig) -> dict:
    """(team_id, week) -> {"o": {pos: points scored}, "d": {pos: points allowed}}."""
    def query() -> dict:
        opp = case((Game.home_team_id == PlayerStats.team_id, Game.away_team_id), else_=Game.home_team_id)
        rows = db.execute(
            select(PlayerStats.team_id, opp.label("opp"), PlayerStats.week, Player.position, func.sum(points_expr(config, False)).label("pts"))
            .join(Player, Player.player_id == PlayerStats.player_id).join(Game, Game.game_id == PlayerStats.game_id)
            .where(PlayerStats.season == season, PlayerStats.season_type == season_type, Player.position.in_(POSITIONS))
            .group_by(PlayerStats.team_id, "opp", PlayerStats.week, Player.position)
        ).all()
        out: dict = {}
        for team_id, opp_id, week, pos, pts in rows:
            out.setdefault((team_id, week), {"o": {}, "d": {}})["o"][pos] = float(pts or 0)
            out.setdefault((opp_id, week), {"o": {}, "d": {}})["d"][pos] = float(pts or 0)
        return out
    return _FANTASY.get_or_compute(db, ("fantasy", season, season_type, config.model_dump_json()), query)


# ---------------------------------------------------------------------------------
# Windows
# ---------------------------------------------------------------------------------
def _personnel(rows: list[dict], personnel: dict, snapshot: dict | None, team_id: int) -> tuple[dict, int | None]:
    """A team's offensive personnel over the window's games, and the week it runs to
    when it came from a hand-supplied season total (None when it came from games).

    Per-game rows (participation) are summed and each grouping's share taken over every
    grouping. With none, a season total is used if the window holds every game it
    counts, share as the file states it; a narrower window gets nothing rather than a
    season's numbers under a label that says otherwise.
    """
    pers: dict[str, dict] = {}
    for r in rows:
        for g, p in personnel.get((team_id, r["week"]), {}).items():
            acc = pers.setdefault(g, {"plays": 0.0, "epa": 0.0, "successes": 0.0})
            for k in acc:
                acc[k] += p[k]
    if pers:
        total = sum(p["plays"] for p in pers.values())
        for p in pers.values():
            p["share"] = p["plays"] / total if total else None
        return pers, None
    if snapshot and snapshot["weeks"] and snapshot["weeks"] <= {r["week"] for r in rows}:
        return {g: dict(p) for g, p in snapshot["groups"].items()}, snapshot["through_week"]
    return {}, None


def _sum_side(rows: list[dict], side: str, personnel: dict, fantasy: dict, team_id: int, snapshot: dict | None = None) -> dict:
    s: dict = {c: None for c in SUM_COLUMNS}
    for r in rows:
        for col in SUM_COLUMNS:
            v = r.get(col)
            if v is not None:
                s[col] = (s[col] or 0.0) + v
    s.update(side=side, games=len(rows), snap_games=sum(1 for r in rows if r.get("snaps")))
    scored = [r for r in rows if r.get("pf") is not None]
    s.update(scored_games=len(scored), pf=sum(r["pf"] for r in scored), pa=sum(r["pa"] for r in scored))
    lined = [r for r in scored if r.get("total") is not None and r.get("spread") is not None]
    s.update(lines=len(lined), imp_sum=sum(r["total"] / 2 + r["spread"] / 2 for r in lined),
             opp_imp_sum=sum(r["total"] / 2 - r["spread"] / 2 for r in lined),
             pf_lined=sum(r["pf"] for r in lined), pa_lined=sum(r["pa"] for r in lined))
    fp: dict[str, float] = {}
    fp_games = 0
    for r in rows:
        f = fantasy.get((team_id, r["week"]))
        if f:
            fp_games += 1
            for pos, pts in f[side].items():
                fp[pos] = fp.get(pos, 0.0) + pts
    s.update(fp=fp, fp_games=fp_games)
    s["pers"], s["pers_through_week"] = _personnel(rows, personnel, snapshot, team_id) if side == "o" else ({}, None)
    return s


def _windows(data: dict, weeks: set[int], fantasy: dict) -> dict[int, dict]:
    by_team: dict[int, dict[str, list]] = {}
    for r in data["rows"]:
        if r["week"] in weeks:
            by_team.setdefault(r["team_id"], {"o": [], "d": []})[r["side"]].append(r)
    windows = {}
    for team_id, sides in by_team.items():
        o = _sum_side(sides["o"], "o", data["personnel"], fantasy, team_id, data.get("personnel_season", {}).get(team_id))
        d = _sum_side(sides["d"], "d", data["personnel"], fantasy, team_id)
        scored = [r for r in sides["o"] if r.get("pf") is not None]
        windows[team_id] = {"team_id": team_id, "o": o, "d": d, "games": len(sides["o"]), "rows": sides,
                            "wins": sum(1 for r in scored if r["pf"] > r["pa"]), "losses": sum(1 for r in scored if r["pf"] < r["pa"]),
                            "ties": sum(1 for r in scored if r["pf"] == r["pa"])}
    # schedule strength needs every opponent's window first
    for w in windows.values():
        for side, other in (("o", "d"), ("d", "o")):
            vals = []
            for r in w["rows"][side]:
                opp = windows.get(r["opponent_id"])
                z = opp[other] if opp else None
                if z and z["plays"]:
                    vals.append(z["epa"] / z["plays"])
            w[side]["sos"] = sum(vals) / len(vals) if vals else None
    return windows


def _personnel_through_week(windows: dict) -> int | None:
    """The week hand-supplied personnel runs to, if any window used it."""
    weeks = [w["o"]["pers_through_week"] for w in windows.values() if w["o"]["pers_through_week"] is not None]
    return min(weeks) if weeks else None


def _value(metric: TeamMetric, window: dict, side: str):
    try:
        v = metric.get(window) if metric.single else metric.get(window[side])
    except (TypeError, ZeroDivisionError, KeyError):
        return None
    return float(v) if v is not None else None


def _rank(values: dict[int, float], better: int) -> dict[int, int]:
    """Competition rank, 1 = best (or the most, for a metric with no direction)."""
    sign = -1 if better == -1 else 1
    ordered = sorted(values.values(), key=lambda v: -sign * v)
    return {team: 1 + sum(1 for v in ordered if sign * v > sign * value) for team, value in values.items()}


def parse_weeks(raw: str | None, played: list[int]) -> set[int]:
    """"3,7,12" -> {3, 7, 12}; empty -> every played week. Unplayed weeks are dropped."""
    if not raw:
        return set(played)
    chosen = {int(x) for x in raw.split(",") if x.strip().isdigit()}
    return (chosen & set(played)) or set(played)


# ---------------------------------------------------------------------------------
# The board: every metric, every team, both sides
# ---------------------------------------------------------------------------------
def team_board(db: Session, season: int, season_type: str, weeks_raw: str | None, config: ScoringConfig) -> dict:
    data = _load_rows(db, season, season_type)
    weeks = parse_weeks(weeks_raw, data["weeks"])

    def compute() -> dict:
        fantasy = _fantasy(db, season, season_type, config)
        windows = _windows(data, weeks, fantasy)
        values: dict[str, dict] = {}
        for m in METRICS:
            entry: dict = {}
            for side in (("o",) if m.single else m.sides):
                vals = {t: v for t, w in windows.items() if (v := _value(m, w, side)) is not None}
                ranks = _rank(vals, m.better(side))
                abbr = {t: data["teams"][t]["abbreviation"] for t in vals}
                entry[side] = {abbr[t]: [round(v, 4), ranks[t]] for t, v in vals.items()}
                entry[f"{side}_mean"] = round(sum(vals.values()) / len(vals), 4) if vals else None
            values[m.id] = entry
        teams = [{**data["teams"][t], "record": {"wins": w["wins"], "losses": w["losses"], "ties": w["ties"]}, "games": w["games"]}
                 for t, w in windows.items()]
        return {"season": season, "season_type": season_type, "played_weeks": data["weeks"], "weeks": sorted(weeks),
                "personnel_through_week": _personnel_through_week(windows),
                "teams": sorted(teams, key=lambda t: t["abbreviation"]), "metrics": [m.as_dict() for m in METRICS], "values": values}

    return _BOARDS.get_or_compute(db, ("board", season, season_type, tuple(sorted(weeks)), config.model_dump_json()), compute)


# ---------------------------------------------------------------------------------
# One team: trend, pass depth, run lanes, personnel, staff
# ---------------------------------------------------------------------------------
def _quantile(sorted_values: list[float], p: float) -> float:
    return sorted_values[min(len(sorted_values) - 1, max(0, round(p * (len(sorted_values) - 1))))]


def _trend(data: dict, team_id: int) -> dict:
    weeks = data["weeks"]
    by = {}
    for r in data["rows"]:
        by.setdefault(r["team_id"], {}).setdefault(r["week"], {})[r["side"]] = r
    metrics = {"net": lambda o, d: o["epa"] / o["plays"] - d["epa"] / d["plays"],
               "off": lambda o, d: o["epa"] / o["plays"], "def": lambda o, d: d["epa"] / d["plays"]}
    out = {}
    for key, fn in metrics.items():
        single, cum = {}, {}
        for team, games in by.items():
            so = {"epa": 0.0, "plays": 0.0}; sd = {"epa": 0.0, "plays": 0.0}
            for w in weeks:
                g = games.get(w)
                if g and "o" in g and "d" in g and g["o"]["plays"] and g["d"]["plays"]:
                    single[(team, w)] = fn(g["o"], g["d"])
                    so["epa"] += g["o"]["epa"]; so["plays"] += g["o"]["plays"]; sd["epa"] += g["d"]["epa"]; sd["plays"] += g["d"]["plays"]
                if so["plays"] and sd["plays"]:
                    cum[(team, w)] = fn(so, sd)
        points = []
        for w in weeks:
            wk = sorted(v for (t, ww), v in single.items() if ww == w)
            roll = [v for (t, ww), v in cum.items() if ww == w]
            g = by.get(team_id, {}).get(w, {}).get("o")
            points.append({"week": w, "value": _r(single.get((team_id, w))), "to_date": _r(cum.get((team_id, w))) if g else None,
                           "opponent_id": g["opponent_id"] if g else None,
                           "opponent": data["teams"].get(g["opponent_id"], {}).get("abbreviation") if g else None,
                           "home": g.get("home") if g else None,
                           "points_for": g.get("pf") if g else None, "points_against": g.get("pa") if g else None,
                           "league_to_date": _r(sum(roll) / len(roll)) if roll else None,
                           "league_q25": _r(_quantile(wk, 0.25)) if wk else None, "league_q75": _r(_quantile(wk, 0.75)) if wk else None})
        out[key] = points
    return out


def _r(v, digits: int = 4):
    return None if v is None else round(v, digits)


def _zone(windows: dict, team_id: int, prefix: str, keys: tuple[str, ...], count_field: str, extra: tuple[str, ...]) -> list[dict]:
    """Share, share rank, EPA and EPA rank per bucket, for one team against the league (offense)."""
    totals = {t: sum(w["o"][f"{prefix}_{k}_{count_field}"] or 0 for k in keys) for t, w in windows.items()}
    out = []
    for k in keys:
        n = {t: w["o"][f"{prefix}_{k}_{count_field}"] or 0 for t, w in windows.items()}
        share = {t: n[t] / totals[t] for t in windows if totals[t]}
        epa = {t: windows[t]["o"][f"{prefix}_{k}_epa"] / n[t] for t in windows if n[t] >= ZONE_MIN_PLAYS}
        sr, er = _rank(share, 0), _rank(epa, 1)
        me = windows.get(team_id)
        lg_n = sum(n.values())
        row = {"key": k, "plays": n.get(team_id, 0), "share": _r(share.get(team_id)), "share_rank": sr.get(team_id), "share_teams": len(share),
               "epa": _r(epa.get(team_id)), "epa_rank": er.get(team_id), "epa_teams": len(epa),
               "league_share": _r(lg_n / sum(totals.values())) if sum(totals.values()) else None,
               "league_epa": _r(sum(w["o"][f"{prefix}_{k}_epa"] or 0 for w in windows.values()) / lg_n) if lg_n else None}
        for f in extra:
            v = me["o"][f"{prefix}_{k}_{f}"] if me else None
            row[f] = _r(v / n[team_id]) if me and n.get(team_id) and v is not None else None
        out.append(row)
    return out


def _lane_groups(windows: dict, team_id: int) -> list[dict]:
    def runs(w, lanes, f):
        return sum(w["o"][f"lane_{x}_{f}"] or 0 for x in lanes)
    out = []
    for key, lanes in LANE_GROUPS.items():
        share = {t: runs(w, lanes, "runs") / runs(w, LANES, "runs") for t, w in windows.items() if runs(w, LANES, "runs")}
        epa = {t: runs(w, lanes, "epa") / runs(w, lanes, "runs") for t, w in windows.items() if runs(w, lanes, "runs") >= ZONE_MIN_PLAYS}
        er = _rank(epa, 1)
        total = sum(runs(w, LANES, "runs") for w in windows.values())
        out.append({"key": key, "share": _r(share.get(team_id)), "epa": _r(epa.get(team_id)), "epa_rank": er.get(team_id), "epa_teams": len(epa),
                    "league_share": _r(sum(runs(w, lanes, "runs") for w in windows.values()) / total) if total else None})
    return out


def _personnel_cards(windows: dict, team_id: int) -> list[dict]:
    me = windows.get(team_id)
    if not me or not me["o"]["pers"]:
        return []
    mine = me["o"]["pers"]
    cards = []
    for g, p in sorted(mine.items(), key=lambda kv: -kv[1]["plays"]):
        share = p["share"]
        if share is None or share < 0.03:
            continue
        # The league figure is the mean of the teams' shares, like the rank table's.
        shares = {t: (w["o"]["pers"].get(g, {}).get("share") or 0.0) for t, w in windows.items() if w["o"]["pers"]}
        epa = {t: pp["epa"] / pp["plays"] for t, w in windows.items()
               if (pp := w["o"]["pers"].get(g)) and pp["plays"] >= PERSONNEL_MIN_PLAYS and pp["epa"] is not None}
        sr, er = _rank(shares, 0), _rank(epa, 1)
        cards.append({"grouping": g, "plays": p["plays"], "share": _r(share), "share_rank": sr.get(team_id), "share_teams": len(shares),
                      "league_share": _r(sum(shares.values()) / len(shares)) if shares else None,
                      "epa": _r(epa.get(team_id)), "epa_rank": er.get(team_id), "epa_teams": len(epa),
                      "success": _r(p["successes"] / p["plays"]) if p["plays"] and p["successes"] is not None else None})
        if len(cards) == 5:
            break
    return cards


def team_breakdown(db: Session, team_id: int, season: int, season_type: str, weeks_raw: str | None) -> dict:
    data = _load_rows(db, season, season_type)
    weeks = parse_weeks(weeks_raw, data["weeks"])
    windows = _windows(data, weeks, {})
    staff = db.execute(select(TeamStaff).where(TeamStaff.team_id == team_id).order_by(TeamStaff.season.desc())).scalars().all()
    return {
        "team_id": team_id, "season": season, "season_type": season_type, "played_weeks": data["weeks"], "weeks": sorted(weeks),
        "trend": _trend(data, team_id),
        "pass_depth": _zone(windows, team_id, "depth", DEPTHS, "attempts", ("completions",)),
        "run_lanes": _zone(windows, team_id, "lane", LANES, "runs", ("successes", "yards")),
        "run_groups": _lane_groups(windows, team_id),
        "personnel": _personnel_cards(windows, team_id),
        "personnel_through_week": _personnel_through_week(windows),
        "staff": [{"season": s.season, "head_coach": s.head_coach, "offensive_coordinator": s.offensive_coordinator,
                   "defensive_coordinator": s.defensive_coordinator} for s in staff],
    }
