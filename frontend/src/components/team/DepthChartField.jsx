// The listed depth chart drawn as a formation: the starter at each spot on the field
// with a headshot, backups listed underneath. The numbers are from the season and weeks
// picked on the page, while the chart itself is the newest one published: depth charts
// are stored as current state, not history, so a past season shows today's listing.
import { Link } from "react-router-dom";
import { formatStat } from "../../utils/format";
import { formatTeamStat } from "../../utils/teamStats";
import { initials } from "../../utils/explore";

// pos_slot is the feed's alignment code: 1 is wide left, 2 wide right, 8 the slot.
const SPOTS = [
  { key: "WR-1", x: 9, row: 0 },
  { key: "TE", x: 28.5, row: 0 },
  { key: "WR-8", x: 75, row: 1 },
  { key: "WR-2", x: 91, row: 0 },
  { key: "QB", x: 50, row: 2 },
  { key: "RB", x: 67, row: 2 },
];
const ROW_Y = [90, 116, 250];
const LINE = [37, 43.5, 50, 56.5, 63];
// The same spots as a list, for a phone, where the 660px field would scroll sideways and
// show two of the six starters at a time.
const LIST_ORDER = ["QB", "RB", "WR-1", "WR-2", "WR-8", "TE"];

// A starter's photo is the spot's background image; without one, their initials.
function NoPhoto({ name, className }) {
  return <span className={`absolute inset-0 grid place-items-center font-semibold text-muted ${className}`}>{initials(name)}</span>;
}

function spotsFrom(chart) {
  const bySpot = {};
  for (const position of ["QB", "RB", "WR", "TE"]) {
    for (const entry of chart?.[position] ?? []) {
      const key = position === "WR" ? `WR-${[1, 2, 8].includes(entry.pos_slot) ? entry.pos_slot : 8}` : position;
      (bySpot[key] = bySpot[key] ?? []).push(entry);
    }
  }
  Object.values(bySpot).forEach((list) => list.sort((a, b) => a.pos_rank - b.pos_rank));
  return bySpot;
}

export function DepthChartField({ chart, asOf, stats, season, weeksLabel, topPersonnel }) {
  const bySpot = spotsFrom(chart);
  const snaps = (id) => formatTeamStat(stats?.[id]?.snap_share, "pct0");
  const hasChart = Object.keys(bySpot).length > 0;
  return (
    <section className="glass-card p-4">
      <h2 className="text-[15px] font-semibold tracking-tight text-fg">Depth chart</h2>
      <p className="mb-3 text-[11.5px] text-faint">
        {asOf ? `Listed as of ${new Date(asOf).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "No chart published"} {"·"} numbers from {season} {weeksLabel}
      </p>
      {hasChart && (
        <div className="grid grid-cols-1 gap-2 sm:hidden">
          {topPersonnel && (
            <span className="justify-self-start rounded-lg border border-line px-2 py-1 text-[11px] text-muted" style={{ background: "color-mix(in srgb, var(--fg) 6%, transparent)" }}>
              {topPersonnel.grouping} personnel <b className="stat-num text-fg">{formatTeamStat(topPersonnel.share, "pct0")}</b> of plays
            </span>
          )}
          {LIST_ORDER.map((key) => {
            const list = bySpot[key] ?? [];
            const starter = list[0];
            if (!starter) return null;
            const position = key.split("-")[0];
            const line = stats?.[starter.player_id];
            const ring = `var(--position-${position.toLowerCase()})`;
            const backups = list.slice(1, 4);
            return (
              <div key={key} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5" style={{ background: "color-mix(in srgb, var(--fg) 3%, transparent)" }}>
                <Link
                  to={`/players/${starter.player_id}`}
                  className="relative h-11 w-11 shrink-0 rounded-full bg-surface-2 bg-cover bg-center"
                  style={{ backgroundImage: starter.headshot_url ? `url('${starter.headshot_url}')` : undefined, boxShadow: `0 0 0 2px ${ring}` }}
                  aria-label={starter.name}
                >
                  {!starter.headshot_url && <NoPhoto name={starter.name} className="text-[14px]" />}
                  <span className="absolute -bottom-[6px] left-1/2 -translate-x-1/2 rounded px-1 py-px text-[9px] font-bold leading-none text-white" style={{ background: `color-mix(in srgb, ${ring} 80%, var(--surface-solid))` }}>
                    {position}{starter.pos_rank}
                  </span>
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link to={`/players/${starter.player_id}`} className="truncate text-[13.5px] font-semibold text-fg hover:text-accent">{starter.name}</Link>
                    <span className="stat-num shrink-0 text-[11.5px] text-muted">
                      {line ? `${snaps(starter.player_id)} · ${formatStat(line.fantasy_ppg, 1)}` : "No snaps"}
                    </span>
                  </div>
                  {backups.length > 0 && (
                    <div className="mt-0.5 truncate text-[11px] text-faint">
                      {backups.map((backup, index) => (
                        <span key={backup.player_id}>
                          {index > 0 && " · "}
                          <Link to={`/players/${backup.player_id}`} className="hover:text-accent">{backup.name}</Link>{" "}
                          <b className="stat-num font-medium text-muted">{stats?.[backup.player_id] ? snaps(backup.player_id) : "—"}</b>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {hasChart ? (
        <div className="hidden overflow-x-auto sm:block">
          <div
            className="relative h-[430px] min-w-[660px] overflow-hidden rounded-[14px] border border-line"
            style={{ background: "repeating-linear-gradient(to bottom, transparent 0 39px, color-mix(in srgb, var(--fg) 8%, transparent) 39px 40px), color-mix(in srgb, var(--series-3) 10%, transparent)" }}
          >
            <div className="absolute inset-x-0 top-[78px] border-t-2" style={{ borderColor: "color-mix(in srgb, var(--accent) 55%, transparent)" }} />
            <span className="absolute right-2.5 top-[60px] text-[10px] tracking-wider text-faint">LINE OF SCRIMMAGE</span>
            {LINE.map((x) => (
              <div key={x} className="absolute grid h-[22px] w-[34px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[7px] border border-line text-[9px] font-semibold text-faint" style={{ left: `${x}%`, top: ROW_Y[0] + 28, background: "color-mix(in srgb, var(--fg) 12%, transparent)" }}>OL</div>
            ))}
            {topPersonnel && (
              <span className="absolute left-2.5 top-2.5 rounded-lg border border-line px-2 py-1 text-[11px] text-muted" style={{ background: "color-mix(in srgb, var(--fg) 6%, transparent)" }}>
                {topPersonnel.grouping} personnel <b className="stat-num text-fg">{formatTeamStat(topPersonnel.share, "pct0")}</b> of plays
              </span>
            )}
            {SPOTS.map((spot) => {
              const list = bySpot[spot.key] ?? [];
              const starter = list[0];
              if (!starter) return null;
              const position = spot.key.split("-")[0];
              const line = stats?.[starter.player_id];
              const ring = `var(--position-${position.toLowerCase()})`;
              return (
                <div key={spot.key} className="absolute flex w-[120px] -translate-x-1/2 flex-col items-center text-center" style={{ left: `${spot.x}%`, top: ROW_Y[spot.row] }}>
                  <Link
                    to={`/players/${starter.player_id}`}
                    className="relative h-14 w-14 rounded-full bg-surface-2 bg-cover bg-center"
                    style={{ backgroundImage: starter.headshot_url ? `url('${starter.headshot_url}')` : undefined, boxShadow: `0 0 0 2px ${ring}, 0 6px 18px -8px rgba(0,0,0,.6)` }}
                    aria-label={starter.name}
                  >
                    {!starter.headshot_url && <NoPhoto name={starter.name} className="text-[17px]" />}
                    <span className="absolute -bottom-[7px] left-1/2 -translate-x-1/2 rounded px-1.5 py-0.5 text-[10px] font-bold leading-none text-white" style={{ background: `color-mix(in srgb, ${ring} 80%, var(--surface-solid))` }}>
                      {position}{starter.pos_rank}
                    </span>
                  </Link>
                  <Link to={`/players/${starter.player_id}`} className="mt-3 whitespace-nowrap text-[12.5px] font-semibold text-fg hover:text-accent">{starter.name}</Link>
                  <div className="stat-num text-[11px] text-muted">
                    {line ? `${snaps(starter.player_id)} · ${formatStat(line.fantasy_ppg, 1)}` : "No snaps"}
                  </div>
                  <div className="mt-1 grid gap-px text-[11px] text-faint">
                    {list.slice(1, 4).map((backup) => (
                      <Link key={backup.player_id} to={`/players/${backup.player_id}`} className="hover:text-accent">
                        {backup.name} <b className="stat-num font-medium text-muted">{stats?.[backup.player_id] ? snaps(backup.player_id) : "—"}</b>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-sm text-muted">No depth chart published for this team.</p>
      )}
      <div className="mt-2 flex flex-wrap gap-x-4 text-[11px] text-faint">
        <span>Under each name: snap share and fantasy points per game</span>
        <span>Backups show snap share</span>
      </div>
    </section>
  );
}
