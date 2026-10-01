// Team Landscape (October 2026): every team's offense against its defense, in EPA per
// play, from the same `/teams/stats` board the team pages and team leaderboards read.
//
// Defense is plotted upside down (fewer EPA allowed sits higher), so up and to the right
// is good on both sides and the top-right corner is shaded. The dashed lines are the
// league averages. Logos are nudged apart where they would overlap; the nudge is a few
// pixels and never moves a logo across an average line's side by more than that.
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHead, CardLink, CardState } from "./primitives";
import { ChartTooltip, hoverProps, useChartTooltip } from "../explore/ChartTooltip";
import { ExportImageButton } from "../explore/ExportImageButton";
import { signed } from "../../utils/explore";
import { ordinal } from "../../utils/format";

const W = 360;
const H = 300;
const PAD = { left: 30, right: 10, top: 10, bottom: 26 };
const LOGO = 20;

function layout(board) {
  const offense = board?.values?.epa?.o ?? {};
  const defense = board?.values?.epa?.d ?? {};
  const teams = (board?.teams ?? []).filter((team) => offense[team.abbreviation] && defense[team.abbreviation]);
  if (!teams.length) return null;
  const xs = teams.map((team) => offense[team.abbreviation][0]);
  const ys = teams.map((team) => defense[team.abbreviation][0]);
  const pad = 0.03;
  const [x0, x1] = [Math.min(...xs) - pad, Math.max(...xs) + pad];
  const [y0, y1] = [Math.min(...ys) - pad, Math.max(...ys) + pad];
  const x = (value) => PAD.left + ((value - x0) / (x1 - x0)) * (W - PAD.left - PAD.right);
  const y = (value) => PAD.top + ((value - y0) / (y1 - y0)) * (H - PAD.top - PAD.bottom);
  const points = teams.map((team) => ({
    team,
    off: offense[team.abbreviation],
    def: defense[team.abbreviation],
    x: x(offense[team.abbreviation][0]),
    y: y(defense[team.abbreviation][0]),
  }));
  // A few rounds of pairwise repulsion: enough to separate stacked logos without
  // letting any drift far from its own point.
  for (let round = 0; round < 60; round += 1) {
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const a = points[i];
        const b = points[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || 0.01;
        if (distance < LOGO) {
          const push = (LOGO - distance) / 2;
          a.x -= (dx / distance) * push;
          a.y -= (dy / distance) * push;
          b.x += (dx / distance) * push;
          b.y += (dy / distance) * push;
        }
      }
    }
  }
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  return { points, meanX: x(mean(xs)), meanY: y(mean(ys)) };
}

/** The plot alone, with no router or query hooks, so the image export can render it. */
export function LandscapeChart({ board, tip, onPick }) {
  const placed = useMemo(() => layout(board), [board]);
  if (!placed) return null;
  const { points, meanX, meanY } = placed;
  const label = { fontSize: 10.5, fill: "var(--faint)" };
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Offense and defense EPA per play for every team">
      <rect x={meanX} y={PAD.top} width={W - PAD.right - meanX} height={meanY - PAD.top} fill="color-mix(in srgb, var(--pos) 8%, transparent)" />
      <line x1={meanX} x2={meanX} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--plot-rule)" strokeDasharray="4 4" opacity={0.7} />
      <line x1={PAD.left} x2={W - PAD.right} y1={meanY} y2={meanY} stroke="var(--plot-rule)" strokeDasharray="4 4" opacity={0.7} />
      <text x={W - PAD.right - 4} y={PAD.top + 12} textAnchor="end" style={{ ...label, fontWeight: 600, fill: "color-mix(in srgb, var(--pos) 60%, var(--fg))" }}>
        Good offense, good defense
      </text>
      <text x={PAD.left + 4} y={H - PAD.bottom - 6} style={label}>Struggling both ways</text>
      <text x={(PAD.left + W - PAD.right) / 2} y={H - 6} textAnchor="middle" style={label}>Offense EPA per play →</text>
      <text transform={`translate(12 ${(PAD.top + H - PAD.bottom) / 2}) rotate(-90)`} textAnchor="middle" style={label}>
        Defense EPA allowed (better ↑)
      </text>
      {points.map((point) => (
        <image
          key={point.team.abbreviation}
          href={point.team.logo_url}
          x={point.x - LOGO / 2}
          y={point.y - LOGO / 2}
          width={LOGO}
          height={LOGO}
          style={onPick ? { cursor: "pointer" } : undefined}
          onClick={onPick ? () => onPick(point.team) : undefined}
          {...(tip ? hoverProps(tip, () => (
            <div>
              <b>{point.team.name ?? point.team.abbreviation}</b>
              <div className="stat-num mt-0.5 text-muted">
                Offense {signed(point.off[0], 2)} ({ordinal(point.off[1])}) · Defense {signed(point.def[0], 2)} ({ordinal(point.def[1])})
              </div>
            </div>
          )) : {})}
        />
      ))}
    </svg>
  );
}

export function TeamLandscapeCard({ board, season, isLoading, isError }) {
  const tip = useChartTooltip();
  const navigate = useNavigate();
  const ready = Boolean(board?.values?.epa);
  return (
    <Card>
      <CardHead title="Team Landscape" sub={`${season} · EPA per play`} />
      <CardState isLoading={isLoading} isError={isError} isEmpty={!ready} empty="No team stats yet." rows={6} />
      {ready && (
        <>
          <LandscapeChart board={board} tip={tip} onPick={(team) => navigate(`/teams/${team.team_id}`)} />
          <p className="mt-1 text-[10.5px] text-faint">Dashed lines: league average. Click a logo for the team page.</p>
          <ChartTooltip tip={tip} />
        </>
      )}
      <div className="mt-auto flex flex-wrap items-end justify-between gap-2">
        <CardLink to="/teams/leaderboards/efficiency">Team leaderboards</CardLink>
        {ready && (
          <ExportImageButton
            title="Every team, offense against defense"
            subtitle={`${season} · EPA per play`}
            render={() => <LandscapeChart board={board} />}
            sizes={["fit", "square"]}
          />
        )}
      </div>
    </Card>
  );
}
