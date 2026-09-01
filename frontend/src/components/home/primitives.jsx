// Shared furniture for the Command Center cards (M10).
//
// The home page is a dashboard rather than a document: it is scanned, not read, so
// every card shares one head, one tab control and one set of loading/empty states.
// Pulling them out here is what keeps eight cards from drifting into eight slightly
// different treatments of the same thing.
import { Link } from "react-router-dom";
import { PositionTag } from "../PositionTag";

export function Card({ children, className = "" }) {
  return <section className={`glass-card flex min-w-0 flex-col p-4 ${className}`}>{children}</section>;
}

export function CardHead({ title, sub, children }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-semibold tracking-tight text-fg">{title}</h3>
        {sub && <span className="text-[11px] font-medium text-faint">{sub}</span>}
      </div>
      {children}
    </div>
  );
}

/** A segmented control. `options` is [{ value, label }]. */
export function Tabs({ options, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="flex gap-[3px] rounded-full border border-edge bg-surface-2 p-[3px]">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`whitespace-nowrap rounded-full px-2.5 py-1.5 text-[10.5px] font-semibold tracking-wide transition ${
              active ? "bg-accent text-[color:var(--accent-ink)]" : "text-muted hover:text-fg"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Player name + position chip + team, linking to the profile. */
export function PlayerCell({ playerId, name, position, team, rank }) {
  return (
    <>
      {rank != null && <span className="stat-num mr-1.5 text-[11px] text-faint">{rank}</span>}
      <Link to={`/players/${playerId}`} className="font-semibold text-fg hover:text-accent">
        {name}
      </Link>
      {position && <PositionTag position={position} variant="quiet" className="ml-1.5" />}
      {team && <span className="ml-1.5 text-[10.5px] text-faint">{team}</span>}
    </>
  );
}

/** Uniform loading / error / empty states, so no card invents its own. */
export function CardState({ isLoading, isError, isEmpty, empty = "Nothing to show yet.", rows = 4 }) {
  if (isLoading) {
    return (
      <div className="space-y-2 py-1" aria-busy="true">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="h-7 animate-pulse rounded-lg bg-surface-2/70" />
        ))}
      </div>
    );
  }
  if (isError) return <p className="py-6 text-center text-xs text-muted">Couldn't load this. Is the API running?</p>;
  if (isEmpty) return <p className="py-6 text-center text-xs text-muted">{empty}</p>;
  return null;
}

export function CardLink({ to, children }) {
  return (
    <div className="mt-3">
      <Link to={to} className="inline-block py-1.5 text-[11.5px] font-semibold text-muted transition hover:text-accent">
        {children} →
      </Link>
    </div>
  );
}

/** A table that scrolls sideways rather than crushing its columns in a narrow rail. */
export function ScrollTable({ minWidth = 430, children }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, align = "right" }) {
  return (
    <th
      className={`whitespace-nowrap pb-2 text-[9.5px] font-bold uppercase tracking-[0.07em] text-faint ${
        align === "left" ? "text-left" : "text-right"
      }`}
    >
      {children}
    </th>
  );
}
