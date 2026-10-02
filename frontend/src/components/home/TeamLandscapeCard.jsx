// Team Landscape (October 2026): every team's pass rate on all plays against its pass rate
// in neutral situations, from the same `/teams/stats` board the team pages and team
// leaderboards read.
//
// Neutral is first to third down, win probability 20-80%, outside the last two minutes of
// a half, so it is the play-caller's preference with the scoreboard taken out. The
// diagonal is where the two agree: a team below it threw more than it wanted to, which
// usually means it spent the game behind, and a team above it ran more than its neutral
// rate, which usually means it was protecting a lead. The dashed lines are the league
// averages. Logos are nudged apart where they would overlap, by a few pixels at most.
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHead, CardLink, CardState } from "./primitives";
import { ChartTooltip, hoverProps, useChartTooltip } from "../explore/ChartTooltip";
import { ExportImageButton } from "../explore/ExportImageButton";
import { ordinal } from "../../utils/format";

const W = 360;
const H = 300;
const PAD = { left: 34, right: 10, top: 10, bottom: 28 };
const LOGO = 20;
const X_METRIC = "pass_rate";
const Y_METRIC = "n_pass";

const pct = (value) => `${(value * 100).toFixed(1)}%`;

function layout(board) {
  const all = board?.values?.[X_METRIC]?.o ?? {};
  const neutral = board?.values?.[Y_METRIC]?.o ?? {};
  const teams = (board?.teams ?? []).filter((team) => all[team.abbreviation]?.[0] != null && neutral[team.abbreviation]?.[0] != null);
  if (!teams.length) return null;
  const xs = teams.map((team) => all[team.abbreviation][0]);
  const ys = teams.map((team) => neutral[team.abbreviation][0]);
  // One shared range on both axes, so the diagonal is a true 45 degrees and "above the
  // line" means the same distance on either side.
  const pad = 0.02;
  const low = Math.min(...xs, ...ys) - pad;
  const high = Math.max(...xs, ...ys) + pad;
  const x = (value) => PAD.left + ((value - low) / (high - low)) * (W - PAD.left - PAD.right);
  const y = (value) => H - PAD.bottom - ((value - low) / (high - low)) * (H - PAD.top - PAD.bottom);
  const points = teams.map((team) => ({
    team,
    all: all[team.abbreviation],
    neutral: neutral[team.abbreviation],
    x: x(all[team.abbreviation][0]),
    y: y(neutral[team.abbreviation][0]),
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
  return { points, meanX: x(mean(xs)), meanY: y(mean(ys)), corner: [x(low), y(low), x(high), y(high)] };
}

/** The plot alone, with no router or query hooks, so the image export can render it. */
export function LandscapeChart({ board, tip, onPick }) {
  const placed = useMemo(() => layout(board), [board]);
  if (!placed) return null;
  const { points, meanX, meanY, corner } = placed;
  const label = { fontSize: 10.5, fill: "var(--faint)" };
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Pass rate on all plays against neutral pass rate for every team">
      <line x1={corner[0]} y1={corner[1]} x2={corner[2]} y2={corner[3]} stroke="var(--plot-rule)" strokeWidth={1.25} opacity={0.55} />
      <line x1={meanX} x2={meanX} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--plot-rule)" strokeDasharray="4 4" opacity={0.7} />
      <line x1={PAD.left} x2={W - PAD.right} y1={meanY} y2={meanY} stroke="var(--plot-rule)" strokeDasharray="4 4" opacity={0.7} />
      <text x={W - PAD.right - 4} y={PAD.top + 12} textAnchor="end" style={{ ...label, fontWeight: 600, fill: "var(--muted)" }}>
        Pass-first
      </text>
      <text x={PAD.left + 4} y={H - PAD.bottom - 6} style={{ ...label, fontWeight: 600, fill: "var(--muted)" }}>Run-first</text>
      <text x={(PAD.left + W - PAD.right) / 2} y={H - 6} textAnchor="middle" style={label}>Pass rate, all plays →</text>
      <text transform={`translate(12 ${(PAD.top + H - PAD.bottom) / 2}) rotate(-90)`} textAnchor="middle" style={label}>
        Neutral pass rate →
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
                All plays {pct(point.all[0])} ({ordinal(point.all[1])}) · Neutral {pct(point.neutral[0])} ({ordinal(point.neutral[1])})
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
  const ready = Boolean(board?.values?.[X_METRIC] && board?.values?.[Y_METRIC]);
  return (
    <Card>
      <CardHead title="Team Landscape" sub={`${season} · Pass rate`} />
      <CardState isLoading={isLoading} isError={isError} isEmpty={!ready} empty="No team stats yet." rows={6} />
      {ready && (
        <>
          <LandscapeChart board={board} tip={tip} onPick={(team) => navigate(`/teams/${team.team_id}`)} />
          <p className="mt-1 text-[10.5px] text-faint">
            Neutral: downs 1 to 3, win probability 20-80%, outside the last two minutes of a half. Below the diagonal,
            a team threw more than its neutral rate, usually from behind. Dashed lines: league average.
          </p>
          <ChartTooltip tip={tip} />
        </>
      )}
      <div className="mt-auto flex flex-wrap items-end justify-between gap-2">
        <CardLink to="/teams/leaderboards/tendencies">Team leaderboards</CardLink>
        {ready && (
          <ExportImageButton
            title="Every team's pass rate, all plays and neutral"
            subtitle={`${season} · Pass rate`}
            render={() => <LandscapeChart board={board} />}
            sizes={["fit", "square"]}
          />
        )}
      </div>
    </Card>
  );
}
