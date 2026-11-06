// The Dashboard's game chart (rounds six to eight): one stat at a time on a fixed axis.
//
// Every game hangs as a lollipop from that season's dashed line (WR24, the RB average...),
// so a game above the line reads as a good one at a glance, and his average runs through
// them as one smooth line: season to date, his last three games, or across his career a
// smoothed trend. A game past either end of the axis runs off its edge as an arrow (hover
// for the number); a game he missed is an X held at his average.
import { useMemo, useState } from "react";
import { Segmented } from "../../team/Segmented";
import { Chips, Legend } from "../../explore/common";
import { usePhone } from "../../../hooks/useMediaQuery";
import { usePlayerCareerDetail } from "../../../hooks/usePlayer";
import {
  GAME_CHART,
  combineGames,
  formatGameStat,
  gameStat,
  gameStatValue,
  lineMetrics,
  lineName,
} from "../../../constants/playerTabs";
import { forPosition } from "../../../constants/playerPage";
import { Crosshair, Panel, ReadoutRow, clamp, lin, smoothPath, useSvgRef, whereText } from "./common";

const COLOR = "var(--series-1)";

/** Every game's x and the line through them. `win`: Infinity (to date), 3, or "smooth". */
function rollGames(games, stat, win, xOf) {
  if (win === "smooth") {
    const usable = games.filter((game) => stat.parts(game));
    const sigma = 3.5;
    return usable.map((game, index) => {
      const window = [];
      const weights = [];
      for (let j = Math.max(0, index - 12); j <= Math.min(usable.length - 1, index + 12); j += 1) {
        window.push(usable[j]);
        weights.push(Math.exp(-((index - j) ** 2) / (2 * sigma * sigma)));
      }
      return { x: xOf(game), v: combineGames(stat, window, weights), gv: gameStatValue(stat, game), game };
    });
  }
  const out = [];
  const seen = [];
  for (const game of games) {
    if (stat.parts(game)) seen.push(game);
    const window = win === Infinity ? seen : seen.slice(-win);
    if (!window.length) continue;
    out.push({ x: xOf(game), v: combineGames(stat, window), gv: gameStatValue(stat, game), game });
  }
  return out;
}

function LollipopChart({ points, missed, axis, stat, refs, refLabel, lineLabel, note, compact }) {
  const svgRef = useSvgRef();
  const w = compact ? 440 : 1040;
  const h = compact ? 300 : 340;
  const L = 46;
  const R = compact ? 70 : 96;
  const T = 18;
  const B = 30;
  const [x0, x1] = axis.domain;
  const x = lin(x0, x1, L, w - R);
  const [d0, d1] = stat.axis;
  const y = lin(d0, d1, h - B, T);
  const yc = (value) => clamp(y(value), T, h - B);
  const F = (value) => formatGameStat(stat, value);
  const weekly = axis.kind === "week";

  const segments = refs.map((ref) => ({
    ...ref,
    a: weekly ? L : x(Math.max(x0, ref.season)),
    b: weekly ? w - R : x(Math.min(x1, ref.season + 1)),
  }));
  const refFor = (season) => refs.find((ref) => ref.season === season)?.value;

  // Line segments: a gap of more than a season breaks the career line.
  const runs = [[]];
  points.forEach((point, index) => {
    if (index && !weekly && point.x - points[index - 1].x > 1.2) runs.push([]);
    runs[runs.length - 1].push([x(point.x), y(point.v)]);
  });
  const last = points[points.length - 1];
  const lastRef = segments[segments.length - 1];
  const clipId = `gc-${axis.kind}`;

  const stops = [
    ...points.map((point) => {
      const ref = refFor(point.game.season);
      return {
        px: x(point.x),
        rows: [...(point.gv != null ? [{ py: yc(point.gv), color: "var(--fg)", r: 4 }] : []), { py: yc(point.v), color: COLOR }],
        content: (
          <div>
            <div className="mb-1 font-semibold text-fg">
              {weekly ? `Week ${point.game.week}` : `${point.game.season} Week ${point.game.week}`} {whereText(point.game)}
            </div>
            <ReadoutRow color="var(--muted)" label="This game" value={F(point.gv)} note={point.gv != null ? note?.(point.game) : null} />
            <ReadoutRow color={COLOR} label={lineLabel} value={F(point.v)} />
            {ref != null && <div className="stat-num mt-1 text-faint">{refLabel} {F(ref)}</div>}
          </div>
        ),
      };
    }),
    ...missed.map((miss) => ({
      px: x(miss.x),
      rows: [{ py: yc(miss.v), color: "var(--muted)" }],
      content: <div><div className="font-semibold text-fg">Week {miss.x}</div><div className="text-muted">Did not play</div></div>,
    })),
  ].sort((a, b) => a.px - b.px);

  return (
    <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} className="block h-auto w-full" role="img" aria-label={stat.label}>
      {stat.ticks.map((tick) => (
        <g key={tick}>
          <line x1={L} x2={w - R} y1={y(tick)} y2={y(tick)} stroke="var(--divider)" />
          <text x={L - 8} y={y(tick) + 3.5} textAnchor="end" fontSize="10" fill="var(--faint)" className="stat-num">{F(tick).replace(/\.0+$/, "")}</text>
        </g>
      ))}
      {d0 < 0 && d1 > 0 && <line x1={L} x2={w - R} y1={y(0)} y2={y(0)} stroke="var(--plot-rule)" strokeOpacity="0.5" />}
      {weekly ? (
        <>
          {axis.open != null && axis.open <= x1 && (
            <g>
              <rect x={x(axis.open - 0.5)} y={T} width={Math.max(0, w - R - x(axis.open - 0.5))} height={h - B - T} fill="color-mix(in srgb, var(--fg) 4%, transparent)" />
              <text x={(x(axis.open - 0.5) + w - R) / 2} y={T + 14} textAnchor="middle" fontSize="10.5" fill="var(--faint)">
                {axis.open === x1 ? `Week ${x1} to play` : `Weeks ${axis.open}-${x1} to play`}
              </text>
            </g>
          )}
          {Array.from({ length: x1 - x0 + 1 }, (_, index) => x0 + index).map((week) => (
            <text key={week} x={x(week)} y={h - B + 16} textAnchor="middle" fontSize="10" fill="var(--faint)" className="stat-num">
              {axis.byes?.includes(week) ? "Bye" : compact && week % 2 === 0 ? "" : week}
            </text>
          ))}
        </>
      ) : (
        Array.from({ length: x1 - x0 }, (_, index) => x0 + index).map((season) => (
          <g key={season}>
            <line x1={x(season)} x2={x(season)} y1={T} y2={h - B} stroke="var(--divider)" />
            <text x={x(season + 0.5)} y={h - B + 16} textAnchor="middle" fontSize="10.5" fontWeight="650" fill="var(--muted)" className="stat-num">
              {compact && x1 - x0 > 6 ? `'${String(season).slice(2)}` : season}
            </text>
          </g>
        ))
      )}
      {segments.map((ref) => (
        <line key={ref.season} x1={ref.a} x2={ref.b} y1={yc(ref.value)} y2={yc(ref.value)} stroke="var(--muted)" strokeOpacity="0.85" strokeDasharray="6 4" strokeWidth="1.4" />
      ))}
      {points.map((point, index) => {
        if (point.gv == null) return null;
        const base = refFor(point.game.season);
        const cx = x(point.x);
        const over = point.gv > d1 ? 1 : point.gv < d0 ? -1 : 0;
        const cy = yc(point.gv);
        const edge = over > 0 ? T - 6 : h - B + 6;
        const size = weekly ? 4.2 : 3.2;
        return (
          <g key={index}>
            {base != null && (
              <line x1={cx} x2={cx} y1={yc(base)} y2={over ? edge : cy} stroke="var(--muted)" strokeOpacity={over ? 0.7 : 0.42} strokeWidth="1.2" />
            )}
            {over ? (
              <path d={`M${cx - size},${edge + over * size * 1.4}L${cx + size},${edge + over * size * 1.4}L${cx},${edge}Z`} fill="var(--muted)" />
            ) : (
              <circle cx={cx} cy={cy} r={weekly ? 3.6 : 2.6} fill="var(--muted)" fillOpacity="0.9" />
            )}
          </g>
        );
      })}
      <defs>
        <clipPath id={clipId}><rect x={L - 4} y={T} width={w - L - R + 8} height={h - B - T} /></clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {runs.map((run, index) => (
          <path key={index} d={smoothPath(run)} fill="none" style={{ stroke: COLOR }} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </g>
      {missed.map((miss) => {
        const cx = x(miss.x);
        const cy = yc(miss.v);
        return <path key={miss.x} d={`M${cx - 4},${cy - 4}L${cx + 4},${cy + 4}M${cx + 4},${cy - 4}L${cx - 4},${cy + 4}`} stroke="var(--fg)" strokeOpacity="0.7" strokeWidth="1.8" strokeLinecap="round" />;
      })}
      {last && (
        <g>
          <circle cx={x(last.x)} cy={yc(last.v)} r="5" style={{ fill: COLOR }} stroke="var(--surface-solid)" strokeWidth="2" />
          <text
            x={x(last.x) > w - R - 30 ? x(last.x) - 9 : x(last.x) + 9}
            y={yc(last.v) - 9}
            textAnchor={x(last.x) > w - R - 30 ? "end" : "start"}
            fontSize="12.5"
            fontWeight="800"
            className="stat-num"
            style={{ fill: COLOR }}
          >
            {F(last.v)}
          </text>
        </g>
      )}
      {lastRef && (
        <text x={w - R + 8} y={yc(lastRef.value) + 3.5} fontSize="10.5" fontWeight="700" fill="var(--muted)" className="stat-num">
          {refLabel} {F(lastRef.value)}
        </text>
      )}
      <Crosshair stops={stops} box={{ w, h, L, R, T, B }} svgRef={svgRef} />
    </svg>
  );
}

function LollipopIcon() {
  return (
    <svg width="12" height="16" viewBox="0 0 12 16" aria-hidden="true">
      <line x1="6" x2="6" y1="15" y2="5" stroke="var(--muted)" strokeWidth="1.4" />
      <circle cx="6" cy="4" r="3" fill="var(--muted)" />
    </svg>
  );
}

/** @param page  the player page's shared data (allGames, seasonLog, position, season...) */
export function GameChart({ page }) {
  const { position, playerId, scoring, allGames, seasonLog, season, careerSeasons } = page;
  const phone = usePhone();
  const config = forPosition(GAME_CHART, position);
  const [statKey, setStatKey] = useState("ppg");
  const [range, setRange] = useState("season");
  const [mode, setMode] = useState("std");
  const key = config.stats.includes(statKey) ? statKey : "ppg";
  const stat = gameStat(position, key);
  const kind = config.lines[key];
  const refLabel = lineName(position, kind, config.rank, true);

  const detail = usePlayerCareerDetail(playerId, scoring, { lines: lineMetrics(position), lineRank: config.rank });
  const lines = useMemo(() => {
    const out = {};
    for (const entry of detail.data?.data ?? []) out[entry.season] = entry.lines ?? {};
    return out;
  }, [detail.data]);
  const refValue = (s) => lines[s]?.[stat.metric]?.[kind] ?? null;

  const previous = careerSeasons.find((entry) => entry.season < season)?.season;
  const regular = useMemo(() => allGames.filter((game) => game.season_type === "REG").sort((a, b) => a.season - b.season || a.week - b.week), [allGames]);
  const finishNote = key === "ppg" ? (game) => (game.position_rank ? `${position}${game.position_rank}` : null) : null;

  let chart;
  let sub;
  let lineLabel;
  if (range === "career") {
    const seasons = [...new Set(regular.map((game) => game.season))];
    const points = rollGames(regular, stat, "smooth", (game) => game.season + (game.week - 0.5) / 19);
    lineLabel = "Trend";
    sub = seasons.length
      ? `Every game since ${seasons[0]}. The line is the trend, a smoothed average of the games around each one. Hover for any game`
      : "";
    chart = points.length ? (
      <LollipopChart
        points={points}
        missed={[]}
        axis={{ kind: "season", domain: [seasons[0], seasons[seasons.length - 1] + 1] }}
        stat={stat}
        refs={seasons.map((s) => ({ season: s, value: refValue(s) })).filter((ref) => ref.value != null)}
        refLabel={refLabel}
        lineLabel={lineLabel}
        note={finishNote}
        compact={phone}
      />
    ) : null;
  } else {
    const which = range === "previous" && previous ? previous : season;
    const games = regular.filter((game) => game.season === which);
    const points = rollGames(games, stat, mode === "l3" ? 3 : Infinity, (game) => game.week);
    const log = which === season ? seasonLog : [];
    const played = new Set(games.map((game) => game.week));
    const missed = log
      .filter((slot) => slot.row_kind === "scheduled" && slot.final && !played.has(slot.week))
      .map((slot) => ({ x: slot.week, v: (points.filter((point) => point.x < slot.week).pop() ?? points[0])?.v }))
      .filter((miss) => miss.v != null);
    const lastWeek = Math.max(18, ...games.map((game) => game.week));
    const open = log.find((slot) => slot.row_kind === "scheduled" && !slot.final)?.week;
    lineLabel = mode === "l3" ? "Last 3 games" : "Season to date";
    sub = `${which} · the line is ${mode === "l3" ? "the average over the last three games" : "the average to date"}, the dashed line the ${lineName(position, kind, config.rank)} that season. Hover for any game`;
    chart = points.length ? (
      <LollipopChart
        points={points}
        missed={missed}
        axis={{ kind: "week", domain: [1, lastWeek], open, byes: log.filter((slot) => slot.row_kind === "bye").map((slot) => slot.week) }}
        stat={stat}
        refs={refValue(which) != null ? [{ season: which, value: refValue(which) }] : []}
        refLabel={refLabel}
        lineLabel={lineLabel}
        note={finishNote}
        compact={phone}
      />
    ) : null;
  }

  const rangeOptions = [
    { value: "season", label: String(season) },
    ...(previous ? [{ value: "previous", label: String(previous) }] : []),
    { value: "career", label: "Career" },
  ];

  return (
    <Panel title={key === "ppg" ? "Points per game" : stat.label} sub={sub}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Chips options={config.stats.map((id) => ({ value: id, label: gameStat(position, id).pill }))} value={key} onChange={setStatKey} label="Stat" />
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Segmented options={rangeOptions} value={range} onChange={setRange} label="Range" />
        {range !== "career" && (
          <Segmented options={[{ value: "std", label: "Season to date" }, { value: "l3", label: "Last 3 games" }]} value={mode} onChange={setMode} label="Line" />
        )}
      </div>
      {chart ?? <p className="py-12 text-center text-sm text-muted">No games with {stat.label.toLowerCase()} in this range.</p>}
      <Legend items={[{ key: "line", color: COLOR, label: lineLabel }]}>
        <span className="inline-flex items-center gap-1.5"><LollipopIcon />One game, hanging from the dashed line</span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block w-[18px] border-t-[1.5px] border-dashed" style={{ borderColor: "var(--muted)" }} />
          {lineName(position, kind, config.rank)} that season
        </span>
      </Legend>
    </Panel>
  );
}
