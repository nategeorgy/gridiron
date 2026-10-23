"""raw/*.json -> data.json, trimmed to what the cards draw, plus need_images.json."""
import json
import os
from bisect import bisect_left, bisect_right

from pull import ADVANCED, PERCENTILES, RANKS
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
# A player's game log stops at the newest fully played week: a Thursday line is a week's
# finish ranked within one game, and would land in C9's totals.
for raw_player in players_raw.values():
    raw_player["log"] = [g for g in raw_player["log"] if g["week"] <= RECAP_WEEK]

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
                "rush_att_inside_10", "adot", "yards_after_catch", "passing_epa", "points_by_phase",
                "route_participation", "targets_per_route_run", "yards_per_route_run"]

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


def game_clock(quarter, clock, season_type="REG"):
    """Seconds into the game, the recap's own convention (app/game_pages.py elapsed)."""
    if quarter is None or not clock:
        return None
    minutes, seconds = clock.split(":")
    left = int(minutes) * 60 + int(seconds)
    if quarter <= 4:
        return (quarter - 1) * 900 + (900 - left)
    period = 600 if season_type == "REG" else 900
    return 3600 + (quarter - 5) * period + (period - left)


def game_plays(raw_plays, away, season_type):
    """A8: every pass and run as [seconds, 0 away / 1 home, EPA, kind, touchdown, turnover],
    and the six that moved EPA most, described."""
    plays, big = [], []
    for play in raw_plays:
        if play["type"] not in ("pass", "run") or play.get("epa") is None:
            continue
        t = game_clock(play["quarter"], play["clock"], season_type)
        side = 0 if play["team"] == away else 1
        plays.append([t, side, r(play["epa"]), play["type"][0], int(bool(play["touchdown"])), int(bool(play["turnover"]))])
        text = short_text(play["text"])
        # A lost fumble is the whole story of the play; the short form would drop it.
        if play["turnover"] and "INTERCEPT" not in play["text"].upper() and "FUMBLE" in play["text"].upper():
            text += ", fumble lost"
        big.append({"t": t, "quarter": play["quarter"], "clock": play["clock"], "team": play["team"], "epa": r(play["epa"]), "text": text})
    big = sorted(big, key=lambda b: -abs(b["epa"]))[:6]
    return plays, big


def passer_throws(raw_throws, players):
    """A9: each passer's targeted throws that week, his line and his tally."""
    line = {p["player_id"]: p for p in players}
    out = {}
    for pid, t in raw_throws.items():
        me = line.get(pid, {})
        out[pid] = {
            "name": t["player"]["name"], "team": me.get("team"),
            "line": pick(me, ["completions", "attempts", "passing_yards", "passing_tds", "interceptions", "sacks_suffered",
                              "passing_epa", "carries", "rushing_yards"]),
            "throws": [[x["air_yards"], x["location"], int(bool(x["complete"])), int(bool(x["touchdown"])),
                        int(bool(x["interception"])), x["yards"], r(x["epa"], 2)] for x in t.get("targets", [])],
            "sum": pick(t.get("summary") or {}, ["targets", "receptions", "yards", "touchdowns", "interceptions", "adot",
                                                 "epa_per_target", "air_yards"]),
        }
    return out


# The recap week's games, then any of the coming week's already played (pull.py's early
# recaps). An early game's week is only partly played, so its week-relative ranks (a
# finish, a team number "ranked against the week") would rank one game: they are marked.
recap_games = games[str(RECAP_WEEK)] + [g for g in games[str(PREVIEW_WEEK)] if g["game_id"] in recaps_raw]
recaps = []
for game in sorted(recap_games, key=lambda g: (g["game_date"], g.get("kickoff_time") or "")):
    gid = game["game_id"]
    raw = recaps_raw[gid]
    h, rc = raw["header"], raw["recap"]
    for p in rc["players"]:
        note_face(p)
    plays, big = game_plays(raw.get("plays", []), h["away"]["abbreviation"], h.get("season_type") or "REG")
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
        "plays": plays, "big_plays": big,
        "partial": game["week"] != RECAP_WEEK,
        "throws": passer_throws(raw.get("throws", {}), rc["players"]),
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

# D1 asks for a stat with no registry metric (a quarterback's rushing yards per game). They are ranked the way the API ranks
# every other one (app/percentiles.py): within the qualified players at the position, rank
# = players strictly better + 1, percentile = mid-rank (below + half the ties) / pool.
DERIVED = {
    "QB": {
        "rushing_yards_per_game": lambda r: (r.get("rushing_yards") or 0) / r["games_played"] if r.get("games_played") else None,
    },
}


def rank_and_percentile(value, pool):
    """Higher is better for all three derived stats."""
    below, through = bisect_left(pool, value), bisect_right(pool, value)
    return len(pool) - through + 1, round((below + 0.5 * (through - below)) / len(pool) * 100)


derived = {}
for position, metrics in DERIVED.items():
    rows = intel[position]
    for metric, value_of in metrics.items():
        pool = sorted(v for row in rows if row.get("qualified") and (v := value_of(row)) is not None)
        for row in rows:
            value = value_of(row)
            if value is not None and pool:
                derived.setdefault(row["player_id"], {})[metric] = (value, *rank_and_percentile(value, pool))

# How many players each advanced metric is ranked among: the qualified players at the
# position with a value, the pool app/percentiles.py ranks within.
ranked_pool = {position: {m: sum(1 for row in intel[position] if row.get("qualified") and row.get(m) is not None)
                          for m in ADVANCED[position]} for position in ADVANCED}

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
    # D8's advanced rows: value, percentile and rank from the API, and how many were ranked.
    entry["adv"] = {
        "v": pick(season, ADVANCED[position], 4),
        "p": {m: (season.get("percentiles") or {}).get(m) for m in ADVANCED[position]},
        "r": {m: (season.get("ranks") or {}).get(m) for m in ADVANCED[position]},
        "n": {m: ranked_pool[position].get(m) for m in ADVANCED[position]},
        "games": season.get("games_played"), "dropbacks": season.get("dropbacks"), "carries": season.get("carries"),
        "targets": season.get("targets"), "sacks": season.get("sacks_suffered"),
    }
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
        "lanes": [pick(x, ["key", "plays", "share", "share_rank", "epa", "epa_rank", "league_share", "league_epa", "successes", "yards"], 4)
                  for x in bd.get("run_lanes", [])],
        "depth": [pick(x, ["key", "plays", "share", "share_rank", "epa", "epa_rank", "league_share", "league_epa", "completions"], 4)
                  for x in bd.get("pass_depth", [])],
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

# --------------------------------------------------- the league, team by team
# C14, C18, E5, B7: every team's value and rank for the metrics those cards draw, both
# sides, with the league means. Personnel groupings are left out (not cleared for 2026).
LEAGUE_METRICS = ["epa", "suc", "p_epa", "p_suc", "r_epa", "r_suc", "explosive", "ypp", "pts_drive", "three_out",
                  "to_drive", "start", "rz_td", "d3", "d4_go", "tov_g", "plays_g", "sec_snap", "cpoe", "adot", "yac",
                  "x_pass", "sack_rate", "int_rate", "intw", "catchable", "drop", "ypc", "stuff", "x_run", "box8", "gap_in",
                  "gap_tk", "gap_out", "pass_rate", "n_pass", "proe", "gun", "under", "empty", "motion", "nohud", "pa", "rpo",
                  "screen", "blitz", "rushers", "ppg", "pdiff", "net_epa"]
team_league = {
    "teams": [t["abbreviation"] for t in team_stats["teams"]],
    "metrics": {
        m["id"]: {
            **pick(m, ["label", "short", "fmt", "better", "label_o", "label_d"]),
            **{side: team_stats_values[m["id"]].get(side) for side in ("o", "d") if team_stats_values[m["id"]].get(side)},
            "o_mean": team_stats_values[m["id"]].get("o_mean"), "d_mean": team_stats_values[m["id"]].get("d_mean"),
        }
        for m in team_stats["metrics"] if m["id"] in LEAGUE_METRICS and m["id"] in team_stats_values
    },
}

# ------------------------------------------------------------- passing networks
# D9: every passer's targets by receiver, for his games with each team. Keyed "id|team".
networks_raw = load("networks")
networks = {}
for key, nw in networks_raw.items():
    passer_id, team = key.split("|")
    note_face(nw["passer"])
    # An untracked receiver (a fullback, a two-way player) has no id: he stays in "others".
    receivers = sorted((x for x in nw.get("receivers", []) if x.get("player_id")), key=lambda x: -x["targets"])
    for x in receivers[:10]:
        note_face(x)
    networks[key] = {
        "passer": pick(nw["passer"], ["player_id", "name", "games", "completions", "attempts", "passing_yards", "passing_tds",
                                      "interceptions", "cpoe"]),
        "team": team,
        "totals": pick(nw["totals"], ["targets", "receptions", "yards", "touchdowns", "interceptions", "epa", "air_yards",
                                      "charted", "locations", "depth"], 2),
        "receivers": [pick(x, ["player_id", "name", "position", "targets", "receptions", "yards", "touchdowns", "interceptions",
                               "epa", "adot", "epa_per_target", "locations", "depth"], 3) for x in receivers[:10]],
        "others": nw["totals"]["targets"] - sum(x["targets"] for x in receivers[:10]),
    }

# ---------------------------------------------------------------- passing zones
# E6: every target each team threw, by depth and side: [targets, catches, yards, TDs, INTs,
# EPA]. Zone k is depth * 3 + side, as in app/explore.py, so the league totals line up.
SIDES = ["left", "middle", "right"]


def depth_index(air_yards):
    if air_yards is None:
        return None
    return 0 if air_yards < 0 else 1 if air_yards < 10 else 2 if air_yards < 20 else 3


def zone_tally(targets):
    zones = [[0, 0, 0, 0, 0, 0.0] for _ in range(12)]
    for t in targets:
        depth = depth_index(t.get("air_yards"))
        if depth is None or t.get("location") not in SIDES:
            continue
        cell = zones[depth * 3 + SIDES.index(t["location"])]
        cell[0] += 1
        cell[1] += int(bool(t["complete"]))
        cell[2] += t.get("yards") or 0
        cell[3] += int(bool(t["touchdown"]))
        cell[4] += int(bool(t["interception"]))
        cell[5] += t.get("epa") or 0.0
    return [[*cell[:5], round(cell[5], 2)] for cell in zones]


team_targets = load("team_targets")
team_zones = {}
league_cells = [[0, 0, 0, 0, 0, 0.0] for _ in range(12)]
for abbr, tt in team_targets.items():
    zones = zone_tally(tt.get("targets", []))
    for k, cell in enumerate(zones):
        league_cells[k] = [a + b for a, b in zip(league_cells[k], cell)]
    # Who caught the passes in each zone: summed over the team's passers' networks.
    by_receiver = {}
    for key, nw in networks_raw.items():
        if key.split("|")[1] != abbr:
            continue
        for x in nw.get("receivers", []):
            if not x.get("player_id"):
                continue
            mine = by_receiver.setdefault(x["player_id"], {"player_id": x["player_id"], "name": x["name"],
                                                          "position": x["position"], "zones": [0] * 12, "targets": 0})
            mine["zones"] = [a + b for a, b in zip(mine["zones"], x.get("zones") or [0] * 12)]
            mine["targets"] += x["targets"]
    leaders = []
    for k in range(12):
        top = max(by_receiver.values(), key=lambda x: x["zones"][k], default=None)
        leaders.append([top["player_id"], top["name"], top["position"], top["zones"][k]] if top and top["zones"][k] else None)
        if top and top["zones"][k]:
            note_face(top)
    team_zones[abbr] = {"zones": zones, "leaders": leaders,
                        "sum": pick(tt.get("summary") or {}, ["targets", "receptions", "yards", "touchdowns", "interceptions",
                                                              "adot", "epa_per_target", "games"])}
league_zones = [[*cell[:5], round(cell[5], 2)] for cell in league_cells]

# -------------------------------------------------------------- advanced pools
# C15: qualified quarterbacks with 15+ attempts a game. C16: the backs with the most carries.
# C17: every qualified player at each position with the Next Gen and charting fields.
qb_ladder = [pick(row, ["player_id", "name", "team_abbreviation", "games_played", "attempts", "dropbacks", "epa_per_play",
                        "cpoe", "passing_yards", "passing_tds", "interceptions", "sacks_suffered", "yards_per_attempt"], 4)
             for row in intel["QB"] if row.get("qualified") and (row.get("attempts") or 0) >= 15 * (row.get("games_played") or 1)
             and row.get("epa_per_play") is not None]
rb_contact = [pick(row, ["player_id", "name", "team_abbreviation", "games_played", "carries", "rushing_yards", "yards_per_carry",
                         "rush_ybc_per_att", "rush_yac_per_att", "ngs_rush_yards_over_expected_per_att",
                         "ngs_rush_yards_over_expected", "rush_broken_tackles", "rushing_epa"], 3)
              for row in sorted(intel["RB"], key=lambda row: -(row.get("carries") or 0))
              if row.get("qualified") and row.get("rush_ybc_per_att") is not None][:30]
NGS_FIELDS = {
    "QB": ["ngs_pass_time_to_throw", "ngs_pass_aggressiveness", "ngs_pass_air_yards_to_sticks", "ngs_pass_intended_air_yards",
           "pressure_rate", "bad_throw_rate", "epa_per_play", "cpoe", "attempts"],
    "RB": ["ngs_rush_pct_attempts_eight_defenders", "ngs_rush_yards_over_expected_per_att", "ngs_rush_time_to_los",
           "ngs_rush_efficiency", "rush_ybc_per_att", "rush_yac_per_att", "carries", "yards_per_carry"],
    "WR": ["ngs_rec_cushion", "ngs_rec_separation", "ngs_rec_yac_above_expectation", "adot", "catch_rate",
           "receiving_drop_rate", "targets", "yards_per_target"],
}
NGS_FIELDS["TE"] = NGS_FIELDS["WR"]
ngs_pool = {
    position: [pick(row, ["player_id", "name", "team_abbreviation", "games_played", "fantasy_points"] + fields, 4)
               for row in sorted((r for r in intel[position] if r.get("qualified")), key=lambda r: -(r.get("fantasy_points") or 0))
               if position != "QB" or (row.get("attempts") or 0) >= 15 * (row.get("games_played") or 1)]
    for position, fields in NGS_FIELDS.items()
}

# Week's best, risers and RB faces not in the card pool still need a headshot.
needed = set()
for rows in week_rows.values():
    needed |= {row["player_id"] for row in rows}
needed |= {m["player_id"] for m in risers + fallers}
needed |= {row["player_id"] for row in rb_work}
needed |= {row["player_id"] for row in routes_pool}
needed |= {row["player_id"] for rows in scatter_pool.values() for row in rows}
needed |= {row["player_id"] for rows in xva_pool.values() for row in rows}
needed |= {row["player_id"] for rows in ngs_pool.values() for row in rows}
needed |= {row["player_id"] for row in qb_ladder + rb_contact}
needed |= {x["player_id"] for nw in networks.values() for x in nw["receivers"]}
needed |= {leader[0] for tz in team_zones.values() for leader in tz["leaders"] if leader}
for card in teams_cards.values():
    needed |= {row["player_id"] for row in card["top"] + card["redzone"] + card["share"]["tgt"] + card["share"]["car"]}
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

data = {
    "byes": byes,
    "season": SEASON, "recap_week": RECAP_WEEK, "preview_week": PREVIEW_WEEK, "teams": TEAMS,
    "recaps": recaps, "previews": previews,
    "landscape": landscape, "league_means": league_means,
    "week_top": week_rows, "risers": risers, "fallers": fallers, "rb_work": rb_work,
    "players": players,
    "teams_cards": teams_cards, "team_means": team_means, "team_metric_meta": metric_meta,
    "routes_pool": routes_pool, "xva_pool": xva_pool, "finishes": finishes, "scatter_pool": scatter_pool,
    "team_league": team_league, "networks": networks, "team_zones": team_zones, "league_zones": league_zones,
    "qb_ladder": qb_ladder, "rb_contact": rb_contact, "ngs_pool": ngs_pool,
}
with open(os.path.join(HERE, "data.json"), "w") as handle:
    json.dump(data, handle, separators=(",", ":"))
with open(os.path.join(HERE, "need_images.json"), "w") as handle:
    json.dump({"headshots": headshots, "teams": sorted(TEAMS)}, handle)
print("data.json", os.path.getsize(os.path.join(HERE, "data.json")) // 1024, "kB;", len(headshots), "headshots;",
      len(players), "players; risers", [m["name"] for m in risers], "fallers", [m["name"] for m in fallers])
