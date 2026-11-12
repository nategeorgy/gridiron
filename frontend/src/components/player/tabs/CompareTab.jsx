// Compare: head to head and both players' percentile radar in one box (his pick,
// November 2026), both players' lines, the closeness line of who he plays most like, and a
// way into Player Comparison.
//
// The opponent defaults to the closest match, so the tab opens on a comparison rather
// than an empty picker. Every row here comes from one `/stats/intelligence` request for the
// whole qualified pool at his position, so both halves of a matchup and the closeness
// line are ranked against identical pools.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useIntelligence } from "../../../hooks/useInsight";
import { usePlayer, usePlayerGameLog, usePlayerSeason } from "../../../hooks/usePlayer";
import { useLiveSearchParams } from "../../../hooks/useLiveSearchParams";
import { useChartTooltip, ChartTooltip } from "../../explore/ChartTooltip";
import { Headshot } from "../../explore/common";
import { ComparePicker } from "../ComparePicker";
import { HeadToHead } from "../HeadToHead";
import { cardPercentileColumns, cardRankColumns, forPosition } from "../../../constants/playerPage";
import { RADAR_STATS } from "../../../constants/playerTabs";
import { SIMILARITY_STATS } from "../../../constants/similarity";
import { scoringLabel } from "../../../constants/scoring";
import { positionName, ringColors } from "../cardParts";
import { PercentileRadar } from "../page/Radar";
import { CompareLines } from "../page/CompareLines";
import { MostSimilar, rankSimilar } from "../page/MostSimilar";
import { Panel } from "../page/common";

export function CompareTab({ page }) {
  const { playerId, player, position, season, scoring, league, metrics, row, teams, through, embedded } = page;
  const [params, setParams] = useLiveSearchParams();
  const [localVs, setLocalVs] = useState(null);
  const chosen = embedded ? localVs : params.get("vs");
  const setChosen = (id) => {
    if (embedded) return setLocalVs(id);
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (id) next.set("vs", id);
      else next.delete("vs");
      return next;
    }, { replace: true });
    return undefined;
  };
  const tip = useChartTooltip();

  const wanted = useMemo(() => [...new Set([
    ...cardPercentileColumns(position),
    ...forPosition(RADAR_STATS, position).map((stat) => stat.id),
    ...forPosition(SIMILARITY_STATS, position).map((stat) => stat.id),
  ])], [position]);
  const poolQuery = useIntelligence({
    season, season_type: "REG", positions: position, metric: "fantasy_points", order: "desc",
    scoring, league, limit: 200, percentiles: wanted.join(","), ranks: cardRankColumns(position).join(","),
    // The players who clear the position's minimum, like the leaderboard: a part-timer's
    // rates are as if qualified, so he is matched on his own request instead.
    require_minimum: true,
  });
  const pool = useMemo(() => poolQuery.data?.data ?? [], [poolQuery.data]);
  const mine = pool.find((entry) => entry.player_id === playerId) ?? row;
  const ranked = useMemo(() => (mine ? rankSimilar(pool, mine.percentiles, playerId, position) : []), [pool, mine, playerId, position]);

  const opponentId = chosen && chosen !== playerId ? chosen : ranked[0]?.row.player_id ?? null;
  const fromPool = pool.find((entry) => entry.player_id === opponentId);
  // A player picked outside the qualified pool (a part-timer) is ranked on his own request.
  const ownQuery = usePlayerSeason({
    playerIds: fromPool ? [] : [opponentId],
    season, scoring, league, percentiles: wanted, ranks: cardRankColumns(position),
  });
  const opponentRow = fromPool ?? (ownQuery.data?.data ?? []).find((entry) => entry.player_id === opponentId) ?? null;
  const opponentProfile = usePlayer(opponentId);
  const opponentLog = usePlayerGameLog(opponentId, scoring);

  const ready = mine && opponentRow && opponentProfile.data;
  const matchup = ready
    ? [{ ...mine, headshot_url: player.headshot_url }, { ...opponentRow, headshot_url: opponentProfile.data.headshot_url }]
    : [];
  const [leftRing, rightRing] = ringColors(teams[mine?.team_abbreviation], teams[opponentRow?.team_abbreviation]);
  const match = ranked.find((entry) => entry.row.player_id === opponentId)?.match;
  const compareLink = `/players/compare?players=${[playerId, opponentId].filter(Boolean).map((id) => `${id}:${season}`).join(",")}`;

  return (
    <div className="space-y-4">
      <Panel
        title="Head to head"
        sub={`${season}${through ? ` through Week ${through}` : ""} · ${scoringLabel(scoring)} · percentiles among ${positionName(position)}${match != null ? ` · ${match}% similar` : ""}`}
        controls={
          <ComparePicker
            position={position}
            selected={opponentProfile.data ? { player_id: opponentId, name: opponentProfile.data.name, headshot_url: opponentProfile.data.headshot_url } : null}
            onSelect={(picked) => setChosen(picked.player_id)}
            onClear={() => setChosen(null)}
          />
        }
      >
        {poolQuery.isLoading || (opponentId && !ready && (ownQuery.isLoading || opponentProfile.isLoading)) ? (
          <div className="h-[520px] animate-pulse rounded-xl bg-surface-2" />
        ) : !ready ? (
          <p className="py-10 text-center text-sm text-muted">
            {opponentId ? `No ${season} stats for that player.` : `Pick another ${position} to see them head to head.`}
          </p>
        ) : (
          <div className="grid items-center gap-x-8 gap-y-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <HeadToHead players={matchup} teams={teams} position={position} season={season} scoring={scoring} metrics={metrics} compact />
            <div>
              <PercentileRadar
                stats={forPosition(RADAR_STATS, position)}
                players={[
                  { name: player.name, color: leftRing, row: mine },
                  { name: opponentRow.name, color: rightRing, row: opponentRow },
                ]}
                metrics={metrics}
                tip={tip}
                width={500}
                height={440}
                radius={132}
              />
              <div className="mt-1 flex flex-wrap justify-center gap-4 text-[11.5px] text-muted">
                {[[player.name, leftRing], [opponentRow.name, rightRing]].map(([name, color]) => (
                  <span key={name} className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />{name}</span>
                ))}
              </div>
            </div>
          </div>
        )}
        <ChartTooltip tip={tip} />
      </Panel>

      <CompareLines page={page} other={ready ? { player: opponentProfile.data, games: opponentLog.data?.data ?? [] } : null} />

      {poolQuery.isLoading ? (
        <section className="glass-card h-64 animate-pulse" />
      ) : (
        <MostSimilar page={page} ranked={ranked} selected={opponentId} onPick={(picked) => setChosen(picked.player_id)} />
      )}

      {!embedded && (
        <Panel title="Compare more players" sub="Player Comparison takes up to five players, each in any season">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {[{ id: playerId, name: player.name, headshot: player.headshot_url }, ...(ready ? [{ id: opponentId, name: opponentRow.name, headshot: opponentProfile.data.headshot_url }] : [])].map((entry) => (
                <span key={entry.id} className="inline-flex items-center gap-2 rounded-full border border-line px-2.5 py-1 text-xs text-fg">
                  <Headshot url={entry.headshot} name={entry.name} className="h-5 w-5 rounded-full" />
                  {entry.name}
                </span>
              ))}
            </div>
            <Link to={compareLink} className="btn-accent px-3.5 py-1.5 text-xs">Open in Player Comparison →</Link>
          </div>
        </Panel>
      )}
    </div>
  );
}
