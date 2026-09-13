// Two players, one column of metric names, values either side (M13).
//
// **The margin pill sits on the winner's side, in his colour.** That is the whole
// design: the eye finds who leads a row before reading either number, and a column of
// pills down one side is a season summarised without a sentence.
//
// **Direction comes from the registry**, so "winning" drops means the fewest of them
// and "winning" interceptions means the fewest — the same `higher_is_better` rule the
// comparison builder's lead margins use.
//
// Blue and gold are the Command Center head-to-head card's identity pair, reused here
// so the same two players read the same way on both surfaces.
import { Link } from "react-router-dom";
import { formatStat } from "../../utils/format";
import { SIDES } from "./sides";

/** The gap in the metric's own units — "+11.2%" for a share, "+44" for a count. */
function gapText(format, gap) {
  if (format === "pct") return `+${(gap * 100).toFixed(1)}%`;
  if (format === "int") return `+${Math.round(gap)}`;
  return `+${gap.toFixed(1)}`;
}

function Face({ player, side, align }) {
  const right = align === "right";
  return (
    <div className={`flex min-w-0 flex-col items-center gap-2 ${right ? "text-right" : "text-left"} sm:items-center`}>
      {player.headshot_url ? (
        <img
          src={player.headshot_url}
          alt=""
          className="h-24 w-24 rounded-2xl object-cover object-top"
          style={{ border: `2px solid ${side.color}`, background: "var(--surface-2)" }}
        />
      ) : (
        <span
          className="grid h-24 w-24 place-items-center rounded-2xl text-2xl font-bold"
          style={{ border: `2px solid ${side.color}`, color: side.color }}
        >
          {player.name?.[0]}
        </span>
      )}
      <span className="min-w-0 text-center">
        <Link
          to={`/players/${player.player_id}`}
          className="block truncate text-[13.5px] font-bold tracking-tight hover:underline"
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

export function HeadToHead({ rows, players, metrics, season }) {
  const [left, right] = players;

  return (
    <section className="glass-card p-4">
      <h3 className="text-sm font-semibold tracking-tight text-fg">
        Head to Head <span className="ml-1 text-[11px] font-medium text-faint">{season}</span>
      </h3>

      <div className="mt-3 grid grid-cols-2 gap-4">
        <Face player={left} side={SIDES[0]} align="left" />
        <Face player={right} side={SIDES[1]} align="right" />
      </div>

      <div className="mt-3">
        {rows.map((spec) => {
          const metric = metrics[spec.id] ?? {};
          const read = (player) => {
            const value = player[spec.id];
            if (value === null || value === undefined) return null;
            // A per-game row divides by games played, so two players with different
            // games missed are compared on rate rather than on availability.
            return spec.perGame ? value / (player.games_played || 1) : value;
          };
          const values = [read(left), read(right)];
          const format = spec.perGame ? 1 : metric.format;

          let leader = null;
          if (values[0] !== null && values[1] !== null && values[0] !== values[1]) {
            const higherWins = metric.higherIsBetter !== false;
            leader = higherWins === values[0] > values[1] ? 0 : 1;
          }
          const gap = leader === null ? null : Math.abs(values[0] - values[1]);

          return (
            <div
              key={spec.id}
              className="grid grid-cols-[3.4rem_1fr_7.5rem_1fr_3.4rem] items-center border-b border-dashed border-line py-1.5 last:border-0"
            >
              <span>
                {leader === 0 && (
                  <span
                    className="stat-num inline-block rounded-md px-1.5 py-0.5 text-[11px] font-bold"
                    style={{ background: SIDES[0].badge, color: SIDES[0].ink }}
                  >
                    {gapText(format, gap)}
                  </span>
                )}
              </span>
              <span className="stat-num text-center text-[15px] font-semibold text-fg">
                {formatStat(values[0], format)}
              </span>
              <span className="truncate text-center text-[12px] text-muted" title={metric.description}>
                {spec.label}
              </span>
              <span className="stat-num text-center text-[15px] font-semibold text-fg">
                {formatStat(values[1], format)}
              </span>
              <span className="text-right">
                {leader === 1 && (
                  <span
                    className="stat-num inline-block rounded-md px-1.5 py-0.5 text-[11px] font-bold"
                    style={{ background: SIDES[1].badge, color: SIDES[1].ink }}
                  >
                    {gapText(format, gap)}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-2.5 text-[10.5px] leading-relaxed text-faint">
        The badge marks who leads each row, and by how much. Direction follows the metric —
        fewest drops leads the drops row.
      </p>
    </section>
  );
}
