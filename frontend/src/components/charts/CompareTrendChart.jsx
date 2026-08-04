// Weekly fantasy points for up to five compared players (M4), in the active league
// scoring. Season totals answer "who scored more"; this answers "who has been
// scoring it lately", which is usually the question behind a comparison.
//
// Series colours come from the fixed categorical order (--series-1..5) and are keyed
// to the player, not their rank — dropping a player never repaints the others.
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const SERIES_COLORS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
];

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-popover px-3 py-2 text-xs">
      <div className="font-semibold text-fg">Week {label}</div>
      {payload
        .filter((entry) => entry.value != null)
        .map((entry) => (
          <div key={entry.dataKey} className="stat-num mt-0.5 text-muted">
            <span
              className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
              style={{ background: entry.stroke }}
            />
            {entry.name}: <span className="text-fg">{entry.value?.toFixed(1)}</span>
          </div>
        ))}
    </div>
  );
}

/**
 * @param {Object[]} players  compare rows: { player_id, name, weekly: [{week, fantasy_points}] }
 */
export function CompareTrendChart({ players }) {
  // Union of weeks across players, so a player who missed a week leaves a gap
  // rather than shifting everyone else's line left.
  const weeks = [
    ...new Set(players.flatMap((player) => player.weekly.map((game) => game.week))),
  ].sort((a, b) => a - b);

  const data = weeks.map((week) => {
    const row = { week };
    for (const player of players) {
      const game = player.weekly.find((entry) => entry.week === week);
      row[player.player_id] = game ? game.fantasy_points : null;
    }
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" vertical={false} />
        <XAxis
          dataKey="week"
          tick={{ fill: "var(--faint)", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "var(--divider)" }}
        />
        <YAxis
          tick={{ fill: "var(--faint)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={44}
        />
        <Tooltip content={<ChartTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 11 }}
          formatter={(value) => <span style={{ color: "var(--muted)" }}>{value}</span>}
        />
        {players.map((player, index) => (
          <Line
            key={player.player_id}
            type="monotone"
            dataKey={player.player_id}
            name={player.name}
            stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 2.5, strokeWidth: 0 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
