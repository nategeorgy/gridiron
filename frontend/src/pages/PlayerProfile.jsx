// Player profile: header, season summary, expected-vs-actual, fantasy trend chart,
// and game log. Everything fantasy on this page is in the user's own league scoring
// (M1 spine A) — including expected points, so the two are directly comparable.
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Select } from "../components/ui/Select";
import { ScoringControl } from "../components/ScoringControl";
import { FantasyTrendChart } from "../components/charts/FantasyTrendChart";
import { usePlayer, usePlayerGameLog } from "../hooks/usePlayer";
import { useScoring } from "../hooks/useScoring";
import { formatStat } from "../utils/format";
import { GAMELOG_COLUMN_SETS, METRICS, SUMMARY_STATS } from "../constants";

function Panel({ children, className = "" }) {
  return <div className={`glass-card ${className}`}>{children}</div>;
}

function ProfileHeader({ player }) {
  return (
    <Panel className="flex items-center gap-4 p-5">
      {player.headshot_url ? (
        <img
          src={player.headshot_url}
          alt={player.name}
          className="h-20 w-20 rounded-full border border-edge bg-surface-2 object-cover"
        />
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded-full border border-edge bg-surface-2 text-2xl font-bold text-faint">
          {player.name?.[0]}
        </div>
      )}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">{player.name}</h1>
        <div className="mt-1 flex items-center gap-2 text-sm text-muted">
          <span className="rounded bg-surface-2 px-2 py-0.5 text-xs font-semibold text-accent">
            {player.position}
          </span>
          <span className="stat-num">{player.team_abbreviation ?? "FA"}</span>
          {player.jersey_number != null && (
            <span className="stat-num text-faint">#{player.jersey_number}</span>
          )}
        </div>
      </div>
    </Panel>
  );
}

function SummaryCards({ position, games }) {
  const stats = SUMMARY_STATS[position] ?? SUMMARY_STATS.WR;
  const gameCount = games.length;

  const values = stats.map((stat) => {
    const sum = games.reduce((acc, game) => acc + (game[stat.base ?? stat.key] ?? 0), 0);
    const value = stat.agg === "ppg" ? (gameCount ? sum / gameCount : 0) : sum;
    return { ...stat, value };
  });

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
      <Panel className="p-3">
        <div className="text-xs uppercase tracking-wide text-faint">Games</div>
        <div className="stat-num mt-1 text-xl font-semibold text-fg">{gameCount}</div>
      </Panel>
      {values.map((stat) => (
        <Panel key={stat.key} className="p-3">
          <div className="text-xs uppercase tracking-wide text-faint">
            {METRICS[stat.key].short}
          </div>
          <div className="stat-num mt-1 text-xl font-semibold text-fg">
            {formatStat(stat.value, METRICS[stat.key].format)}
          </div>
        </Panel>
      ))}
    </div>
  );
}

// How big a gap counts as a real signal rather than noise, in points per game.
const NOTABLE_GAP_PER_GAME = 1.5;

function ExpectedVsActual({ games }) {
  const modelled = games.filter((game) => game.expected_fantasy_points != null);
  if (modelled.length === 0) return null;

  const actual = modelled.reduce((total, game) => total + (game.fantasy_points ?? 0), 0);
  const expected = modelled.reduce((total, game) => total + game.expected_fantasy_points, 0);
  const diff = actual - expected;
  const perGame = diff / modelled.length;
  const positive = diff >= 0;

  // A descriptive read, not a projection — what the gap means for fantasy value.
  let verdict = "Production has tracked the opportunity closely — no gap worth reading into.";
  if (perGame > NOTABLE_GAP_PER_GAME) {
    verdict =
      "Outscoring the opportunity. Some of this gap is efficiency and touchdown luck " +
      "that typically fades — a sell-high signal unless the usage grows to match.";
  } else if (perGame < -NOTABLE_GAP_PER_GAME) {
    verdict =
      "Underscoring the opportunity. The usage has been worth more than the box score " +
      "shows — the kind of gap that tends to close.";
  }

  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-medium text-muted">Expected vs Actual</div>
        <div className="text-xs text-faint">
          {modelled.length} of {games.length} games modelled · in your league scoring
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-faint">Actual</div>
          <div className="stat-num text-2xl font-semibold text-fg">{formatStat(actual, 1)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-faint">Expected</div>
          <div className="stat-num text-2xl font-semibold text-muted">{formatStat(expected, 1)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-faint">Difference</div>
          <div className={`stat-num text-2xl font-semibold ${positive ? "text-pos" : "text-neg"}`}>
            {positive ? "+" : ""}
            {formatStat(diff, 1)}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-faint">Per Game</div>
          <div className={`stat-num text-2xl font-semibold ${positive ? "text-pos" : "text-neg"}`}>
            {positive ? "+" : ""}
            {formatStat(perGame, 2)}
          </div>
        </div>
      </div>
      <p className="mt-3 max-w-2xl text-xs leading-relaxed text-muted">{verdict}</p>
      <p className="mt-1 text-[11px] text-faint">
        Expected points are a model estimate of what this player's usage was worth
        (nflverse ffopportunity), not a projection.
      </p>
    </Panel>
  );
}

export function PlayerProfile() {
  const { playerId } = useParams();
  const [scoring, setScoring] = useScoring();
  const playerQuery = usePlayer(playerId);
  const gameLogQuery = usePlayerGameLog(playerId, scoring);

  const allGames = gameLogQuery.data?.data ?? [];
  // Regular-season games only, so season totals match the leaderboard.
  const regGames = useMemo(
    () => allGames.filter((game) => game.season_type === "REG"),
    [allGames],
  );
  const seasons = useMemo(
    () => [...new Set(regGames.map((game) => game.season))].sort((a, b) => b - a),
    [regGames],
  );

  const [season, setSeason] = useState(null);
  const activeSeason = season ?? seasons[0];
  const seasonGames = useMemo(
    () =>
      regGames
        .filter((game) => game.season === activeSeason)
        .sort((a, b) => a.week - b.week),
    [regGames, activeSeason],
  );

  const player = playerQuery.data;
  const position = player?.position ?? "WR";
  const columns = GAMELOG_COLUMN_SETS[position] ?? GAMELOG_COLUMN_SETS.WR;

  if (playerQuery.isLoading) {
    return <div className="p-6 text-center text-sm text-muted">Loading…</div>;
  }
  if (playerQuery.isError) {
    return (
      <div className="p-6 text-center text-sm text-neg">
        Player not found.{" "}
        <Link to="/fantasy/leaders" className="text-accent hover:underline">Back to leaderboard</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link to="/fantasy/leaders" className="inline-block text-sm text-muted transition hover:text-accent">
        ← Leaderboard
      </Link>

      <ProfileHeader player={player} />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-fg">Season Stats</h2>
        {seasons.length > 0 && (
          <Select
            value={String(activeSeason)}
            onChange={(value) => setSeason(Number(value))}
            options={seasons.map((year) => ({ value: String(year), label: String(year) }))}
          />
        )}
      </div>

      {seasonGames.length === 0 ? (
        <Panel className="p-8 text-center text-sm text-muted">
          No regular-season game data for this player.
        </Panel>
      ) : (
        <>
          <ScoringControl scoring={scoring} onChange={setScoring} />

          <SummaryCards position={position} games={seasonGames} />

          <ExpectedVsActual games={seasonGames} />

          <Panel className="p-4">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-sm font-medium text-muted">
                Fantasy Points by Week — {activeSeason}
              </div>
              <div className="text-xs text-faint">dashed line = expected points</div>
            </div>
            <FantasyTrendChart games={seasonGames} />
          </Panel>

          <Panel className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-faint">
                  <th className="px-3 py-3 text-right">WK</th>
                  <th className="px-3 py-3">Opp</th>
                  {columns.map((key) => (
                    <th key={key} className="whitespace-nowrap px-3 py-3 text-right" title={METRICS[key].label}>
                      {METRICS[key].short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {seasonGames.map((game) => (
                  <tr key={game.game_id} className="border-b border-line last:border-0 hover:bg-surface-2">
                    <td className="stat-num px-3 py-2.5 text-right text-muted">{game.week}</td>
                    <td className="stat-num px-3 py-2.5 text-muted">{game.opponent_abbreviation ?? "—"}</td>
                    {columns.map((key) => (
                      <td key={key} className="stat-num px-3 py-2.5 text-right text-fg">
                        {formatStat(game[key], METRICS[key].format)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </>
      )}
    </div>
  );
}
