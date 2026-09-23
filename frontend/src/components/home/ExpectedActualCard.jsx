// Expected vs Actual (September 2026) — one plot in place of the two rail cards.
//
// Underperformers and Regression Candidates drew the same quantity twice, each on its
// own scale, and neither said *why* a player was off his expected points. This draws
// every player in the league as a faint dot, the diagonal as par, and the hand-picked
// few as headshots; hovering one explains the gap by naming every expected component
// the player is on the wrong (or right) side of.
//
// **Not red and green, on purpose.** "Below expected" is a *buy* — colouring it red
// would tell the reader the opposite of what the plot means, and green would make a
// deficit look like an achievement. Blue reads cold, amber reads hot, and neither
// borrows the meaning `--pos` / `--neg` carry everywhere else in the app.
import { useNavigate } from "react-router-dom";
import { PositionTag } from "../PositionTag";
import { StatTooltip, useStatTooltip } from "../StatTooltip";
import { Card, CardHead, CardState } from "./primitives";
import { formatSigned, formatStat } from "../../utils/format";
import { scoringLabel } from "../../constants/scoring";

const COLD = "var(--series-1)"; // below par: a buy
const HOT = "var(--warn)"; // above par: a sell

/**
 * The stored expected components, by phase (see the M2 note in CLAUDE.md: the database
 * holds expected *components*, never expected points, so this is the whole vocabulary
 * the gap can be explained in).
 *
 * `name` is deliberately short and phase-free — the sentence already names the phase,
 * so "receiving yards 67" would say it twice.
 */
const EXPECTED_COMPONENTS = {
  passing: [
    { actual: "passing_yards", expected: "passing_yards_exp", name: "yards" },
    { actual: "passing_tds", expected: "passing_tds_exp", name: "touchdowns" },
    { actual: "completions", expected: "completions_exp", name: "completions" },
    { actual: "passing_first_downs", expected: "passing_first_downs_exp", name: "first downs" },
    // The one component where fewer is better, which the sentence has to say out loud
    // or "ahead of expected on interceptions" reads as the opposite of the truth.
    { actual: "interceptions", expected: "interceptions_exp", name: "interceptions (fewer)", lowerIsBetter: true },
  ],
  rushing: [
    { actual: "rushing_yards", expected: "rushing_yards_exp", name: "yards" },
    { actual: "rushing_tds", expected: "rushing_tds_exp", name: "touchdowns" },
    { actual: "rushing_first_downs", expected: "rushing_first_downs_exp", name: "first downs" },
  ],
  receiving: [
    { actual: "receiving_yards", expected: "receiving_yards_exp", name: "yards" },
    { actual: "receptions", expected: "receptions_exp", name: "receptions" },
    { actual: "receiving_tds", expected: "receiving_tds_exp", name: "touchdowns" },
    { actual: "receiving_first_downs", expected: "receiving_first_downs_exp", name: "first downs" },
  ],
};

/** Which phase the player's expected points actually come from, rather than his position. */
function dominantPhase(row) {
  const byPhase = {
    passing: row.passing_yards_exp ?? 0,
    rushing: row.rushing_yards_exp ?? 0,
    receiving: row.receiving_yards_exp ?? 0,
  };
  return Object.entries(byPhase).sort((a, b) => b[1] - a[1])[0][0];
}

/** An expected value reads better whole once it is big enough for a decimal to be noise. */
function expectedValue(value) {
  return Math.abs(value) >= 20 ? Math.round(value).toLocaleString() : value.toFixed(1);
}

/**
 * Why the player is off par: every component of his main phase that falls on the same
 * side of expected as his points do, biggest shortfall (or surplus) first.
 *
 * Derived rather than written, so the sentence stays true when the picks change.
 */
export function explainGap(row) {
  const behind = (row.fantasy_points_over_expected ?? 0) < 0;
  const phase = dominantPhase(row);
  const components = EXPECTED_COMPONENTS[phase];

  const matching = components
    .map((component) => {
      const actual = row[component.actual];
      const expected = row[component.expected];
      if (actual == null || expected == null || expected === 0) return null;
      // Direction first, then side: fewer interceptions than expected is a surplus.
      const surplus = component.lowerIsBetter ? expected - actual : actual - expected;
      if (behind ? surplus >= 0 : surplus <= 0) return null;
      return { ...component, actual, expected, size: Math.abs(surplus) / Math.abs(expected) };
    })
    .filter(Boolean)
    .sort((a, b) => b.size - a.size);

  if (matching.length === 0) return null;

  const scope =
    matching.length === components.length
      ? `every ${phase} component`
      : `${matching.length} of ${components.length} ${phase} components`;
  const list = matching
    .map((item) => `${item.name} ${formatStat(item.actual, "int")} against ${expectedValue(item.expected)}`)
    .join(", ");
  return `${behind ? "Behind" : "Ahead of"} expected on ${scope}: ${list}.`;
}

/**
 * Put each headshot on a short leader off its exact point: try eight angles at three
 * distances and take the first that stays inside the plot and clear of the photos
 * already placed. Hand placement would only hold until the picks changed.
 *
 * The claim on the canvas is the photo **and** the two lines of text under it, which is
 * wider than the circle — reserving only the circle put one player's points-over-
 * expected on top of his neighbour's face.
 */
function placePhotos(points, box, { radius = 20, leaders = [50, 68, 86], pad = 4 } = {}) {
  const angles = [-90, -50, -130, 0, 180, 40, 140, 90];
  const rectOf = (cx, cy) => ({ x0: cx - 34, x1: cx + 34, y0: cy - radius - 1, y1: cy + 48 });
  const overlaps = (a, b) =>
    a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;
  const placed = [];

  // Loudest first, so the biggest gap gets the cleanest spot.
  [...points]
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .forEach((point) => {
      let best = null;
      let fallback = null;
      search: for (const leader of leaders) {
        for (const degrees of angles) {
          const radians = (degrees * Math.PI) / 180;
          const cx = point.x + Math.cos(radians) * leader;
          const cy = point.y + Math.sin(radians) * leader;
          const rect = rectOf(cx, cy);
          if (rect.x0 < box.x0 || rect.x1 > box.x1 || rect.y0 < box.y0 || rect.y1 > box.y1) continue;
          if (!fallback) fallback = { cx, cy };
          if (placed.every((other) => !overlaps(rectOf(other.cx, other.cy), rect))) {
            best = { cx, cy };
            break search;
          }
        }
      }
      placed.push({ ...point, ...(best ?? fallback ?? { cx: point.x, cy: point.y - leaders[0] }) });
    });

  return placed;
}

const WIDTH = 620;
const HEIGHT = 470;
const MARGIN = { left: 48, right: 18, top: 18, bottom: 42 };

export function ExpectedActualCard({ season, scoring, rows, cloud = [], headshots, isLoading, isError }) {
  const navigate = useNavigate();
  const { tip, show, hide } = useStatTooltip();

  // One scale for both axes: par is the 45° line, which is only true when the two axes
  // share a domain.
  const highest = Math.max(
    10,
    ...cloud.flatMap((point) => [point.x ?? 0, point.y ?? 0]),
    ...rows.flatMap((row) => [row.expected_fantasy_points ?? 0, row.fantasy_points ?? 0]),
  );
  const max = Math.ceil(highest / 20) * 20;
  const x = (value) => MARGIN.left + (value / max) * (WIDTH - MARGIN.left - MARGIN.right);
  const y = (value) => HEIGHT - MARGIN.bottom - (value / max) * (HEIGHT - MARGIN.top - MARGIN.bottom);
  const box = { x0: MARGIN.left, x1: WIDTH - MARGIN.right, y0: MARGIN.top, y1: HEIGHT - MARGIN.bottom };
  const ticks = Array.from({ length: max / 20 + 1 }, (_, index) => index * 20);

  const toneOf = (row) => ((row.fantasy_points_over_expected ?? 0) < 0 ? COLD : HOT);
  const markers = placePhotos(
    rows.map((row) => ({
      row,
      x: x(row.expected_fantasy_points),
      y: y(Math.min(row.fantasy_points, max)),
      value: row.fantasy_points_over_expected,
    })),
    box,
  );

  return (
    <Card>
      <CardHead title="Expected vs Actual" sub={`${season} · ${scoringLabel(scoring)}`} />
      <p className="mb-3 text-[11.5px] leading-relaxed text-muted">
        Players scoring above or below expectations based on opportunity
      </p>

      <CardState isLoading={isLoading} isError={isError} isEmpty={rows.length === 0} rows={6} />

      {rows.length > 0 && (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            width="100%"
            className="block max-w-full"
            role="img"
            aria-label={`Actual fantasy points against expected fantasy points, ${season}`}
          >
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={x(tick)} y1={MARGIN.top} x2={x(tick)} y2={HEIGHT - MARGIN.bottom}
                      style={{ stroke: "var(--divider)", strokeWidth: 1 }} />
                <line x1={MARGIN.left} y1={y(tick)} x2={WIDTH - MARGIN.right} y2={y(tick)}
                      style={{ stroke: "var(--divider)", strokeWidth: 1 }} />
                <text x={x(tick)} y={HEIGHT - MARGIN.bottom + 17} textAnchor="middle"
                      style={{ fill: "var(--faint)", font: "500 10px Inter, sans-serif" }}>{tick}</text>
                <text x={MARGIN.left - 9} y={y(tick) + 3.5} textAnchor="end"
                      style={{ fill: "var(--faint)", font: "500 10px Inter, sans-serif" }}>{tick}</text>
              </g>
            ))}

            <line x1={x(0)} y1={y(0)} x2={x(max)} y2={y(max)}
                  style={{ stroke: "var(--plot-rule)", strokeWidth: 1.5, strokeDasharray: "5 4" }} />
            <text x={x(max) - 5} y={y(max) + 17} textAnchor="end"
                  style={{ fill: "var(--muted)", font: "600 10px Inter, sans-serif" }}>par</text>

            {cloud.map((point) => (
              <circle key={point.player_id} cx={x(Math.min(point.x, max))} cy={y(Math.min(point.y, max))} r={2.5}
                      style={{ fill: "var(--faint)", opacity: 0.3 }} />
            ))}

            {markers.map(({ row, x: px, y: py, cx, cy }) => {
              const tone = toneOf(row);
              const clipId = `expected-actual-${row.player_id.replace(/[^a-z0-9]/gi, "")}`;
              const open = (event) =>
                show(event.currentTarget, {
                  label: row.name,
                  short: `${row.position} · ${row.team_abbreviation}`,
                  description: explainGap(row) ?? "Scoring in line with the opportunity.",
                  hint: "Open player page",
                });
              return (
                <g
                  key={row.player_id}
                  tabIndex={0}
                  role="button"
                  aria-label={`${row.name}, ${formatSigned(row.fantasy_points_over_expected, 1)} points over expected`}
                  className="cursor-pointer focus:outline-none"
                  onMouseEnter={open}
                  onFocus={open}
                  onMouseLeave={hide}
                  onBlur={hide}
                  onClick={() => navigate(`/players/${row.player_id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") navigate(`/players/${row.player_id}`);
                  }}
                >
                  <defs>
                    <clipPath id={clipId}>
                      <circle cx={cx} cy={cy} r={20} />
                    </clipPath>
                  </defs>
                  {/* The leader to the photo, and a dashed drop to par so the gap is a length. */}
                  <line x1={px} y1={py} x2={cx} y2={cy} style={{ stroke: tone, strokeWidth: 1.3, opacity: 0.75 }} />
                  <line x1={px} y1={py} x2={px} y2={y(row.expected_fantasy_points)}
                        style={{ stroke: tone, strokeWidth: 1.3, strokeDasharray: "2 2", opacity: 0.85 }} />
                  <circle cx={cx} cy={cy} r={20} style={{ fill: "var(--surface-solid)" }} />
                  {headshots?.[row.player_id] && (
                    <image href={headshots[row.player_id]} x={cx - 20} y={cy - 21} width={40} height={42}
                           clipPath={`url(#${clipId})`} preserveAspectRatio="xMidYMin slice" />
                  )}
                  <circle cx={cx} cy={cy} r={20} style={{ fill: "none", stroke: tone, strokeWidth: 2.5 }} />
                  <circle cx={px} cy={py} r={3.5}
                          style={{ fill: tone, stroke: "var(--surface-solid)", strokeWidth: 1.2 }} />
                  <text x={cx} y={cy + 33} textAnchor="middle"
                        style={{ fill: "var(--fg)", font: "600 10.5px Inter, sans-serif" }}>
                    {row.name.split(" ").slice(-1)[0]}
                  </text>
                  <text x={cx} y={cy + 44} textAnchor="middle"
                        style={{ fill: tone, font: "700 10px 'JetBrains Mono', monospace" }}>
                    {formatSigned(row.fantasy_points_over_expected, 1)}
                  </text>
                </g>
              );
            })}

            <text x={(MARGIN.left + WIDTH - MARGIN.right) / 2} y={HEIGHT - 6} textAnchor="middle"
                  style={{ fill: "var(--muted)", font: "600 10.5px Inter, sans-serif" }}>Expected points</text>
            <text transform={`translate(14 ${(MARGIN.top + HEIGHT - MARGIN.bottom) / 2}) rotate(-90)`}
                  textAnchor="middle"
                  style={{ fill: "var(--muted)", font: "600 10.5px Inter, sans-serif" }}>Actual points</text>
          </svg>

          <div className="grid gap-2">
            {[...rows]
              .sort((a, b) => a.fantasy_points_over_expected - b.fantasy_points_over_expected)
              .map((row) => (
                <button
                  key={row.player_id}
                  type="button"
                  onClick={() => navigate(`/players/${row.player_id}`)}
                  onMouseEnter={(event) =>
                    show(event.currentTarget, {
                      label: row.name,
                      short: `${row.position} · ${row.team_abbreviation}`,
                      description: explainGap(row) ?? "Scoring in line with the opportunity.",
                      hint: "Open player page",
                    })
                  }
                  onMouseLeave={hide}
                  className="flex items-center gap-2 rounded-xl border border-transparent px-2 py-1.5 text-left transition hover:border-edge hover:bg-surface-2/70"
                >
                  <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: toneOf(row) }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-fg">
                      {row.name} <PositionTag position={row.position} variant="quiet" />
                    </span>
                    <span className="stat-num block text-[10px] text-faint">
                      {row.team_abbreviation} · {formatStat(row.expected_fantasy_points, 1)} expected,{" "}
                      {formatStat(row.fantasy_points, 1)} actual
                    </span>
                  </span>
                  <b className="stat-num text-[11.5px] font-bold" style={{ color: toneOf(row) }}>
                    {formatSigned(row.fantasy_points_over_expected, 1)}
                  </b>
                </button>
              ))}
          </div>
        </div>
      )}

      <StatTooltip tip={tip} />
    </Card>
  );
}
