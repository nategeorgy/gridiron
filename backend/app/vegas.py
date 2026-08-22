"""The Vegas board (M6.4) — game environment as a fantasy input.

The market prices every game twice: a **spread** (who wins, by how much) and a **total**
(how many points get scored). Split them apart and you get each team's **implied total**
— the points the market expects that offense to score — which is the single best
forward-looking read on how many fantasy points there are to go around. A running back
in a 27-point implied offense is in a different job from the same back in a 17-point one.

**No new data and no odds API.** The lines arrive in the same nflverse schedule feed the
`games` table is already built from (M6.0), for finished games and upcoming ones alike.
Implied totals are derived here rather than stored: they are arithmetic on two columns
that always move together, and storing them would mean two ways to be out of date.

**Unpriced is a real state, not missing data.** The market prices a few weeks out and
posts look-ahead lines on a handful of marquee games beyond that — as of 2026-08-20,
weeks 1–6 were fully priced, week 7 half, and the rest sporadic. A board that rendered
those as blanks or zeroes would be lying about what the market has said.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session, aliased

from app.aggregation import aggregate_select, finalize_row, games_expr, window_filters
from app.models import DepthChartEntry, Game, Player, PlayerStats, Team
from app.scoring import ScoringConfig

VIEWS = ("players", "games")

# How deep into a depth chart the player view goes. Past the third at a position, a
# chart stops being a fantasy question — and letting a whole 30-man roster through
# would bury the second-best game environment under the best one's practice squad.
MAX_DEPTH_RANK = 3


def implied_totals(
    spread_line: float | None, total_line: float | None
) -> tuple[float | None, float | None]:
    """Split a spread and a total into (home, away) implied points.

    nflverse's ``spread_line`` is from the **home** team's perspective — positive means
    the home team is favoured — so the favourite gets half the spread added and the
    underdog has it taken away.
    """
    if spread_line is None or total_line is None:
        return None, None
    half_spread = spread_line / 2
    return (
        round(total_line / 2 + half_spread, 2),
        round(total_line / 2 - half_spread, 2),
    )


def default_week(db: Session, season: int) -> int | None:
    """The week the board should open on: the next one not yet played.

    Answers "what does this show in July": the **coming** season's first week, not last
    season's closing lines. A line's whole value is that it is about a game nobody has
    played, so a board defaulting to a settled week would be a history exhibit.
    """
    upcoming = db.scalar(
        select(func.min(Game.week)).where(
            Game.season == season,
            Game.season_type == "REG",
            Game.home_score.is_(None),
        )
    )
    if upcoming is not None:
        return upcoming
    # The season is over: fall back to its last week rather than showing nothing.
    return db.scalar(
        select(func.max(Game.week)).where(
            Game.season == season, Game.season_type == "REG"
        )
    )


def week_summary(db: Session, season: int) -> list[dict]:
    """Every week of a season with how much of it the market has priced."""
    rows = db.execute(
        select(
            Game.week,
            func.count().label("games"),
            func.count(Game.spread_line).label("priced"),
            func.count(Game.home_score).label("played"),
        )
        .where(Game.season == season, Game.season_type == "REG", Game.week.is_not(None))
        .group_by(Game.week)
        .order_by(Game.week)
    ).mappings().all()
    return [dict(row) for row in rows]


def fetch_games(db: Session, season: int, week: int) -> list[dict]:
    """One week's slate, each game with both implied totals."""
    home_team = aliased(Team)
    away_team = aliased(Team)
    rows = db.execute(
        select(
            Game.game_id, Game.week, Game.game_date,
            Game.home_team_id, Game.away_team_id,
            Game.home_score, Game.away_score,
            Game.spread_line, Game.total_line,
            Game.home_moneyline, Game.away_moneyline,
            Game.roof, Game.div_game,
            home_team.abbreviation.label("home"),
            away_team.abbreviation.label("away"),
        )
        .outerjoin(home_team, Game.home_team_id == home_team.team_id)
        .outerjoin(away_team, Game.away_team_id == away_team.team_id)
        .where(Game.season == season, Game.season_type == "REG", Game.week == week)
        .order_by(Game.game_date, Game.game_id)
    ).mappings().all()

    games = []
    for row in rows:
        home_implied, away_implied = implied_totals(row["spread_line"], row["total_line"])
        games.append({
            **dict(row),
            "home_implied": home_implied,
            "away_implied": away_implied,
            "priced": row["spread_line"] is not None and row["total_line"] is not None,
        })

    # Highest-scoring environment first; unpriced games sort last, since "no line" is
    # not "a low total".
    games.sort(key=lambda game: (game["total_line"] is None, -(game["total_line"] or 0)))
    return games


def _team_context(games: list[dict]) -> dict[int, dict]:
    """Each team's own view of its game that week: opponent, its spread, its total."""
    context: dict[int, dict] = {}
    for game in games:
        for team_id, opponent, is_home, implied in (
            (game["home_team_id"], game["away"], True, game["home_implied"]),
            (game["away_team_id"], game["home"], False, game["away_implied"]),
        ):
            if team_id is None:
                continue
            spread = game["spread_line"]
            context[team_id] = {
                "game_id": game["game_id"],
                "game_date": game["game_date"],
                "opponent": opponent,
                "is_home": is_home,
                # Positive means favoured, from this team's side.
                "team_spread": None if spread is None else (spread if is_home else -spread),
                "total_line": game["total_line"],
                "implied_total": implied,
                "priced": game["priced"],
            }
    return context


def _candidates(db: Session, season: int, team_ids: set[int]) -> list[dict]:
    """The players worth listing for a week: the current depth chart, top three deep.

    Falls back to whoever produced in the season itself when no chart is stored for it
    — depth charts are kept for the current season only, so a historical week would
    otherwise be an empty board.
    """
    rows = db.execute(
        select(
            DepthChartEntry.player_id, DepthChartEntry.pos_abb, DepthChartEntry.pos_rank,
            DepthChartEntry.team_id, Player.name, Player.headshot_url,
        )
        .join(Player, DepthChartEntry.player_id == Player.player_id)
        .where(
            DepthChartEntry.season == season,
            DepthChartEntry.team_id.in_(team_ids),
            DepthChartEntry.pos_rank <= MAX_DEPTH_RANK,
        )
    ).mappings().all()
    if rows:
        return [
            {
                "player_id": row["player_id"], "name": row["name"],
                "position": row["pos_abb"], "team_id": row["team_id"],
                "pos_rank": row["pos_rank"], "headshot_url": row["headshot_url"],
            }
            for row in rows
        ]

    fallback = db.execute(
        select(Player.player_id, Player.name, Player.position, Player.team_id, Player.headshot_url)
        .join(PlayerStats, PlayerStats.player_id == Player.player_id)
        .where(PlayerStats.season == season, Player.team_id.in_(team_ids))
        .group_by(Player.player_id, Player.name, Player.position, Player.team_id, Player.headshot_url)
    ).mappings().all()
    return [{**dict(row), "pos_rank": None} for row in fallback]


def build_vegas(
    db: Session,
    season: int,
    week: int,
    config: ScoringConfig,
    production_season: int | None,
    position: str | None = None,
) -> tuple[list[dict], list[dict]]:
    """One week, as both a slate of games and a ranked list of players."""
    games = fetch_games(db, season, week)
    context = _team_context(games)

    teams = {team_id for team_id in context}
    candidates = _candidates(db, season, teams)
    if position:
        wanted = position.upper()
        candidates = [player for player in candidates if player["position"] == wanted]

    production: dict[str, dict] = {}
    if production_season and candidates:
        player_ids = tuple(player["player_id"] for player in candidates)
        rows = db.execute(
            aggregate_select(
                window_filters(production_season, "REG", player_ids=player_ids), games_expr()
            )
        ).mappings().all()
        production = {row["player_id"]: finalize_row(dict(row), config) for row in rows}

    team_names = dict(
        db.execute(select(Team.team_id, Team.abbreviation).where(Team.team_id.in_(teams))).all()
    )

    players = []
    for player in candidates:
        game = context.get(player["team_id"], {})
        stats = production.get(player["player_id"], {})
        players.append({
            **player,
            "team_abbreviation": team_names.get(player["team_id"]),
            **game,
            "fantasy_ppg": stats.get("fantasy_ppg"),
            "expected_fantasy_ppg": stats.get("expected_fantasy_ppg"),
            "games_played": stats.get("games_played"),
        })

    # Best scoring environment first, then the better player inside it — the second key
    # is what stops a single high-total offense reading as an unordered block.
    players.sort(
        key=lambda player: (
            player.get("implied_total") is None,
            -(player.get("implied_total") or 0),
            -(player.get("fantasy_ppg") or 0),
        )
    )
    return players, games
