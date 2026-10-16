// The game page's charts, all plain SVG scaled to their card.
//
// Each draws one box at desktop width and a narrower one on a phone (usePhone), rather
// than shrinking the desktop box, which set 11px labels at 4px. Team colours come from
// colors.js through the `colors` prop ({ away, home }); text in a team colour goes
// through teamText so it reads on both themes.
import { usePhone } from "../../hooks/useMediaQuery";
import { lastName, signed } from "../../utils/explore";
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

/** Each offense's total EPA by quarter, side by side. */
export function EpaByQuarterChart({ data, away, home, colors, periods }) {
  const W = 440, H = 190, pad = { l: 36, r: 8, t: 12, b: 26 };
  const rows = { [away]: data?.[away] ?? [], [home]: data?.[home] ?? [] };
  const quarters = (rows[away].length ? rows[away] : rows[home]).map((row) => row.quarter);
  const values = [...rows[away], ...rows[home]].map((row) => Math.abs(row.epa));
  const max = Math.max(4, ...values);
  const y = lin(-max, max, H - pad.b, pad.t);
  const band = (W - pad.l - pad.r) / Math.max(quarters.length, 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="EPA by quarter">
      {[-max, 0, max].map((v) => (
        <text key={v} x={pad.l - 6} y={y(v) + 3} textAnchor="end" fontSize="9.5" fill="var(--faint)" fontFamily={MONO}>{signed(Math.round(v), 0)}</text>
      ))}
      <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="var(--plot-rule)" />
      {quarters.map((quarter, index) => (
        <g key={quarter}>
          {[away, home].map((team, side) => {
            const row = rows[team].find((entry) => entry.quarter === quarter);
            if (!row) return null;
            const x0 = pad.l + index * band + band * 0.16 + side * band * 0.34;
            return (
              <rect key={team} x={x0} y={Math.min(y(0), y(row.epa))} width={band * 0.3} height={Math.max(1, Math.abs(y(row.epa) - y(0)))} rx="2"
                fill={side ? colors.home : colors.away}>
                <title>{`${team} ${periodLabel(quarter, periods)}: ${signed(row.epa, 1)} EPA on ${row.plays} plays`}</title>
              </rect>
            );
          })}
          <text x={pad.l + index * band + band / 2} y={H - 8} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="var(--faint)">{periodLabel(quarter, periods)}</text>
        </g>
      ))}
    </svg>
  );
}

/** Points scored against points expected, one row per player. */
export function ExpectedDumbbell({ players, logos }) {
  const phone = usePhone();
  const rows = players.filter((p) => p.expected_fantasy_points !== null && (p.fantasy_points >= 3 || p.expected_fantasy_points >= 4));
  if (!rows.length) return null;
  const W = phone ? 380 : 640, rowH = 25;
  const pad = { l: phone ? 112 : 150, r: 54, t: 22, b: 6 };
  const H = pad.t + rows.length * rowH + pad.b;
  const top = Math.ceil(Math.max(...rows.map((p) => Math.max(p.fantasy_points, p.expected_fantasy_points))) / 10) * 10;
  const x = lin(0, top, pad.l, W - pad.r);
  const ticks = [];
  for (let v = 0; v <= top; v += 10) ticks.push(v);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Fantasy points against expected points">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={x(v)} x2={x(v)} y1={pad.t - 6} y2={H - pad.b} stroke="var(--divider)" />
          <text x={x(v)} y={pad.t - 10} textAnchor="middle" fontSize="9.5" fill="var(--faint)" fontFamily={MONO}>{v}</text>
        </g>
      ))}
      {rows.map((player, index) => {
        const yy = pad.t + index * rowH + rowH / 2;
        const diff = player.fantasy_points - player.expected_fantasy_points;
        const color = diff >= 0 ? "var(--pos)" : "var(--neg)";
        return (
          <g key={player.player_id}>
            {logos?.[player.team] && <image href={logos[player.team]} x="0" y={yy - 8} width="16" height="16" />}
            <text x="22" y={yy + 4} fontSize="12" fontWeight="600" fill="var(--fg)">{phone ? lastName(player.name) : player.name}</text>
            <line x1={x(player.expected_fantasy_points)} x2={x(player.fantasy_points)} y1={yy} y2={yy} stroke={color} strokeWidth="3" strokeOpacity="0.55" />
            <circle cx={x(player.expected_fantasy_points)} cy={yy} r="4.5" fill="var(--surface-solid)" stroke="var(--muted)" strokeWidth="1.6" />
            <circle cx={x(player.fantasy_points)} cy={yy} r="5.5" fill={color} />
            <text x={W - 4} y={yy + 4} textAnchor="end" fontSize="11.5" fontWeight="700" fontFamily={MONO}
              fill={`color-mix(in srgb, ${color} 72%, var(--fg))`}>{signed(diff, 1)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export const BREAKDOWN_PARTS = [
  { key: "catches", label: "Catches", color: "var(--series-1)" },
  { key: "receiving_yards", label: "Receiving yards", color: "var(--series-3)" },
  { key: "rushing_yards", label: "Rushing yards", color: "var(--series-2)" },
  { key: "passing_yards", label: "Passing yards", color: "var(--series-4)" },
  { key: "touchdowns", label: "Touchdowns", color: "var(--series-5)" },
];

/** Each player's points as a stack of where they came from; turnovers run left of zero. */
export function PointsBreakdownChart({ players }) {
  const phone = usePhone();
  if (!players.length) return null;
  const W = phone ? 380 : 640, rowH = 25;
  const pad = { l: phone ? 112 : 150, r: 46, t: 6, b: 4 };
  const H = pad.t + players.length * rowH + pad.b;
  const positive = (p) => BREAKDOWN_PARTS.reduce((sum, part) => sum + Math.max(0, p.breakdown[part.key] + (part.key === "touchdowns" ? Math.max(0, p.breakdown.other) : 0)), 0);
  const low = Math.min(0, ...players.map((p) => p.breakdown.turnovers));
  const high = Math.max(...players.map(positive), 1);
  const x = lin(low, high, pad.l, W - pad.r);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Where each player's points came from">
      {players.map((player, index) => {
        const yy = pad.t + index * rowH;
        let running = 0;
        return (
          <g key={player.player_id}>
            <text x="0" y={yy + 16} fontSize="12" fontWeight="600" fill="var(--fg)">{phone ? lastName(player.name) : player.name}</text>
            {BREAKDOWN_PARTS.map((part) => {
              // Two-point conversions and return scores are folded into touchdowns.
              const value = player.breakdown[part.key] + (part.key === "touchdowns" ? Math.max(0, player.breakdown.other) : 0);
              if (value <= 0.05) return null;
              const start = running;
              running += value;
              return (
                <rect key={part.key} x={x(start)} y={yy + 4} width={x(running) - x(start)} height={rowH - 8} fill={part.color}>
                  <title>{`${part.label}: ${value.toFixed(1)}`}</title>
                </rect>
              );
            })}
            {player.breakdown.turnovers < 0 && (
              <rect x={x(player.breakdown.turnovers)} y={yy + 4} width={x(0) - x(player.breakdown.turnovers)} height={rowH - 8} fill="var(--neg)" fillOpacity="0.75">
                <title>{`Turnovers: ${player.breakdown.turnovers.toFixed(1)}`}</title>
              </rect>
            )}
            <text x={x(running) + 6} y={yy + 16} fontSize="11.5" fontWeight="700" fill="var(--fg)" fontFamily={MONO}>{player.fantasy_points.toFixed(1)}</text>
          </g>
        );
      })}
      <line x1={x(0)} x2={x(0)} y1="0" y2={H} stroke="var(--plot-rule)" />
    </svg>
  );
}

/**
 * Every drive as a bar from where it started to where it ended, all running toward the
 * end zone on the right. Scoring drives are solid, the rest outlined.
 */
export function DriveChart({ drives, colors, away, logos, periods }) {
  const phone = usePhone();
  if (!drives?.length) return null;
  const W = phone ? 380 : 1320, rowH = 26;
  const pad = phone ? { l: 70, r: 64, t: 26, b: 8 } : { l: 132, r: 300, t: 26, b: 8 };
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
          {(!phone || yard % 20 === 10 || yard === 50) && (
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
            {logos?.[drive.team] && <image href={logos[drive.team]} x="2" y={yy + 4} width="18" height="18" />}
            <text x="26" y={yy + 17} fontSize="11.5" fontWeight="600" fill="var(--muted)" fontFamily={MONO}>{clock}</text>
            <rect x={Math.min(start, finish)} y={yy + 6.5} width={Math.max(3, Math.abs(finish - start))} height={rowH - 13} rx="4"
              fill={scored ? color : "var(--surface-2)"} stroke={color} strokeWidth="1.4">
              <title>{`${drive.team} · ${drive.result} · ${drive.plays} plays, ${drive.yards} yards, ${top}`}</title>
            </rect>
            <circle cx={start} cy={yy + rowH / 2} r="3" fill="var(--fg)" />
            <text x={x(108) + 10} y={yy + 17} fontSize="12" fontWeight={scored ? 800 : 600} fill={scored ? "var(--fg)" : "var(--muted)"}>
              {short}{drive.points ? <tspan fill="var(--faint)" fontWeight="600">{` +${drive.points}`}</tspan> : null}
            </text>
            {!phone && (
              <text x={W - 4} y={yy + 17} textAnchor="end" fontSize="11" fill="var(--faint)" fontFamily={MONO}>{`${drive.plays} plays · ${drive.yards} yds · ${top}`}</text>
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
