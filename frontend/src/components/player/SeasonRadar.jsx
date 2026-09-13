// The season at a glance: each percentile as a wedge, grouped by what it measures.
//
// **Wedge length is the percentile, and the full-length track behind it is 100.** The
// missing share of a wedge is as visible as the earned share, which is the whole reason
// this reads faster than the same numbers in a list — a short wedge is a hole in the
// profile, not merely a small number.
//
// Slices and groups are per position (`RADAR_GROUPS`): ten to twelve slices, and a
// quarterback's chart has no Opportunity group. Colours are `--series-*` tokens keyed to
// the group, never `--accent`/`--pos`/`--neg`, which carry "good"/"bad" meanings a
// category must not borrow.
//
// Percentiles are already direction-corrected by the API, so a long wedge always means
// good — including for drops and interceptions.
import { formatStat } from "../../utils/format";
import { columnEntry, forPosition, RADAR_GROUPS } from "../../constants/playerPage";

const SIZE = 640;
const CENTRE_X = 320;
const CENTRE_Y = 285;
const RADIUS = 160;
// Enough of a gap that neighbouring wedges read as separate without the ring looking
// dashed, and a floor so a 2nd-percentile wedge is still a visible mark rather than
// nothing at all.
const WEDGE_GAP = 0.02;
const MIN_WEDGE = 10;

function polar(angle, radius) {
  return [CENTRE_X + radius * Math.cos(angle), CENTRE_Y + radius * Math.sin(angle)];
}

export function SeasonRadar({ row, metrics, position, season }) {
  const groups = forPosition(RADAR_GROUPS, position);
  const slices = groups.flatMap((group) =>
    group.columns.map((entry) => {
      const { id, label } = columnEntry(entry);
      return { column: id, label, group };
    }),
  );
  const step = (2 * Math.PI) / slices.length;
  const start = -Math.PI / 2;

  const wedge = (index, radius) => {
    const from = start + index * step + WEDGE_GAP;
    const to = start + (index + 1) * step - WEDGE_GAP;
    const [x0, y0] = polar(from, radius);
    const [x1, y1] = polar(to, radius);
    return `M ${CENTRE_X} ${CENTRE_Y} L ${x0} ${y0} A ${radius} ${radius} 0 0 1 ${x1} ${y1} Z`;
  };
  const cap = (index, radius) => {
    const from = start + index * step + WEDGE_GAP;
    const to = start + (index + 1) * step - WEDGE_GAP;
    const [x0, y0] = polar(from, radius);
    const [x1, y1] = polar(to, radius);
    return `M ${x0} ${y0} A ${radius} ${radius} 0 0 1 ${x1} ${y1}`;
  };

  const ranked = slices.map((slice, index) => ({
    ...slice,
    index,
    percentile: row?.percentiles?.[slice.column] ?? null,
    value: row?.[slice.column],
  }));

  return (
    <section className="glass-card flex flex-col p-4">
      <h2 className="text-sm font-semibold tracking-tight text-fg">Season Profile</h2>
      <p className="mt-0.5 text-[11.5px] text-faint">
        Percentile among {position}s, {season} · wedge length is the rank, the number beside
        each label is the actual value
      </p>

      <svg
        viewBox={`0 0 ${SIZE} 575`}
        className="mt-1.5 block h-auto w-full"
        role="img"
        aria-label={`Percentile profile for ${season}`}
      >
        {/* Empty tracks first, so what is missing is as legible as what is there. */}
        {ranked.map((slice) => (
          <path key={`track-${slice.column}`} d={wedge(slice.index, RADIUS)} fill="var(--surface-2)" fillOpacity={0.5} />
        ))}
        {[25, 50, 75].map((ring) => (
          <circle
            key={ring}
            cx={CENTRE_X}
            cy={CENTRE_Y}
            r={(RADIUS * ring) / 100}
            fill="none"
            stroke="var(--line)"
            strokeWidth="1"
          />
        ))}

        {ranked.map((slice) => {
          if (slice.percentile == null) return null;
          const radius = Math.max((RADIUS * slice.percentile) / 100, MIN_WEDGE);
          return (
            <g key={`fill-${slice.column}`}>
              <path d={wedge(slice.index, radius)} fill={slice.group.color} fillOpacity={0.3} />
              <path
                d={cap(slice.index, radius)}
                fill="none"
                stroke={slice.group.color}
                strokeWidth="3.5"
                strokeLinecap="round"
              />
            </g>
          );
        })}

        {/* The percentile itself, inside the wedge when there is room and just past its
            cap when there is not, with a surface-coloured halo so it stays legible
            against either the fill or the track. */}
        {ranked.map((slice) => {
          if (slice.percentile == null) return null;
          const radius = Math.max((RADIUS * slice.percentile) / 100, MIN_WEDGE);
          const mid = start + (slice.index + 0.5) * step;
          const [x, y] = polar(mid, radius > 128 ? radius - 18 : radius + 14);
          return (
            <text
              key={`num-${slice.column}`}
              x={x}
              y={y + 4}
              textAnchor="middle"
              className="stat-num"
              fontSize="12.5"
              fontWeight="700"
              fill="var(--fg)"
              stroke="var(--surface-solid)"
              strokeWidth="3"
              paintOrder="stroke"
            >
              {slice.percentile}
            </text>
          );
        })}

        <circle cx={CENTRE_X} cy={CENTRE_Y} r="2.5" fill="var(--faint)" />

        {ranked.map((slice) => {
          const mid = start + (slice.index + 0.5) * step;
          const [x, y] = polar(mid, RADIUS + 26);
          // Only labels near the poles centre themselves; the rest hang off their own
          // side, so near-vertical neighbours never collide over the top of the chart.
          const nearPole = Math.abs(Math.cos(mid)) < 0.22;
          const anchor = nearPole ? "middle" : Math.cos(mid) > 0 ? "start" : "end";
          const label = slice.label ?? metrics[slice.column]?.label ?? slice.column;
          const shifted = nearPole ? y + (Math.sin(mid) > 0 ? 14 : -16) : y;
          return (
            <text key={`label-${slice.column}`} x={x} y={shifted} textAnchor={anchor} fontSize="11.5" fontWeight="600" fill="var(--fg)">
              <tspan x={x}>{label}</tspan>
              <tspan x={x} dy="13" fontSize="10.5" fontWeight="500" fill="var(--faint)" className="stat-num">
                {slice.percentile == null ? "not ranked" : formatStat(slice.value, metrics[slice.column]?.format)}
              </tspan>
            </text>
          );
        })}
      </svg>

      <div className="mt-1 flex flex-wrap justify-center gap-4 text-[11.5px] text-muted">
        {groups.map((group) => (
          <span key={group.name} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: group.color }} />
            {group.name}
          </span>
        ))}
      </div>
    </section>
  );
}
