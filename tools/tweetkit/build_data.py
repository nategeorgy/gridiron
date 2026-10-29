"""raw/*.json -> data.json, trimmed to what the cards draw, plus need_images.json."""
import json
import os
from bisect import bisect_left, bisect_right

from pull import PERCENTILES, RANKS
import re
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
API = "http://localhost:8000/api/v1"


def load(name):
    with open(os.path.join(HERE, "raw", f"{name}.json")) as handle:
        return json.load(handle)


def r(value, digits=3):
    return None if value is None else round(value, digits)


def pick(row, keys, digits=3):
    out = {}
    for key in keys:
        value = row.get(key)
        out[key] = r(value, digits) if isinstance(value, float) else value
    return out


meta = load("meta")
SEASON, RECAP_WEEK, PREVIEW_WEEK = meta["season"], meta["recap_week"], meta["preview_week"]
games = load("games")
recaps_raw = load("recaps")
previews_raw = load("previews")
teams_raw = load("teams")
team_stats = load("team_stats")
through = load("team_stats_through")
intel = load("intel")
intel_early = load("intel_early")
intel_late = load("intel_late")
week_top = load("week_top")
players_raw = load("players")

team_list = teams_raw["data"] if isinstance(teams_raw, dict) else teams_raw
TEAMS = {}
for team in team_list:
    TEAMS[team["abbreviation"]] = {
        "id": team["team_id"], "name": team["name"], "color": team.get("color"), "color2": team.get("color2"),
        "conf": team.get("conference"), "div": team.get("division"),
    }

headshots = {}  # player_id -> url


def note_face(player):
    if player.get("headshot_url"):
        headshots[player["player_id"]] = player["headshot_url"]


HEADER_KEYS = ["game_id", "week", "week_label", "game_date", "kickoff_time", "stadium", "roof", "div_game", "status",
               "overtime", "periods", "spread_line", "total_line", "favorite", "home_implied", "away_implied",
               "home_moneyline", "away_moneyline", "home_win_chance", "pregame_home_wp", "line_result"]


def header(h):
    out = pick(h, HEADER_KEYS)
    for side in ("away", "home"):
        s = h[side]
        out[side] = pick(s, ["abbreviation", "name", "score", "record", "rest_days", "linescore"])
    return out


RECAP_PLAYER = ["player_id", "name", "position", "team", "fantasy_points", "expected_fantasy_points", "position_rank",
                "pool_size", "average_coming_in", "games_coming_in", "points_by_quarter", "completions", "attempts",
                "passing_yards", "passing_tds", "interceptions", "sacks_suffered", "carries", "rushing_yards",
                "rushing_tds", "targets", "receptions", "receiving_yards", "receiving_tds", "snap_share",
                "target_share", "air_yards", "routes_run", "epa", "fumbles_lost", "red_zone_targets",
                "rush_att_inside_10", "adot", "yards_after_catch", "passing_epa", "points_by_phase"]

TEAM_BOX = ["points", "plays", "yards", "yards_per_play", "first_downs", "passing_yards", "rushing_yards",
            "third_down_conversions", "third_down_attempts", "fourth_down_conversions", "fourth_down_attempts",
            "red_zone_tds", "red_zone_trips", "turnovers", "sacks", "penalties", "penalty_yards", "explosive_plays",
            "time_of_possession", "epa_per_play", "success_rate", "epa_per_dropback", "epa_per_run", "pass_rate",
            "drives", "points_per_drive", "three_and_outs", "average_start", "neutral_pass_rate"]


def short_text(text):
    """Play-by-play's raw sentence to the recap's short form, for the few it leaves long."""
    if text == "D, fumble":
        return "Fumble"
    if not text or len(text) < 40:
        return text
    surname = lambda s: s.split(".")[-1].strip()
    penalty = re.search(r"PENALTY on (\w+)", text)
    tail = f", penalty on {penalty.group(1)}" if penalty else ""
    m = re.match(r"\(?[\d:]*\)?\s*(?:\(Shotgun\)\s*)?([A-Z]\.\s?[\w'\-]+) pass incomplete[\w ]*?(?: to ([A-Z]\.\s?[\w'\-]+))?[.\s\[]", text)
    if m:
        return f"{surname(m.group(1))} incomplete" + (f" to {surname(m.group(2))}" if m.group(2) else "") + tail
    m = re.match(r"([A-Z]\.\s?[\w'\-]+) punt is BLOCKED by ([A-Z]\.\s?[\w'\-]+)", text)
    if m:
        return f"{surname(m.group(1))} punt blocked by {surname(m.group(2))}"
    m = re.match(r"([A-Z]\.\s?[\w'\-]+) extra point is GOOD", text)
    if m:
        return f"{surname(m.group(1))} extra point good"
    m = re.match(r"\(?[\d:]*\)?\s*(?:\(Shotgun\)\s*)?([A-Z]\.\s?[\w'\-]+) pass [\w ]*?to ([A-Z]\.\s?[\w'\-]+).*?for (-?\d+) yards?", text)
    if m:
        passer, target, yards = (m.group(1).split(".")[-1].strip(), m.group(2).split(".")[-1].strip(), m.group(3))
        return f"{passer} to {target}, {yards} yards" + (", TD" if "TOUCHDOWN" in text else "") + tail
    m = re.match(r"\(?[\d:]*\)?\s*(?:\(Shotgun\)\s*)?([A-Z]\.\s?[\w'\-]+) (?:up the middle|left|right|scrambles)[\w ]*? for (-?\d+) yards?", text)
    if m:
        return f"{m.group(1).split('.')[-1].strip()} run, {m.group(2)} yards" + (", TD" if "TOUCHDOWN" in text else "")
    m = re.match(r".*?([A-Z]\.\s?[\w'\-]+) pass [\w ]*?intended for ([A-Z]\.\s?[\w'\-]+) INTERCEPTED by ([A-Z]\.\s?[\w'\-]+)", text)
    if m:
        return f"{m.group(1).split('.')[-1].strip()} intercepted by {m.group(3).split('.')[-1].strip()}"
    return text[:60].rstrip() + "..."


recaps = []
for game in sorted(games[str(RECAP_WEEK)], key=lambda g: (g["game_date"], g.get("kickoff_time") or "")):
    gid = game["game_id"]
    if gid not in recaps_raw:  # not played yet
        continue
    raw = recaps_raw[gid]
    h, rc = raw["header"], raw["recap"]
    for p in rc["players"]:
        note_face(p)
    recaps.append({
        "id": gid,
        "header": header(h),
        "wp": {"pregame": rc["win_probability"]["pregame"], "end": rc["win_probability"]["end"],
               "series": [[t, round(v, 4)] for t, v in rc["win_probability"]["series"]]},
        "swings": [dict(pick(s, ["elapsed", "quarter", "clock", "team", "home_delta", "home_wp"]), text=short_text(s["text"]))
                   for s in rc["swings"]],
        "scoring": [dict(pick(s, ["quarter", "clock", "team", "type", "away_score", "home_score", "elapsed"]), text=s["text"])
                    for s in rc["scoring_plays"]],
        "drives": [pick(d, ["drive", "team", "quarter", "clock", "elapsed", "start", "end", "plays", "yards", "seconds", "result", "points"])
                   for d in rc["drives"]],
        "flow": rc["flow"],
        "epa_q": rc["epa_by_quarter"],
        "box": {team: pick(v, TEAM_BOX) for team, v in rc["team_box"].items()},
        "ranks": rc["week_ranks"],
        "players": [pick(p, RECAP_PLAYER) for p in rc["players"]],
        "touches": rc["touches"],
        "league": rc["league"],
        "passers": rc["passers"],
    })

PREVIEW_PLAYER = ["player_id", "name", "position", "team", "games", "fantasy_points", "fantasy_ppg",
                  "expected_fantasy_ppg", "target_share", "rush_attempt_share", "snap_share", "targets", "carries",
                  "consensus", "injury", "matchup"]

previews = []
for game in sorted(games[str(PREVIEW_WEEK)], key=lambda g: (g["game_date"], g.get("kickoff_time") or "")):
    gid = game["game_id"]
    raw = previews_raw[gid]
    h, pv = raw["header"], raw["preview"]
    players = {}
    for team, rows in pv["players"].items():
        keep = [row for row in rows if (row["fantasy_ppg"] or 0) > 0][:12]
        for row in keep:
            note_face(row)
        players[team] = [dict(pick(row, PREVIEW_PLAYER),
                              weeks=[pick(w, ["week", "played", "bye", "fantasy_points", "position_rank", "target_share",
                                              "rush_attempt_share", "snap_share"]) for w in row["weeks"]])
                         for row in keep]
    meetings = []
    for m in pv["meetings"][:6]:
        for s in m.get("top_scorers", []):
            note_face(s)
        meetings.append(dict(pick(m, ["game_id", "season", "week", "week_label", "home", "away", "home_score",
                                      "away_score", "winner", "spread_line", "total_line", "line_result"]),
                             top=[pick(s, ["player_id", "name", "position", "team", "fantasy_points"]) for s in m.get("top_scorers", [])[:1]]))
    previews.append({
        "id": gid, "header": header(h), "form": pv["form"], "slate": pv["slate"], "players": players,
        "pa": pv["points_allowed"], "tape": pv["tape"], "tendencies": pv["tendencies"],
        "defense_tendencies": pv.get("defense_tendencies") or [],
        "teams_ranked": pv["teams_ranked"],
        "trend": {team: {k: [pick(x, ["week", "value", "to_date", "opponent", "home", "points_for", "points_against",
                                      "league_q25", "league_q75"]) for x in v[k]] for k in ("net", "off", "def")}
                  for team, v in pv["trend"].items()},
        "meetings": meetings, "meetings_total": len(pv["meetings"]),
        "pass_depth": pv.get("pass_depth"),
    })

# ---------------------------------------------------------------- landscape
values = team_stats["values"]
landscape = []
for team in team_stats["teams"]:
    abbr = team["abbreviation"]
    trail = []
    for week, snap in sorted(through.items(), key=lambda kv: int(kv[0])):
        v = snap["values"]
        off, de = v["epa"]["o"].get(abbr), v["epa"]["d"].get(abbr)
        if off and de:
            trail.append({"w": int(week), "o": r(off[0], 4), "d": r(de[0], 4)})
    landscape.append({
        "team": abbr, "record": team["record"], "games": team["games"],
        "off": values["epa"]["o"][abbr], "def": values["epa"]["d"][abbr],
        "net": values["net_epa"]["o"].get(abbr), "ppg": values["ppg"]["o"].get(abbr),
        "ppg_against": values["ppg"]["d"].get(abbr), "pdiff": values["pdiff"]["o"].get(abbr),
        "p_epa": values["p_epa"]["o"].get(abbr), "r_epa": values["r_epa"]["o"].get(abbr),
        "trail": trail,
    })
league_means = {"off": values["epa"]["o_mean"], "def": values["epa"]["d_mean"]}

# ----------------------------------------------------------- week's best
week_rows = {}
for position, rows in week_top.items():
    week_rows[position] = [pick(row, ["player_id", "name", "position", "team_abbreviation", "fantasy_points",
                                      "expected_fantasy_points", "completions", "attempts", "passing_yards", "passing_tds",
                                      "interceptions", "carries", "rushing_yards", "rushing_tds", "targets", "receptions",
                                      "receiving_yards", "receiving_tds", "snap_share", "target_share"]) for row in rows[:12]]

season_rows = {row["player_id"]: row for position in intel for row in intel[position]}
# ------------------------------------------------------------ usage risers
def by_id(rows):
    return {row["player_id"]: row for row in rows}


usage = {}
for position in ("RB", "WR", "TE"):
    early, late = by_id(intel_early[position]), by_id(intel_late[position])
    moves = []
    for pid, now in late.items():
        before = early.get(pid)
        if not before or (now.get("games_played") or 0) < 2 or (before.get("games_played") or 0) < 2:
            continue
        x0, x1 = before.get("expected_fantasy_ppg"), now.get("expected_fantasy_ppg")
        if x0 is None or x1 is None:
            continue
        moves.append({
            "player_id": pid, "name": now["name"], "position": position, "team": now["team_abbreviation"],
            "x0": r(x0, 2), "x1": r(x1, 2), "p0": r(before.get("fantasy_ppg"), 2), "p1": r(now.get("fantasy_ppg"), 2),
            "o0": r(before.get("opportunity_share"), 3), "o1": r(now.get("opportunity_share"), 3),
            "t0": r(before.get("target_share"), 3), "t1": r(now.get("target_share"), 3),
            "c0": r(before.get("rush_attempt_share"), 3), "c1": r(now.get("rush_attempt_share"), 3),
            "s0": r(before.get("snap_share"), 3), "s1": r(now.get("snap_share"), 3),
            "g0": before.get("games_played"), "g1": now.get("games_played"),
        })
    usage[position] = moves
# The usage above averages every game, so a game a player left hurt reads as lost work.
# Rebuilt from game logs (the reply-card pool), counting only games where he played at
# least FULL_GAME of his own median snap share, with two such games in each window. The
# same rule as an on/off split in CLAUDE.md: never average a game he did not play in full.
FULL_GAME = 0.6


def window_usage(raw_log, weeks):
    played = [g for g in raw_log if g.get("snap_share") is not None]
    if not played:
        return None
    usual = sorted(g["snap_share"] for g in played)[len(played) // 2]
    games = [g for g in played if g["week"] in weeks and g["snap_share"] >= FULL_GAME * usual]
    if len(games) < 2:
        return None
    mean = lambda key: sum((g.get(key) or 0) for g in games) / len(games)
    return {"x": mean("expected_fantasy_points"), "p": mean("fantasy_points"), "t": mean("target_share"),
            "c": mean("rush_attempt_share"), "s": mean("snap_share"), "g": len(games)}


early_weeks, late_weeks = set(range(1, RECAP_WEEK - 2)), set(range(RECAP_WEEK - 2, RECAP_WEEK + 1))
moves = []
for pid, raw in players_raw.items():
    position = raw["profile"]["position"]
    if position not in ("RB", "WR", "TE"):
        continue
    a, b = window_usage(raw["log"], early_weeks), window_usage(raw["log"], late_weeks)
    if not a or not b:
        continue
    season = season_rows.get(pid, {})
    moves.append({
        "player_id": pid, "name": raw["profile"]["name"], "position": position,
        "team": season.get("team_abbreviation") or raw["profile"].get("team_abbreviation"),
        "x0": r(a["x"], 2), "x1": r(b["x"], 2), "p0": r(a["p"], 2), "p1": r(b["p"], 2),
        "t0": r(a["t"], 3), "t1": r(b["t"], 3), "c0": r(a["c"], 3), "c1": r(b["c"], 3),
        "s0": r(a["s"], 3), "s1": r(b["s"], 3), "g0": a["g"], "g1": b["g"],
    })
risers = sorted([m for m in moves if m["x1"] >= 10 and m["x1"] > m["x0"]], key=lambda m: m["x0"] - m["x1"])[:8]
fallers = sorted([m for m in moves if m["x0"] >= 10 and m["x1"] < m["x0"]], key=lambda m: m["x1"] - m["x0"])[:8]

# --------------------------------------------------------------- RB work
rb_work = []
for row in intel["RB"]:
    if (row.get("games_played") or 0) < 3 or row.get("rush_attempt_share") is None:
        continue
    if (row.get("expected_fantasy_ppg") or 0) < 6:
        continue
    rb_work.append(pick(row, ["player_id", "name", "team_abbreviation", "games_played", "rush_attempt_share",
                              "target_share", "snap_share", "expected_fantasy_ppg", "fantasy_ppg", "carries", "targets",
                              "opportunity_share"]))

# ------------------------------------------------------------ the players
SEASON_KEYS = {
    "all": ["fantasy_points", "fantasy_ppg", "expected_fantasy_ppg", "fantasy_points_over_expected", "games_played",
            "snap_share", "epa", "tds_over_expected", "fantasy_opportunity_rating"],
    "QB": ["completions", "attempts", "passing_yards", "passing_tds", "interceptions", "carries", "rushing_yards",
           "rushing_tds", "epa_per_play", "cpoe", "yards_per_attempt", "passer_rating", "sacks_suffered",
           "ngs_pass_intended_air_yards", "ngs_pass_time_to_throw", "completion_pct", "passing_yards_exp",
           "passing_tds_exp", "rushing_yards_exp", "rushing_tds_exp", "interceptions_exp"],
    "RB": ["carries", "rushing_yards", "rushing_tds", "targets", "receptions", "receiving_yards", "receiving_tds",
           "rush_attempt_share", "opportunity_share", "target_share", "rush_att_inside_5", "rush_att_inside_10",
           "yards_per_carry", "rushing_epa", "ngs_rush_yards_over_expected_per_att", "rush_yards_after_contact",
           "red_zone_rush_share", "rush_broken_tackles", "rushing_yards_exp", "rushing_tds_exp", "receptions_exp",
           "receiving_yards_exp", "receiving_tds_exp"],
    "WR": ["targets", "receptions", "receiving_yards", "receiving_tds", "target_share", "air_yards_share",
           "route_participation", "targets_per_route_run", "yards_per_route_run", "adot", "red_zone_targets",
           "ngs_rec_separation", "yards_after_catch", "catch_rate", "wopr", "receiving_epa", "routes_run",
           "ngs_rec_yac_above_expectation", "fantasy_points_per_route_run", "receptions_exp", "receiving_yards_exp",
           "receiving_tds_exp", "carries", "rushing_yards", "rushing_tds"],
}
SEASON_KEYS["TE"] = SEASON_KEYS["WR"]

LOG_KEYS = ["week", "game_id", "opponent_abbreviation", "team_abbreviation", "fantasy_points", "expected_fantasy_points",
            "position_rank", "pool_size", "snap_share", "target_share", "rush_attempt_share", "route_participation",
            "targets", "receptions", "receiving_yards", "receiving_tds", "carries", "rushing_yards", "rushing_tds",
            "completions", "attempts", "passing_yards", "passing_tds", "interceptions", "air_yards", "routes_run",
            "red_zone_targets", "rush_att_inside_5", "air_yards_share", "epa", "fumbles_lost"]

# D1 and B7 ask for stats with no registry metric (a quarterback's rushing yards per game and sack %). They are ranked the way the API ranks
# every other one (app/percentiles.py): within the qualified players at the position, rank
# = players strictly better + 1, percentile = mid-rank (below + half the ties) / pool.
# Sack % is sacks over dropbacks (attempts + sacks), the registry's own dropbacks.
def sack_rate(row):
    dropbacks = (row.get("attempts") or 0) + (row.get("sacks_suffered") or 0)
    return (row.get("sacks_suffered") or 0) / dropbacks if dropbacks else None


# [value, higher is better]
DERIVED = {
    "QB": {
        "rushing_yards_per_game": (lambda r: (r.get("rushing_yards") or 0) / r["games_played"] if r.get("games_played") else None, True),
        "sack_rate": (sack_rate, False),
    },
}


def rank_and_percentile(value, pool, higher=True):
    """Rank (1 = best) and percentile within a sorted pool, for either direction."""
    below, through = bisect_left(pool, value), bisect_right(pool, value)
    ties = 0.5 * (through - below)
    if higher:
        return len(pool) - through + 1, round((below + ties) / len(pool) * 100)
    return below + 1, round((len(pool) - through + ties) / len(pool) * 100)


derived = {}
for position, metrics in DERIVED.items():
    rows = intel[position]
    for metric, (value_of, higher) in metrics.items():
        pool = sorted(v for row in rows if row.get("qualified") and (v := value_of(row)) is not None)
        for row in rows:
            value = value_of(row)
            if value is not None and pool:
                derived.setdefault(row["player_id"], {})[metric] = (value, *rank_and_percentile(value, pool, higher))

players = {}
for pid, raw in players_raw.items():
    profile = raw["profile"]
    position = profile["position"]
    season = season_rows.get(pid)
    if not season:
        continue
    note_face(profile)
    keys = SEASON_KEYS["all"] + SEASON_KEYS[position] + PERCENTILES[position] + RANKS[position]
    entry = {
        "id": pid, "name": profile["name"], "pos": position, "team": season["team_abbreviation"],
        "number": profile.get("jersey_number"), "age": profile.get("age"), "height": profile.get("height"),
        "weight": profile.get("weight"), "college": profile.get("college_name"), "draft": pick(profile, ["draft_year", "draft_round", "draft_pick", "draft_team"]),
        "depth": profile.get("depth_chart"),
        "season": pick(season, keys, 4),
        "pct": season.get("percentiles") or {},
        "ranks": season.get("ranks") or {},
        "qualified": season.get("qualified"),
        "log": [pick(g, LOG_KEYS) for g in raw["log"]],
        "career": [pick(c, ["season", "team_abbreviation", "games_played", "fantasy_points", "fantasy_ppg",
                            "position_rank", "position_rank_ppg", "pool_size", "ppg_pool_size", "ppg_qualified",
                            "expected_fantasy_ppg"], 2) for c in raw["career"]],
    }
    t = raw.get("targets") or {}
    entry["targets"] = [[x["week"], x["air_yards"], x["location"], int(bool(x["complete"])), int(bool(x["touchdown"])),
                         int(bool(x["interception"])), x["yards"]] for x in t.get("targets", [])]
    entry["tsum"] = pick(t.get("summary") or {}, ["targets", "receptions", "yards", "touchdowns", "interceptions", "adot", "epa_per_target", "games"])
    entry["tavg"] = pick(t.get("average") or {}, ["adot", "epa_per_target", "catch_rate"])
    if raw.get("runs"):
        runs = raw["runs"]
        entry["runs"] = {"lanes": runs["lanes"], "outcomes": runs["outcomes"], "carries": runs["carries"],
                         "avg": {"lanes": runs["average"]["lanes"], "outcomes": runs["average"]["outcomes"],
                                 "carries": runs["average"]["carries"]}}
    for metric, (value, rank, percentile) in derived.get(pid, {}).items():
        entry["season"][metric] = r(value, 4)
        entry["ranks"][metric] = rank
        entry["pct"][metric] = percentile
    players[pid] = entry

# ---------------------------------------------------------------- teams (E)
team_stats_values = values
breakdowns = load("breakdowns")
weekly_boards = load("weekly_boards")
TEAM_METRICS = ["record", "pdiff", "ppg", "net_epa", "epa", "suc", "p_epa", "r_epa", "explosive", "pts_drive", "rz_td",
                "d3", "tov_g", "sack_rate", "pass_rate", "n_pass", "proe", "sec_snap", "plays_g", "adot",
                "fp_QB", "fp_RB", "fp_WR", "fp_TE"]
metric_meta = {m["id"]: {"label": m["label"], "fmt": m["fmt"]} for m in team_stats["metrics"] if m["id"] in TEAM_METRICS}
all_rows = [row for position in intel for row in intel[position]]
teams_cards = {}
for team in team_stats["teams"]:
    abbr = team["abbreviation"]
    stats = {mid: {side: team_stats_values[mid][side].get(abbr) for side in ("o", "d") if side in team_stats_values[mid]}
             for mid in TEAM_METRICS if mid in team_stats_values}
    roster = sorted((row for row in all_rows if row.get("team_abbreviation") == abbr),
                    key=lambda row: -(row.get("fantasy_points") or 0))
    top = [pick(row, ["player_id", "name", "position", "fantasy_points", "fantasy_ppg", "games_played"]) for row in roster[:5]]
    for row in top:
        row["rank"] = next((rank for rank, other in enumerate(sorted(
            (r2 for r2 in intel[row["position"]] if r2.get("qualified")), key=lambda r2: -(r2.get("fantasy_ppg") or 0)), 1)
            if other["player_id"] == row["player_id"]), None)
    # Share of the work: every skill player's target and carry share by week, for the
    # players with the most targets plus carries.
    weeks = sorted(int(w) for w in weekly_boards)
    share = {}
    for week in weeks:
        for row in weekly_boards[str(week)]:
            if row.get("team_abbreviation") != abbr:
                continue
            entry = share.setdefault(row["player_id"], {"player_id": row["player_id"], "name": row["name"],
                                                         "position": row["position"], "tgt": {}, "car": {}, "targets": 0, "carries": 0})
            entry["tgt"][week] = r(row.get("target_share") or 0, 3)
            entry["car"][week] = r(row.get("rush_attempt_share") or 0, 3)
            entry["targets"] += row.get("targets") or 0
            entry["carries"] += row.get("carries") or 0
    redzone = sorted(
        [pick(row, ["player_id", "name", "position", "red_zone_targets", "red_zone_rush_attempts", "rush_att_inside_10",
                    "rush_att_inside_5", "games_played"]) for row in roster
         if (row.get("red_zone_targets") or 0) + (row.get("red_zone_rush_attempts") or 0) > 0],
        key=lambda row: -((row.get("red_zone_targets") or 0) + (row.get("red_zone_rush_attempts") or 0)))[:9]
    bd = breakdowns.get(abbr, {})
    teams_cards[abbr] = {
        "team": abbr, "record": team["record"], "games": team["games"], "stats": stats, "top": top,
        "share": {"weeks": weeks, "tgt": sorted((s for s in share.values() if s["targets"]), key=lambda s: -s["targets"])[:5],
                  "car": sorted((s for s in share.values() if s["carries"]), key=lambda s: -s["carries"])[:4]},
        "redzone": redzone,
        "trend": {k: [pick(x, ["week", "value", "opponent", "home", "points_for", "points_against", "league_q25", "league_q75",
                               "league_to_date"]) for x in bd.get("trend", {}).get(k, [])] for k in ("off", "def", "net")},
    }
team_means = {mid: {side: team_stats_values[mid].get(f"{side}_mean") for side in ("o", "d")} for mid in TEAM_METRICS
              if mid in team_stats_values}

# ------------------------------------------------------------ scatter pools
# C7: receivers who ran 50+ routes at a 50%+ route participation (Nate's tweet pool, Week 5).
routes_pool = [pick(row, ["player_id", "name", "team_abbreviation", "route_participation", "targets_per_route_run",
                          "routes_run", "targets", "fantasy_points", "fantasy_ppg"])
               for row in intel["WR"] if (row.get("routes_run") or 0) >= 50 and (row.get("route_participation") or 0) >= 0.5
               and row.get("targets_per_route_run") is not None]
# C8: qualified backs, receivers and tight ends with 5+ expected points per game.
xva_pool = {position: [pick(row, ["player_id", "name", "team_abbreviation", "expected_fantasy_ppg", "fantasy_ppg",
                                  "games_played", "fantasy_points"])
                       for row in intel[position] if row.get("qualified") and (row.get("expected_fantasy_ppg") or 0) >= 5]
            for position in ("RB", "WR", "TE")}
# C10 to C13: the app's Scatter page (frontend/src/constants/scatters.js), every qualified
# player at the position, most fantasy points first. The fields are every axis and bubble
# size that position's presets use.
SCATTER_FIELDS = {
    "QB": ["cpoe", "epa_per_play", "attempts", "expected_fantasy_ppg", "fantasy_ppg", "ngs_pass_intended_air_yards"],
    "RB": ["rush_attempt_share", "route_participation", "fantasy_ppg", "expected_fantasy_ppg", "rush_att_inside_5",
           "rushing_tds", "rush_yac_per_att", "ngs_rush_yards_over_expected_per_att", "target_share", "yards_per_route_run"],
    "WR": ["adot", "target_share", "fantasy_ppg", "expected_fantasy_ppg", "yards_per_route_run", "targets_per_route_run",
           "red_zone_targets", "receiving_tds", "route_participation"],
}
SCATTER_FIELDS["TE"] = SCATTER_FIELDS["WR"]
scatter_pool = {
    position: [pick(row, ["player_id", "name", "team_abbreviation", "games_played", "fantasy_points"] + fields)
               for row in sorted((r for r in intel[position] if r.get("qualified")), key=lambda r: -(r.get("fantasy_points") or 0))]
    for position, fields in SCATTER_FIELDS.items()
}

# C9: each position's top scorers and every week's finish (from the reply-card pool's game logs).
FINISH_DEPTH = {"QB": 20, "RB": 30, "WR": 36, "TE": 20}
finishes = {}
for position, depth in FINISH_DEPTH.items():
    rows = sorted((p for p in players_raw.values() if p["profile"]["position"] == position),
                  key=lambda p: -sum(g.get("fantasy_points") or 0 for g in p["log"]))[:depth]
    finishes[position] = [{
        "player_id": p["profile"]["player_id"], "name": p["profile"]["name"],
        "team": season_rows.get(p["profile"]["player_id"], {}).get("team_abbreviation"),
        "total": r(sum(g.get("fantasy_points") or 0 for g in p["log"]), 1),
        "weeks": {g["week"]: [g.get("position_rank"), r(g.get("fantasy_points"), 1)] for g in p["log"]},
    } for p in rows]

# --------------------------------------------------------- timeframe windows
# Every timeframe control offers the same windows (pull.timeframes): the season, the last
# 4, 3 and 2 weeks, and the newest week.
windows = load("windows")
intel_windows = load("intel_windows")
scatter_windows = {
    key: {position: [pick(row, ["player_id", "name", "team_abbreviation", "games_played", "fantasy_points"] + fields)
                     for row in sorted(intel_windows[key][position], key=lambda r: -(r.get("fantasy_points") or 0))]
          for position, fields in SCATTER_FIELDS.items()}
    for key in windows
}
# Team rankings and team scatters: a curated set of the team page's metrics, per window.
TEAM_WINDOW_METRICS = ["ppg", "pdiff", "epa", "net_epa", "suc", "p_epa", "r_epa", "explosive", "ypp", "pts_drive", "three_out",
                       "rz_td", "d3", "tov_g", "sack_rate", "pass_rate", "n_pass", "proe", "sec_snap", "plays_g", "p_yds_g",
                       "r_yds_g", "ypc", "cpoe", "adot", "yac", "x_pass", "x_run", "stuff", "int_rate", "start", "blitz",
                       "rushers", "box8", "p_td_g", "r_td_g", "rz_g"]
team_windows_raw = load("team_windows")
team_windows = {}
for key, snap in team_windows_raw.items():
    team_windows[key] = {mid: {side: {abbr: [r(v[0], 4), v[1]] for abbr, v in snap["values"][mid][side].items()}
                               for side in ("o", "d") if side in snap["values"].get(mid, {})}
                         for mid in TEAM_WINDOW_METRICS if mid in snap["values"]}
    for mid in team_windows[key]:
        for side in ("o", "d"):
            mean = snap["values"][mid].get(f"{side}_mean")
            if mean is not None:
                team_windows[key][mid][f"{side}_mean"] = r(mean, 4)
team_window_meta = {m["id"]: {"label_o": m["label_o"], "label_d": m["label_d"], "fmt": m["fmt"], "better": m["better"],
                              "sides": m["sides"], "short": m["short"]}
                    for m in team_stats["metrics"] if m["id"] in TEAM_WINDOW_METRICS}

# ------------------------------------------------------- week-by-week lines
# The leaders and the race add weeks up, so each player's box score is kept per week:
# [attempts, completions, pass yards, pass TDs, INTs, carries, rush yards, rush TDs,
#  targets, receptions, rec yards, rec TDs, fumbles lost].
LINE = ["attempts", "completions", "passing_yards", "passing_tds", "interceptions", "carries", "rushing_yards",
        "rushing_tds", "targets", "receptions", "receiving_yards", "receiving_tds", "fumbles_lost"]
weekly_qb = load("weekly_qb")
weekly_lines = {}
for boards in (weekly_boards, weekly_qb):
    for week, rows in boards.items():
        for row in rows:
            line = [row.get(key) or 0 for key in LINE]
            if not any(line):
                continue
            entry = weekly_lines.setdefault(row["player_id"], {"n": row["name"], "pos": row["position"], "w": {}, "tw": {}})
            entry["w"][int(week)] = line
            entry["tw"][int(week)] = row.get("team_abbreviation")
for entry in weekly_lines.values():
    entry["t"] = entry["tw"][max(entry["tw"])]
    del entry["tw"]

# ------------------------------------------------- target analysis, by week
# Per receiver per week: [targets, catches, yards, TDs, INTs, first downs, EPA, air yards,
# charted, left, middle, right, behind, short, intermediate, deep] plus the air-yard
# histogram as [bin, count] pairs (bin 0 is -10 yards or less, bin 55 is 45 or more).
target_weeks = load("target_weeks")
TALLY = ["targets", "receptions", "yards", "touchdowns", "interceptions", "first_downs", "epa", "air_yards", "charted"]


def tally(row):
    return ([row.get(key) or 0 for key in TALLY[:6]] + [r(row.get("epa") or 0, 2)] + [row.get(key) or 0 for key in TALLY[7:]]
            + list(row["locations"]) + list(row["depth"]))


receivers = {}
for week, board in target_weeks.items():
    for row in board["players"]:
        entry = receivers.setdefault(row["player_id"], {"n": row["name"], "pos": row["position"], "w": {}, "tw": {}})
        entry["w"][int(week)] = tally(row) + [[[i, c] for i, c in enumerate(row["hist"]) if c]]
        entry["tw"][int(week)] = row.get("team")
for entry in receivers.values():
    entry["t"] = entry["tw"][max(entry["tw"])]
    del entry["tw"]

# ------------------------------------------------------- passing networks
# Per passer, per week, per situation: each receiver's tally as above (no histogram), and
# the passer's own line [completions, attempts, yards, TDs, INTs]. A receiver play-by-play
# names but we do not track arrives with no id and is folded into "others" on the card.
networks_raw = load("networks")
people = {}
networks = {}
for pid, by_week in networks_raw.items():
    entry = None
    for week, by_situation in by_week.items():
        for situation, net in by_situation.items():
            passer = net["passer"]
            if entry is None:
                entry = {"n": passer["name"], "w": {}, "tw": {}}
                note_face(passer)
            if not net["receivers"] and not passer.get("attempts"):
                continue
            slot = entry["w"].setdefault(int(week), {})
            slot[situation] = {"line": [passer.get(k) or 0 for k in ("completions", "attempts", "passing_yards", "passing_tds", "interceptions")]
                               if situation == "all" else None,
                               "rec": [[rec.get("player_id")] + tally(rec) for rec in net["receivers"]]}
            if passer.get("team"):
                entry["tw"][int(week)] = passer["team"]
            for rec in net["receivers"]:
                if rec.get("player_id"):
                    people[rec["player_id"]] = [rec["name"], rec.get("position")]
    if entry and entry["w"]:
        entry["t"] = entry["tw"][max(entry["tw"])] if entry["tw"] else None
        del entry["tw"]
        networks[pid] = entry

# Each recap quarterback's throws that week: [air yards, side, complete, TD, INT, yards].
recap_throws = load("recap_throws")
for game in recaps:
    game["throws"] = {}
    for team, ids in game["passers"].items():
        for qb in ids:
            rows = recap_throws.get(qb, {}).get("targets", [])
            game["throws"][qb] = [[t["air_yards"], t["location"], int(bool(t["complete"])), int(bool(t["touchdown"])),
                                   int(bool(t["interception"])), t["yards"]] for t in rows]

# Week's best, risers and RB faces not in the card pool still need a headshot.
needed = set()
for rows in week_rows.values():
    needed |= {row["player_id"] for row in rows}
needed |= {m["player_id"] for m in risers + fallers}
needed |= {row["player_id"] for row in rb_work}
needed |= {row["player_id"] for row in routes_pool}
needed |= {row["player_id"] for rows in scatter_pool.values() for row in rows}
needed |= {row["player_id"] for rows in xva_pool.values() for row in rows}
for card in teams_cards.values():
    needed |= {row["player_id"] for row in card["top"] + card["redzone"] + card["share"]["tgt"] + card["share"]["car"]}
# The new cards' faces: receivers with a real season of targets, each passer's regular
# targets, and anyone near the top of a counting stat.
needed |= {pid for pid, e in receivers.items() if sum(w[0] for w in e["w"].values()) >= 12}
needed |= set(networks)
for pid, e in networks.items():
    counts = {}
    for slot in e["w"].values():
        for rec in slot.get("all", {}).get("rec", []):
            if rec[0]:
                counts[rec[0]] = counts.get(rec[0], 0) + rec[1]
    needed |= {rid for rid, n in counts.items() if n >= 4}
for k in range(len(LINE)):
    totals = sorted(weekly_lines, key=lambda pid: -sum(w[k] for w in weekly_lines[pid]["w"].values()))
    needed |= set(totals[:24])
needed |= {pid for rows in scatter_windows["last1"].values() for pid in [row["player_id"] for row in rows[:40]]}
missing = sorted(pid for pid in needed if pid not in headshots)
for start in range(0, len(missing), 50):
    chunk = missing[start:start + 50]
    query = urllib.parse.urlencode({"player_ids": ",".join(chunk), "limit": 100})
    with urllib.request.urlopen(f"{API}/players?{query}") as response:
        for row in json.load(response)["data"]:
            note_face(row)

with urllib.request.urlopen(f"{API}/games?season={SEASON}&limit=400") as response:
    schedule = json.load(response)["data"]
weeks_by_team = {}
for game in schedule:
    if game.get("season_type", "REG") != "REG":
        continue
    for side in ("home_abbreviation", "away_abbreviation"):
        weeks_by_team.setdefault(game[side], set()).add(game["week"])
all_weeks = set(range(1, max(g["week"] for g in schedule) + 1))
byes = {team: sorted(all_weeks - weeks) for team, weeks in weeks_by_team.items()}
# Week-by-week results per team, for the game logs: {team: {week: [opponent, home, for, against]}}.
results = {}
for game in schedule:
    if game.get("season_type", "REG") != "REG" or game.get("home_score") is None:
        continue
    home, away = game["home_abbreviation"], game["away_abbreviation"]
    results.setdefault(home, {})[game["week"]] = [away, 1, game["home_score"], game["away_score"]]
    results.setdefault(away, {})[game["week"]] = [home, 0, game["away_score"], game["home_score"]]

# ------------------------------------------------------ what each defense allowed
# The matchup cards: every QB, RB, WR and TE line against each defense, by week, summed by
# position. allowed[defense][week][position] = the ALLOWED sums, then the top scorer as
# [player_id, name, team, points].
ALLOWED = ["fantasy_points", "expected_fantasy_points", "attempts", "completions", "passing_yards", "passing_tds",
           "interceptions", "sacks_suffered", "carries", "rushing_yards", "rushing_tds", "rushing_epa", "targets",
           "receptions", "receiving_yards", "receiving_tds", "air_yards", "yards_after_catch", "receiving_epa", "epa"]
allowed = {}
for boards in (weekly_boards, weekly_qb):
    for week, rows in boards.items():
        for row in rows:
            game = results.get(row.get("team_abbreviation"), {}).get(int(week))
            if not game:
                continue
            slot = allowed.setdefault(game[0], {}).setdefault(int(week), {}).setdefault(row["position"], {"sum": [0.0] * len(ALLOWED), "top": None})
            for i, key in enumerate(ALLOWED):
                slot["sum"][i] += row.get(key) or 0
            points = row.get("fantasy_points") or 0
            if slot["top"] is None or points > slot["top"][3]:
                slot["top"] = [row["player_id"], row["name"], row["team_abbreviation"], r(points, 1)]
allowed = {defense: {week: {position: [r(v, 2) for v in slot["sum"]] + [slot["top"]] for position, slot in by_pos.items()}
                     for week, by_pos in by_week.items()} for defense, by_week in allowed.items()}

data = {
    "byes": byes,
    "season": SEASON, "recap_week": RECAP_WEEK, "preview_week": PREVIEW_WEEK, "teams": TEAMS,
    "recaps": recaps, "previews": previews,
    "landscape": landscape, "league_means": league_means,
    "week_top": week_rows, "risers": risers, "fallers": fallers, "rb_work": rb_work,
    "players": players,
    "teams_cards": teams_cards, "team_means": team_means, "team_metric_meta": metric_meta,
    "routes_pool": routes_pool, "xva_pool": xva_pool, "finishes": finishes, "scatter_pool": scatter_pool,
    "windows": windows, "scatter_windows": scatter_windows, "team_windows": team_windows, "team_window_meta": team_window_meta,
    "weekly_lines": weekly_lines, "receivers": receivers, "networks": networks, "people": people, "results": results,
    "passers": [p["player_id"] for p in load("passers")],
    "allowed": allowed, "allowed_keys": ALLOWED,
    "tape_meta": {m["id"]: {"label_o": m["label_o"], "label_d": m["label_d"], "better": m["better"]} for m in team_stats["metrics"]},
}
with open(os.path.join(HERE, "data.json"), "w") as handle:
    json.dump(data, handle, separators=(",", ":"))
with open(os.path.join(HERE, "need_images.json"), "w") as handle:
    json.dump({"headshots": headshots, "teams": sorted(TEAMS)}, handle)
print("data.json", os.path.getsize(os.path.join(HERE, "data.json")) // 1024, "kB;", len(headshots), "headshots;",
      len(players), "players; risers", [m["name"] for m in risers], "fallers", [m["name"] for m in fallers])
