// Percentile radar for compared players (M4). Every axis is a percentile *within the
// player's own position*, which is the only way the shape means anything: raw stats on
// a radar put yards (thousands) and target share (a fraction) on the same spoke.
//
// Deliberately limited to a curated per-position axis set rather than free choice.
// A radar invites reading "bigger polygon = better", so the axes have to be
// comparable in kind and few enough to read — the shape is a summary, and the table
// below it remains the authoritative numbers.
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { SERIES_COLORS } from "./CompareTrendChart";

// Curated radar axes per position — production, opportunity, and efficiency, so the
// shape says something about the kind of player rather than just the volume.
const RADAR_AXES = {
  QB: [
    "fantasy_ppg", "passing_yards", "passing_tds", "rushing_yards", "cpoe", "epa",
  ],
  RB: [
    "fantasy_ppg", "opportunity_share", "rush_attempt_share",
    "high_value_touches_per_game", "receptions", "snap_share",
  ],
  WR: [
    "fantasy_ppg", "target_share", "air_yards_share", "yards_per_route_run",
    "route_participation", "red_zone_targets",
  ],
};
RADAR_AXES.TE = RADAR_AXES.WR;

// Axes for a *mixed-position* comparison, in preference order. Percentiles are what
// make that comparison legitimate — each player is ranked inside their own position
// pool — so the radar is arguably more useful here than in a same-position view, not
// less. Deliberately excludes signed metrics (points over expected) and
// lower-is-better ones (fumbles): a radar reads "further out = more", and neither
// obeys that.
const CROSS_POSITION_AXES = [
  "fantasy_ppg",
  "expected_fantasy_ppg",
  "snap_share",
  "opportunity_share",
  "high_value_touches_per_game",
  "market_share",
  "rushing_yards",
  "receiving_yards",
  "epa",
];

// Fewer than this and the shape is a line or a triangle — not worth drawing.
const MIN_AXES = 3;

/**
 * Radar axes for a comparison.
 *
 * @param {string[]} positions  the positions being compared
 * @param {string[]} available  metric ids the API actually returned (already
 *                              intersected across those positions)
 * @returns {string[]} axis metric ids, or [] when a radar wouldn't be meaningful
 */
export function radarAxesFor(positions, available = null) {
  const unique = [...new Set(positions.filter(Boolean))];
  if (unique.length === 0) return [];

  // Compare the *axis sets*, not the position names: receivers and tight ends share
  // one set, so a WR-vs-TE comparison should still get the richer receiving radar
  // rather than falling back to generic axes.
  const sets = unique.map((position) => RADAR_AXES[position] ?? RADAR_AXES.WR);
  const sameSet = sets.every((set) => set === sets[0]);

  if (sameSet) {
    const axes = sets[0];
    if (!available) return axes;
    const present = axes.filter((axis) => available.includes(axis));
    return present.length >= MIN_AXES ? present : [];
  }

  // Mixed positions: fall back to axes every one of them shares.
  const shared = available
    ? CROSS_POSITION_AXES.filter((axis) => available.includes(axis))
    : CROSS_POSITION_AXES;
  return shared.length >= MIN_AXES ? shared.slice(0, 6) : [];
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { metric } = payload[0].payload;
  return (
    <div className="glass-popover px-3 py-2 text-xs">
      <div className="font-semibold text-fg">{metric}</div>
      {payload.map((entry) => (
        <div key={entry.name} className="stat-num mt-0.5 text-muted">
          <span
            className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
            style={{ background: entry.stroke }}
          />
          {entry.name}:{" "}
          <span className="text-fg">
            {entry.value == null ? "—" : `${Math.round(entry.value)}th pct`}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * @param {Object[]} players  compare rows with a `percentiles` map
 * @param {string[]} axes     metric ids to draw as spokes
 * @param {Object}   metrics  the metric registry, for labels
 */
export function CompareRadar({ players, axes, metrics }) {
  const data = axes.map((metricId) => {
    const row = {
      metric: metrics[metricId]?.short ?? metricId,
      fullLabel: metrics[metricId]?.label ?? metricId,
    };
    for (const player of players) {
      row[player.player_id] = player.percentiles?.[metricId] ?? null;
    }
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={340}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke="var(--divider)" />
        <PolarAngleAxis dataKey="metric" tick={{ fill: "var(--muted)", fontSize: 11 }} />
        <PolarRadiusAxis
          domain={[0, 100]}
          tick={{ fill: "var(--faint)", fontSize: 10 }}
          tickCount={5}
          axisLine={false}
        />
        <Tooltip content={<ChartTooltip />} />
        {players.map((player, index) => (
          <Radar
            key={player.player_id}
            name={player.name}
            dataKey={player.player_id}
            stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
            fill={SERIES_COLORS[index % SERIES_COLORS.length]}
            fillOpacity={0.12}
            strokeWidth={2}
            isAnimationActive={false}
          />
        ))}
      </RadarChart>
    </ResponsiveContainer>
  );
}
