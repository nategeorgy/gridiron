// Bar chart of PPR fantasy points by week for the selected season.
// Colors are pulled from the active theme's CSS variables so the chart adapts
// to light/dark automatically.
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="glass-popover px-3 py-2 text-xs">
      <div className="font-semibold text-fg">
        Week {row.week}
        {row.opponent ? <span className="text-muted"> vs {row.opponent}</span> : null}
      </div>
      <div className="stat-num mt-0.5 text-accent">{row.points?.toFixed(1)} PPR</div>
    </div>
  );
}

export function FantasyTrendChart({ games }) {
  const data = games.map((game) => ({
    week: game.week,
    opponent: game.opponent_abbreviation,
    points: game.fantasy_points_ppr ?? 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
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
          width={40}
        />
        <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<ChartTooltip />} />
        <Bar dataKey="points" radius={[3, 3, 0, 0]}>
          {data.map((entry) => (
            <Cell key={entry.week} fill="var(--accent)" fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
