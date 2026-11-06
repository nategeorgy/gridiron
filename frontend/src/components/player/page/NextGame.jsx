// The Dashboard's Next game card (round ten, "What the opponent allows").
//
// His team's next game (records, kickoff, the line, his team's implied total and this
// week's consensus rank), then what that defense has allowed to his position in every
// game it has played: one bar per game, every player at the position on that offense
// added up. A dash inside each bar marks what the offense's most-used players at the
// position scored (two receivers, or one back, tight end or quarterback), with their faces
// beside it, so a big number reads as "who did it". The dashed line is what this defense
// allows on average; the solid one is his own points per game. Both leave a gap wherever
// they would cross a face or a label.
import { useId, useMemo } from "react";
import { Link } from "react-router-dom";
import { usePlayerNextGame } from "../../../hooks/usePlayer";
import { usePhone } from "../../../hooks/useMediaQuery";
import { ChartTooltip, hoverProps, useChartTooltip } from "../../explore/ChartTooltip";
import { ClipDef, SvgHeadshot, useClipId } from "../../explore/SvgHeadshot";
import { Legend } from "../../explore/common";
import { formatGameDateLong, formatKickoff } from "../../schedule/kickoff";
import { lastName } from "../../../utils/explore";
import { scoringLabel } from "../../../constants/scoring";
import { positionName } from "../cardParts";
import { Panel, lin, mix } from "./common";

const POSITION_WORD = { WR: "receivers", RB: "backs", TE: "tight ends", QB: "quarterbacks" };

function niceTop(value) {
  const step = value > 60 ? 20 : value > 30 ? 10 : 5;
  return Math.ceil(value / step) * step;
}

function Header({ data, team, teams }) {
  const game = data.game;
  const mine = data.is_home ? game.home : game.away;
  const theirs = data.is_home ? game.away : game.home;
  const spread = game.spread_line == null ? null : data.is_home ? game.spread_line : -game.spread_line;
  const line = spread == null ? "-" : spread > 0 ? `${mine.abbreviation} -${spread}` : spread < 0 ? `${theirs.abbreviation} -${-spread}` : "Pick'em";
  const implied = data.is_home ? game.home_implied : game.away_implied;
  const side = (block, right) => (
    <div className={`flex items-center gap-3 ${right ? "flex-row-reverse text-right" : ""}`}>
      {block.logo_url && <img src={block.logo_url} alt="" className="h-10 w-10 object-contain sm:h-11 sm:w-11" />}
      <div>
        <div className="text-[18px] font-extrabold tracking-tight text-fg">{block.abbreviation}</div>
        <div className="stat-num text-xs text-muted">{block.record ?? ""}</div>
      </div>
    </div>
  );
  const fact = (label, value, title) => (
    <div className="min-w-[64px] text-center" title={title}>
      <div className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-faint">{label}</div>
      <div className="stat-num text-[15px] font-extrabold text-fg">{value}</div>
    </div>
  );
  const consensus = data.consensus;
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-2xl border border-line px-4 py-3"
      style={{ background: `linear-gradient(100deg, ${mix(team?.color ?? "var(--accent)", 26)}, transparent 45%, transparent 55%, ${mix(teams[theirs.abbreviation]?.color ?? "var(--fg)", 26)})` }}
    >
      <div className="flex min-w-0 flex-1 items-center justify-between gap-4 sm:max-w-[560px]">
        {side(mine, false)}
        <Link to={`/games/${game.game_id}`} className="text-center transition hover:text-accent">
          <div className="text-[15px] font-extrabold text-fg">{data.is_home ? "vs" : "@"}</div>
          <div className="text-[11.5px] text-muted">
            {formatGameDateLong(game.game_date)}
            {game.kickoff_time ? ` · ${formatKickoff(game.kickoff_time)}` : ""}
          </div>
        </Link>
        {side(theirs, true)}
      </div>
      <div className="flex flex-wrap gap-2">
        {fact("Line", line)}
        {fact("Total", game.total_line ?? "-")}
        {fact(`${mine.abbreviation} implied`, implied == null ? "-" : implied.toFixed(1))}
        {fact(
          "Consensus",
          consensus?.label ?? "-",
          consensus ? `Consensus rank this week, as of ${consensus.as_of}. Best ${consensus.label.replace(/\d+/, "")}${consensus.best}, worst ${consensus.label.replace(/\d+/, "")}${consensus.worst}` : undefined,
        )}
      </div>
    </div>
  );
}

/** Text width at a font size, near enough to cut a gap for it. */
const textWidth = (text, size) => text.length * size * 0.58;

function AllowsChart({ allows, opponent, position, ppg, name, teams, scoring, compact }) {
  const tip = useChartTooltip();
  const clipId = useClipId();
  const maskId = `allows-mask${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const games = allows.games;
  const lastWeek = Math.max(...games.map((game) => game.week));
  const weeks = Array.from({ length: lastWeek }, (_, index) => index + 1);
  const w = compact ? 620 : 1040;
  const h = compact ? 300 : 340;
  const L = 40;
  const R = compact ? 16 : 168;
  const T = 30;
  const B = 46;
  const columnWidth = (w - L - R) / weeks.length;
  const top = niceTop(Math.max(...games.map((game) => game.total), allows.average ?? 0, ppg ?? 0) * 1.1);
  const y = lin(0, top, h - B, T);
  const ticks = Array.from({ length: 5 }, (_, index) => (top / 4) * index);
  const barWidth = Math.min(44, columnWidth * 0.34);
  const faceR = compact ? 10 : 13;
  const color = teams[opponent]?.color ?? "var(--series-2)";
  const surname = lastName(name);

  // Where every bar, dash, face and label goes, worked out first so the two lines across
  // the chart can leave a gap wherever they would cross a face or a label.
  const holes = [];
  const columns = weeks.map((week, index) => {
    const cx = L + columnWidth * (index + 0.5);
    const game = games.find((entry) => entry.week === week);
    if (!game) return { week, cx, game: null };
    const bx = cx - columnWidth * 0.17;
    const total = game.total.toFixed(1);
    holes.push({ x: bx - textWidth(total, 11) / 2 - 3, y: y(game.total) - 18, w: textWidth(total, 11) + 6, h: 16 });
    // Each player's face sits beside his own dash, nudged apart when two dashes are close.
    const order = game.prominent.map((player, which) => ({ player, which, at: y(Math.max(0, player.pts)) })).sort((a, b) => a.at - b.at);
    const gap = faceR * 2 + (compact ? 6 : 18);
    const bottom = h - B - faceR - (compact ? 4 : 15);
    order.forEach((entry, i) => {
      entry.fy = Math.max(T + faceR, Math.min(bottom, entry.at));
      if (i && entry.fy - order[i - 1].fy < gap) entry.fy = order[i - 1].fy + gap;
    });
    // Pushed past the floor: walk back up so the lowest face and its name stay in the chart.
    for (let i = order.length - 1; i >= 0; i -= 1) {
      order[i].fy = Math.min(order[i].fy, i === order.length - 1 ? bottom : order[i + 1].fy - gap);
    }
    const fx = bx + barWidth / 2 + faceR + 5;
    order.forEach((entry) => {
      entry.fx = fx;
      entry.label = `${lastName(entry.player.name).slice(0, 12)} ${entry.player.pts.toFixed(1)}`;
      holes.push({ cx: fx, cy: entry.fy, r: faceR + 3 });
      if (!compact) {
        const lw = textWidth(entry.label, 10);
        holes.push({ x: fx - lw / 2 - 3, y: entry.fy + faceR + 1, w: lw + 6, h: 14 });
      }
    });
    return { week, cx, bx, game, total, faces: order.sort((a, b) => a.which - b.which) };
  });

  // The two lines across the chart, labelled at the right and kept from overlapping.
  const lines = [
    { key: "avg", value: allows.average, stroke: "var(--muted)", dash: "5 4", text: compact ? "Avg" : `${opponent} average` },
    { key: "player", value: ppg, stroke: "var(--series-1)", dash: null, text: compact ? surname : `${surname}/game` },
  ].filter((line) => line.value != null);
  lines.forEach((line) => { line.ly = y(line.value) + 4; });
  if (lines.length === 2 && Math.abs(lines[0].ly - lines[1].ly) < 14) {
    const mid = (lines[0].ly + lines[1].ly) / 2;
    const [upper, lower] = lines[0].ly <= lines[1].ly ? [lines[0], lines[1]] : [lines[1], lines[0]];
    upper.ly = mid - 7;
    lower.ly = mid + 7;
  }

  return (
    <>
      <svg viewBox={`0 0 ${w} ${h}`} className="block h-auto w-full" role="img" aria-label={`What ${opponent} allows`}>
        <defs>
          <ClipDef id={clipId} />
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={w} height={h}>
            <rect x="0" y="0" width={w} height={h} fill="white" />
            {holes.map((hole, index) => (hole.r
              ? <circle key={index} cx={hole.cx} cy={hole.cy} r={hole.r} fill="black" />
              : <rect key={index} x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx="3" fill="black" />))}
          </mask>
        </defs>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={L} x2={w - R} y1={y(tick)} y2={y(tick)} stroke="var(--divider)" />
            <text x={L - 8} y={y(tick) + 3.5} textAnchor="end" fontSize="10" fill="var(--faint)" className="stat-num">{Math.round(tick)}</text>
          </g>
        ))}
        {columns.map(({ week, cx, bx, game }) => {
          if (!game) {
            return (
              <g key={week}>
                <text x={cx} y={h - B - 8} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="var(--faint)">Bye</text>
                <text x={cx} y={h - B + 18} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="var(--faint)">W{week}</text>
              </g>
            );
          }
          return (
            <g key={week}>
              <rect x={bx - barWidth / 2} y={y(game.total)} width={barWidth} height={Math.max(0, y(0) - y(game.total))} rx="6" style={{ fill: mix(color, 22), stroke: mix(color, 55) }} />
              {teams[game.offense]?.logo_url && <image href={teams[game.offense].logo_url} x={cx - 10} y={h - B + 5} width="20" height="20" />}
              <text x={cx} y={h - B + 38} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--muted)">
                W{week} {game.offense_home ? "@" : "vs"} {game.offense}
              </text>
            </g>
          );
        })}
        <g mask={`url(#${maskId})`}>
          {lines.map((line) => (
            <line key={line.key} x1={L} x2={w - R + (compact ? 0 : 8)} y1={y(line.value)} y2={y(line.value)} style={{ stroke: line.stroke }} strokeWidth="1.6" strokeDasharray={line.dash ?? undefined} />
          ))}
        </g>
        {!compact && lines.map((line) => (
          <text key={line.key} x={w - R + 14} y={line.ly} fontSize="11" fontWeight="700" style={{ fill: line.stroke }}>
            {line.text} <tspan className="stat-num" fontWeight="800">{line.value.toFixed(1)}</tspan>
          </text>
        ))}
        {columns.map(({ week, bx, game, total, faces }) => {
          if (!game) return null;
          const offenseColor = teams[game.offense]?.color ?? "var(--series-3)";
          const content = (
            <div>
              <div className="mb-1 font-semibold text-fg">Week {week}: {opponent} {game.offense_home ? "@" : "vs"} {game.offense}</div>
              <div className="text-muted">{positionName(position)} scored <b className="stat-num text-fg">{total}</b> {scoringLabel(scoring)} points ({game.count} players)</div>
              {game.prominent.map((player) => (
                <div key={player.player_id} className="stat-num text-muted">{player.name} <b className="text-fg">{player.pts.toFixed(1)}</b></div>
              ))}
              {game.others > 0.05 && <div className="stat-num text-muted">Everyone else <b className="text-fg">{game.others.toFixed(1)}</b></div>}
            </div>
          );
          return (
            <g key={week} {...hoverProps(tip, content)}>
              {/* An invisible hit area over the column, so the whole game answers a hover. */}
              <rect x={bx - barWidth / 2 - 4} y={T} width={barWidth + faceR * 2 + 16} height={h - B - T} fill="transparent" />
              {faces.map((entry) => (
                <line
                  key={`dash-${entry.player.player_id}`}
                  x1={bx - barWidth / 2 + 4}
                  x2={bx + barWidth / 2 - 4}
                  y1={y(Math.max(0, entry.player.pts))}
                  y2={y(Math.max(0, entry.player.pts))}
                  stroke="var(--fg)"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
              ))}
              <text x={bx} y={y(game.total) - 6} textAnchor="middle" fontSize="11" fontWeight="800" fill="var(--fg)" className="stat-num">{total}</text>
              {faces.map((entry) => (
                <g key={entry.player.player_id}>
                  <g transform={`translate(${entry.fx},${entry.fy})`}>
                    <SvgHeadshot url={entry.player.headshot_url} name={entry.player.name} r={faceR} ring={offenseColor} clipId={clipId} />
                  </g>
                  {!compact && (
                    <text x={entry.fx} y={entry.fy + faceR + 11} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--fg)">
                      {lastName(entry.player.name).slice(0, 12)} <tspan className="stat-num" fontWeight="800">{entry.player.pts.toFixed(1)}</tspan>
                    </text>
                  )}
                </g>
              ))}
            </g>
          );
        })}
      </svg>
      <ChartTooltip tip={tip} />
      <Legend items={[{ key: "all", color: mix(color, 40), label: `Every ${position} against ${opponent}, together` }]}>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-[2.5px] w-4 rounded" style={{ background: "var(--fg)" }} />
          {position === "WR" ? "Their two most-targeted receivers" : position === "QB" ? "Their starting quarterback" : position === "TE" ? "Their most-targeted tight end" : "Their most-used back"}
        </span>
        {ppg != null && (
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-[3px] w-4 rounded" style={{ background: "var(--series-1)" }} />
            {surname}/game, {ppg.toFixed(1)}
          </span>
        )}
        {allows.average != null && (
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block w-[18px] border-t-[1.5px] border-dashed" style={{ borderColor: "var(--muted)" }} />
            {opponent} average, {allows.average.toFixed(1)}
          </span>
        )}
      </Legend>
    </>
  );
}

export function NextGame({ page }) {
  const { playerId, scoring, position, row, player, team, teams } = page;
  const query = usePlayerNextGame(playerId, scoring);
  const compact = usePhone();
  const data = query.data;
  const opponent = useMemo(() => {
    if (!data?.game) return null;
    return (data.is_home ? data.game.away : data.game.home).abbreviation;
  }, [data]);

  if (query.isLoading) return <section className="glass-card h-[420px] animate-pulse p-5" />;
  if (!data?.game) return null;

  const allows = data.allows;
  const best = allows.games.filter((game) => game.best).map((game) => game.best.pts);
  const bestAverage = best.length ? best.reduce((a, b) => a + b, 0) / best.length : null;
  const word = POSITION_WORD[position] ?? `${position}s`;
  return (
    <Panel
      title={`Next game · ${data.game.week_label}`}
      sub={`What ${opponent} has allowed to ${word}${allows.season !== data.game.season ? ` in ${allows.season}` : " this season"}, game by game`}
    >
      <Header data={data} team={team} teams={teams} />
      <div className="mt-4">
        {allows.games.length ? (
          <AllowsChart
            allows={allows}
            opponent={opponent}
            position={position}
            ppg={row?.fantasy_ppg ?? null}
            name={player.name}
            teams={teams}
            scoring={scoring}
            compact={compact}
          />
        ) : (
          <p className="py-10 text-center text-sm text-muted">{opponent} has not played a game yet.</p>
        )}
      </div>
      {allows.games.length > 0 && (
        <p className="mt-2 text-[11.5px] text-faint">
          {opponent} has given {word} {allows.average?.toFixed(1)} {scoringLabel(scoring)} points a game
          {bestAverage != null ? `. The best ${position} against them has averaged ${bestAverage.toFixed(1)}` : ""}. Hover a game for who scored.
        </p>
      )}
    </Panel>
  );
}
