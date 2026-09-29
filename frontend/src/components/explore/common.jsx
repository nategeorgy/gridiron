// Small shared pieces for the Explore pages: the page header, the chip row, headshots,
// swatches and card titles. Kept together because each is a few lines and all five
// pages use most of them.
import { useState } from "react";
import { PositionTag } from "../PositionTag";
import { initials } from "../../utils/explore";

/** The page header every Explore page opens with. */
export function ExploreHeader({ title, description, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent">Explore</div>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
      </div>
      {children}
    </div>
  );
}

/**
 * A row of pill chips, one pressed: the scatter's questions, the Query Builder's
 * examples. `options` is [{ value, label, hint? }].
 */
export function Chips({ options, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            title={option.hint}
            onClick={() => onChange(option.value)}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              on ? "text-fg" : "border-edge text-muted hover:text-fg"
            }`}
            style={on ? {
              background: "var(--surface-solid)",
              borderColor: "color-mix(in srgb, var(--accent) 55%, transparent)",
            } : undefined}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** A labelled control for the filter bars, matching ui/Select's label. */
export function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      {children}
    </div>
  );
}

/** A round headshot with initials underneath, which show until (or unless) the photo loads. */
export function Headshot({ url, name, size = 28, ring }) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className="relative inline-block shrink-0 overflow-hidden rounded-full"
      style={{
        width: size,
        height: size,
        background: "color-mix(in srgb, var(--fg) 10%, var(--surface-solid))",
        boxShadow: ring ? `0 0 0 2px ${ring}` : undefined,
      }}
    >
      <span
        className="absolute inset-0 grid place-items-center font-semibold text-muted"
        style={{ fontSize: Math.max(9, size * 0.34) }}
      >
        {initials(name)}
      </span>
      {url && !failed && (
        <img
          src={url}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
      )}
    </span>
  );
}

/** A colour dot for a series or a legend. */
export function Swatch({ color, size = 10, round = true }) {
  return (
    <span
      className={`inline-block shrink-0 ${round ? "rounded-full" : "rounded-[3px]"}`}
      style={{ width: size, height: size, background: color }}
    />
  );
}

/** Headshot, name, then position and team underneath. */
export function PlayerLine({ player, size = 26, sub, ring }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Headshot url={player.headshot_url} name={player.name} size={size} ring={ring} />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold text-fg">{player.name}</span>
        <span className="stat-num flex items-center gap-1.5 text-[11px] text-faint">
          {player.position && <PositionTag position={player.position} variant="quiet" />}
          {player.team && <span>{player.team}</span>}
          {sub}
        </span>
      </span>
    </span>
  );
}

/** A card's title row: heading and subtitle on the left, controls on the right. */
export function CardTitle({ title, sub, children }) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight text-fg">{title}</h2>
        {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** The fine print under a chart. */
export function Foot({ children }) {
  return <p className="mt-2 text-[11px] leading-relaxed text-faint">{children}</p>;
}

/** A legend row. `items` is [{ key, color, label, round? }]. */
export function Legend({ items, children }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted">
      {items?.map((item) => (
        <span key={item.key ?? item.label} className="inline-flex items-center gap-1.5">
          <Swatch color={item.color} size={item.size ?? 10} round={item.round ?? false} />
          {item.label}
        </span>
      ))}
      {children}
    </div>
  );
}

/** A checkbox with its label, for chart options. */
export function Toggle({ checked, onChange, children }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[12.5px] text-muted">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-[color:var(--accent)]"
      />
      {children}
    </label>
  );
}

/** Loading, error and empty states inside a chart card. */
export function ChartState({ isLoading, isError, isEmpty, empty = "Nothing to show for this selection.", height = 240 }) {
  if (isLoading) {
    return <div className="animate-pulse rounded-xl bg-surface-2" style={{ height }} aria-busy="true" />;
  }
  if (isError) return <p className="py-10 text-center text-sm text-muted">Couldn't load this. Try again in a moment.</p>;
  if (isEmpty) return <p className="py-10 text-center text-sm text-muted">{empty}</p>;
  return null;
}
