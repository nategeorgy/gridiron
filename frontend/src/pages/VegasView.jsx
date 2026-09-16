// The Vegas board (M6.4, redesigned September 2026) — game environment as a fantasy
// input.
//
// The market prices every game twice: a spread (who wins, by how much) and a total
// (how many points). Split them and you get each team's **implied total** — the points
// the market expects that offense to score, and the best forward-looking read on how
// many fantasy points are going to exist. A back in a 27-point offense has a different
// job from the same back in a 17-point one.
//
// ⚠️ **The old Players/Games toggle is gone, and that was the fix, not a simplification.**
// The players view ranked *players* by their team's implied total — but implied total
// is a fact about the offense, so every player on a team shared one number and the
// board opened with twelve San Francisco players in a row before it reached another
// team. It was sorting 300 rows on 32 distinct values. So the page is now one scroll,
// summary then detail, both ordered the same way:
//
//   1. a rail of every offense this week, one bar each — where the points are;
//   2. the same offenses expanded with their players — who is in line for them.
//
// Structure comes from `/games` rather than `/stats/vegas?view=games`, because that
// endpoint carries team logos and the same implied totals. `/stats/vegas?view=players`
// still supplies the player chips.
import { useMemo } from "react";

import { Select } from "../components/ui/Select";
import { ScoringControl } from "../components/ScoringControl";
import { ExportButton } from "../components/ExportButton";
import { SaveViewButton } from "../components/SaveViewButton";
import { OffenseCard } from "../components/schedule/OffenseCard";
import { TeamEnvironmentRail } from "../components/schedule/TeamEnvironmentRail";
import { WeekRail, defaultWeek } from "../components/schedule/WeekRail";
import { useGames, useGameWeeks } from "../hooks/useGames";
import { useVegas } from "../hooks/useDraftBoard";
import { useScoring } from "../hooks/useScoring";
import { useUrlState } from "../hooks/useUrlState";
import { useSeasons } from "../hooks/useSeasons";
import { POSITIONS } from "../constants";

/** How many players to show per offense. Enough for a lineup decision, not a roster. */
const CHIPS_PER_TEAM = 6;
/** The endpoint's ceiling; a full week of charted players runs to roughly 370. */
const PLAYER_LIMIT = 400;

/**
 * One row per offense, from the week's fixtures.
 *
 * Unpriced games are kept rather than dropped — a team with no line is still playing,
 * and hiding it would make the board quietly incomplete — but they sort last, because
 * "no line" is not "a low total".
 */
function offensesFrom(games) {
  const rows = [];
  for (const game of games) {
    const shared = {
      gameId: game.game_id,
      total: game.total_line,
      divGame: game.div_game,
    };
    rows.push({
      ...shared,
      abbreviation: game.away_abbreviation,
      teamId: game.away_team_id,
      logoUrl: game.away_logo_url,
      opponent: game.home_abbreviation,
      isHome: false,
      implied: game.away_implied,
    });
    rows.push({
      ...shared,
      abbreviation: game.home_abbreviation,
      teamId: game.home_team_id,
      logoUrl: game.home_logo_url,
      opponent: game.away_abbreviation,
      isHome: true,
      implied: game.home_implied,
    });
  }
  return rows.sort((a, b) => {
    if (a.implied == null && b.implied == null) return 0;
    if (a.implied == null) return 1;
    if (b.implied == null) return -1;
    return b.implied - a.implied;
  });
}

export function VegasView({ board }) {
  const { seasons, currentSeason } = useSeasons({ statsOnly: false });
  const [season, setSeason] = useUrlState("season", String(seasons[0] ?? currentSeason));
  const [weekChoice, setWeek] = useUrlState("week", "");
  const [position, setPosition] = useUrlState("position", "");
  const [scoring, setScoring] = useScoring();

  const { data: weekData } = useGameWeeks({ season: Number(season), season_type: "REG" });
  const weeks = weekData?.weeks ?? [];
  const week = weekChoice || defaultWeek(weeks) || "";

  // Structure + logos. Skipped until a week resolves, so the first paint is not a
  // whole season of fixtures.
  const gamesQuery = useGames(
    { season: Number(season), season_type: "REG", week: Number(week), limit: 400 },
    { enabled: Boolean(week) },
  );
  // The players inside those offenses, in the reader's scoring.
  const playersQuery = useVegas(
    {
      season: Number(season),
      week: Number(week),
      view: "players",
      ...(position ? { position } : {}),
      scoring,
      limit: PLAYER_LIMIT,
    },
    { enabled: Boolean(week) },
  );

  const games = gamesQuery.data?.data ?? [];
  const offenses = useMemo(() => offensesFrom(games), [games]);

  const priced = offenses.filter((team) => team.implied != null);
  const max = priced.length ? priced[0].implied : 0;
  const median = priced.length ? priced[Math.floor(priced.length / 2)].implied : 0;

  // The API already ranks players; keep that order inside each team so the chips lead
  // with the names that matter.
  const playersByTeam = useMemo(() => {
    const grouped = new Map();
    for (const player of playersQuery.data?.data ?? []) {
      const key = player.team_abbreviation;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(player);
    }
    return grouped;
  }, [playersQuery.data]);

  const exportRows = useMemo(
    () =>
      offenses.map((team) => ({
        team: team.abbreviation,
        matchup: `${team.isHome ? "vs " : "@ "}${team.opponent}`,
        implied_total: team.implied,
        total_line: team.total,
        players: (playersByTeam.get(team.abbreviation) ?? [])
          .slice(0, CHIPS_PER_TEAM)
          .map((player) => player.name)
          .join(", "),
      })),
    [offenses, playersByTeam],
  );

  const isLoading = gamesQuery.isLoading || !week;
  const isError = gamesQuery.isError;

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent">Schedule</div>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-fg">{board.title}</h1>
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
          <Select label="Position" value={position} onChange={setPosition} options={POSITIONS} />
          <div className="ml-auto flex items-end gap-2">
            <SaveViewButton defaultName={board.title} />
            <ExportButton
              filename={`gridironiq-vegas-${season}-wk${week}`}
              rows={exportRows}
              columns={[
                { key: "team", label: "Team" },
                { key: "matchup", label: "Matchup" },
                { key: "implied_total", label: "Implied total" },
                { key: "total_line", label: "Game total" },
                { key: "players", label: "Players" },
              ]}
              context={[
                "GridironIQ — Vegas Board",
                `${season} week ${week} · scoring: ${scoring}`,
                "Implied total = game total / 2 +/- spread / 2. Blank lines are games the market has not priced.",
              ]}
            />
          </div>
        </div>

        <div className="border-t border-line pt-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.07em] text-faint">Week</div>
          {/* No "All weeks": an implied total is a fact about one fixture, so a
              season-wide view of them would be a list with no question behind it. */}
          <WeekRail weeks={weeks} value={week} onChange={setWeek} allowAll={false} />
        </div>
      </div>

      <ScoringControl scoring={scoring} onChange={setScoring} />

      <p className="max-w-3xl text-xs leading-relaxed text-muted">{board.lede}</p>

      {isError ? (
        <div className="glass-card p-10 text-center text-sm text-muted">
          Could not load the Vegas board.
        </div>
      ) : isLoading ? (
        <div className="glass-card p-10 text-center text-sm text-muted">Loading…</div>
      ) : offenses.length === 0 ? (
        <div className="glass-card p-10 text-center text-sm text-muted">No games this week.</div>
      ) : (
        <>
          <section className="glass-card p-4">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-bold tracking-tight text-fg">
                Where the points are
              </h2>
              <span className="text-[11px] text-faint">
                {offenses.length} offenses · week {week}
              </span>
            </div>
            <p className="mb-3.5 text-xs text-muted">
              Implied team total — the game total split by the spread.{" "}
              {/* With nothing priced there is no median to be below, and "median of
                  0.0" would read as a real number rather than an absent one. */}
              {priced.length > 0 ? (
                <>Faint bars are below this week&apos;s median of {median.toFixed(1)}.</>
              ) : (
                <>The market has not priced this week yet, so there is nothing to rank.</>
              )}
            </p>
            <TeamEnvironmentRail teams={offenses} median={median} max={max} />
          </section>

          <section className="space-y-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-bold tracking-tight text-fg">
                Who&apos;s in those games
              </h2>
              <span className="text-[11px] text-faint">
                {position ? `${position}s only · ` : ""}top {CHIPS_PER_TEAM} by points per game
              </span>
            </div>
            {offenses.map((team) => (
              <OffenseCard
                key={`${team.gameId}-${team.abbreviation}`}
                team={team}
                players={(playersByTeam.get(team.abbreviation) ?? []).slice(0, CHIPS_PER_TEAM)}
              />
            ))}
          </section>
        </>
      )}

      <p className="max-w-3xl text-[11px] leading-relaxed text-faint">
        Implied total is the game total split by the spread — what the market expects
        each offense to score. Lines come from the nflverse schedule feed, the same one
        the fixtures do, so there is no odds provider behind this and no intraday
        movement: they update when the feed does. The player list is each team&apos;s
        depth chart to third at a position, with points per game from the{" "}
        <span className="text-muted">{playersQuery.data?.production_season ?? "current"}</span>{" "}
        season in your scoring. Games the market has not priced show{" "}
        <span className="text-muted">no line</span> and sort last, because no line is not
        a low total.
      </p>
    </div>
  );
}
