// Schedule by team (M10) — one season as a team × week grid.
//
// The same shape as the M6.3 strength-of-schedule grid, and for the same reason: a
// fixture list answers "who plays this week", and a row answers "what does this player
// have to get through". The second question is the one that decides a trade, and a
// week-by-week list cannot show it.
//
// A bye is drawn as an explicit gap rather than an empty cell. An absent fixture and an
// unloaded one look identical otherwise, and only one of them is news.
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { useGames } from "../hooks/useGames";
import { useSeasons } from "../hooks/useSeasons";
import { useUrlState } from "../hooks/useUrlState";
import { getTeams } from "../services/teams";

export function ScheduleGridView({ board }) {
  const { seasons, currentSeason } = useSeasons({ statsOnly: false });
  const [season, setSeason] = useUrlState("season", String(seasons[0] ?? currentSeason));

  const { data: teamsData } = useQuery({ queryKey: ["teams"], queryFn: getTeams, staleTime: Infinity });
  const { data, isLoading, isError } = useGames({
    season: Number(season),
    season_type: "REG",
    limit: 400,
  });

  const { rows, weeks } = useMemo(() => {
    const games = data?.data ?? [];
    const weekNumbers = [...new Set(games.map((game) => game.week))].sort((a, b) => a - b);

    // Only teams that actually played this season. A franchise can exist in `teams` and
    // have no fixtures in the season being asked about (M6.5) — a row of byes for a
    // team that did not exist yet reads as a data bug rather than as history.
    const byTeam = new Map();
    const record = (teamId, abbreviation, week, cell) => {
      if (teamId == null) return;
      if (!byTeam.has(teamId)) byTeam.set(teamId, { teamId, abbreviation, cells: new Map() });
      byTeam.get(teamId).cells.set(week, cell);
    };

    for (const game of games) {
      record(game.home_team_id, game.home_abbreviation, game.week, {
        opponent: game.away_abbreviation,
        home: true,
        played: game.played,
        won: game.winner === "home",
        tied: game.winner === "tie",
        score: game.played ? `${game.home_score}-${game.away_score}` : null,
        implied: game.home_implied,
      });
      record(game.away_team_id, game.away_abbreviation, game.week, {
        opponent: game.home_abbreviation,
        home: false,
        played: game.played,
        won: game.winner === "away",
        tied: game.winner === "tie",
        score: game.played ? `${game.away_score}-${game.home_score}` : null,
        implied: game.away_implied,
      });
    }

    const names = new Map((teamsData ?? []).map((team) => [team.team_id, team.name]));
    const ordered = [...byTeam.values()].sort((a, b) =>
      (a.abbreviation ?? "").localeCompare(b.abbreviation ?? ""),
    );
    return {
      weeks: weekNumbers,
      rows: ordered.map((team) => ({ ...team, name: names.get(team.teamId) })),
    };
  }, [data, teamsData]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">{board.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">{board.description}</p>
      </div>

      <div className="glass-card flex flex-wrap items-end gap-4 p-4">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.07em] text-faint">Season</span>
          <select
            value={season}
            onChange={(event) => setSeason(event.target.value)}
            className="glass-input px-3 py-2 text-sm"
          >
            {seasons.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
        <p className="ml-auto max-w-md text-[11px] leading-relaxed text-faint">
          Home games are plain, away games carry an <span className="text-muted">@</span>. Played
          weeks are tinted by result; upcoming weeks show the opponent.
        </p>
      </div>

      <div className="glass-card p-4">
        {isError && <p className="py-10 text-center text-sm text-muted">Couldn't load the schedule.</p>}
        {isLoading && <p className="py-10 text-center text-sm text-muted">Loading…</p>}
        {!isLoading && !isError && (
          <div className="overflow-x-auto">
            <table className="border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-[color:var(--surface-solid)] pb-2 pr-3 text-left text-[9.5px] font-bold uppercase tracking-[0.07em] text-faint">
                    Team
                  </th>
                  {weeks.map((week) => (
                    <th
                      key={week}
                      className="px-1 pb-2 text-center text-[9.5px] font-bold uppercase tracking-[0.07em] text-faint"
                    >
                      {week}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((team) => (
                  <tr key={team.teamId} className="border-t border-line">
                    <td className="sticky left-0 z-10 bg-[color:var(--surface-solid)] py-1.5 pr-3">
                      <Link
                        to={`/teams/${team.teamId}`}
                        className="text-[12px] font-semibold text-fg hover:text-accent"
                      >
                        {team.abbreviation}
                      </Link>
                    </td>
                    {weeks.map((week) => {
                      const cell = team.cells.get(week);
                      if (!cell) {
                        return (
                          <td key={week} className="px-1 py-1.5 text-center">
                            <span className="text-[10px] font-semibold text-faint">BYE</span>
                          </td>
                        );
                      }
                      const tint = !cell.played
                        ? "transparent"
                        : cell.tied
                          ? "color-mix(in srgb, var(--warn) 16%, transparent)"
                          : cell.won
                            ? "color-mix(in srgb, var(--pos) 16%, transparent)"
                            : "color-mix(in srgb, var(--neg) 16%, transparent)";
                      return (
                        <td key={week} className="px-0.5 py-1">
                          <span
                            className="block rounded px-1.5 py-1 text-center text-[11px] leading-tight"
                            style={{ background: tint }}
                            title={
                              cell.played
                                ? `${cell.won ? "Won" : cell.tied ? "Tied" : "Lost"} ${cell.score}`
                                : cell.implied != null
                                  ? `Implied total ${cell.implied}`
                                  : "No line yet"
                            }
                          >
                            <span className="font-semibold text-fg">
                              {cell.home ? "" : <span className="text-faint">@</span>}
                              {cell.opponent}
                            </span>
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
