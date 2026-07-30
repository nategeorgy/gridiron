// Fantasy points by week for the selected season, in the active league scoring,
// with expected points (xFP) overlaid as a dashed line so over- and
// under-performance is visible at a glance: bars above the line = outscoring the
// opportunity. Colors are pulled from the active theme's CSS variables so the chart
// adapts to light/dark automatically.
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const diff = row.expected == null ? null : row.points - row.expected;
  return (
    <div className="glass-popover px-3 py-2 text-xs">
      <div className="font-semibold text-fg">
        Week {row.week}
        {row.opponent ? <span className="text-muted"> vs {row.opponent}</span> : null}
      </div>
      <div className="stat-num mt-0.5 text-accent">{row.points?.toFixed(1)} pts</div>
      {diff != null && (
        <>
          <div className="stat-num text-muted">{row.expected.toFixed(1)} expected</div>
          <div className={`stat-num ${diff >= 0 ? "text-pos" : "text-neg"}`}>
            {diff >= 0 ? "+" : ""}
            {diff.toFixed(1)} vs expected
          </div>
        </>
      )}
    </div>
  );
}

export function FantasyTrendChart({ games }) {
  const data = games.map((game) => ({
    week: game.week,
    opponent: game.opponent_abbreviation,
    points: game.fantasy_points ?? 0,
    expected: game.expected_fantasy_points ?? null,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
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
        <Line
          type="monotone"
          dataKey="expected"
          stroke="var(--fg)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
