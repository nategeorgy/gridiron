// The Query Builder's results drawn as an SVG table, for "Export image" only.
//
// The page's table is HTML, which the exporter cannot rasterise (utils/exportImage.js
// works from an SVG). So the image is its own drawing of the same rows and columns:
// rank, face, name, position and team, the search's context columns (season; week and
// game for a games list; best game for a count), then the stat columns in the page's
// order, with the sorted one shaded.
//
// It is drawn at its final type size, so the export passes `fitScale: 1`: a table
// enlarged the way a narrow chart is would set its numbers larger than the title. Column
// widths are measured from the text they hold, and any room left over at the minimum
// width goes to the player column, which keeps the stats together on the right.
//
// Rendered offscreen with no providers (see composeImage), so it takes the parsed
// league from the page rather than reading a hook.
import { ClipDef, SvgHeadshot, useClipId } from "./SvgHeadshot";
import { finishTier } from "../player/FinishChip";
import { positionColor } from "../../utils/explore";
import { formatStat } from "../../utils/format";

const SANS = "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";
const MIN_WIDTH = 1104; // a 1,200px frame
const ROW = 56;
const HEADER = 40;
const GAP = 28;
const MIN_STAT = 76; // so a two-digit column (games, touchdowns) does not crowd its neighbours
const NAME_X = 102;

let measureContext = null;
/** Rendered width of `text` in a CSS font; the page's fonts are loaded before an export. */
function measure(text, font, tracking = 0) {
  measureContext ??= document.createElement("canvas").getContext("2d");
  measureContext.font = font;
  return measureContext.measureText(String(text)).width + tracking * String(text).length;
}
const monoWidth = (text, size) => String(text).length * size * 0.6;

const RESULT_COLORS = { W: "var(--pos)", L: "var(--neg)", T: "var(--muted)" };

function gameText(row) {
  const place = row.home ? "vs" : "@";
  const score = row.team_score == null ? "" : `${row.team_score}–${row.opponent_score} `;
  return `${score}${place} ${row.opponent ?? ""}`;
}

function bestGameText(best) {
  const week = best.season_type === "POST" ? best.week_label : `Wk ${best.week_label}`;
  return `${formatStat(best.fantasy_points, 1)} · ${best.season} ${week} ${best.home ? "vs" : "@"} ${best.opponent ?? ""}`;
}

const headerLabel = (column, sorted, order) =>
  sorted ? `${column.label.toUpperCase()} ${order === "asc" ? "↑" : "↓"}` : column.short;

/**
 * @param data    the search response (grain, mode, columns, sort, order)
 * @param rows    the rows to draw, in order
 * @param league  the parsed league, for weekly-finish colours
 */
export function QueryResultsImage({ data, rows, league }) {
  const clipId = useClipId();
  const count = data.mode === "count";
  const games = data.grain === "games" && !count;

  // --- layout ---------------------------------------------------------------------------
  const nameWidth = Math.max(
    180,
    ...rows.map((row) => Math.max(measure(row.name, `600 19px ${SANS}`), measure(`${row.position} · ${row.team ?? ""}`, `500 13.5px ${SANS}`))),
  );
  const headerWidth = (text) => measure(text, `700 12.5px ${SANS}`, 1);
  const lead = [];
  if (!count) lead.push({ key: "season", label: "SEASON", align: "end", width: Math.max(headerWidth("SEASON"), monoWidth("2024", 17)) + GAP });
  if (games) {
    lead.push({ key: "week", label: "WK", align: "end", width: Math.max(headerWidth("WK"), ...rows.map((row) => monoWidth(row.week_label, 17))) + GAP });
    lead.push({ key: "game", label: "GAME", align: "start", width: Math.max(headerWidth("GAME"), ...rows.map((row) => monoWidth(`W ${gameText(row)}`, 15))) + GAP });
  }
  const stats = data.columns.map((column) => {
    const sorted = column.key === data.sort;
    const valueWidth = column.key === "weekly_finish"
      ? 66
      : Math.max(...rows.map((row) => monoWidth(formatStat(row[column.key], column.format), sorted ? 19 : 17)));
    return { column, sorted, width: Math.max(MIN_STAT, Math.max(headerWidth(headerLabel(column, sorted, data.order)), valueWidth) + GAP) };
  });
  const tail = count
    ? [{ key: "best", label: "BEST GAME", align: "start", width: Math.max(headerWidth("BEST GAME"), ...rows.map((row) => monoWidth(bestGameText(row.best), 15))) + GAP }]
    : [];
  const fixed = [...lead, ...stats, ...tail].reduce((sum, column) => sum + column.width, 0);
  const playerWidth = Math.max(NAME_X + nameWidth + GAP, MIN_WIDTH - fixed);
  const width = Math.ceil(playerWidth + fixed);
  const height = HEADER + rows.length * ROW + 8;

  // x of each column's left edge, in drawing order
  let cursor = playerWidth;
  const place = (column) => {
    const left = cursor;
    cursor += column.width;
    return { ...column, left };
  };
  const leadPlaced = lead.map(place);
  const statPlaced = stats.map(place);
  const tailPlaced = tail.map(place);
  // Right-aligned text sits GAP/2 inside its column's right edge; left-aligned text
  // GAP/2 inside its left edge, after the column before it.
  const anchorX = (column) => (column.align === "start" ? column.left + GAP / 2 : column.left + column.width - GAP / 2);
  const statX = (column) => column.left + column.width - GAP / 2;

  // --- drawing --------------------------------------------------------------------------
  const head = (x, text, anchor, on = false) => (
    <text x={x} y={HEADER - 14} textAnchor={anchor}
      style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 700, letterSpacing: 1, fill: on ? "var(--fg)" : "var(--faint)" }}>
      {text}
    </text>
  );
  const num = (x, y, text, { size = 17, weight = 500, fill = "var(--muted)", anchor = "end" } = {}) => (
    <text x={x} y={y} dy="0.35em" textAnchor={anchor} style={{ fontFamily: MONO, fontSize: size, fontWeight: weight, fill }}>
      {text}
    </text>
  );

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Query results">
      <defs>
        <ClipDef id={clipId} />
      </defs>
      {statPlaced.filter((column) => column.sorted).map((column) => (
        <rect key="band" x={column.left + 10} y={2} width={column.width - 14} height={HEADER + rows.length * ROW - 4} rx={10}
          fill="color-mix(in srgb, var(--accent) 8%, transparent)" />
      ))}

      {head(10, "#", "start")}
      {head(NAME_X, "PLAYER", "start")}
      {[...leadPlaced, ...tailPlaced].map((column) => <g key={column.key}>{head(anchorX(column), column.label, column.align)}</g>)}
      {statPlaced.map((column) => (
        <g key={column.column.key}>{head(statX(column), headerLabel(column.column, column.sorted, data.order), "end", column.sorted)}</g>
      ))}

      {rows.map((row, index) => {
        const top = HEADER + index * ROW;
        const middle = top + ROW / 2;
        return (
          <g key={`${row.player_id}-${row.season ?? ""}-${row.week ?? ""}-${index}`}>
            <rect x={0} y={top} width={width} height={1} fill="var(--divider)" />
            {num(34, middle, index + 1, { size: 16, weight: 400, fill: "var(--faint)" })}
            <g transform={`translate(70 ${middle})`}>
              <SvgHeadshot url={row.headshot_url} name={row.name} r={20} ring={positionColor(row.position)} ringWidth={2.5} clipId={clipId} />
            </g>
            <text x={NAME_X} y={middle - 3} style={{ fontFamily: SANS, fontSize: 19, fontWeight: 600, fill: "var(--fg)" }}>{row.name}</text>
            <text x={NAME_X} y={middle + 16} style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 500, fill: "var(--muted)" }}>
              {row.position}{row.team ? ` · ${row.team}` : ""}
            </text>

            {leadPlaced.map((column) => {
              if (column.key === "season") return <g key="season">{num(anchorX(column), middle, row.season)}</g>;
              if (column.key === "week") return <g key="week">{num(anchorX(column), middle, row.week_label)}</g>;
              return (
                <text key="game" x={anchorX(column)} y={middle} dy="0.35em" style={{ fontFamily: MONO, fontSize: 15, fontWeight: 500, fill: "var(--muted)" }}>
                  {row.result && <tspan style={{ fill: RESULT_COLORS[row.result], fontWeight: 700 }}>{row.result} </tspan>}
                  {gameText(row)}
                </text>
              );
            })}

            {statPlaced.map((column) => {
              const { key, format, filtered } = column.column;
              const value = row[key];
              if (key === "weekly_finish" && value != null) {
                const tier = finishTier(value, row.position, league);
                const right = statX(column);
                return (
                  <g key={key}>
                    <rect x={right - 62} y={middle - 13} width={62} height={26} rx={6} fill={tier.background} />
                    {num(right - 31, middle, `${row.position}${value}`, { size: 14, weight: 600, fill: tier.color, anchor: "middle" })}
                  </g>
                );
              }
              const strong = column.sorted || filtered;
              return (
                <g key={key}>
                  {num(statX(column), middle, formatStat(value, format), {
                    size: column.sorted ? 19 : 17,
                    weight: column.sorted ? 700 : 500,
                    fill: strong ? "var(--fg)" : "var(--muted)",
                  })}
                </g>
              );
            })}

            {tailPlaced.map((column) => (
              <g key="best">{num(anchorX(column), middle, bestGameText(row.best), { size: 15, anchor: "start" })}</g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
