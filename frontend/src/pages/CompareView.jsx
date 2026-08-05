// Comparison builder (M4) — up to five players side by side.
//
// The table answers one question per row: who leads this stat, and by how much. The
// leader's value is accented and carries a "+3.2" chip showing the margin over the
// runner-up, so the size of an edge is readable without doing arithmetic. Percentiles
// were tried here and removed: a bar plus a number plus a rank in every cell is three
// things to read where one will do.
//
// Which metrics appear depends on who is being compared — the backend returns only
// metrics that apply to *every* position in the comparison, so a QB-vs-WR view drops
// passing and receiving and keeps the common ground.
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Select } from "../components/ui/Select";
import { ScoringControl } from "../components/ScoringControl";
import { ExportButton } from "../components/ExportButton";
import { PlayerPicker } from "../components/PlayerPicker";
import { CompareTrendChart, SERIES_COLORS } from "../components/charts/CompareTrendChart";
import { CompareRadar, radarAxesFor } from "../components/charts/CompareRadar";
import { useCompare } from "../hooks/useExplore";
import { useScoring } from "../hooks/useScoring";
import { useMetrics } from "../hooks/useMetrics";
import { formatStat } from "../utils/format";
import { INSIGHT_TIMEFRAMES, SEASONS, SEASON_TYPES } from "../constants";

const seasonOptions = SEASONS.map((year) => ({ value: String(year), label: String(year) }));
const MAX_PLAYERS = 5;

/**
 * Who leads a metric, and by how much over the runner-up.
 * Returns `{ leaderId, margin }`; `margin` is null when it's a tie or only one player
 * has a value, because "+0.0" is noise and a lone value isn't a lead over anything.
 */
function leadFor(players, metricId, higherIsBetter) {
  const scored = players
    .map((player) => ({ id: player.player_id, value: player.stats?.[metricId] }))
    .filter((entry) => typeof entry.value === "number");
  if (scored.length < 2) return { leaderId: scored[0]?.id ?? null, margin: null };

  scored.sort((a, b) => (higherIsBetter ? b.value - a.value : a.value - b.value));
  const [leader, runnerUp] = scored;
  const margin = Math.abs(leader.value - runnerUp.value);
  return { leaderId: leader.id, margin: margin === 0 ? null : margin };
}

export function CompareView({ board }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [season, setSeason] = useState(String(SEASONS[0]));
  const [lastWeeks, setLastWeeks] = useState("");
  const [seasonType, setSeasonType] = useState("REG");
  const [scoring, setScoring] = useScoring();
  const { metrics } = useMetrics();

  // Selected players live in the URL so a comparison is shareable (spine C). Names
  // come back from the API, so the URL only has to carry ids.
  const playerIds = useMemo(() => {
    const raw = searchParams.get("players") ?? "";
    return raw.split(",").map((id) => id.trim()).filter(Boolean).slice(0, MAX_PLAYERS);
  }, [searchParams]);

  const setPlayerIds = (ids) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (ids.length) params.set("players", ids.join(","));
        else params.delete("players");
        return params;
      },
      { replace: true },
    );
  };

  const params = useMemo(
    () => ({
      players: playerIds.join(","),
      season: Number(season),
      ...(lastWeeks ? { last_weeks: Number(lastWeeks) } : {}),
      season_type: seasonType,
      scoring,
    }),
    [playerIds, season, lastWeeks, seasonType, scoring],
  );

  const { data, isLoading, isError, error } = useCompare(params);

  const players = data?.data ?? [];
  const metricIds = data?.metrics ?? [];
  const sections = data?.sections ?? [];

  // Chips need names before the compare call resolves for a freshly added player, so
  // they are held locally and reconciled with whatever the API returns.
  const [pending, setPending] = useState([]);
  const chips = playerIds.map((id) => {
    const loaded = players.find((player) => player.player_id === id);
    return loaded ?? pending.find((player) => player.player_id === id) ?? { player_id: id, name: id };
  });

  const addPlayer = (player) => {
    if (playerIds.includes(player.player_id) || playerIds.length >= MAX_PLAYERS) return;
    setPending((prev) => [...prev, player]);
    setPlayerIds([...playerIds, player.player_id]);
  };

  const removePlayer = (playerId) => setPlayerIds(playerIds.filter((id) => id !== playerId));

  // One pass over the metrics gives every row's leader, and the per-player tally of
  // categories led that heads the table.
  const leads = useMemo(() => {
    const byMetric = {};
    const counts = Object.fromEntries(players.map((player) => [player.player_id, 0]));
    for (const metricId of metricIds) {
      const lead = leadFor(players, metricId, metrics[metricId]?.higherIsBetter !== false);
      byMetric[metricId] = lead;
      if (lead.leaderId && lead.margin !== null) counts[lead.leaderId] += 1;
    }
    return { byMetric, counts };
  }, [players, metricIds, metrics]);

  const mixedPositions = new Set(players.map((player) => player.position)).size > 1;

  // Axes are chosen from what the comparison actually returned, so a mixed-position
  // lineup gets shared axes rather than losing the radar entirely.
  const radarAxes = radarAxesFor(
    players.map((player) => player.position),
    metricIds,
  );
  const radarReady = players.length >= 2 && radarAxes.length > 0;

  const exportRows = metricIds.map((metricId) => ({
    metric: metrics[metricId]?.label ?? metricId,
    ...Object.fromEntries(players.map((player) => [player.player_id, player.stats[metricId]])),
  }));
  const exportColumns = [
    { key: "metric", label: "Metric" },
    ...players.map((player) => ({ key: player.player_id, label: player.name })),
  ];

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent">Explore</div>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-fg">{board.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">{board.description}</p>
      </div>

      <PlayerPicker selected={chips} onAdd={addPlayer} onRemove={removePlayer} max={MAX_PLAYERS} />

      <div className="glass-card flex flex-wrap gap-3 p-4">
        <Select label="Season" value={season} onChange={setSeason} options={seasonOptions} />
        <Select label="Timeframe" value={lastWeeks} onChange={setLastWeeks} options={INSIGHT_TIMEFRAMES} />
        <Select label="Type" value={seasonType} onChange={setSeasonType} options={SEASON_TYPES} />
        <div className="ml-auto flex items-end">
          <ExportButton
            filename={`gridironiq-compare-${season}`}
            rows={exportRows}
            columns={exportColumns}
            context={[
              `GridironIQ comparison — ${players.map((p) => p.name).join(" vs ")}`,
              `${season} ${seasonType}${lastWeeks ? ` · last ${lastWeeks} weeks` : ""}`,
              `scoring: ${scoring}`,
            ]}
          />
        </div>
      </div>

      <ScoringControl scoring={scoring} onChange={setScoring} />

      {playerIds.length === 0 && (
        <div className="glass-card p-12 text-center text-sm text-muted">
          Add a player above to start a comparison.
        </div>
      )}

      {isError && (
        <div className="glass-card p-8 text-center text-sm text-neg">
          {error?.response?.data?.detail ?? error?.message ?? "Failed to load."}
        </div>
      )}

      {isLoading && playerIds.length > 0 && (
        <div className="glass-card p-12 text-center text-sm text-muted">Loading…</div>
      )}

      {players.length > 0 && (
        <>
          <div className="glass-card overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="w-52 px-3 py-3 text-xs uppercase tracking-wide text-faint">
                    Metric
                  </th>
                  {players.map((player, index) => (
                    <PlayerHeader
                      key={player.player_id}
                      player={player}
                      color={SERIES_COLORS[index % SERIES_COLORS.length]}
                      led={leads.counts[player.player_id] ?? 0}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {sections.map((section) => (
                  <Fragmentish key={section.label}>
                    <tr>
                      <td
                        colSpan={players.length + 1}
                        className="border-b border-line bg-surface-2/40 px-3 pb-1.5 pt-4 text-[10px] font-bold uppercase tracking-[0.1em] text-faint"
                      >
                        {section.label}
                      </td>
                    </tr>
                    {section.metrics.map((metricId) => {
                      const lead = leads.byMetric[metricId] ?? {};
                      const format = metrics[metricId]?.format;
                      return (
                        <tr
                          key={metricId}
                          className="border-b border-line last:border-0 hover:bg-surface-2"
                        >
                          <td
                            className="px-3 py-2.5 text-muted"
                            title={metrics[metricId]?.description ?? ""}
                          >
                            {metrics[metricId]?.label ?? metricId}
                          </td>
                          {players.map((player) => (
                            <StatCell
                              key={player.player_id}
                              value={player.stats[metricId]}
                              format={format}
                              isLeader={lead.leaderId === player.player_id}
                              margin={lead.leaderId === player.player_id ? lead.margin : null}
                            />
                          ))}
                        </tr>
                      );
                    })}
                  </Fragmentish>
                ))}
              </tbody>
            </table>
          </div>

          <div className="glass-card p-4">
            <div className="mb-2 text-sm font-medium text-muted">
              Fantasy Points by Week — in your scoring
            </div>
            <CompareTrendChart players={players} />
          </div>

          {radarReady && (
            <div className="glass-card p-4">
              <div className="mb-1 text-sm font-medium text-muted">Percentile Shape</div>
              <p className="mb-2 text-xs text-faint">
                {mixedPositions
                  ? "Each spoke is a percentile within that player's own position pool — " +
                    "which is what makes comparing across positions fair. A tight end at the " +
                    "80th percentile and a receiver at the 80th are genuinely comparable; " +
                    "their raw numbers are not."
                  : "Each spoke is a percentile within this position's qualified pool — the one " +
                    "place a rank still earns its keep, because a shape needs a common scale."}
              </p>
              <CompareRadar players={players} axes={radarAxes} metrics={metrics} />
            </div>
          )}

          {data?.window && (
            <p className="text-[11px] leading-relaxed text-faint">
              The green figure next to a leading stat is how far clear they are of the next
              player in this comparison.{" "}
              {mixedPositions
                ? "Because these players don't share a position, only metrics that apply to all of them are shown."
                : ""}{" "}
              Covering{" "}
              <span className="text-muted">
                {data.window.last_weeks
                  ? `the last ${data.window.last_weeks} played weeks`
                  : `the full ${data.window.season} season`}{" "}
                (weeks {data.window.week_from}–{data.window.week_to})
              </span>
              , in your league scoring.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** Table-safe fragment: React.Fragment with a key, for grouped <tr> runs. */
function Fragmentish({ children }) {
  return <>{children}</>;
}

/** Player column header: headshot, name, team, and how many categories they lead. */
function PlayerHeader({ player, color, led }) {
  return (
    <th className="px-3 py-3 text-right align-bottom">
      <div className="flex flex-col items-end gap-1.5">
        {player.headshot_url ? (
          <img
            src={player.headshot_url}
            alt=""
            className="h-11 w-11 rounded-full border border-edge bg-surface-2 object-cover"
          />
        ) : (
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-edge bg-surface-2 text-sm font-bold text-faint">
            {player.name?.[0]}
          </div>
        )}
        <Link
          to={`/players/${player.player_id}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg transition hover:text-accent"
        >
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          {player.name}
        </Link>
        <div className="text-[10px] font-normal normal-case text-faint">
          {player.position} · {player.team_abbreviation ?? "FA"} · {player.games_played}G
        </div>
        <div className="text-[10px] font-normal normal-case text-muted">
          leads <span className="stat-num font-semibold text-accent">{led}</span>
        </div>
      </div>
    </th>
  );
}

/** One cell: the value, plus the lead margin when this player tops the row. */
function StatCell({ value, format, isLeader, margin }) {
  return (
    <td className="px-3 py-2.5 text-right">
      <span className={`stat-num ${isLeader ? "font-semibold text-fg" : "text-muted"}`}>
        {formatStat(value, format)}
      </span>
      {isLeader && margin !== null && (
        <span className="stat-num ml-2 text-xs font-semibold text-accent">
          +{formatStat(margin, format)}
        </span>
      )}
    </td>
  );
}
