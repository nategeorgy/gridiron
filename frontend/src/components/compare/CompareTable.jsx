// Player Comparison's stat table (November 2026, option S4, "Shaded, percentile"): the
// leaderboard turned on its side. The players are the rows and the tab's stats the
// columns, under the tab's section headers; every cell is shaded by its percentile on the
// leaderboard's scale with the percentile beneath, and the best of the players in each
// column is bold and underlined in that player's series colour.
//
// Headers sort like the leaderboard's: high to low, then low to high on a second click,
// players without the stat last. The sort is in the URL (`sort=`, `order=`), and an
// unsorted table follows the tab's first column. A percentile ranked as if qualified is
// drawn open (a dashed ring, a dashed pill), as on the leaderboard.
import { Link } from "react-router-dom";
import { asIfNote, isAsIf } from "../../utils/qualifiers";
import { formatStat, ordinal } from "../../utils/format";
import { asIfRing, percentileFill, percentileInk } from "../../utils/percentileScale";
import { Headshot, Swatch } from "../explore/common";
import { StatTooltip, useStatTooltip } from "../StatTooltip";

/** The player with the best value in a column, or null for a tie or fewer than two. */
export function columnLeader(slots, id, metric) {
  const values = slots.filter((slot) => slot.row?.[id] !== null && slot.row?.[id] !== undefined)
    .map((slot) => ({ slot, value: slot.row[id] }));
  if (values.length < 2) return null;
  const higher = metric?.higher_is_better !== false;
  values.sort((a, b) => (higher ? b.value - a.value : a.value - b.value));
  return formatStat(values[0].value, metric?.format) === formatStat(values[1].value, metric?.format) ? null : values[0].slot;
}

/** A section's columns, with where each section starts so a hairline can mark it. */
const columnsOf = (sections) => sections.flatMap((section) => section.columns);

export function CompareTable({ slots, sections, metrics, sort, order, onSort }) {
  const tooltip = useStatTooltip();
  const columns = columnsOf(sections);
  const sortId = columns.includes(sort) ? sort : columns[0];
  const starts = new Set(sections.map((section) => section.columns[0]));
  const leaders = new Map(columns.map((id) => [id, columnLeader(slots, id, metrics[id])]));
  const led = new Map(slots.map((slot) => [slot.key, 0]));
  leaders.forEach((slot) => { if (slot) led.set(slot.key, led.get(slot.key) + 1); });

  const rows = [...slots].sort((a, b) => {
    const va = a.row?.[sortId];
    const vb = b.row?.[sortId];
    if (va === null || va === undefined) return vb === null || vb === undefined ? a.index - b.index : 1;
    if (vb === null || vb === undefined) return -1;
    return order === "asc" ? va - vb : vb - va;
  });

  const tipFor = (id) => ({ label: metrics[id]?.label ?? id.replace(/_/g, " "), short: metrics[id]?.short, description: metrics[id]?.description });

  return (
    <div>
      <StatTooltip tip={tooltip.tip} />
      <div className="overflow-x-auto">
        <table className="board-shaded w-full text-sm md:min-w-[720px]">
          <thead>
            {sections.some((section) => section.name) && (
              <tr className="border-b border-line text-[10px] uppercase tracking-[0.11em] text-faint">
                <th className="pin-col px-3 py-1.5" />
                {sections.map((section, index) => (
                  <th key={`${index}-${section.name}`} colSpan={section.columns.length} className="border-l border-line px-3 py-1.5 text-center">
                    <span className="font-bold text-fg">{section.name}</span>
                  </th>
                ))}
              </tr>
            )}
            <tr className="border-b border-line text-xs uppercase tracking-wide text-faint">
              <th className="pin-col px-3 py-2.5 text-left">Player</th>
              {columns.map((id) => (
                <th
                  key={id}
                  tabIndex={0}
                  onClick={() => onSort(id)}
                  onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && (event.preventDefault(), onSort(id))}
                  onMouseEnter={(event) => tooltip.show(event.currentTarget, tipFor(id))}
                  onMouseLeave={tooltip.hide}
                  onFocus={(event) => tooltip.show(event.currentTarget, tipFor(id))}
                  onBlur={tooltip.hide}
                  aria-sort={sortId === id ? (order === "asc" ? "ascending" : "descending") : undefined}
                  className={`cursor-pointer whitespace-nowrap px-3 py-2.5 text-center align-bottom transition hover:text-fg ${starts.has(id) ? "border-l border-line" : ""} ${sortId === id ? "text-accent" : ""}`}
                >
                  <span className="relative inline-block">
                    {metrics[id]?.short ?? metrics[id]?.label ?? id.replace(/_/g, " ")}
                    {sortId === id && (
                      <span className="absolute left-full top-0 pl-0.5 font-mono" aria-hidden="true">{order === "asc" ? "↑" : "↓"}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((slot) => (
              <tr key={slot.key} className="border-b border-line last:border-0">
                <td className="pin-col px-3 py-2 max-md:pl-2 max-md:pr-2.5">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Headshot url={slot.headshot_url} name={slot.name} size={30} ring={slot.color} />
                    <span className="min-w-0 leading-tight">
                      <Link to={`/players/${slot.id}`} className="block max-w-[118px] truncate text-[13px] font-bold text-fg hover:text-accent md:max-w-[200px]">
                        <span className="md:hidden">{slot.label}</span>
                        <span className="hidden md:inline">{slot.fullLabel}</span>
                      </Link>
                      <span className="stat-num block whitespace-nowrap text-[11px] text-faint">
                        {slot.team ?? "FA"} · {slot.season}{slot.row ? ` · ${slot.row.games_played}G` : ""}
                      </span>
                    </span>
                  </span>
                </td>
                {columns.map((id) => {
                  const value = slot.row?.[id];
                  const percentile = slot.row?.percentiles?.[id];
                  const has = percentile !== null && percentile !== undefined;
                  const open = has && isAsIf(slot.row, id);
                  const leads = leaders.get(id) === slot;
                  const text = formatStat(value, metrics[id]?.format);
                  const edges = [
                    "inset 1px 0 0 color-mix(in srgb, var(--bg) 35%, transparent)",
                    leads ? `inset 0 -3px 0 ${slot.color}` : null,
                  ].filter(Boolean).join(", ");
                  return (
                    <td
                      key={id}
                      title={[`${slot.fullLabel}: ${text}`, has && `${ordinal(percentile)} percentile`, open && "as if qualified", leads && "best here"].filter(Boolean).join(" · ")}
                      className={`stat-cell stat-num px-3 py-2 text-center ${starts.has(id) ? "border-l border-line" : ""}`}
                      style={{ ...(has ? (open ? asIfRing(percentile) : { background: percentileFill(percentile) }) : {}), boxShadow: edges }}
                    >
                      <span className="flex flex-col items-center leading-tight">
                        <span className={leads ? "font-extrabold text-fg" : "text-fg"}>{text}</span>
                        {has ? (
                          <span
                            className={`text-[10px] font-semibold ${open ? "mt-px rounded-full border border-dashed px-1 leading-[13px]" : ""}`}
                            style={{ color: percentileInk(percentile), borderColor: open ? percentileInk(percentile) : undefined }}
                          >
                            {percentile}
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-faint" aria-hidden="true">&ndash;</span>
                        )}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
        <span>Best in a column, on this tab:</span>
        {slots.map((slot) => (
          <span key={slot.key} className="inline-flex items-center gap-1.5">
            <Swatch color={slot.color} />
            {slot.label}
            <b className="stat-num text-fg">{led.get(slot.key)}</b>
          </span>
        ))}
      </div>
      {slots.map((slot) => asIfNote(slot.row, slot.name, slot.row?.position, "Dashed percentiles")).filter(Boolean).map((note) => (
        <p key={note} className="mt-1.5 text-xs text-muted">{note}</p>
      ))}
    </div>
  );
}
