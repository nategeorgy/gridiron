// Compare's line chart (rounds six and seven): both players on the game chart's stats as
// clean lines, this season week by week (season to date), by season, or by age, with a
// card for each name on the right and a crosshair readout of both.
import { useMemo, useState } from "react";
import { usePhone } from "../../../hooks/useMediaQuery";
import { Chips } from "../../explore/common";
import { Headshot } from "../../explore/common";
import { Segmented } from "../../team/Segmented";
import { forPosition } from "../../../constants/playerPage";
import { GAME_CHART, combineGames, formatGameStat, gameStat } from "../../../constants/playerTabs";
import { Crosshair, Panel, ReadoutRow, clamp, lin, smoothPath, useSvgRef } from "./common";

const COLORS = ["var(--series-1)", "var(--series-2)"];

/** Age on 1 September of a season, from a birth date. */
function ageIn(season, birthDate) {
  if (!birthDate) return null;
  const [year, month, day] = birthDate.split("-").map(Number);
  const born = Date.UTC(year, month - 1, day);
  return (Date.UTC(season, 8, 1) - born) / (365.25 * 24 * 3600 * 1000);
}

function series(games, stat, range, season, birthDate) {
  const regular = games.filter((game) => game.season_type === "REG").sort((a, b) => a.season - b.season || a.week - b.week);
  if (range === "season") {
    const list = regular.filter((game) => game.season === season);
    const out = [];
    const seen = [];
    list.forEach((game) => {
      if (stat.parts(game)) seen.push(game);
      if (seen.length) out.push({ x: game.week, v: combineGames(stat, seen), label: `Week ${game.week}` });
    });
    return out;
  }
  const seasons = [...new Set(regular.map((game) => game.season))];
  return seasons
    .map((year) => {
      const v = combineGames(stat, regular.filter((game) => game.season === year));
      const x = range === "age" ? ageIn(year, birthDate) : year;
      return v == null || x == null ? null : { x, v, label: range === "age" ? `Age ${Math.floor(x)} (${year})` : String(year) };
    })
    .filter(Boolean);
}

export function CompareLines({ page, other }) {
  const { position, season, player, allGames, seasonLog } = page;
  const phone = usePhone();
  const config = forPosition(GAME_CHART, position);
  const [statKey, setStatKey] = useState("ppg");
  const [range, setRange] = useState("season");
  const key = config.stats.includes(statKey) ? statKey : "ppg";
  const stat = gameStat(position, key);
  const F = (value) => formatGameStat(stat, value);
  const svgRef = useSvgRef();

  const people = useMemo(() => [
    { name: player.name, headshot: player.headshot_url, birth: player.birth_date, games: allGames, color: COLORS[0] },
    ...(other ? [{ name: other.player.name, headshot: other.player.headshot_url, birth: other.player.birth_date, games: other.games, color: COLORS[1] }] : []),
  ], [player, allGames, other]);
  const lines = people.map((person) => ({ ...person, points: series(person.games, stat, range, season, person.birth) }));
  const xs = lines.flatMap((line) => line.points.map((point) => point.x));

  const w = phone ? 440 : 820;
  const h = phone ? 250 : 260;
  // The weeks still to play this season, shaded, from the first one not yet final.
  const open = range === "season" ? (seasonLog ?? []).find((slot) => slot.row_kind === "scheduled" && !slot.final)?.week : null;
  const L = 46, R = 18, T = 18, B = 30;
  const domain = range === "season" ? [1, 18] : xs.length ? [Math.floor(Math.min(...xs)), Math.ceil(Math.max(...xs))] : [0, 1];
  if (domain[0] === domain[1]) domain[1] += 1;
  const x = lin(domain[0], domain[1], L, w - R);
  const [d0, d1] = stat.axis;
  const y = lin(d0, d1, h - B, T);
  const yc = (value) => clamp(y(value), T, h - B);
  const ticksX = range === "season"
    ? Array.from({ length: 18 }, (_, index) => index + 1).filter((week) => !phone || week % 2 === 1)
    : Array.from({ length: domain[1] - domain[0] + 1 }, (_, index) => domain[0] + index);

  const stopXs = [...new Set(xs.map((value) => +value.toFixed(3)))].sort((a, b) => a - b);
  const stops = stopXs.map((at) => {
    const rows = [];
    const lines_ = [];
    lines.forEach((line) => {
      const hit = line.points.find((point) => Math.abs(point.x - at) < (range === "season" ? 0.01 : 0.6));
      if (!hit) return;
      rows.push({ py: yc(hit.v), color: line.color });
      lines_.push(<ReadoutRow key={line.name} color={line.color} label={line.name} value={F(hit.v)} />);
    });
    const label = lines.flatMap((line) => line.points).find((point) => Math.abs(point.x - at) < 0.6)?.label ?? "";
    return { px: x(at), rows, content: <div><div className="mb-1 font-semibold text-fg">{range === "season" ? `Week ${Math.round(at)}` : label}</div>{lines_}</div> };
  });

  return (
    <Panel
      title={key === "ppg" ? "Points per game" : stat.label}
      sub={range === "season" ? `${season} · each line is that player's average to date. Hover to read both` : range === "age" ? "Each season at the player's age that September. Hover to read both" : "Each season's number. Hover to read both"}
      controls={<Segmented options={[{ value: "season", label: String(season) }, { value: "seasons", label: "By season" }, { value: "age", label: "By age" }]} value={range} onChange={setRange} label="Range" />}
    >
      <div className="mb-3">
        <Chips options={config.stats.map((id) => ({ value: id, label: gameStat(position, id).pill }))} value={key} onChange={setStatKey} label="Stat" />
      </div>
      <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
        <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} className="block h-auto w-full" role="img" aria-label="Both players">
          {stat.ticks.map((tick) => (
            <g key={tick}>
              <line x1={L} x2={w - R} y1={y(tick)} y2={y(tick)} stroke="var(--divider)" />
              <text x={L - 8} y={y(tick) + 3.5} textAnchor="end" fontSize="10" fill="var(--faint)" className="stat-num">{F(tick).replace(/\.0+$/, "")}</text>
            </g>
          ))}
          {open != null && open <= 18 && (
            <g>
              <rect x={x(open - 0.5)} y={T} width={Math.max(0, w - R - x(open - 0.5))} height={h - B - T} fill="color-mix(in srgb, var(--fg) 4%, transparent)" />
              <text x={(x(open - 0.5) + w - R) / 2} y={T + 14} textAnchor="middle" fontSize="10.5" fill="var(--faint)">
                {open === 18 ? "Week 18 to play" : `Weeks ${open}-18 to play`}
              </text>
            </g>
          )}
          {d0 < 0 && d1 > 0 && <line x1={L} x2={w - R} y1={y(0)} y2={y(0)} stroke="var(--plot-rule)" strokeOpacity="0.5" />}
          {ticksX.map((tick) => (
            <text key={tick} x={x(tick)} y={h - B + 16} textAnchor="middle" fontSize="10" fill="var(--faint)" className="stat-num">
              {range === "seasons" && phone ? `'${String(tick).slice(2)}` : tick}
            </text>
          ))}
          <defs><clipPath id="cmp-clip"><rect x={L - 6} y={T} width={w - L - R + 12} height={h - B - T} /></clipPath></defs>
          {lines.map((line) => {
            const runs = [[]];
            line.points.forEach((point, index) => {
              if (index && range !== "season" && point.x - line.points[index - 1].x > 1.6) runs.push([]);
              runs[runs.length - 1].push([x(point.x), y(point.v)]);
            });
            const last = line.points[line.points.length - 1];
            return (
              <g key={line.name}>
                <g clipPath="url(#cmp-clip)">
                  {runs.map((run, index) => (
                    <path key={index} d={smoothPath(run)} fill="none" style={{ stroke: line.color }} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                  ))}
                  {range !== "season" && line.points.map((point) => <circle key={point.x} cx={x(point.x)} cy={y(point.v)} r="3.6" style={{ fill: line.color }} stroke="var(--surface-solid)" strokeWidth="1.6" />)}
                </g>
                {last && range === "season" && <circle cx={x(last.x)} cy={yc(last.v)} r="4.6" style={{ fill: line.color }} stroke="var(--surface-solid)" strokeWidth="2" />}
              </g>
            );
          })}
          <Crosshair stops={stops} box={{ w, h, L, R, T, B }} svgRef={svgRef} />
        </svg>
        <div className="space-y-2.5">
          {lines.map((line) => {
            const last = line.points[line.points.length - 1];
            return (
              <div key={line.name} className="flex items-center gap-3 rounded-2xl border border-line px-3 py-2.5" style={{ borderLeft: `3px solid ${line.color}` }}>
                <Headshot url={line.headshot} name={line.name} className="h-9 w-9 shrink-0 rounded-full" style={{ border: `2px solid ${line.color}`, background: "var(--surface-2)" }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-bold text-fg">{line.name}</div>
                  <div className="text-[11px] text-muted">{last ? last.label : "No games"}</div>
                </div>
                <span className="stat-num text-[16px] font-extrabold text-fg">{last ? F(last.v) : "-"}</span>
              </div>
            );
          })}
          {!other && <p className="text-xs text-muted">Pick a player above to add a second line.</p>}
        </div>
      </div>
    </Panel>
  );
}
