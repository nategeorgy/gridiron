// Small shared pieces for the game page tabs: the card frame, table cells, a player cell
// and the notes a tab shows while its data has not arrived yet.
import { Link } from "react-router-dom";
import { PositionTag } from "../PositionTag";
import { Headshot } from "../explore/common";
import { shortName } from "../../utils/format";

export function Panel({ title, sub, right, children, className = "" }) {
  return (
    <section className={`glass-card min-w-0 p-4 ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold tracking-tight text-fg">{title}</h2>}
            {sub && <p className="mt-0.5 text-[11.5px] text-faint">{sub}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

/** A note in place of a tab's content, saying what will be there and when. */
export function Waiting({ children }) {
  return <section className="glass-card p-6 text-center text-sm text-muted">{children}</section>;
}

export function Loading({ height = 320 }) {
  return <div className="glass-card animate-pulse" style={{ height }} aria-busy="true" />;
}

const TH_BASE = "whitespace-nowrap px-2 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-faint";
export const TH = `${TH_BASE} text-right`;
export const TH_LEFT = `${TH_BASE} text-left`;
export const TH_CENTER = `${TH_BASE} text-center`;
export const TD = "stat-num whitespace-nowrap px-2 py-1.5 text-right";

export function PlayerName({ player, logo, size = 22 }) {
  return (
    <Link to={`/players/${player.player_id}`} className="flex min-w-0 items-center gap-2 whitespace-nowrap font-medium text-fg hover:text-accent">
      {logo && <img src={logo} alt="" className="h-4 w-4 flex-none object-contain" />}
      <Headshot url={player.headshot_url} name={player.name} size={size} />
      <span className="md:hidden">{shortName(player.name)}</span>
      <span className="hidden md:inline">{player.name}</span>
      <PositionTag position={player.position} variant="quiet" />
    </Link>
  );
}

/** "17-138, 1 TD on 24 tgt · 2-9 rushing": a stat line in a few words, receiving first for a receiver. */
export function lineText(p) {
  const parts = [];
  if (p.attempts > 0) {
    parts.push(`${p.completions}/${p.attempts}, ${p.passing_yards} yds${p.passing_tds ? `, ${p.passing_tds} TD` : ""}${p.interceptions ? `, ${p.interceptions} INT` : ""}`);
  }
  const rush = p.carries > 0 && (["RB", "QB"].includes(p.position) || p.carries >= 2)
    ? `${p.carries}-${p.rushing_yards}${p.rushing_tds ? `, ${p.rushing_tds} TD` : ""} rushing` : null;
  const receive = p.targets > 0
    ? `${p.receptions}-${p.receiving_yards}${p.receiving_tds ? `, ${p.receiving_tds} TD` : ""} on ${p.targets} tgt` : null;
  const order = ["WR", "TE"].includes(p.position) ? [receive, rush] : [rush, receive];
  return [...parts, ...order.filter(Boolean)].join(" · ");
}

export const pct = (value, digits = 0) => (value === null || value === undefined ? "—" : `${(value * 100).toFixed(digits)}%`);
export const num = (value, digits = 1) => (value === null || value === undefined ? "—" : Number(value).toFixed(digits));
export const int = (value) => (value === null || value === undefined ? "—" : Math.round(value).toString());
export const clockTime = (seconds) => (seconds ? `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}` : "—");

/** A tinted cell for a share: stronger accent for a bigger share of the work. */
export function Heat({ value, max, children }) {
  if (value === null || value === undefined || value <= 0) return <span className="text-faint">{children ?? "—"}</span>;
  const strength = Math.max(0, Math.min(1, value / max));
  return (
    <span
      className="inline-block min-w-[44px] rounded-[5px] px-1.5 py-0.5 text-center"
      style={{
        background: `color-mix(in srgb, var(--accent) ${Math.round(8 + strength * 46)}%, transparent)`,
        color: `color-mix(in srgb, var(--accent) ${Math.round(strength * 25)}%, var(--fg))`,
      }}
    >
      {children}
    </span>
  );
}
