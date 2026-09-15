// Trending Up (M10) — who is about to see more work.
//
// The live trending board: a *change* measured over a trailing window. It needs about
// seven weeks of a season before it has anything to rank, so the page renders it only
// once the endpoint returns rows; until then the Week standouts card holds the top slot.
// (It used to fall back to a hand-picked preseason outlook here; the standouts replaced
// that once the season produced real snaps.)
//
// There is deliberately no up/down toggle. In August nobody is trending anywhere, and
// in season a card this size answers one question well rather than two badly.
//
// Every row is a **dumbbell**: hollow dot where the number was, filled dot where it is.
// An earlier draft drew "before" as a second stacked bar and it was invisible — these
// are moves in one direction, so the longer bar covered the shorter one completely.
import { useState } from "react";
import { Link } from "react-router-dom";
import { PositionTag } from "../PositionTag";
import { Card, CardHead, CardState } from "./primitives";
import { formatStat } from "../../utils/format";

// Which second measure reads for the position: a back's role is carries and targets,
// a receiver's is whether he is on the field running routes at all.
const SECOND_METRIC = { RB: "opportunity_share", WR: "route_participation", TE: "route_participation" };
const METRIC_LABEL = {
  snap_share: "Snap share",
  opportunity_share: "Opportunity share",
  route_participation: "Route participation",
  target_share: "Target share",
};

/** One before → after row. `format` is a registry-style format spec. */
function DumbbellRow({ label, before, after, format = "pct", tint }) {
  if (before == null || after == null) return null;

  // Scaled to the pair's own maximum so the movement fills the track, rather than
  // huddling at one end of an axis nobody is near.
  const max = Math.max(before, after, format === "pct" ? 0.05 : 1) * 1.18;
  const from = (before / max) * 100;
  const to = (after / max) * 100;
  const [low, high] = from < to ? [from, to] : [to, from];

  return (
    <div className="grid grid-cols-[104px_1fr_96px] items-center gap-2.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-faint">{label}</span>
      <span className="relative h-[18px]">
        <i className="absolute inset-x-0 top-2 h-0.5 rounded bg-line" />
        <i
          className="absolute top-[7.5px] h-[3px] rounded"
          style={{ left: `${low}%`, width: `${high - low}%`, background: tint }}
        />
        <i
          className="absolute top-1 h-[11px] w-[11px] -translate-x-1/2 rounded-full border-2 border-faint bg-surface-solid"
          style={{ left: `${from}%` }}
          title={`was ${formatStat(before, format)}`}
        />
        <i
          className="absolute top-1 h-[11px] w-[11px] -translate-x-1/2 rounded-full"
          style={{
            left: `${to}%`,
            background: tint,
            boxShadow: `0 0 0 3px color-mix(in srgb, ${tint} 22%, transparent)`,
          }}
          title={`now ${formatStat(after, format)}`}
        />
      </span>
      <span className="stat-num text-right text-[11px] text-muted">
        {formatStat(before, format)} <span className="text-faint">→</span>{" "}
        <b className="font-semibold text-fg">{formatStat(after, format)}</b>
      </span>
    </div>
  );
}

function PlayerHead({ playerId, name, position, team, headshot, children }) {
  return (
    <div className="flex items-start gap-4">
      {headshot && (
        <img
          src={headshot}
          alt=""
          className="h-16 w-16 shrink-0 rounded-2xl border border-edge bg-surface-2 object-cover object-top"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[19px] font-bold tracking-tight text-fg">
          <Link to={`/players/${playerId}`} className="hover:text-accent">
            {name}
          </Link>
          <PositionTag position={position} variant="quiet" className="ml-2" />
          <span className="ml-1.5 text-[10.5px] font-normal text-faint">{team}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Chevrons either side of one dot per card, wrapping at both ends.
 *
 * The active dot takes the card's own tint, so paging onto a warning card is visible
 * in the control itself rather than only in the bars above it. */
function Pager({ count, index, onChange, tint, names }) {
  const step = (delta) => onChange((index + delta + count) % count);
  const chevron =
    "grid h-6 w-6 place-items-center rounded-full text-[13px] leading-none text-muted transition hover:text-fg";

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-edge bg-surface-2 px-1.5 py-1">
      <button type="button" className={chevron} onClick={() => step(-1)} aria-label="Previous player">
        ‹
      </button>
      {Array.from({ length: count }).map((_, position) => {
        const active = position === index;
        return (
          <button
            key={position}
            type="button"
            aria-current={active}
            aria-label={names?.[position] ? `Show ${names[position]}` : `Show ${position + 1}`}
            onClick={() => onChange(position)}
            className="grid h-5 w-5 place-items-center"
          >
            <span
              className="block h-[7px] w-[7px] rounded-full border transition"
              style={{
                background: active ? tint : "transparent",
                borderColor: active ? tint : "var(--faint)",
              }}
            />
          </button>
        );
      })}
      <button type="button" className={chevron} onClick={() => step(1)} aria-label="Next player">
        ›
      </button>
    </div>
  );
}

export function TrendingCard({ result, isLoading, isError }) {
  const [index, setIndex] = useState(0);

  const rows = result?.data ?? [];
  const item = rows[Math.min(index, Math.max(rows.length - 1, 0))];
  const context = result?.context;
  const tint = "var(--pos)";

  // The board says which weeks it compared.
  const sub =
    context?.prior_from != null
      ? `weeks ${context.recent_from}–${context.recent_to} vs ${context.prior_from}–${context.prior_to}`
      : "last 3 weeks vs season pace";

  return (
    <Card>
      <CardHead title="Trending Up · Usage" sub={sub} />

      <CardState
        isLoading={isLoading}
        isError={isError}
        isEmpty={rows.length === 0}
        empty="Nobody startable has moved much in this window."
        rows={5}
      />

      {item && (
        <>
          <PlayerHead
            playerId={item.player_id}
            name={item.name}
            position={item.position}
            team={item.team_abbreviation}
            headshot={item.headshot_url}
          >
            <div className="mt-1 text-xs text-muted">
              <span className="font-bold" style={{ color: tint }}>
                ▲ {item.fantasy_ppg_delta >= 0 ? "+" : ""}
                {item.fantasy_ppg_delta?.toFixed(1)}
              </span>{" "}
              PPG over the last {item.recent_games} games ·{" "}
              <span className="stat-num">
                {item.fantasy_ppg.prior?.toFixed(1)} →{" "}
                <b className="text-fg">{item.fantasy_ppg.recent?.toFixed(1)}</b>
              </span>
            </div>
          </PlayerHead>
          <div className="mt-3.5 flex flex-col gap-2.5">
            {["snap_share", SECOND_METRIC[item.position] ?? "opportunity_share", "target_share"].map(
              (metric) => (
                <DumbbellRow
                  key={metric}
                  label={METRIC_LABEL[metric]}
                  before={item.usage?.[metric]?.prior}
                  after={item.usage?.[metric]?.recent}
                  tint={tint}
                />
              ),
            )}
          </div>
        </>
      )}

      {item && (
        // The pager is centred against the card, not against the space left over by the
        // link — hence absolute positioning for the link rather than a three-column row.
        <div className="relative mt-3 flex items-center justify-center">
          {rows.length > 1 && (
            <Pager
              count={rows.length}
              index={Math.min(index, rows.length - 1)}
              onChange={setIndex}
              tint={tint}
              names={rows.map((row) => row.name)}
            />
          )}
          <Link
            to={`/players/${item.player_id}`}
            className="absolute right-0 py-1.5 text-[11.5px] font-semibold text-muted transition hover:text-accent"
          >
            Full player page →
          </Link>
        </div>
      )}
    </Card>
  );
}
