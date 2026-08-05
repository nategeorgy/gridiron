// Weekly usage-share trend for one player (M4). Opportunity is the most repeatable
// thing in fantasy, so its *direction* matters more than any single week's box score:
// a role that is growing is worth more than the season average says, and a shrinking
// one is worth less.
//
// One axis, all series: every line here is a share in the same 0–100% space, so they
// are directly comparable. Metrics on other scales get their own chart rather than a
// second y-axis.
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

// Share metrics worth tracking per position, all on the same percentage scale.
const USAGE_SERIES = {
  QB: [],
  RB: [
    { key: "snap_share", label: "Snap Share", color: "var(--accent)" },
    { key: "opportunity_share", label: "Opportunity Share", color: "var(--series-1)" },
    { key: "rush_attempt_share", label: "Rush Share", color: "var(--series-2)" },
  ],
  WR: [
    { key: "snap_share", label: "Snap Share", color: "var(--accent)" },
    { key: "target_share", label: "Target Share", color: "var(--series-1)" },
    { key: "route_participation", label: "Route Participation", color: "var(--series-2)" },
  ],
};
USAGE_SERIES.TE = USAGE_SERIES.WR;

export function usageSeriesFor(position) {
  return USAGE_SERIES[position] ?? USAGE_SERIES.WR;
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-popover px-3 py-2 text-xs">
      <div className="font-semibold text-fg">Week {label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="stat-num mt-0.5 text-muted">
          <span
            className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
            style={{ background: entry.stroke }}
          />
          {entry.name}: <span className="text-fg">{(entry.value * 100).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}

export function UsageTrendChart({ games, position }) {
  const series = usageSeriesFor(position);
  const data = games.map((game) => ({
    week: game.week,
    ...Object.fromEntries(series.map(({ key }) => [key, game[key] ?? null])),
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
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
          width={46}
          domain={[0, 1]}
          tickFormatter={(value) => `${Math.round(value * 100)}%`}
        />
        <Tooltip content={<ChartTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 11 }}
          formatter={(value) => <span style={{ color: "var(--muted)" }}>{value}</span>}
        />
        {series.map(({ key, label, color }) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            name={label}
            stroke={color}
            strokeWidth={2}
            dot={{ r: 2.5, strokeWidth: 0, fill: color }}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
