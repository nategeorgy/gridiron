// The Stats tab's scatter (round five): the Explore Scatter's questions for his position,
// with him lit and everyone else dimmed. The thirty top scorers are faces; he is always
// drawn and named, wherever he lands.
import { useMemo, useState } from "react";
import { ChartTooltip, TipCard, useChartTooltip } from "../../explore/ChartTooltip";
import { Chips } from "../../explore/common";
import { ScatterPlot } from "../../explore/ScatterPlot";
import { useIntelligence } from "../../../hooks/useInsight";
import { useHeadshots } from "../../../hooks/useExplore";
import { usePhone } from "../../../hooks/useMediaQuery";
import { SCATTER_PRESETS } from "../../../constants/scatters";
import { formatStat } from "../../../utils/format";
import { Panel } from "./common";

const SHOWN = 30;

export function StatScatter({ page }) {
  const { playerId, player, position, season, scoring, league, metrics } = page;
  const presets = SCATTER_PRESETS[position] ?? SCATTER_PRESETS.WR;
  const [presetId, setPresetId] = useState(presets[0].id);
  const preset = presets.find((entry) => entry.id === presetId) ?? presets[0];
  const phone = usePhone();
  const tip = useChartTooltip();
  const axisIds = [preset.x, preset.y, ...(preset.size ? [preset.size] : [])];

  const { data, isLoading } = useIntelligence({
    season, season_type: "REG", positions: position, metric: "fantasy_points", order: "desc",
    scoring, league, limit: 200, percentiles: axisIds.join(","),
  });
  const rows = useMemo(() => {
    const usable = (data?.data ?? []).filter((row) => row[preset.x] != null && row[preset.y] != null);
    const top = usable.slice(0, SHOWN);
    const mine = usable.find((row) => row.player_id === playerId);
    return mine && !top.includes(mine) ? [...top, mine] : top;
  }, [data, preset.x, preset.y, playerId]);
  const headshots = useHeadshots(rows.map((row) => row.player_id));
  const points = rows.map((row, index) => ({
    id: row.player_id, name: row.name, position: row.position, team: row.team_abbreviation, games: row.games_played,
    headshot_url: row.player_id === playerId ? player.headshot_url : headshots[row.player_id],
    x: row[preset.x], y: row[preset.y], z: preset.size ? row[preset.size] : null, rank: index + 1,
    percentiles: row.percentiles ?? {}, asIf: row.as_if ?? [],
  }));
  const label = (id) => metrics[id]?.label ?? id;
  const tipFor = (point) => (
    <TipCard
      player={point}
      sub={`${point.position} · ${point.team} · ${point.games} games`}
      rows={axisIds.map((id) => [label(id), formatStat(point[id === preset.x ? "x" : id === preset.y ? "y" : "z"], metrics[id]?.format), point.percentiles[id] ?? null, point.asIf.includes(id)])}
    />
  );
  const mine = points.find((point) => point.id === playerId);

  return (
    <Panel
      title={preset.question}
      sub={`${season} · the ${SHOWN} highest scorers at ${position} and ${player.name}${preset.size ? `, sized by ${label(preset.size).toLowerCase()}` : ""}. The same charts as Explore's Scatter`}
    >
      <div className="mb-3">
        <Chips options={presets.map((entry) => ({ value: entry.id, label: entry.label }))} value={preset.id} onChange={setPresetId} label="Question" />
      </div>
      {isLoading ? (
        <div className="h-[420px] animate-pulse rounded-xl bg-surface-2" />
      ) : points.length < 3 ? (
        <p className="py-10 text-center text-sm text-muted">Not enough players with both stats this season.</p>
      ) : (
        <>
          <ScatterPlot
            compact={phone}
            points={points}
            xMetric={metrics[preset.x]}
            yMetric={metrics[preset.y]}
            sizeMetric={preset.size ? metrics[preset.size] : null}
            identity={preset.identity}
            corners={preset.corners}
            display="heads"
            always={[playerId]}
            lit={new Set([playerId])}
            tip={tip}
            tipFor={tipFor}
            height={560}
          />
          {!mine && <p className="mt-2 text-xs text-muted">{player.name} has no value for one of these stats this season.</p>}
        </>
      )}
      <ChartTooltip tip={tip} />
    </Panel>
  );
}
