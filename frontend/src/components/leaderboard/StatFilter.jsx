// The leaderboard's Filter button: keep only the players inside a range of a volume stat
// (at least, at most, or between), as many as you like (November 2026).
//
// The stats offered are the board's volume counts (FILTER_STATS in
// constants/leaderboards.js: games, snaps, targets, carries, receptions, attempts,
// dropbacks, completions).
//
// Every board opens with the **Qualified** chip on (November 2026, replacing the
// per-group default minimums): only players at their position's minimum per team game
// (utils/qualifiers.js). Removing it brings back the players below it, tagged and with
// open cells; "+ Qualified" puts it back. It is `minimum=off` in the URL, and sent as
// `require_minimum` rather than through `where`, because the bar is per team game and
// per position, which a total cannot say.
//
// The filters live in the URL as `where=metric:min:max,...`, the Query Builder's grammar,
// and the backend applies them after scoring and before paging, so a filter counts every
// page of the board, not just the 50 rows on screen. It narrows the board only: a
// receiver's percentile is still among every receiver (backend `_parse_where`).
//
// A filter on a stat the season has no data for (snaps before 2013) is not sent, since it
// would empty the board; its chip is dimmed and says why.
import { useCallback, useRef, useState } from "react";
import { Popover } from "../ui/Popover";

/** "targets:10:,snap_count:30:" -> [{ metric, min, max }], numbers or null. */
export function parseWhere(raw) {
  return String(raw ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [metric, low = "", high = ""] = part.split(":");
      const toNumber = (text) => (text.trim() === "" || Number.isNaN(Number(text)) ? null : Number(text));
      return { metric, min: toNumber(low), max: toNumber(high) };
    })
    .filter((entry) => entry.metric && (entry.min !== null || entry.max !== null));
}

/** The reverse of parseWhere. */
export function writeWhere(filters) {
  const text = (value) => (value === null || value === undefined ? "" : String(Number(value.toPrecision(6))));
  return filters.map((entry) => `${entry.metric}:${text(entry.min)}:${text(entry.max)}`).join(",");
}

/** Whether two filters are the same condition. */
export const sameFilter = (a, b) => a.metric === b.metric && a.min === b.min && a.max === b.max;

const number = (value) => Number(value.toPrecision(6)).toLocaleString();

/** "Snaps ≥ 30", "Targets 5 to 10". */
export function filterLabel(entry, stats) {
  const name = stats.find((stat) => stat.id === entry.metric)?.label ?? entry.metric;
  if (entry.min !== null && entry.max !== null) return `${name} ${number(entry.min)} to ${number(entry.max)}`;
  if (entry.min !== null) return `${name} ≥ ${number(entry.min)}`;
  return `${name} ≤ ${number(entry.max)}`;
}

const toInput = (value) => (value === null || value === undefined ? "" : String(Number(value.toPrecision(6))));
const fromInput = (text) => (String(text).trim() === "" || Number.isNaN(Number(text)) ? null : Number(text));

function FunnelIcon({ filled }) {
  return filled ? (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
      <path d="M2 3h12l-4.6 5.4V13l-2.8-1.4V8.4z" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M2.5 3.5h11L9 8.7v4l-2-1v-3z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 3l6 6M9 3l-6 6" />
    </svg>
  );
}

const CONDITIONS = [
  { id: "min", label: "At least" },
  { id: "max", label: "At most" },
  { id: "between", label: "Between" },
];
const ACTIVE_SEGMENT = {
  background: "var(--surface-solid)",
  boxShadow: "0 1px 3px rgba(0,0,0,.18), inset 0 0 0 1px color-mix(in srgb, var(--accent) 60%, transparent)",
};

/** The editor inside the popover, for a new filter (`entry` null) or an existing one. */
function FilterEditor({ entry, stats, startOn, onApply, onRemove, onCancel }) {
  const [metricId, setMetricId] = useState(entry?.metric ?? startOn);
  const [condition, setCondition] = useState(
    entry ? (entry.min !== null && entry.max !== null ? "between" : entry.min !== null ? "min" : "max") : "min",
  );
  const [low, setLow] = useState(toInput(entry?.min));
  const [high, setHigh] = useState(toInput(entry?.max));
  const [problem, setProblem] = useState("");

  const apply = () => {
    const min = condition === "max" ? null : fromInput(low);
    const max = condition === "min" ? null : fromInput(high);
    if (min === null && max === null) return setProblem("Enter a number first.");
    if (min !== null && max !== null && min > max) return setProblem("The first number has to be the smaller one.");
    onApply({ metric: metricId, min, max });
    return undefined;
  };

  const field = (value, setValue, placeholder, autoFocus) => (
    <input
      value={value}
      onChange={(event) => {
        setValue(event.target.value);
        setProblem("");
      }}
      onKeyDown={(event) => event.key === "Enter" && apply()}
      inputMode="decimal"
      placeholder={placeholder}
      aria-label={placeholder}
      data-autofocus={autoFocus ? "" : undefined}
      className="glass-input stat-num w-full min-w-0 px-2.5 py-1.5 text-sm"
    />
  );

  return (
    <>
      <h4 className="px-0.5 text-[13px] font-bold text-fg">{entry ? "Edit filter" : "Filter by a stat"}</h4>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Stat</span>
        <select
          value={metricId}
          onChange={(event) => setMetricId(event.target.value)}
          className="glass-input w-full min-w-0 px-2.5 py-1.5 text-sm"
        >
          {stats.map((stat) => (
            <option key={stat.id} value={stat.id} style={{ background: "var(--surface-solid)", color: "var(--fg)" }}>
              {stat.label}
            </option>
          ))}
        </select>
      </label>
      <div role="group" aria-label="Condition" className="inline-flex justify-self-start rounded-xl border border-edge bg-surface-2 p-[3px]">
        {CONDITIONS.map((option) => {
          const on = option.id === condition;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={on}
              onClick={() => setCondition(option.id)}
              className={`rounded-[9px] px-2.5 py-1 text-[12.5px] font-semibold transition ${on ? "text-fg" : "text-muted hover:text-fg"}`}
              style={on ? ACTIVE_SEGMENT : undefined}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {condition === "between" ? (
        <div className="grid grid-cols-2 gap-2">
          {field(low, setLow, "Min", true)}
          {field(high, setHigh, "Max", false)}
        </div>
      ) : condition === "min" ? (
        field(low, setLow, "Minimum", true)
      ) : (
        field(high, setHigh, "Maximum", true)
      )}
      {problem && <p className="px-0.5 text-xs text-neg">{problem}</p>}
      <div className="flex justify-end gap-2">
        {entry && (
          <button type="button" onClick={onRemove} className="btn-ghost mr-auto px-3 py-1 text-xs font-semibold hover:!text-accent">
            Remove
          </button>
        )}
        <button type="button" onClick={onCancel} className="btn-ghost px-3 py-1 text-xs font-semibold hover:!text-accent">
          Cancel
        </button>
        <button type="button" onClick={apply} className="btn-accent-solid px-3 py-1 text-xs">
          {entry ? "Update" : "Add filter"}
        </button>
      </div>
    </>
  );
}

/**
 * @param filters    parsed `where` entries
 * @param onChange   takes the next list of entries
 * @param stats      the stats the Filter offers: [{ id, label }]
 * @param inactive   { metric: reason } for filters that are off this season
 * @param qualified  { on, onChange, title } for the Qualified chip, or null for none
 */
/**
 * The Qualified chip: on by default, removable, and "+ Qualified" to put it back.
 * @param title  what the minimum is for the positions on the board
 */
function QualifiedChip({ on, onChange, title }) {
  if (!on) {
    return (
      <button
        type="button"
        onClick={() => onChange(true)}
        title={`Show only qualified players: ${title}`}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-dashed border-edge px-3 py-1 text-[12.5px] font-semibold text-muted transition hover:text-fg"
      >
        + Qualified
      </button>
    );
  }
  return (
    <span
      title={`Qualified: ${title}`}
      className="inline-flex items-center gap-1.5 rounded-full border py-1 pl-3 pr-1 text-[12.5px] font-semibold text-fg"
      style={{
        background: "color-mix(in srgb, var(--accent) 12%, var(--surface-2))",
        borderColor: "color-mix(in srgb, var(--accent) 45%, transparent)",
      }}
    >
      Qualified
      <button
        type="button"
        aria-label="Remove the Qualified filter"
        onClick={() => onChange(false)}
        className="grid h-[18px] w-[18px] place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-fg"
      >
        <CloseIcon />
      </button>
    </span>
  );
}

export function StatFilter({ filters, onChange, stats, inactive = {}, qualified = null }) {
  // Which filter is open: "new", an index into `filters`, or null.
  const [editing, setEditing] = useState(null);
  const anchor = useRef(null);
  const button = useRef(null);
  const close = useCallback(() => setEditing(null), []);

  const openNew = () => {
    anchor.current = button.current;
    setEditing((current) => (current === "new" ? null : "new"));
  };
  const openExisting = (index, element) => {
    anchor.current = element;
    setEditing(index);
  };

  const count = filters.filter((filter) => !inactive[filter.metric]).length;
  const entry = typeof editing === "number" ? filters[editing] : null;
  // A new filter starts on the first stat not already filtered.
  const startOn = (stats.find((stat) => !filters.some((filter) => filter.metric === stat.id)) ?? stats[0])?.id;

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={openNew}
        aria-haspopup="dialog"
        aria-expanded={editing === "new"}
        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] font-semibold transition ${
          count ? "bg-surface-2 text-accent" : "border-edge bg-surface-2 text-fg hover:text-accent"
        }`}
        style={count ? { borderColor: "color-mix(in srgb, var(--accent) 70%, transparent)" } : undefined}
      >
        <FunnelIcon filled={count > 0} />
        Filter
        {count > 0 && (
          <span className="stat-num min-w-[18px] rounded-full bg-accent px-1.5 text-center text-[11px] font-bold leading-4 text-[#04140c]">
            {count}
          </span>
        )}
      </button>

      {qualified && <QualifiedChip {...qualified} />}

      {filters.map((filter, index) => {
        const off = inactive[filter.metric];
        const label = filterLabel(filter, stats);
        return (
          <span
            key={`${filter.metric}-${index}`}
            role="button"
            tabIndex={0}
            title={off ? `Off: ${off}` : "Edit filter"}
            onClick={(event) => openExisting(index, event.currentTarget)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openExisting(index, event.currentTarget);
              }
            }}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border py-1 pl-3 pr-1 text-[12.5px] font-semibold ${
              off ? "border-dashed border-edge text-faint line-through decoration-1" : "text-fg"
            }`}
            style={
              off
                ? undefined
                : {
                    background: "color-mix(in srgb, var(--accent) 12%, var(--surface-2))",
                    borderColor: "color-mix(in srgb, var(--accent) 45%, transparent)",
                  }
            }
          >
            <span className="stat-num">{label}</span>
            <button
              type="button"
              aria-label={`Remove ${label}`}
              onClick={(event) => {
                event.stopPropagation();
                setEditing(null);
                onChange(filters.filter((_, other) => other !== index));
              }}
              className="grid h-[18px] w-[18px] place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-fg"
            >
              <CloseIcon />
            </button>
          </span>
        );
      })}
      {filters.length > 1 && (
        <button type="button" onClick={() => onChange([])} className="text-[12.5px] text-muted underline underline-offset-[3px] hover:text-fg">
          Clear all
        </button>
      )}

      <Popover anchorRef={anchor} open={editing !== null} onClose={close} width={300} label="Stat filter">
        {editing !== null && (
          <FilterEditor
            key={String(editing)}
            entry={entry}
            stats={stats}
            startOn={startOn}
            onCancel={close}
            onRemove={() => {
              onChange(filters.filter((_, other) => other !== editing));
              setEditing(null);
            }}
            onApply={(next) => {
              onChange(entry ? filters.map((filter, other) => (other === editing ? next : filter)) : [...filters, next]);
              setEditing(null);
            }}
          />
        )}
        {entry && inactive[entry.metric] && (
          <p className="px-0.5 text-xs text-faint">Off this season: {inactive[entry.metric]}</p>
        )}
      </Popover>
    </>
  );
}
