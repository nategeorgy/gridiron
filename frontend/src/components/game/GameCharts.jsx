// The game page's charts, all plain SVG scaled to their card.
//
// Each draws one box at desktop width and a narrower one on a phone (usePhone), rather
// than shrinking the desktop box, which set 11px labels at 4px. Team colours come from
// colors.js through the `colors` prop ({ away, home }); text in a team colour goes
// through teamText so it reads on both themes.
import { usePhone } from "../../hooks/useMediaQuery";
import { lastName, signed } from "../../utils/explore";
import { ordinal } from "../../utils/format";
import { formatTeamStat } from "../../utils/teamStats";
import { teamText } from "./colors";

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const lin = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
const path = (points) => points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
const periodLabel = (quarter, periods) => (quarter >= 5 ? (periods > 5 ? `OT${quarter - 4}` : "OT") : `Q${quarter}`);

/** The swing markers' numbers, nudged apart where two would overlap. */
function placeMarkers(swings, x, y, mid) {
  const placed = [];
  return swings.map((swing) => {
    const cx = x(swing.elapsed);
    const natural = y(swing.home_wp);
    let cy = natural;
    while (placed.some(([px, py]) => Math.abs(px - cx) < 19 && Math.abs(py - cy) < 19)) cy += cy > mid ? -20 : 20;
    placed.push([cx, cy]);
    return { ...swing, cx, cy, natural };
  });
}

/**
 * The home team's chance to win after every play, from the market's view at kickoff.
 * Above the middle line is the home team's side, filled in its colour; below, the away
 * team's. Numbered rings mark the biggest swings and triangles every score.
 */
export function WinProbabilityChart({ winProbability, swings = [], scoring = [], away, home, colors, numbered = 5, compact = false }) {
  const phone = usePhone();
  const small = compact || phone;
  const W = small ? 380 : 900;
  const H = small ? 210 : 290;
  const pad = small ? { l: 36, r: 8, t: 14, b: 24 } : { l: 58, r: 14, t: 16, b: 30 };
  const series = winProbability?.series ?? [];
  if (!series.length) return null;
  const end = Math.max(winProbability.end, 3600);
  const x = lin(0, end, pad.l, W - pad.r);
  const y = lin(0, 1, H - pad.b, pad.t);
  const mid = y(0.5);
  const points = [[x(0), y(winProbability.pregame ?? series[0][1])], ...series.map(([t, v]) => [x(t), y(v)])];
  const area = `${path(points)}L${x(series[series.length - 1][0]).toFixed(1)},${mid}L${x(0)},${mid}Z`;
  const clip = `wp-${away}-${home}-${small ? "s" : "l"}`;
  const quarters = [["1st", 0, 900], ["2nd", 900, 1800], ["3rd", 1800, 2700], ["4th", 2700, 3600]];
  if (end > 3600) quarters.push(["OT", 3600, end]);
  const markers = placeMarkers(swings.slice(0, numbered), x, y, mid);
  const fontSize = small ? 10 : 11;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Win probability for ${home} and ${away}`}>
      <defs>
        <clipPath id={`${clip}-top`}><rect x="0" y="0" width={W} height={mid} /></clipPath>
        <clipPath id={`${clip}-bottom`}><rect x="0" y={mid} width={W} height={H - mid} /></clipPath>
      </defs>
      {[0.25, 0.75].map((v) => <line key={v} x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--divider)" />)}
      {[900, 1800, 2700, 3600].filter((t) => t < end).map((t) => (
        <line key={t} x1={x(t)} x2={x(t)} y1={pad.t} y2={H - pad.b} stroke="var(--divider)" strokeDasharray="3 3" />
      ))}
      {quarters.map(([label, a, b]) => (
        <text key={label} x={(x(a) + x(Math.min(b, end))) / 2} y={H - 8} textAnchor="middle" fontSize={fontSize} fontWeight="600" fill="var(--faint)">{label}</text>
      ))}
      <text x={pad.l - 8} y={pad.t + 9} textAnchor="end" fontSize={fontSize} fontWeight="700" fill="var(--fg)">{home}</text>
      <text x={pad.l - 8} y={mid + 4} textAnchor="end" fontSize={fontSize - 1} fill="var(--faint)">50%</text>
      <text x={pad.l - 8} y={H - pad.b - 2} textAnchor="end" fontSize={fontSize} fontWeight="700" fill="var(--fg)">{away}</text>
      <path d={area} fill={colors.home} fillOpacity="0.68" clipPath={`url(#${clip}-top)`} />
      <path d={area} fill={colors.away} fillOpacity="0.68" clipPath={`url(#${clip}-bottom)`} />
      <line x1={pad.l} x2={W - pad.r} y1={mid} y2={mid} stroke="var(--plot-rule)" />
      <path d={path(points)} fill="none" stroke="var(--fg)" strokeWidth={small ? 1.4 : 1.7} strokeLinejoin="round" />
      {scoring.map((score, index) => {
        const top = score.team === home;
        const yy = top ? pad.t - 2 : H - pad.b + 2;
        const cx = x(score.elapsed ?? 0);
        return <path key={index} d={`M${cx - 4},${yy}L${cx + 4},${yy}L${cx},${yy + (top ? 7 : -7)}Z`} fill={top ? colors.home : colors.away}><title>{score.text}</title></path>;
      })}
      {markers.map((marker, index) => (
        <g key={index}>
          {Math.abs(marker.cy - marker.natural) > 2 && <line x1={marker.cx} x2={marker.cx} y1={marker.natural} y2={marker.cy} stroke="var(--fg)" />}
          <circle cx={marker.cx} cy={marker.cy} r="9" fill="var(--surface-solid)" stroke="var(--fg)" strokeWidth="1.4" />
          <text x={marker.cx} y={marker.cy + 3.6} textAnchor="middle" fontSize="10" fontWeight="800" fill="var(--fg)">{index + 1}</text>
        </g>
      ))}
    </svg>
  );
}

/** Every possession along the game clock: the away team's on the top row, the home team's
 *  below. Scoring drives are solid, the rest outlined. */
export function PossessionStrip({ drives = [], end, away, home, colors }) {
  const phone = usePhone();
  const W = phone ? 380 : 900, H = 70;
  const total = Math.max(end ?? 3600, 3600);
  const x = lin(0, total, 0, W);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Possessions">
      {drives.map((drive, index) => {
        const next = drives[index + 1]?.elapsed ?? total;
        const top = drive.team === away;
        const yy = top ? 19 : 37;
        const scored = drive.result === "Touchdown" || drive.result === "Field goal";
        const lost = drive.result === "Turnover" || drive.result === "Opp touchdown";
        const color = top ? colors.away : colors.home;
        const label = drive.result === "Touchdown" ? "TD" : drive.result === "Field goal" ? "FG" : lost ? "TO" : drive.result === "Missed field goal" ? "MISS" : null;
        const width = Math.max(2, x(next) - x(drive.elapsed ?? 0) - 2);
        return (
          <g key={drive.drive}>
            <rect x={x(drive.elapsed ?? 0) + 1} y={yy + 0.5} width={width} height="13" rx="3" fill={scored ? color : "var(--surface-2)"} stroke={color} strokeWidth="1.2">
              <title>{`${drive.team} · ${drive.result} · ${drive.plays} plays, ${drive.yards} yards`}</title>
            </rect>
            {label && width > 14 && (
              <text x={x(drive.elapsed ?? 0) + 1 + width / 2} y={top ? 14 : 63} textAnchor="middle" fontSize="9.5" fontWeight="800"
                fill={scored ? "var(--fg)" : "var(--neg)"}>{label}</text>
            )}
          </g>
        );
      })}
      {[900, 1800, 2700, 3600].filter((t) => t < total).map((t) => (
        <line key={t} x1={x(t)} x2={x(t)} y1="15" y2="55" stroke="var(--plot-rule)" strokeDasharray="2 3" />
      ))}
    </svg>
  );
}

/** A face in a chart: the headshot clipped to a circle, ringed in the team's colour. */
function Face({ player, cx, cy, r, ring }) {
  const clip = `face-${player.player_id}-${Math.round(cx)}-${Math.round(cy)}`;
  return (
    <g>
      <clipPath id={clip}><circle cx={cx} cy={cy} r={r} /></clipPath>
      <circle cx={cx} cy={cy} r={r + 1.2} fill="var(--surface-2)" stroke={ring} strokeWidth="2" />
      {player.headshot_url && <image href={player.headshot_url} x={cx - r} y={cy - r} width={r * 2} height={r * 2} clipPath={`url(#${clip})`} preserveAspectRatio="xMidYMid slice" />}
    </g>
  );
}

/**
 * This game's points against what the player averaged coming in: the bar is the game,
 * the tick his average. `top` is shared by both teams' charts so their bars compare.
 */
export function AverageChart({ players, color, top }) {
  const phone = usePhone();
  if (!players.length) return null;
  const W = phone ? 380 : 560, rowH = 32;
  const pad = { l: phone ? 112 : 150, r: phone ? 52 : 64, t: 22, b: 4 };
  const H = pad.t + players.length * rowH + pad.b;
  const x = lin(0, top, pad.l, W - pad.r);
  const ticks = [];
  for (let v = 0; v <= top; v += 10) ticks.push(v);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Fantasy points against the player's average">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={x(v)} x2={x(v)} y1={pad.t - 6} y2={H - pad.b} stroke="var(--divider)" />
          <text x={x(v)} y={pad.t - 10} textAnchor="middle" fontSize="9.5" fill="var(--faint)" fontFamily={MONO}>{v}</text>
        </g>
      ))}
      {players.map((player, index) => {
        const mid = pad.t + index * rowH + rowH / 2;
        const has = player.games_coming_in > 0 && player.average_coming_in !== null;
        const diff = has ? player.fantasy_points - player.average_coming_in : null;
        return (
          <g key={player.player_id}>
            <title>{has
              ? `${player.name}: ${player.fantasy_points.toFixed(1)} this game, ${player.average_coming_in.toFixed(1)} a game in his ${player.games_coming_in} before it`
              : `${player.name}: ${player.fantasy_points.toFixed(1)}, his first game this season`}</title>
            <Face player={player} cx={10} cy={mid} r={9} ring={color} />
            <text x="26" y={mid + 4} fontSize="12" fontWeight="600" fill="var(--fg)">{phone || player.name.length > 17 ? lastName(player.name) : player.name}</text>
            <rect x={x(0)} y={mid - 8} width={Math.max(2, x(Math.max(0, player.fantasy_points)) - x(0))} height="16" rx="4" fill={color} fillOpacity="0.85" />
            {has && <rect x={x(Math.max(0, player.average_coming_in)) - 1.5} y={mid - 12} width="3" height="24" rx="1.5" fill="var(--fg)" />}
            {has ? (
              <text x={W - 2} y={mid + 4} textAnchor="end" fontSize="11.5" fontWeight="700" fontFamily={MONO}
                fill={`color-mix(in srgb, ${diff >= 0 ? "var(--pos)" : "var(--neg)"} 72%, var(--fg))`}>{signed(diff, 1)}</text>
            ) : (
              <text x={W - 2} y={mid + 4} textAnchor="end" fontSize="10.5" fill="var(--faint)">1st game</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

const TOUCH_ROWS = 7;

/**
 * Every target and carry one team's players got, where it happened on the game clock: a
 * row per player, circles for targets (filled when caught), squares for carries, a ring
 * in the accent for a touchdown. `end` is the game's last second, so both teams' charts
 * share one clock.
 *
 * A caller that measures its card passes `width`, and the chart draws at that size:
 * surnames below 640px, and the target and carry counts kept down to 420px. Without it,
 * the game page's two boxes.
 */
export function TouchTimeline({ touches, players, color, end, periods, seasonType, width }) {
  const phone = usePhone();
  const counts = {};
  for (const touch of touches) counts[touch.player] = (counts[touch.player] ?? 0) + 1;
  const rows = players.filter((p) => (counts[p.player_id] ?? 0) >= 2)
    .sort((a, b) => counts[b.player_id] - counts[a.player_id]).slice(0, TOUCH_ROWS);
  if (!rows.length) return null;
  const narrow = width ? width < 640 : phone;
  const showCounts = width ? width >= 420 : !phone;
  const W = width || (phone ? 380 : 1180), rowH = narrow ? 30 : 34;
  const pad = !narrow ? { l: 180, r: 120, t: 22, b: 4 } : showCounts ? { l: 112, r: 84, t: 22, b: 4 } : { l: 98, r: 8, t: 22, b: 4 };
  const H = pad.t + rows.length * rowH + pad.b;
  const total = Math.max(end, 3600);
  const x = lin(0, total, pad.l, W - pad.r);
  const quarters = [[1, 0, 900], [2, 900, 1800], [3, 1800, 2700], [4, 2700, 3600]];
  if (total > 3600) quarters.push([5, 3600, total]);
  const mark = narrow ? 4 : 5.5;
  const clock = (t) => {
    const quarter = t >= 3600 ? 5 : Math.min(4, Math.floor(t / 900) + 1);
    // A regular-season overtime is ten minutes, a playoff one fifteen.
    const overtime = seasonType === "REG" ? 600 : 900;
    const left = quarter === 5 ? overtime - ((t - 3600) % overtime) : 900 - (t - (quarter - 1) * 900);
    return `${periodLabel(quarter, periods)} ${Math.max(0, Math.floor(left / 60))}:${String(Math.max(0, Math.round(left % 60))).padStart(2, "0")}`;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Every target and carry on the game clock">
      {quarters.map(([quarter, a, b], index) => (
        <g key={quarter}>
          {index % 2 === 1 && <rect x={x(a)} y={pad.t - 4} width={x(b) - x(a)} height={H - pad.t} fill="color-mix(in srgb, var(--fg) 3.5%, transparent)" />}
          <text x={(x(a) + x(b)) / 2} y="13" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="var(--faint)">{periodLabel(quarter, periods)}</text>
        </g>
      ))}
      {rows.map((player, index) => {
        const cy = pad.t + index * rowH + rowH / 2;
        const mine = touches.filter((touch) => touch.player === player.player_id);
        const targets = mine.filter((touch) => touch.kind === "target").length;
        return (
          <g key={player.player_id}>
            <line x1={pad.l} x2={W - pad.r} y1={cy} y2={cy} stroke="var(--divider)" />
            <Face player={player} cx={12} cy={cy} r={narrow ? 9 : 11} ring={color} />
            <text x={narrow ? 26 : 30} y={cy + 4} fontSize={narrow ? 11 : 12.5} fontWeight="600" fill="var(--fg)">{narrow ? lastName(player.name) : player.name}</text>
            {showCounts && (
              <text x={W - pad.r + (narrow ? 8 : 14)} y={cy + 4} fontSize={narrow ? 10.5 : 11.5} fill="var(--muted)" fontFamily={MONO}>
                <tspan fontWeight="700" fill="var(--fg)">{targets}</tspan> tgt{narrow ? " " : " · "}<tspan fontWeight="700" fill="var(--fg)">{mine.length - targets}</tspan> car
              </text>
            )}
            {mine.map((touch, at) => {
              const cx = x(touch.t);
              const what = touch.kind === "target" ? (touch.caught ? `caught for ${touch.yards}` : "incomplete") : `carry for ${touch.yards}`;
              return (
                <g key={at}>
                  <title>{`${player.name}, ${clock(touch.t)}: ${what}${touch.td ? ", touchdown" : ""}`}</title>
                  {touch.td && <circle cx={cx} cy={cy} r={mark + 4.5} fill="none" stroke="var(--accent)" strokeWidth="2" />}
                  {touch.kind === "target" ? (
                    <circle cx={cx} cy={cy} r={mark} fill={touch.caught ? color : "var(--surface-solid)"} stroke={color} strokeWidth="1.6" />
                  ) : (
                    <rect x={cx - mark} y={cy - mark} width={mark * 2} height={mark * 2} rx="2"
                      fill={`color-mix(in srgb, ${color} 56%, var(--surface-solid))`} stroke={color} strokeWidth="1.2" />
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Every drive as a bar from where it started to where it ended, all running toward the
 * end zone on the right. Scoring drives are solid, the rest outlined.
 *
 * Like TouchTimeline, a measured `width` draws the chart at that size: below 700px the
 * rows tighten and the plays and yards column goes, since the bar already shows the yards.
 */
export function DriveChart({ drives, colors, away, logos, periods, width }) {
  const phone = usePhone();
  if (!drives?.length) return null;
  const narrow = width ? width < 700 : phone;
  const W = width || (phone ? 380 : 1320), rowH = width && narrow ? 22 : 26;
  const pad = !narrow ? { l: 132, r: 300, t: 26, b: 8 } : width ? { l: 88, r: 92, t: 24, b: 6 } : { l: 70, r: 64, t: 26, b: 8 };
  const logoSize = width && narrow ? 16 : 18;
  const textY = rowH / 2 + 4;
  const H = pad.t + drives.length * rowH + pad.b;
  const x = lin(0, 100, pad.l, W - pad.r);
  const lines = [];
  for (let yard = 10; yard < 100; yard += 10) lines.push(yard);
  let quarter = 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Drive chart">
      <rect x={x(100)} y={pad.t - 4} width={x(108) - x(100)} height={H - pad.t - pad.b + 4} fill="color-mix(in srgb, var(--accent) 14%, transparent)" />
      {lines.map((yard) => (
        <g key={yard}>
          <line x1={x(yard)} x2={x(yard)} y1={pad.t - 4} y2={H - pad.b} stroke={yard === 50 ? "var(--plot-rule)" : "var(--divider)"} />
          {(!narrow || yard % 20 === 10 || yard === 50) && (
            <text x={x(yard)} y={pad.t - 10} textAnchor="middle" fontSize="10" fill="var(--faint)" fontFamily={MONO}>{yard <= 50 ? yard : 100 - yard}</text>
          )}
        </g>
      ))}
      {drives.map((drive, index) => {
        const yy = pad.t + index * rowH;
        const divider = drive.quarter !== quarter && index > 0;
        quarter = drive.quarter;
        const scored = drive.result === "Touchdown" || drive.result === "Field goal";
        const color = drive.team === away ? colors.away : colors.home;
        const start = x(drive.start), finish = x(drive.result === "Touchdown" ? 100 : drive.end ?? drive.start);
        const short = { Touchdown: "TD", "Field goal": "FG", "Missed field goal": "Missed FG", Turnover: "TO", "Turnover on downs": "Downs", "End of half": "Half", "Opp touchdown": "Opp TD" }[drive.result] ?? drive.result;
        const clock = `${periodLabel(drive.quarter, periods)} ${(drive.clock ?? "").replace(/^0/, "")}`;
        const top = drive.seconds ? `${Math.floor(drive.seconds / 60)}:${String(drive.seconds % 60).padStart(2, "0")}` : "";
        return (
          <g key={drive.drive}>
            {divider && <line x1="0" x2={W} y1={yy} y2={yy} stroke="var(--border-strong)" />}
            {logos?.[drive.team] && <image href={logos[drive.team]} x="2" y={yy + (rowH - logoSize) / 2} width={logoSize} height={logoSize} />}
            <text x={logoSize + 8} y={yy + textY} fontSize={width && narrow ? 10.5 : 11.5} fontWeight="600" fill="var(--muted)" fontFamily={MONO}>{clock}</text>
            <rect x={Math.min(start, finish)} y={yy + rowH / 4} width={Math.max(3, Math.abs(finish - start))} height={rowH / 2} rx="4"
              fill={scored ? color : "var(--surface-2)"} stroke={color} strokeWidth="1.4">
              <title>{`${drive.team} · ${drive.result} · ${drive.plays} plays, ${drive.yards} yards, ${top}`}</title>
            </rect>
            <circle cx={start} cy={yy + rowH / 2} r="3" fill="var(--fg)" />
            <text x={x(108) + 10} y={yy + textY} fontSize={width && narrow ? 11 : 12} fontWeight={scored ? 800 : 600} fill={scored ? "var(--fg)" : "var(--muted)"}>
              {short}{drive.points ? <tspan fill="var(--faint)" fontWeight="600">{` +${drive.points}`}</tspan> : null}
            </text>
            {!narrow && (
              <text x={W - 4} y={yy + textY} textAnchor="end" fontSize="11" fill="var(--faint)" fontFamily={MONO}>{`${drive.plays} plays · ${drive.yards} yds · ${top}`}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Both teams' EPA per play game by game this season, over the league's middle half. */
export function GameTrendChart({ trend, away, home, colors, metric = "net" }) {
  const phone = usePhone();
  const series = [away, home].map((team) => ({ team, rows: trend?.[team]?.[metric] ?? [] }));
  const weeks = [...new Set(series.flatMap((s) => s.rows.map((r) => r.week)))].sort((a, b) => a - b);
  if (!weeks.length) return null;
  const W = phone ? 380 : 880, H = phone ? 230 : 240;
  const pad = { l: 44, r: 16, t: 14, b: 44 };
  const all = series.flatMap((s) => s.rows.flatMap((r) => [r.value, r.league_q25, r.league_q75]));
  const max = Math.max(0.3, ...all.filter((v) => v !== null && v !== undefined).map(Math.abs));
  const x = weeks.length > 1 ? lin(weeks[0], weeks[weeks.length - 1], pad.l + 20, W - pad.r - 20) : () => (W + pad.l) / 2;
  const y = lin(-max, max, H - pad.b, pad.t);
  const band = series.find((s) => s.rows.length)?.rows ?? [];
  const bandPath = band.length > 1
    ? `${path(band.map((r) => [x(r.week), y(r.league_q75)]))}L${band.slice().reverse().map((r) => `${x(r.week).toFixed(1)},${y(r.league_q25).toFixed(1)}`).join("L")}Z`
    : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="EPA per play by game">
      {bandPath && <path d={bandPath} fill="var(--surface-2)" />}
      {[-max / 2, 0, max / 2].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? "var(--plot-rule)" : "var(--divider)"} />
          <text x={pad.l - 8} y={y(v) + 3} textAnchor="end" fontSize="9.5" fill="var(--faint)" fontFamily={MONO}>{signed(v, 2)}</text>
        </g>
      ))}
      {series.map(({ team, rows }, index) => (
        <g key={team}>
          <path d={path(rows.map((r) => [x(r.week), y(r.value)]))} fill="none" stroke={index ? colors.home : colors.away} strokeWidth="2.5" />
          {rows.map((r) => (
            <circle key={r.week} cx={x(r.week)} cy={y(r.value)} r="4" fill={index ? colors.home : colors.away}>
              <title>{`${team} week ${r.week} ${r.home ? "vs" : "at"} ${r.opponent}: ${signed(r.value, 2)}`}</title>
            </circle>
          ))}
        </g>
      ))}
      {weeks.map((week) => (
        <g key={week}>
          <text x={x(week)} y={H - 26} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--faint)">{`W${week}`}</text>
          {series.map(({ team, rows }, index) => {
            const row = rows.find((r) => r.week === week);
            return row ? (
              <text key={team} x={x(week)} y={H - 13 + index * 10} textAnchor="middle" fontSize="8.5" fontWeight="700"
                fill={teamText(index ? colors.home : colors.away)}>{`${row.home ? "" : "@"}${row.opponent}`}</text>
            ) : null;
          })}
        </g>
      ))}
    </svg>
  );
}

// The tale of the tape's rows, in the tweet kit's order (B3), with labels short enough
// for a narrow card. The preview's own `tape` carries more; these are the ones that say
// who should move the ball.
const TAPE_ROWS = [
  ["epa", "EPA per play"],
  ["suc", "Success rate"],
  ["p_epa", "EPA per dropback"],
  ["r_epa", "EPA per run"],
  ["explosive", "Explosive rate"],
  ["pts_drive", "Points per drive"],
  ["rz_td", "Red zone TD rate"],
  ["d3", "Third down rate"],
  ["sack_rate", "Sack rate"],
];

/**
 * One offense against the defense it faces, as rank tracks (the tweet kit's B3): each
 * stat a track from 1st to last, the offense's season rank and the defense's on it, joined
 * in the colour of whichever side has the edge. `tape` is the preview's rows, `colors`
 * maps each team to its game colour, and `width` is the card's measured width.
 */
export function TapeTracks({ tape, ranked, offense, defense, colors, logos, width }) {
  if (!width) return null;
  const rows = TAPE_ROWS.map(([id, label]) => {
    const row = tape?.find((item) => item.id === id);
    return row && { ...row, short: label };
  }).filter(Boolean);
  const narrow = width < 420;
  const labelW = narrow ? 100 : 122, rankW = 36, rowH = 25, top = 18;
  const tx0 = labelW + 12, tx1 = width - rankW * 2 - 14;
  const x = lin(1, ranked, tx0, tx1);
  const H = top + rows.length * rowH + 2;
  const marker = 9.5;
  return (
    <svg viewBox={`0 0 ${width} ${H}`} className="block h-auto w-full" role="img" aria-label={`${offense} offense against ${defense} defense`}>
      <text x={tx0} y="11" fontSize="10" fontWeight="700" fill="var(--faint)">Best</text>
      <text x={tx1} y="11" textAnchor="end" fontSize="10" fontWeight="700" fill="var(--faint)">{`${ordinal(ranked)}`}</text>
      {[offense, defense].map((team, index) => (
        <text key={team} x={tx1 + 14 + rankW * index + rankW / 2} y="11" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--faint)">{team}</text>
      ))}
      {rows.map((row, index) => {
        const cy = top + index * rowH + rowH / 2;
        const off = row.o?.[offense], def = row.d?.[defense];
        const edge = off && def ? (off[1] < def[1] ? offense : def[1] < off[1] ? defense : null) : null;
        const close = off && def && Math.abs(x(off[1]) - x(def[1])) < marker * 2 + 2;
        const tip = `${row.label}: ${offense} offense ${off ? `${formatTeamStat(off[0], row.fmt)} (${ordinal(off[1])})` : "no rank"}, ${defense} defense ${def ? `${formatTeamStat(def[0], row.fmt)} (${ordinal(def[1])})` : "no rank"}`;
        return (
          <g key={row.id}>
            <title>{tip}</title>
            <text x="0" y={cy + 4} fontSize={narrow ? 11 : 11.5} fontWeight="600" fill="var(--muted)">{row.short}</text>
            <line x1={tx0} x2={tx1} y1={cy} y2={cy} stroke="var(--divider)" strokeWidth="4" strokeLinecap="round" />
            {off && def && (
              <line x1={x(off[1])} x2={x(def[1])} y1={cy} y2={cy} stroke={edge ? colors[edge] : "var(--muted)"} strokeWidth="4" strokeLinecap="round" opacity="0.85" />
            )}
            {[[defense, def, close ? 4.5 : 0], [offense, off, close ? -4.5 : 0]].map(([team, cell, dy]) => cell && (
              <g key={team}>
                <circle cx={x(cell[1])} cy={cy + dy} r={marker} fill="var(--surface-solid)" stroke={colors[team]} strokeWidth="1.8" />
                {logos?.[team] && <image href={logos[team]} x={x(cell[1]) - 6.5} y={cy + dy - 6.5} width="13" height="13" />}
              </g>
            ))}
            {[[offense, off], [defense, def]].map(([team, cell], column) => (
              <text key={team} x={tx1 + 14 + rankW * column + rankW / 2} y={cy + 4} textAnchor="middle" fontSize="11.5" fontWeight="700" fontFamily={MONO}
                fill={edge === team ? teamText(colors[team]) : "var(--fg)"}>
                {ordinal(cell?.[1])}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

