// One team (M6.2): record, fixtures with their betting lines, and the current depth
// chart with each player's fantasy production.
//
// Two seasons are on this page at once and it says so rather than hoping nobody
// notices: the schedule, the lines and the depth chart are about the season *coming*,
// while the production beside each name is the last season *played*. From March to
// September those are different years.
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Select } from "../components/ui/Select";
import { ScoringControl } from "../components/ScoringControl";
import { FavoriteStar } from "../components/FavoriteStar";
import { useTeam } from "../hooks/useTeamLeaderboard";
import { useScoring } from "../hooks/useScoring";
import { useSeasons } from "../hooks/useSeasons";
import { formatStat, ordinal } from "../utils/format";

const POSITION_LABELS = { QB: "Quarterback", RB: "Running Back", WR: "Wide Receiver", TE: "Tight End" };
const POSITIONS = ["QB", "RB", "WR", "TE"];
// How many players to show per position before "show all". Five covers the fantasy
// question at every position; a chart's WR13 is a camp body.
const VISIBLE_PER_POSITION = 5;

/** "KC −3.0" / "at DEN +2.5" — the line from this team's point of view. */
function spreadLabel(spread) {
  if (spread === null || spread === undefined) return null;
  if (spread === 0) return "PK";
  return spread > 0 ? `−${formatStat(spread, 1)}` : `+${formatStat(Math.abs(spread), 1)}`;
}

// Easy is green, hard is red — the same scale the SOS grid uses, so a number means
// the same thing on both pages.
function difficultyTint(difficulty) {
  if (difficulty === null || difficulty === undefined) return undefined;
  const distance = Math.min(Math.abs(difficulty - 50) / 50, 1);
  const token = difficulty < 50 ? "--pos" : "--neg";
  return `color-mix(in srgb, var(${token}) ${Math.round(distance * 55)}%, transparent)`;
}

// Strength of schedule for this team, by position (M6.3). Two windows: the whole
// season, and the weeks a fantasy title is actually decided in — which are often very
// different answers for the same team.
function SosStrip({ sos, basis }) {
  const hasData = POSITIONS.some((position) => sos?.[position]?.full?.difficulty != null);
  if (!hasData) return null;

  return (
    <section className="glass-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight text-fg">Strength of schedule</h2>
        <Link to="/insight/sos" className="text-[11px] text-faint transition hover:text-accent">
          Full grid →
        </Link>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {POSITIONS.map((position) => {
          const full = sos?.[position]?.full;
          const playoffs = sos?.[position]?.playoffs;
          return (
            <div key={position} className="rounded-lg bg-surface-2/60 px-3 py-2">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold text-fg">{position}</span>
                <span
                  className="stat-num rounded px-1.5 py-0.5 text-xs text-fg"
                  style={{ backgroundColor: difficultyTint(full?.difficulty) }}
                  title="Season difficulty, 0-100. Higher is harder."
                >
                  {formatStat(full?.difficulty, 0)}
                </span>
              </div>
              <div className="mt-1 flex items-baseline justify-between text-[11px] text-muted">
                <span>{full?.rank ? `${ordinal(full.rank)} easiest` : "—"}</span>
                <span title="Weeks 15-17, when fantasy titles are decided">
                  playoffs{" "}
                  <span className="stat-num text-fg">{formatStat(playoffs?.difficulty, 0)}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {basis && (
        <p className="mt-2 text-[11px] text-faint">
          Fantasy points allowed by each opponent, in your scoring — 0–100, higher is
          harder. Based on{" "}
          {basis.kind === "prior_season"
            ? `the ${basis.season} season`
            : `${basis.season} so far (${basis.weeks} weeks)`}
          .
        </p>
      )}
    </section>
  );
}

function NextGame({ game }) {
  if (!game) {
    return <p className="text-sm text-muted">No games left on this schedule.</p>;
  }
  const spread = spreadLabel(game.team_spread);
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="text-sm font-semibold text-fg">
        Week {game.week} {game.is_home ? "vs" : "at"} {game.opponent}
      </span>
      {game.game_date && <span className="text-xs text-muted">{game.game_date}</span>}
      {spread && (
        <span className="stat-num rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
          {spread}
        </span>
      )}
      {game.implied_total !== null && game.implied_total !== undefined && (
        <span className="stat-num text-[11px] text-muted">
          implied <span className="text-accent">{formatStat(game.implied_total, 1)}</span>
        </span>
      )}
    </div>
  );
}

function DepthColumn({ position, players, productionSeason }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? players : players.slice(0, VISIBLE_PER_POSITION);

  return (
    <section className="glass-card p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold tracking-tight text-fg">{POSITION_LABELS[position]}</h3>
        <span className="text-[10px] uppercase tracking-wide text-faint">{position}</span>
      </div>

      {players.length === 0 && <p className="text-xs text-muted">No chart published.</p>}

      <ol className="space-y-1.5">
        {shown.map((player) => (
          <li key={player.player_id} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="stat-num w-5 shrink-0 text-[11px] text-faint">
                {position}
                {player.pos_rank}
              </span>
              <FavoriteStar playerId={player.player_id} size="h-3.5 w-3.5" />
              <Link
                to={`/players/${player.player_id}`}
                className="min-w-0 truncate text-xs font-medium text-fg hover:text-accent hover:underline"
              >
                {player.name}
              </Link>
            </span>
            <span
              className="stat-num shrink-0 text-[11px] text-muted"
              title={
                player.fantasy_ppg === null || player.fantasy_ppg === undefined
                  ? `No ${productionSeason} production`
                  : `${formatStat(player.fantasy_ppg, 2)} points per game in ${productionSeason} (${player.games_played} games)`
              }
            >
              {player.fantasy_ppg === null || player.fantasy_ppg === undefined
                ? "—"
                : formatStat(player.fantasy_ppg, 1)}
            </span>
          </li>
        ))}
      </ol>

      {players.length > VISIBLE_PER_POSITION && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-2 text-[11px] text-faint transition hover:text-accent"
        >
          {expanded ? "Show fewer" : `Show all ${players.length}`}
        </button>
      )}
    </section>
  );
}

export function TeamProfile() {
  const { teamId } = useParams();
  const { seasonOptions, currentSeason } = useSeasons({ statsOnly: false });
  const [seasonChoice, setSeason] = useState(null);
  const [scoring, setScoring] = useScoring();

  // Defaults to the newest season on the *schedule*, which is a year ahead of the
  // newest season with stats for most of the calendar — a fixture list is about what
  // is coming. The seasons hook is asked for the unfiltered list for the same reason.
  const scheduleSeasons = seasonOptions;
  const season = seasonChoice ?? String(scheduleSeasons[0]?.value ?? currentSeason);

  const params = useMemo(() => ({ season: Number(season), scoring }), [season, scoring]);
  const { data, isLoading, isError, error } = useTeam(teamId, params);

  const team = data?.team;
  const record = data?.record;
  const chart = data?.depth_chart ?? {};
  const schedule = data?.schedule ?? [];

  if (isError) {
    return (
      <div className="glass-card p-6 text-center text-sm text-muted">
        {error?.response?.status === 404 ? "Team not found." : "Could not load this team."}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent">
            {team?.division ?? "Team"}
          </div>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-fg">
            {team?.name ?? (isLoading ? "Loading…" : "Team")}
          </h1>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 text-sm text-muted">
            {record && record.played > 0 && (
              <span className="stat-num text-fg">
                {record.wins}–{record.losses}
                {record.ties ? `–${record.ties}` : ""}
              </span>
            )}
            <NextGame game={data?.next_game} />
          </div>
        </div>
        <Select label="Season" value={season} onChange={setSeason} options={scheduleSeasons} />
      </div>

      <ScoringControl scoring={scoring} onChange={setScoring} />

      <SosStrip sos={data?.sos} basis={data?.sos_basis} />

      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight text-fg">Depth chart</h2>
          {data?.depth_chart_as_of && (
            <span className="text-[11px] text-faint">
              as of {new Date(data.depth_chart_as_of).toLocaleDateString()} · points are{" "}
              {data.production_season} per-game in your scoring
            </span>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {["QB", "RB", "WR", "TE"].map((position) => (
            <DepthColumn
              key={position}
              position={position}
              players={chart[position] ?? []}
              productionSeason={data?.production_season}
            />
          ))}
        </div>
        {!isLoading && !data?.depth_chart_as_of && (
          <p className="mt-2 text-[11px] text-faint">
            Depth charts are stored for the current season only — pick {scheduleSeasons[0]?.label} to see one.
          </p>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold tracking-tight text-fg">Schedule</h2>
        <div className="glass-card overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-faint">
                <th className="px-3 py-3 text-right">Wk</th>
                <th className="px-3 py-3">Opponent</th>
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3 text-right" title="The spread from this team's point of view">Line</th>
                <th className="px-3 py-3 text-right" title="Points this team is expected to score, from the spread and the total">Implied</th>
                <th className="px-3 py-3 text-right">Result</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-muted">Loading…</td></tr>
              )}
              {!isLoading && schedule.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-muted">No schedule for this season.</td></tr>
              )}
              {schedule.map((game) => (
                <tr key={game.game_id} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="stat-num px-3 py-2.5 text-right text-faint">{game.week}</td>
                  <td className="px-3 py-2.5 text-fg">
                    <span className="text-muted">{game.is_home ? "vs" : "at"}</span>{" "}
                    <span className="stat-num">{game.opponent}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted">{game.game_date ?? "—"}</td>
                  <td className="stat-num px-3 py-2.5 text-right text-muted">
                    {spreadLabel(game.team_spread) ?? "—"}
                  </td>
                  <td className="stat-num px-3 py-2.5 text-right text-muted">
                    {formatStat(game.implied_total, 1)}
                  </td>
                  <td className="stat-num px-3 py-2.5 text-right">
                    {game.result ? (
                      <span className={game.result === "W" ? "text-pos" : game.result === "L" ? "text-neg" : "text-muted"}>
                        {game.result} {game.team_score}–{game.opponent_score}
                      </span>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="max-w-3xl text-[11px] leading-relaxed text-faint">
        Lines come from the nflverse schedule feed and are blank on games the market has
        not priced yet — typically anything more than about thirteen weeks out. The
        implied total is the spread and the total combined into what this team is
        expected to score.
      </p>
    </div>
  );
}
