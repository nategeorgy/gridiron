// Bar chart of PPR fantasy points by week for the selected season.
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

const ACCENT = "#00e389";
const NAVY_GRID = "#1c2740";

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border border-navy-700 bg-navy-850 px-3 py-2 text-xs shadow-lg">
      <div className="font-semibold text-slate-200">
        Week {row.week}
        {row.opponent ? <span className="text-slate-400"> vs {row.opponent}</span> : null}
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
        <CartesianGrid strokeDasharray="3 3" stroke={NAVY_GRID} vertical={false} />
        <XAxis
          dataKey="week"
          tick={{ fill: "#64748b", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: NAVY_GRID }}
        />
        <YAxis
          tick={{ fill: "#64748b", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<ChartTooltip />} />
        <Bar dataKey="points" radius={[3, 3, 0, 0]}>
          {data.map((entry) => (
            <Cell key={entry.week} fill={ACCENT} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
