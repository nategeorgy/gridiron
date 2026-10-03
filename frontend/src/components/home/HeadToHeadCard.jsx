// Head to Head (M10) — two players, one argument.
//
// **Radar by default.** The eight axes are percentiles within the position pool, so
// the *shape* is the comparison: a back who lives on carries and goal-line work leans
// one way, a back who lives on routes and targets leans the other. Each axis carries
// both real values, and the leader's is badged in his own colour — which is what
// removes the need for a legend.
//
// **Table is the fallback for exact numbers**, and it is the player page's table
// (`MarginTable`): both values either side of the metric, with the margin pill on the
// leader's side in his colour. It replaced a tug-of-war of percentile bars, which made
// the reader compare two bar lengths to find who led a row.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardHead, CardLink, CardState, Tabs } from "./primitives";
import { MarginTable } from "../player/MarginTable";
import { SIDES } from "../player/sides";
import { useDebounce } from "../../hooks/useDebounce";
import { usePlayerSearch } from "../../hooks/usePlayerSearch";
import { MATCHUP_METRICS, MATCHUP_METRICS_BY_POSITION } from "../../constants/signals";
import { formatStat } from "../../utils/format";

const SKILL = ["QB", "RB", "WR", "TE"];

/** The radar's axes for a position; receivers' eight when the position is not known yet. */
export function matchupMetrics(position) {
  return MATCHUP_METRICS_BY_POSITION[position] ?? MATCHUP_METRICS;
}

const VIEWS = [
  { value: "radar", label: "Radar" },
  { value: "table", label: "Table" },
];

// On a phone the face stacks over the name: side by side, a 96px headshot left the name
// about 40px, and it broke a letter at a time.
function Face({ player, side, align }) {
  const right = align === "right";
  return (
    <div
      className={`flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:gap-2.5 ${
        right ? "sm:flex-row-reverse sm:text-right" : "sm:text-left"
      }`}
    >
      {player.headshot_url ? (
        <img
          src={player.headshot_url}
          alt=""
          className="h-[72px] w-[72px] shrink-0 rounded-full object-cover object-top sm:h-24 sm:w-24"
          style={{ border: `2px solid ${side.color}`, background: "var(--surface-2)" }}
        />
      ) : (
        <span
          className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-full text-2xl font-bold sm:h-24 sm:w-24"
          style={{ border: `2px solid ${side.color}`, color: side.color }}
        >
          {player.name?.[0]}
        </span>
      )}
      <span className="min-w-0">
        <Link
          to={`/players/${player.player_id}`}
          className="block text-[15.5px] font-bold leading-tight tracking-tight [overflow-wrap:anywhere] hover:underline"
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

function Radar({ players, metrics }) {
  const size = 440;
  const centre = size / 2;
  const radius = 150;
  const count = metrics.length;

  const angle = (index) => -Math.PI / 2 + index * ((2 * Math.PI) / count);
  const point = (index, value) => [
    centre + Math.cos(angle(index)) * radius * (value / 100),
    centre + Math.sin(angle(index)) * radius * (value / 100),
  ];
  const polygon = (player) =>
    metrics.map((metric, index) =>
      point(index, player.percentiles?.[metric.id] ?? 0).map((n) => n.toFixed(1)).join(","),
    ).join(" ");
  const ring = (value) =>
    metrics.map((_, index) => point(index, value).map((n) => n.toFixed(1)).join(",")).join(" ");

  return (
    // Narrower than the card on a phone: the axis labels sit outside the radar's own box,
    // and at full width the ones on the left and right ran off the card.
    <div className="flex justify-center px-7 pt-1.5 sm:px-0">
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
          {metrics.map((metric, index) => {
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
              {metrics.map((metric, index) => {
                const [x, y] = point(index, players[which].percentiles?.[metric.id] ?? 0);
                return <circle key={metric.id} cx={x.toFixed(1)} cy={y.toFixed(1)} r="3.2" fill="currentColor" />;
              })}
            </g>
          ))}
        </svg>

        {/* Axis labels are HTML over the SVG so the winner's badge is a real styled
            chip rather than hand-placed <rect> maths. */}
        {metrics.map((metric, index) => {
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

function Table({ players, metrics }) {
  return (
    <MarginTable
      rows={metrics.map((metric) => ({
        id: metric.id,
        label: metric.label,
        format: metric.format,
        values: players.map((player) => player.stats?.[metric.id] ?? null),
      }))}
    />
  );
}

/**
 * Search for one side of the matchup. The second player is held to the first one's
 * position, because every axis is a percentile within a position pool (the player page's
 * picker makes the same call, for the same reason).
 */
function PlayerPicker({ side, position, current, onPick }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const debounced = useDebounce(query, 250);
  const { data, isFetching } = usePlayerSearch(debounced);
  const results = (data?.data ?? []).filter(
    (player) => (position ? player.position === position : SKILL.includes(player.position)) && player.player_id !== current,
  );

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const choose = (player) => {
    onPick(player);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative min-w-0">
      <span className="pointer-events-none absolute left-2.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full" style={{ background: side.color }} />
      <input
        id={`h2h-pick-${side.color.replace(/[^a-z0-9]/gi, "")}`}
        type="text"
        value={query}
        aria-label={position ? `Search ${position}s` : "Search players"}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "Enter" && results.length > 0) choose(results[0]);
        }}
        placeholder={position ? `Change ${position}…` : "Change player…"}
        className="glass-input w-full py-1.5 pl-7 pr-3 text-[12.5px]"
      />
      {open && debounced.trim().length >= 2 && (
        <div className="glass-popover absolute z-30 mt-1 w-full overflow-hidden">
          {isFetching && results.length === 0 && <div className="px-3 py-2 text-xs text-muted">Searching…</div>}
          {!isFetching && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted">No {position ? `${position}s` : "players"} found.</div>
          )}
          {results.map((player) => (
            <button
              key={player.player_id}
              type="button"
              onClick={() => choose(player)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-surface-2"
            >
              <span className="truncate text-fg">{player.name}</span>
              <span className="stat-num flex-none text-xs text-faint">
                {player.position} {"·"} {player.team_abbreviation ?? "FA"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Head to Head, now with the pair chosen by the reader (October 2026). The radar is the
 * production card's own; its axes follow the position (`MATCHUP_METRICS_BY_POSITION`).
 *
 * @param ids      the two player ids, from the page's `?h2h=` (a missing second id is a
 *                 half-built matchup, shown as a prompt rather than an error)
 * @param position the first player's position, which the second is held to
 * @param onChange receives the new pair of ids
 */
export function HeadToHeadCard({ caption, ids, position, result, isLoading, isError, onChange }) {
  const [view, setView] = useState("radar");
  const metrics = matchupMetrics(position);
  const byId = Object.fromEntries((result?.data ?? []).map((player) => [player.player_id, player]));
  const players = ids.map((id) => byId[id]).filter(Boolean);
  const ready = players.length === 2;

  const pickFirst = (player) => {
    // A new position empties the second slot: the old opponent would be measured in a
    // different pool, so the card asks for one at the new position instead.
    const second = player.position === position ? ids[1] : "";
    onChange([player.player_id, second === player.player_id ? "" : second]);
  };
  const pickSecond = (player) => onChange([ids[0], player.player_id]);
  const compareLink = `/explore/compare?players=${ids.filter(Boolean).join(",")}`;

  return (
    <Card>
      <CardHead title="Head to Head" sub={caption}>
        {ready && <Tabs options={VIEWS} value={view} onChange={setView} label="Comparison view" />}
      </CardHead>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <PlayerPicker side={SIDES[0]} position={null} current={ids[1]} onPick={pickFirst} />
        <PlayerPicker side={SIDES[1]} position={position} current={ids[0]} onPick={pickSecond} />
      </div>

      {!ids[1] ? (
        <p className="py-8 text-center text-xs text-muted">
          Pick a second {position ?? "player"} to compare with {players[0]?.name ?? "the first"}.
        </p>
      ) : (
        <CardState isLoading={isLoading} isError={isError} isEmpty={!ready} empty="Couldn't load this matchup." rows={6} />
      )}

      {ready && (
        <>
          <div className="mb-3.5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <Face player={players[0]} side={SIDES[0]} align="left" />
            <span className="text-[10px] font-bold tracking-[0.1em] text-faint">VS</span>
            <Face player={players[1]} side={SIDES[1]} align="right" />
          </div>

          {view === "radar" ? <Radar players={players} metrics={metrics} /> : <Table players={players} metrics={metrics} />}

          <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
            {view === "radar"
              ? "Shape is percentile within qualified players at the position; the numbers beside each axis are the real values. The badged one leads that category."
              : "The badge marks who leads each row, and by how much."}
          </p>
        </>
      )}
      <CardLink to={compareLink}>Open in Player Comparison</CardLink>
    </Card>
  );
}
