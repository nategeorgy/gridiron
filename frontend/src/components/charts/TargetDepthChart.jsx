// Targets by pass depth (M4). Shows where a receiver's opportunity actually lives —
// two players with identical target counts can have completely different value when
// one works behind the line and the other is a downfield threat.
//
// Targets and receptions are drawn as paired bars so the catch rate at each depth is
// visible without a second chart: deep targets convert at ~40%, short ones at ~75%,
// and that difference is the whole reason air yards and receptions tell different
// stories about the same player.
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Bucket ids from the backend -> how they read on an axis.
const BUCKET_LABELS = {
  behind_los: "Behind LOS",
  short_0_9: "Short (0–9)",
  intermediate_10_19: "Intermediate (10–19)",
  deep_20_plus: "Deep (20+)",
};

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="glass-popover px-3 py-2 text-xs">
      <div className="font-semibold text-fg">{row.label}</div>
      <div className="stat-num mt-1 text-accent">{row.targets} targets</div>
      <div className="stat-num text-muted">{row.receptions} catches</div>
      <div className="stat-num text-muted">{row.receiving_yards} yards · {row.receiving_tds} TD</div>
      {row.catch_rate != null && (
        <div className="stat-num text-muted">
          {(row.catch_rate * 100).toFixed(0)}% caught · {row.yards_per_target} yds/target
        </div>
      )}
      {row.target_share != null && (
        <div className="stat-num text-faint">
          {(row.target_share * 100).toFixed(0)}% of his targets
        </div>
      )}
    </div>
  );
}

export function TargetDepthChart({ buckets }) {
  const data = buckets.map((bucket) => ({
    ...bucket,
    label: BUCKET_LABELS[bucket.depth_bucket] ?? bucket.depth_bucket,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" vertical={false} />
        <XAxis
          dataKey="label"
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
        <Legend
          wrapperStyle={{ fontSize: 11, color: "var(--muted)" }}
          formatter={(value) => <span style={{ color: "var(--muted)" }}>{value}</span>}
        />
        <Bar dataKey="targets" name="Targets" fill="var(--accent)" fillOpacity={0.85} radius={[4, 4, 0, 0]} />
        <Bar dataKey="receptions" name="Catches" fill="var(--series-1)" fillOpacity={0.85} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
