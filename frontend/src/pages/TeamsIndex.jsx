// Teams > Team Pages: every team by division, in standing order, with its record, net
// EPA rank and next game. Each card opens that team's page.
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Select } from "../components/ui/Select";
import { RankChip } from "../components/team/RankChip";
import { useGames } from "../hooks/useGames";
import { useScoring } from "../hooks/useScoring";
import { useSeasons } from "../hooks/useSeasons";
import { useTeamStats } from "../hooks/useTeamStats";
import { useUrlState } from "../hooks/useUrlState";
import { formatTeamStat, rankedCount, recordText, teamsByDivision } from "../utils/teamStats";

/** Each team's first unplayed game in a season's schedule, from its point of view. */
function nextGames(games) {
  const next = {};
  const sorted = [...(games ?? [])].filter((game) => !game.played).sort((a, b) => a.week - b.week);
  for (const game of sorted) {
    for (const [side, other] of [["home", "away"], ["away", "home"]]) {
      const abbreviation = game[`${side}_abbreviation`];
      if (next[abbreviation]) continue;
      next[abbreviation] = { week: game.week, home: side === "home", opponent: game[`${other}_abbreviation`], implied: game[`${side}_implied`] };
    }
  }
  return next;
}

export function TeamsIndex() {
  const { seasonOptions, currentSeason } = useSeasons();
  const { seasonOptions: scheduleSeasons } = useSeasons({ statsOnly: false });
  const [season, setSeason] = useUrlState("season", String(currentSeason));
  const [scoring] = useScoring();
  const seasonNumber = Number(season);
  const scheduleSeason = Number(scheduleSeasons[0]?.value ?? currentSeason);

  const { data: board, isLoading } = useTeamStats({ season: seasonNumber, scoring });
  const { data: games } = useGames({ season: scheduleSeason, season_type: "REG", limit: 400 }, { enabled: seasonNumber === scheduleSeason });
  const upcoming = useMemo(() => (seasonNumber === scheduleSeason ? nextGames(games?.data) : {}), [games, seasonNumber, scheduleSeason]);

  const net = board?.values?.net_epa?.o ?? {};
  const pointsFor = board?.values?.ppg?.o ?? {};
  const pointsAgainst = board?.values?.ppg?.d ?? {};
  const netCount = rankedCount(board, "net_epa", "o");
  const standing = (team) => (team.record?.wins ?? 0) + (team.record?.ties ?? 0) / 2;
  const diff = (team) => (pointsFor[team.abbreviation]?.[0] ?? 0) - (pointsAgainst[team.abbreviation]?.[0] ?? 0);
  const divisions = teamsByDivision(board?.teams).map((group) => ({ ...group, teams: [...group.teams].sort((a, b) => standing(b) - standing(a) || diff(b) - diff(a)) }));

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">Team pages</h1>
          <p className="mt-1 text-sm text-muted">{season} {"·"} in division standing order {"·"} net EPA rank is out of 32</p>
        </div>
        <Select label="Season" value={season} onChange={setSeason} options={seasonOptions} />
      </div>

      <section className="glass-card grid gap-3 p-4">
        {isLoading && !board && <p className="py-8 text-center text-sm text-muted">Loading...</p>}
        {divisions.map(({ division, teams }) => (
          <div key={division} className="grid gap-2.5 md:grid-cols-[110px_repeat(4,minmax(0,1fr))]">
            <h2 className="self-center font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-faint">{division}</h2>
            {teams.map((team) => {
              const rating = net[team.abbreviation];
              const game = upcoming[team.abbreviation];
              return (
                <Link
                  key={team.team_id}
                  to={`/teams/${team.team_id}${season !== String(currentSeason) ? `?season=${season}` : ""}`}
                  className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1 rounded-2xl border border-line p-3 transition hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
                  style={{ background: "var(--surface)" }}
                >
                  {team.logo_url && <img src={team.logo_url} alt="" className="row-span-2 h-11 w-11 object-contain" />}
                  <b className="truncate text-sm text-fg">{team.name.split(" ").pop()}</b>
                  <span className="flex flex-wrap items-baseline gap-2 text-[11.5px] text-muted">
                    <span className="stat-num font-semibold text-fg">{recordText(team.record)}</span>
                    <RankChip rank={rating?.[1]} of={netCount} />
                    <span>net EPA {formatTeamStat(rating?.[0], "sgn2")}</span>
                  </span>
                  <span className="col-span-2 mt-1 flex justify-between gap-1.5 border-t border-line pt-1.5 text-[11.5px] text-faint">
                    {game ? (
                      <>
                        <span>Wk {game.week} {game.home ? "vs" : "at"} {game.opponent}</span>
                        <span>{game.implied != null ? `implied ${game.implied.toFixed(1)}` : "no line yet"}</span>
                      </>
                    ) : (
                      <>
                        <span>{seasonNumber === scheduleSeason ? "Season over" : "Final"}</span>
                        <span className="stat-num">{formatTeamStat(pointsFor[team.abbreviation]?.[0], "num1")}{"–"}{formatTeamStat(pointsAgainst[team.abbreviation]?.[0], "num1")} per game</span>
                      </>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
      </section>
    </div>
  );
}
