// The Command Center's head-to-head radar, on a player page (M13).
//
// Deliberately the same chart as `components/home/HeadToHeadCard`: nested plates, two
// polygons, and each axis carrying both real values with the leader's badged in his own
// colour — which is what removes the need for a legend. A manager who reads a matchup on
// the home page should not have to learn a second visual language to read one here.
//
// **Shape is percentile, labels are real values.** The polygon compares each player to
// his position, not to the other player, so two mid-tier backs cannot both look like
// studs merely by being similar to each other.
import { formatStat } from "../../utils/format";
import { SIDES } from "./sides";

const SIZE = 440;
const CENTRE = SIZE / 2;
const RADIUS = 146;

export function CompareRadar({ axes, players, metrics }) {
  const count = axes.length;
  const angle = (index) => -Math.PI / 2 + index * ((2 * Math.PI) / count);
  const point = (index, value) => [
    CENTRE + Math.cos(angle(index)) * RADIUS * (value / 100),
    CENTRE + Math.sin(angle(index)) * RADIUS * (value / 100),
  ];
  const polygon = (player) =>
    axes.map((axis, index) => point(index, player.percentiles?.[axis.id] ?? 0).map((n) => n.toFixed(1)).join(",")).join(" ");
  const ring = (value) =>
    axes.map((_, index) => point(index, value).map((n) => n.toFixed(1)).join(",")).join(" ");

  return (
    <section className="glass-card flex flex-col p-4">
      <h3 className="text-sm font-semibold tracking-tight text-fg">Profile Comparison</h3>
      <p className="mt-0.5 text-[11.5px] text-faint">
        Shape is each player's percentile within the position, not against each other
      </p>

      <div className="mt-1 flex justify-center">
        <div className="relative aspect-square w-full max-w-[430px]">
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="block h-full w-full"
            role="img"
            aria-label={`Percentile comparison of ${players.map((player) => player.name).join(" and ")}`}
          >
            {/* Nested plates rather than hairlines: the polygons need a surface to sit on. */}
            {[100, 80, 60, 40, 20].map((value, index) => (
              <polygon
                key={value}
                points={ring(value)}
                fill="var(--surface-2)"
                fillOpacity={0.18 + index * 0.05}
                stroke="var(--line)"
                strokeWidth="1"
              />
            ))}
            {axes.map((axis, index) => {
              const [x, y] = point(index, 100);
              return (
                <line
                  key={axis.id}
                  x1={CENTRE}
                  y1={CENTRE}
                  x2={x.toFixed(1)}
                  y2={y.toFixed(1)}
                  stroke="var(--line)"
                  strokeWidth="1"
                />
              );
            })}
            {/* Second player first, so the first sits on top where they overlap. */}
            {[1, 0].map((which) => (
              <g key={which} style={{ color: SIDES[which].color }}>
                <polygon
                  points={polygon(players[which])}
                  fill="currentColor"
                  fillOpacity="0.28"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                />
                {axes.map((axis, index) => {
                  const [x, y] = point(index, players[which].percentiles?.[axis.id] ?? 0);
                  return <circle key={axis.id} cx={x.toFixed(1)} cy={y.toFixed(1)} r="3.2" fill="currentColor" />;
                })}
              </g>
            ))}
          </svg>

          {/* Axis labels are HTML over the SVG so the winner's badge is a real styled
              chip rather than hand-placed <rect> maths. */}
          {axes.map((axis, index) => {
            const [x, y] = point(index, 100);
            const left = CENTRE + (x - CENTRE) * 1.3;
            const top = CENTRE + (y - CENTRE) * 1.26;
            const drift = left - CENTRE;
            const align = Math.abs(drift) < 12 ? "items-center" : drift > 0 ? "items-start" : "items-end";
            const metric = metrics[axis.id] ?? {};

            const values = players.map((player) => player[axis.id]);
            const higherWins = metric.higherIsBetter !== false;
            const [first, second] = values;
            let leader = 0;
            if (first === null || first === undefined) leader = 1;
            else if (second === null || second === undefined) leader = 0;
            else leader = higherWins === first >= second ? 0 : 1;

            return (
              <div
                key={axis.id}
                className={`pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col gap-0.5 whitespace-nowrap ${align}`}
                style={{ left: `${(left / SIZE) * 100}%`, top: `${(top / SIZE) * 100}%` }}
              >
                <span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-muted">
                  {axis.label}
                </span>
                <span className="flex items-center gap-1.5">
                  {players.map((player, which) => {
                    const won = which === leader;
                    const side = SIDES[which];
                    return (
                      <span
                        key={player.player_id}
                        className="stat-num rounded px-1 py-[3px] text-[12px] font-semibold"
                        style={won ? { background: side.badge, color: side.ink, fontWeight: 700 } : { color: side.color }}
                      >
                        {formatStat(player[axis.id], metric.format)}
                      </span>
                    );
                  })}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
        The numbers beside each axis are the real values; the badged one leads that
        category.
      </p>
    </section>
  );
}
