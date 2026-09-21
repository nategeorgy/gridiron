// Games (M10, redesigned September 2026) — the week as a slate of cards.
//
// It was a flat six-column table, which had three problems. The **kickoff slot was
// invisible**: a reader parses a week as Thursday / Sunday early / Sunday late /
// Sunday night / Monday, and a list sorted by timestamp made them reconstruct that.
// **"Implied A/H" was two numbers sharing a cell** — the most fantasy-relevant figure
// on the page in its least legible form. And every game **weighed the same**, so a
// 52.5-point shootout and a 40.5-point slog looked identical.
//
// So: cards grouped by slot, the market drawn rather than tabulated, and the week
// picker promoted to a rail that says how much of each week is played and priced
// before you click it.
//
// Every filter still lives in the URL (`useUrlState`), so a week of the schedule is a
// link worth sending and a saved view worth saving.
//
// **Schedule-shaped, so it offers every season the schedule knows about** — not only
// the ones with stats. From March to September the newest scheduled season has no
// player stats at all, and it is exactly the season somebody looking at fixtures wants.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { GameCard } from "../components/schedule/GameCard";
import { WeekRail, defaultWeek } from "../components/schedule/WeekRail";
import { SLOT_ORDER, formatGameDateLong, slotOf } from "../components/schedule/kickoff";
import { Select } from "../components/ui/Select";
import { ExportButton } from "../components/ExportButton";
import { SaveViewButton } from "../components/SaveViewButton";
import { useGames, useGameWeeks } from "../hooks/useGames";
import { useSeasons } from "../hooks/useSeasons";
import { getTeams } from "../services/teams";
import { useUrlState } from "../hooks/useUrlState";

const ALL = WeekRail.ALL;

/**
 * Games grouped for display: by kickoff slot inside a single week, by week across
 * several. Grouping 272 games into seven slot buckets would be meaningless, and
 * grouping 16 by week would be one heading.
 */
function groupGames(games, oneWeek) {
  const buckets = new Map();
  for (const game of games) {
    const key = oneWeek ? slotOf(game) : `Week ${game.week}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(game);
  }
  const order = oneWeek ? SLOT_ORDER : [...buckets.keys()];
  return order
    .filter((key) => buckets.has(key))
    .map((key) => {
      const rows = buckets.get(key);
      return { key, games: rows, caption: formatGameDateLong(rows[0].game_date) };
    });
}

export function GamesView({ board }) {
  // Every season on the schedule, not only those with stats: fixtures exist months
  // before anyone plays them.
  const { seasons, currentSeason } = useSeasons({ statsOnly: false });
  const [season, setSeason] = useUrlState("season", String(seasons[0] ?? currentSeason));
  const [weekChoice, setWeek] = useUrlState("week", "");
  const [teamId, setTeamId] = useUrlState("team", "");

  const { data: teamsData } = useQuery({ queryKey: ["teams"], queryFn: getTeams, staleTime: Infinity });
  const teams = useMemo(
    () => [...(teamsData ?? [])].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
    [teamsData],
  );

  const { data: weekData } = useGameWeeks({ season: Number(season), season_type: "REG" });
  const weeks = weekData?.weeks ?? [];

  // "" means "decide for me", which resolves once the week summary lands.
  const week = weekChoice || defaultWeek(weeks) || "";
  const oneWeek = week !== ALL && week !== "";

  const params = useMemo(
    () => ({
      season: Number(season),
      season_type: "REG",
      ...(oneWeek ? { week: Number(week) } : {}),
      ...(teamId ? { team_id: Number(teamId) } : {}),
      limit: 400,
    }),
    [season, week, oneWeek, teamId],
  );
  const { data, isLoading, isError } = useGames(params);
  const games = data?.data ?? [];
  const groups = useMemo(() => groupGames(games, oneWeek), [games, oneWeek]);

  const exportRows = useMemo(
    () =>
      games.map((game) => ({
        week: game.week,
        date: game.game_date,
        kickoff: game.kickoff_time,
        matchup: `${game.away_abbreviation} @ ${game.home_abbreviation}`,
        away_score: game.away_score,
        home_score: game.home_score,
        favorite: game.favorite,
        spread: game.favorite_spread,
        total_line: game.total_line,
        away_implied: game.away_implied,
        home_implied: game.home_implied,
      })),
    [games],
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">{board.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">{board.description}</p>
      </div>

      <div className="glass-card space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <Select
            label="Season"
            value={season}
            onChange={setSeason}
            options={seasons.map((year) => ({ value: String(year), label: String(year) }))}
          />
          <Select
            label="Team"
            value={teamId}
            onChange={setTeamId}
            options={[
              { value: "", label: "All teams" },
              ...teams.map((team) => ({
                value: String(team.team_id),
                label: team.name ?? team.abbreviation,
              })),
            ]}
          />
          <div className="ml-auto flex items-end gap-2">
            <SaveViewButton defaultName={board.title} />
            <ExportButton
              filename={`second-level-games-${season}${oneWeek ? `-wk${week}` : ""}`}
              rows={exportRows}
              columns={[
                { key: "week", label: "Week" },
                { key: "date", label: "Date" },
                { key: "kickoff", label: "Kickoff (ET)" },
                { key: "matchup", label: "Game" },
                { key: "away_score", label: "Away score" },
                { key: "home_score", label: "Home score" },
                { key: "favorite", label: "Favorite" },
                { key: "spread", label: "Spread" },
                { key: "total_line", label: "Total" },
                { key: "away_implied", label: "Away implied" },
                { key: "home_implied", label: "Home implied" },
              ]}
              context={[
                "Second Level: Games",
                `${season} regular season${oneWeek ? `, week ${week}` : ""}`,
                "Implied total = total / 2 +/- spread / 2. Blank lines are games the market has not priced.",
              ]}
            />
          </div>
        </div>

        <div className="border-t border-line pt-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.07em] text-faint">
            Week
          </div>
          <WeekRail weeks={weeks} value={week} onChange={setWeek} />
        </div>
      </div>

      {isError ? (
        <div className="glass-card p-10 text-center text-sm text-muted">
          Couldn&apos;t load the schedule.
        </div>
      ) : isLoading ? (
        <div className="glass-card p-10 text-center text-sm text-muted">Loading…</div>
      ) : games.length === 0 ? (
        <div className="glass-card p-10 text-center text-sm text-muted">
          No games match these filters.
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.key}>
              <div className="mb-2.5 flex items-center gap-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-fg">
                <span>{group.key}</span>
                {oneWeek && <span className="font-semibold tracking-[0.04em] text-faint">{group.caption}</span>}
                <span className="h-px flex-1 bg-line" />
                <span className="font-semibold tracking-[0.04em] text-faint">
                  {group.games.length} game{group.games.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(228px,1fr))]">
                {group.games.map((game) => (
                  <GameCard key={game.game_id} game={game} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="max-w-3xl text-[11px] leading-relaxed text-faint">
        The bar under each game splits its total by the spread and the points the market
        expects each offense to score. Lines come from the nflverse schedule feed, there
        is no odds provider behind this and no intraday movement. Most of a season
        carries no line until a few weeks out, and those games show an empty bar rather
        than a zero. Kickoffs are Eastern.
      </p>
    </div>
  );
}
