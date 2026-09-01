// Games (M10) — the whole schedule, filterable.
//
// The endpoint CLAUDE.md has listed since the first milestone and nothing had built.
// Every filter lives in the URL (`useUrlState`), so a week of the schedule is a link
// worth sending and a saved view worth saving.
//
// **Schedule-shaped, so it offers every season the schedule knows about** — not only
// the ones with stats. From March to September the newest scheduled season has no
// player stats at all, and it is exactly the season somebody looking at fixtures wants.
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { useGames, useGameWeeks } from "../hooks/useGames";
import { useSeasons } from "../hooks/useSeasons";
import { getTeams } from "../services/teams";
import { useUrlState } from "../hooks/useUrlState";
import { formatStat } from "../utils/format";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatGameDate(iso) {
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return `${WEEKDAYS[date.getUTCDay()]} ${month}/${day}`;
}

export function formatKickoff(time) {
  if (!time) return "";
  const [hours, minutes] = time.split(":").map(Number);
  const hour12 = ((hours + 11) % 12) + 1;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"} ET`;
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.07em] text-faint">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="glass-input px-3 py-2 text-sm"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function GameRow({ game }) {
  const awayWon = game.winner === "away";
  const homeWon = game.winner === "home";
  return (
    <tr className="border-t border-line">
      <td className="py-2.5 text-[11px] text-faint">
        {formatGameDate(game.game_date)}
        {game.kickoff_time && <span className="ml-1.5">{formatKickoff(game.kickoff_time)}</span>}
      </td>
      <td className="py-2.5">
        <Link to={`/teams/${game.away_team_id}`} className={`font-semibold hover:text-accent ${awayWon ? "text-fg" : "text-muted"}`}>
          {game.away_abbreviation}
        </Link>
        <span className="mx-1.5 text-faint">@</span>
        <Link to={`/teams/${game.home_team_id}`} className={`font-semibold hover:text-accent ${homeWon ? "text-fg" : "text-muted"}`}>
          {game.home_abbreviation}
        </Link>
      </td>
      <td className="stat-num py-2.5 text-right">
        {game.played ? (
          <>
            <span className={awayWon ? "font-semibold text-fg" : "text-faint"}>{game.away_score}</span>
            <span className="mx-1 text-faint">–</span>
            <span className={homeWon ? "font-semibold text-fg" : "text-faint"}>{game.home_score}</span>
          </>
        ) : (
          <span className="text-faint">—</span>
        )}
      </td>
      <td className="stat-num py-2.5 text-right text-muted">
        {/* An unpriced game is a state, not a zero (M6.4). */}
        {game.favorite ? `${game.favorite} ${game.favorite_spread}` : <span className="text-faint">no line</span>}
      </td>
      <td className="stat-num py-2.5 text-right text-muted">
        {game.total_line != null ? formatStat(game.total_line, 1) : <span className="text-faint">—</span>}
      </td>
      <td className="stat-num py-2.5 text-right text-muted">
        {game.away_implied != null ? `${formatStat(game.away_implied, 1)} / ${formatStat(game.home_implied, 1)}` : <span className="text-faint">—</span>}
      </td>
    </tr>
  );
}

export function GamesView({ board }) {
  // Every season on the schedule, not only those with stats: fixtures exist months
  // before anyone plays them.
  const { seasons, currentSeason } = useSeasons({ statsOnly: false });
  const [season, setSeason] = useUrlState("season", String(seasons[0] ?? currentSeason));
  const [week, setWeek] = useUrlState("week", "");
  const [teamId, setTeamId] = useUrlState("team", "");

  const { data: teamsData } = useQuery({ queryKey: ["teams"], queryFn: getTeams, staleTime: Infinity });
  const teams = useMemo(
    () => [...(teamsData ?? [])].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
    [teamsData],
  );

  const { data: weekData } = useGameWeeks({ season: Number(season), season_type: "REG" });
  const weeks = weekData?.weeks ?? [];

  const params = useMemo(
    () => ({
      season: Number(season),
      season_type: "REG",
      week: week ? Number(week) : undefined,
      team_id: teamId ? Number(teamId) : undefined,
      limit: 400,
    }),
    [season, week, teamId],
  );
  const { data, isLoading, isError } = useGames(params);
  const games = data?.data ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">{board.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">{board.description}</p>
      </div>

      <div className="glass-card flex flex-wrap items-end gap-4 p-4">
        <Select
          label="Season"
          value={season}
          onChange={setSeason}
          options={seasons.map((year) => ({ value: String(year), label: String(year) }))}
        />
        <Select
          label="Week"
          value={week}
          onChange={setWeek}
          options={[
            { value: "", label: "All weeks" },
            ...weeks.map((entry) => ({
              value: String(entry.week),
              // Say what is behind a week before someone clicks it (M6.4).
              label: `Week ${entry.week}${entry.played === 0 ? " · upcoming" : ""}`,
            })),
          ]}
        />
        <Select
          label="Team"
          value={teamId}
          onChange={setTeamId}
          options={[
            { value: "", label: "All teams" },
            ...teams.map((team) => ({ value: String(team.team_id), label: team.name ?? team.abbreviation })),
          ]}
        />
        <span className="ml-auto text-xs text-faint">
          {isLoading ? "Loading…" : `${games.length} game${games.length === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="glass-card overflow-hidden p-4">
        {isError ? (
          <p className="py-10 text-center text-sm text-muted">Couldn't load the schedule.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" style={{ minWidth: 640 }}>
              <thead>
                <tr className="text-[9.5px] uppercase tracking-[0.07em] text-faint">
                  <th className="pb-2 text-left font-bold">When</th>
                  <th className="pb-2 text-left font-bold">Matchup</th>
                  <th className="pb-2 text-right font-bold">Score</th>
                  <th className="pb-2 text-right font-bold">Line</th>
                  <th className="pb-2 text-right font-bold">O/U</th>
                  <th className="pb-2 text-right font-bold">Implied A/H</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-muted">
                      Loading…
                    </td>
                  </tr>
                )}
                {!isLoading && games.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-muted">
                      No games match these filters.
                    </td>
                  </tr>
                )}
                {games.map((game) => (
                  <GameRow key={game.game_id} game={game} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
