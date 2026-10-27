"""Pull everything the tweet cards draw from the local API into raw/*.json.

    python3 pull.py                 # the newest fully played week, and the week after it
    python3 pull.py --week 6        # recaps for Week 6, previews for Week 7

Needs the backend running on localhost:8000 (uvicorn app.main:app --port 8000).
"""
import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

API = "http://localhost:8000/api/v1"
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
POSITIONS = ["QB", "RB", "WR", "TE"]
# How many players per position the reply cards can switch between.
CARD_DEPTH = {"QB": 36, "RB": 64, "WR": 90, "TE": 36}

# D1's percentile rows, per position, in the order the card draws them.
PERCENTILES = {
    "QB": ["fantasy_ppg", "completion_pct", "passer_rating", "yards_per_attempt", "yards_per_completion",
           "ngs_pass_intended_air_yards", "rushing_tds", "ngs_pass_aggressiveness", "bad_throw_rate", "cpoe",
           "epa_per_play", "epa"],
    "RB": ["fantasy_ppg", "rush_attempt_share", "target_share", "route_participation", "rush_att_inside_5",
           "red_zone_targets", "yards_per_carry", "fantasy_points_per_carry", "targets_per_route_run",
           "ngs_rush_yards_over_expected_per_att", "rush_ybc_per_att", "rush_yac_per_att", "rushing_epa",
           "receiving_epa", "epa"],
    "WR": ["fantasy_ppg", "target_share", "route_participation", "yards_per_reception", "yards_per_target",
           "targets_per_route_run", "yards_per_route_run", "fantasy_points_per_route_run", "adot", "air_yards",
           "air_yards_share", "red_zone_targets", "receiving_epa"],
}
# Positional ranks for D1's top row (and D2's side panel). RB total yards and total TDs,
# and QB rushing yards per game, have no registry metric: build_data.py derives them.
RANKS = {
    "QB": ["fantasy_ppg", "fantasy_points", "expected_fantasy_ppg", "passing_yards", "passing_tds", "interceptions"],
    "RB": ["fantasy_ppg", "fantasy_points", "expected_fantasy_ppg", "receptions", "rushing_yards", "receiving_yards",
           "rushing_tds", "receiving_tds"],
    "WR": ["fantasy_ppg", "fantasy_points", "expected_fantasy_ppg", "receptions", "receiving_yards", "receiving_tds"],
}
RANKS["TE"] = RANKS["WR"]
PERCENTILES["TE"] = PERCENTILES["WR"]


def get(path, **params):
    query = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    url = f"{API}{path}" + (f"?{query}" if query else "")
    with urllib.request.urlopen(url, timeout=120) as response:
        return json.load(response)


def every_row(path, **params):
    """A list endpoint caps a page at 200 rows, so walk the pages."""
    rows, offset = [], 0
    while True:
        page = get(path, limit=200, offset=offset, **params)
        rows += page["data"]
        offset += 200
        if offset >= page.get("total", 0) or not page["data"]:
            return rows


def save(name, data):
    with open(os.path.join(RAW, f"{name}.json"), "w") as handle:
        json.dump(data, handle)


def default_week(season):
    """The newest week whose games have all been played."""
    weeks = get("/games/weeks", season=season)["weeks"]
    done = [w["week"] for w in weeks if w["games"] and w["played"] == w["games"]]
    return max(done) if done else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--season", type=int, help="defaults to the newest season with stats")
    parser.add_argument("--week", type=int, help="the week to recap; previews are for the week after")
    args = parser.parse_args()
    global SEASON, RECAP_WEEK, PREVIEW_WEEK
    SEASON = args.season or next(s["season"] for s in get("/seasons")["data"] if s["has_stats"])
    RECAP_WEEK = args.week or default_week(SEASON)
    PREVIEW_WEEK = RECAP_WEEK + 1
    print(f"season {SEASON}: recaps for Week {RECAP_WEEK}, previews for Week {PREVIEW_WEEK}", file=sys.stderr)

    os.makedirs(RAW, exist_ok=True)
    out = {"meta": {"season": SEASON, "recap_week": RECAP_WEEK, "preview_week": PREVIEW_WEEK}}

    games = {}
    for week in (RECAP_WEEK, PREVIEW_WEEK):
        games[week] = get("/games", season=SEASON, week=week, limit=50)["data"]
    out["games"] = games

    def recap(game):
        gid = game["game_id"]
        return gid, {"header": get(f"/games/{gid}"), "recap": get(f"/games/{gid}/recap", scoring="ppr")}

    def preview(game):
        gid = game["game_id"]
        return gid, {"header": get(f"/games/{gid}"), "preview": get(f"/games/{gid}/preview", scoring="ppr")}

    with ThreadPoolExecutor(4) as pool:
        # Only games already played: a week can be recapped before Monday night is.
        out["recaps"] = dict(pool.map(recap, [g for g in games[RECAP_WEEK] if g["played"]]))
        out["previews"] = dict(pool.map(preview, games[PREVIEW_WEEK]))
    print("recaps", len(out["recaps"]), "previews", len(out["previews"]), file=sys.stderr)

    out["teams"] = get("/teams")
    out["team_stats"] = get("/teams/stats", season=SEASON)
    # Every team's season through each week, for the landscape trail.
    out["team_stats_through"] = {}
    for last in range(1, RECAP_WEEK + 1):
        weeks = ",".join(str(w) for w in range(1, last + 1))
        out["team_stats_through"][last] = get("/teams/stats", season=SEASON, weeks=weeks)

    weeks_all = ",".join(str(w) for w in range(1, RECAP_WEEK + 1))
    early = ",".join(str(w) for w in range(1, RECAP_WEEK - 2))
    late = ",".join(str(w) for w in range(RECAP_WEEK - 2, RECAP_WEEK + 1))
    out["intel"], out["intel_early"], out["intel_late"], out["week_top"] = {}, {}, {}, {}
    for position in POSITIONS:
        pct = ",".join(PERCENTILES[position])
        out["intel"][position] = every_row("/stats/intelligence", season=SEASON, position=position, metric="fantasy_points",
                                           scoring="ppr", include_unqualified="true", percentiles=pct,
                                           ranks=",".join(RANKS[position]))
        out["intel_early"][position] = get("/stats/intelligence", season=SEASON, weeks=early, position=position,
                                           metric="fantasy_points", scoring="ppr", limit=200,
                                           include_unqualified="true")["data"]
        out["intel_late"][position] = get("/stats/intelligence", season=SEASON, weeks=late, position=position,
                                          metric="fantasy_points", scoring="ppr", limit=200,
                                          include_unqualified="true")["data"]
        out["week_top"][position] = get("/stats/leaderboard", season=SEASON, week=RECAP_WEEK, position=position,
                                        metric="fantasy_points", scoring="ppr", limit=30)["data"]
    print("intel", {p: len(v) for p, v in out["intel"].items()}, file=sys.stderr)

    # Team cards: each team's EPA by game, and every skill player's share of the work by week.
    def breakdown(team):
        return team["abbreviation"], get(f"/teams/{team['team_id']}/breakdown", season=SEASON)
    team_list = [t for t in out["team_stats"]["teams"]]
    with ThreadPoolExecutor(6) as pool:
        out["breakdowns"] = dict(pool.map(breakdown, team_list))
    out["weekly_boards"] = {
        week: every_row("/stats/leaderboard", season=SEASON, week=week, positions="RB,WR,TE", metric="fantasy_points",
                        scoring="ppr")
        for week in range(1, RECAP_WEEK + 1)
    }
    print("breakdowns", len(out["breakdowns"]), "weekly boards", len(out["weekly_boards"]), file=sys.stderr)

    # The reply-card pool: the top N at each position by total points.
    pool_ids = []
    for position in POSITIONS:
        ranked = sorted(out["intel"][position], key=lambda r: -(r.get("fantasy_points") or 0))
        pool_ids += [(r["player_id"], position) for r in ranked[: CARD_DEPTH[position]]]

    def player(entry):
        pid, position = entry
        data = {
            "profile": get(f"/players/{pid}"),
            "log": get(f"/players/{pid}/stats", season=SEASON, scoring="ppr")["data"],
            "career": get(f"/players/{pid}/career", scoring="ppr")["data"],
        }
        role = "passer" if position == "QB" else "receiver"
        data["targets"] = get(f"/explore/players/{pid}/targets", season=SEASON, role=role)
        if position in ("RB", "QB"):
            data["runs"] = get(f"/explore/players/{pid}/runs", season=SEASON)
        return pid, data

    with ThreadPoolExecutor(6) as pool:
        out["players"] = dict(pool.map(player, pool_ids))
    print("players", len(out["players"]), file=sys.stderr)

    for key, value in out.items():
        save(key, value)


if __name__ == "__main__":
    main()
