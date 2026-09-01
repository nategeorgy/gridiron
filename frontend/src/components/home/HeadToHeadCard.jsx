// Head to Head (M10) — two players, one argument.
//
// **Radar by default.** The eight axes are percentiles within the position pool, so
// the *shape* is the comparison: a back who lives on carries and goal-line work leans
// one way, a back who lives on routes and targets leans the other. Each axis carries
// both real values, and the leader's is badged in his own colour — which is what
// removes the need for a legend.
//
// **Table is the fallback for exact numbers.** Bar length is the percentile, so a full
// bar means leading the position rather than merely winning this matchup. That reading
// is deliberate: two mid-tier backs can both fill their bars against each other and
// look like studs, which is the thing a head-to-head is most likely to mislead about.
import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardHead, CardLink, CardState, Tabs } from "./primitives";
import { MATCHUP_METRICS } from "../../constants/signals";
import { formatStat } from "../../utils/format";

// Blue and gold: two of the validated `--series-*` hues, far enough apart to separate
// under every colour-vision deficiency the token set was checked against.
const SIDES = [
  { color: "var(--series-1)", badge: "color-mix(in srgb, var(--series-1) 84%, #000)", ink: "#ffffff" },
  // White on this gold measures 2.17:1 in the light theme — nowhere near readable — so
  // the gold badge takes dark ink instead of sharing one inherited white.
  { color: "var(--series-4)", badge: "var(--series-4)", ink: "#160f00" },
];

const VIEWS = [
  { value: "radar", label: "Radar" },
  { value: "table", label: "Table" },
];

/** The gap, in the metric's own units — "+11.2%" for a share, "+44" for a count. */
function gapText(format, gap) {
  if (format === "pct") return `+${(gap * 100).toFixed(1)}%`;
  if (format === "int") return `+${Math.round(gap)}`;
  return `+${gap.toFixed(1)}`;
}

function Face({ player, side, align }) {
  const right = align === "right";
  return (
    <div className={`flex min-w-0 items-center gap-2.5 ${right ? "flex-row-reverse text-right" : ""}`}>
      {player.headshot_url ? (
        <img
          src={player.headshot_url}
          alt=""
          className="h-16 w-16 shrink-0 rounded-full object-cover object-top"
          style={{ border: `2px solid ${side.color}`, background: "var(--surface-2)" }}
        />
      ) : (
        <span
          className="grid h-16 w-16 shrink-0 place-items-center rounded-full text-lg font-bold"
          style={{ border: `2px solid ${side.color}`, color: side.color }}
        >
          {player.name?.[0]}
        </span>
      )}
      <span className="min-w-0">
        <Link
          to={`/players/${player.player_id}`}
          className="block truncate text-[15.5px] font-bold tracking-tight hover:underline"
          style={{ color: side.color }}
        >
          {player.name}
        </Link>
        <span className="block text-[10.5px] text-faint">
          {player.team_abbreviation} · {player.position} · {player.games_played} G
        </span>
      </span>
    </div>
  );
}

function Radar({ players }) {
  const size = 440;
  const centre = size / 2;
  const radius = 150;
  const count = MATCHUP_METRICS.length;

  const angle = (index) => -Math.PI / 2 + index * ((2 * Math.PI) / count);
  const point = (index, value) => [
    centre + Math.cos(angle(index)) * radius * (value / 100),
    centre + Math.sin(angle(index)) * radius * (value / 100),
  ];
  const polygon = (player) =>
    MATCHUP_METRICS.map((metric, index) =>
      point(index, player.percentiles?.[metric.id] ?? 0).map((n) => n.toFixed(1)).join(","),
    ).join(" ");
  const ring = (value) =>
    MATCHUP_METRICS.map((_, index) => point(index, value).map((n) => n.toFixed(1)).join(",")).join(" ");

  return (
    <div className="flex justify-center pt-1.5">
      <div className="relative aspect-square w-full max-w-[430px]">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="block h-full w-full"
          role="img"
          aria-label={`Percentile comparison of ${players.map((p) => p.name).join(" and ")}`}
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
          {MATCHUP_METRICS.map((metric, index) => {
            const [x, y] = point(index, 100);
            return (
              <line
                key={metric.id}
                x1={centre}
                y1={centre}
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
              {MATCHUP_METRICS.map((metric, index) => {
                const [x, y] = point(index, players[which].percentiles?.[metric.id] ?? 0);
                return <circle key={metric.id} cx={x.toFixed(1)} cy={y.toFixed(1)} r="3.2" fill="currentColor" />;
              })}
            </g>
          ))}
        </svg>

        {/* Axis labels are HTML over the SVG so the winner's badge is a real styled
            chip rather than hand-placed <rect> maths. */}
        {MATCHUP_METRICS.map((metric, index) => {
          const [x, y] = point(index, 100);
          const left = centre + (x - centre) * 1.3;
          const top = centre + (y - centre) * 1.26;
          const drift = left - centre;
          const align = Math.abs(drift) < 12 ? "items-center" : drift > 0 ? "items-start" : "items-end";

          const values = players.map((player) => player.stats?.[metric.id]);
          const leader = (values[0] ?? -Infinity) >= (values[1] ?? -Infinity) ? 0 : 1;

          return (
            <div
              key={metric.id}
              className={`pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col gap-0.5 whitespace-nowrap ${align}`}
              style={{ left: `${(left / size) * 100}%`, top: `${(top / size) * 100}%` }}
            >
              <span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-muted">
                {metric.label}
              </span>
              <span className="flex items-center gap-1.5">
                {players.map((player, which) => {
                  const won = which === leader;
                  const side = SIDES[which];
                  return (
                    <span
                      key={player.player_id}
                      className="stat-num rounded px-1 py-[3px] text-[12px] font-semibold"
                      style={
                        won
                          ? { background: side.badge, color: side.ink, fontWeight: 700 }
                          : { color: side.color }
                      }
                    >
                      {formatStat(player.stats?.[metric.id], metric.format)}
                    </span>
                  );
                })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TugOfWar({ players }) {
  return (
    <div className="flex flex-col">
      {MATCHUP_METRICS.map((metric) => {
        const values = players.map((player) => player.stats?.[metric.id] ?? 0);
        const percentiles = players.map((player) => player.percentiles?.[metric.id] ?? 0);
        const leader = values[0] >= values[1] ? 0 : 1;
        const gap = Math.abs(values[0] - values[1]);
        const surname = players[leader].name?.split(" ").slice(-1)[0]?.replace(/[.,]$/, "");

        return (
          <div
            key={metric.id}
            className="grid grid-cols-[46px_1fr_92px_1fr_46px] items-center gap-1.5 py-1.5 sm:grid-cols-[52px_1fr_104px_1fr_52px]"
          >
            <span className={`text-[11.5px] ${leader === 0 ? "font-semibold text-fg" : "text-muted"}`}>
              {formatStat(values[0], metric.format)}
            </span>
            <span className="relative h-1.5 overflow-hidden rounded-full bg-surface-2">
              <i
                className="absolute inset-y-0 right-0 rounded-full"
                style={{ width: `${percentiles[0]}%`, background: SIDES[0].color }}
              />
            </span>
            <span className="flex flex-col items-center gap-px">
              <span className="text-[9.5px] font-bold uppercase tracking-[0.05em] text-faint">
                {metric.label}
              </span>
              <span
                className="stat-num truncate text-[9.5px] font-bold"
                style={{ color: SIDES[leader].color }}
              >
                {surname} {gapText(metric.format, gap)}
              </span>
            </span>
            <span className="relative h-1.5 overflow-hidden rounded-full bg-surface-2">
              <i
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${percentiles[1]}%`, background: SIDES[1].color }}
              />
            </span>
            <span className={`text-right text-[11.5px] ${leader === 1 ? "font-semibold text-fg" : "text-muted"}`}>
              {formatStat(values[1], metric.format)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function HeadToHeadCard({ caption, result, isLoading, isError }) {
  const [view, setView] = useState("radar");
  const players = result?.data ?? [];
  const ready = players.length === 2;

  return (
    <Card>
      <CardHead title="Head to Head" sub={caption}>
        {ready && <Tabs options={VIEWS} value={view} onChange={setView} label="Comparison view" />}
      </CardHead>

      <CardState isLoading={isLoading} isError={isError} isEmpty={!ready} empty="Couldn't load this matchup." rows={6} />

      {ready && (
        <>
          <div className="mb-3.5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <Face player={players[0]} side={SIDES[0]} align="left" />
            <span className="text-[10px] font-bold tracking-[0.1em] text-faint">VS</span>
            <Face player={players[1]} side={SIDES[1]} align="right" />
          </div>

          {view === "radar" ? <Radar players={players} /> : <TugOfWar players={players} />}

          <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
            {view === "radar"
              ? "Shape is percentile within qualified players at the position; the numbers beside each axis are the real values. The badged one leads that category."
              : "Bar length is percentile within the position."}
          </p>
          <CardLink to={`/explore/compare?players=${players.map((p) => p.player_id).join(",")}`}>
            Open in Compare
          </CardLink>
        </>
      )}
    </Card>
  );
}
