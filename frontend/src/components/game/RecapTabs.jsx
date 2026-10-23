// The recap's tabs: Summary, Box Score, Fantasy, Usage, Targets & Runs, Team Stats,
// Drives and Play-by-Play. Each takes the game header, the recap response and the two
// team colours; Targets & Runs and Team Stats also read the Explore and team-breakdown
// endpoints for the game's week, so their charts are the same ones the rest of the site
// draws.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FinishChip } from "../player/FinishChip";
import { PositionTag } from "../PositionTag";
import { RankChip } from "../team/RankChip";
import { PassDepthField } from "../team/PassDepthField";
import { RunLaneColumns } from "../team/RunLaneColumns";
import { NetworkChart, NetworkLegend, shapeNetwork } from "../explore/NetworkChart";
import { TeamTargetCard } from "../explore/TargetCard";
import { Headshot } from "../explore/common";
import { useNetwork } from "../../hooks/useExplore";
import { useGamePlays } from "../../hooks/useGames";
import { useTeamBreakdown } from "../../hooks/useTeamStats";
import { usePhone } from "../../hooks/useMediaQuery";
import { formatTeamStat } from "../../utils/teamStats";
import { signed } from "../../utils/explore";
import { ordinal } from "../../utils/format";
import { AverageChart, DriveChart, PossessionStrip, TouchTimeline, WinProbabilityChart } from "./GameCharts";
import { TeamKey } from "./GameHeader";
import { teamText } from "./colors";
import { Heat, Loading, Panel, PlayerName, TD, TH, TH_CENTER, TH_LEFT, Waiting, clockTime, int, lineText, num, pct } from "./parts";

const sides = (game) => [game.away.abbreviation, game.home.abbreviation];
const colorOf = (game, colors, team) => (team === game.away.abbreviation ? colors.away : colors.home);
const logosOf = (game) => ({ [game.away.abbreviation]: game.away.logo_url, [game.home.abbreviation]: game.home.logo_url });
const periodName = (quarter, game) => (quarter >= 5 ? ((game.periods?.length ?? 5) > 5 ? `OT${quarter - 4}` : "OT") : `Q${quarter}`);
const quarterHeading = (quarter, game) => (quarter >= 5 ? ((game.periods?.length ?? 5) > 5 ? `Overtime ${quarter - 4}` : "Overtime") : `${ordinal(quarter)} quarter`);
const shortClock = (clock) => (clock ?? "").replace(/^0(?=\d)/, "");

function NoStats() {
  return <Waiting>Stats for this game arrive with the weekly update, usually the Wednesday after it is played.</Waiting>;
}

// ------------------------------------------------------------------- Summary
function SwingList({ swings, game, colors, count = 5 }) {
  return (
    <ol className="divide-y divide-line">
      {swings.slice(0, count).map((swing, index) => {
        const towards = swing.home_delta > 0 ? game.home.abbreviation : game.away.abbreviation;
        return (
          <li key={index} className="flex items-center gap-3 py-2 text-[13px]">
            <span className="stat-num grid h-5 w-5 flex-none place-items-center rounded-full border-[1.4px] border-fg text-[10px] font-extrabold text-fg">{index + 1}</span>
            <span className="stat-num w-16 flex-none text-[11px] text-faint">{periodName(swing.quarter, game)} {shortClock(swing.clock)}</span>
            <span className="min-w-0 flex-1 font-semibold text-fg">{swing.text}</span>
            <span className="stat-num flex-none font-bold" style={{ color: teamText(colorOf(game, colors, towards)) }}>
              {towards} +{Math.round(Math.abs(swing.home_delta) * 100)}%
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function FlowFacts({ flow, game }) {
  const items = [
    ["Lead changes", flow.lead_changes],
    ["Times tied", flow.ties],
    [`Largest ${game.away.abbreviation} lead`, flow.largest_lead?.[game.away.abbreviation] ?? 0],
    [`Largest ${game.home.abbreviation} lead`, flow.largest_lead?.[game.home.abbreviation] ?? 0],
    ["Plays", flow.plays],
  ];
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-3">
      {items.map(([label, value]) => (
        <div key={label}>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-faint">{label}</div>
          <div className="stat-num text-base font-extrabold text-fg">{value}</div>
        </div>
      ))}
    </div>
  );
}

function ScoringSummary({ scoring, game, dense = false }) {
  if (!scoring.length) return <p className="py-6 text-center text-sm text-muted">No points were scored.</p>;
  const logos = logosOf(game);
  let quarter = 0;
  return (
    <div>
      {scoring.map((score, index) => {
        const heading = score.quarter !== quarter;
        quarter = score.quarter;
        const awayLead = score.team === game.away.abbreviation;
        return (
          <div key={index}>
            {heading && <div className="border-b border-line pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-faint">{quarterHeading(score.quarter, game)}</div>}
            <div className="flex items-start gap-2.5 border-b border-line py-2 last:border-0">
              {logos[score.team] && <img src={logos[score.team]} alt="" className="mt-0.5 h-5 w-5 flex-none object-contain" />}
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-fg">{score.text}</div>
                {!dense && score.drive && (
                  <div className="text-[11px] text-faint">{shortClock(score.clock)} · {score.drive.plays} plays, {score.drive.yards} yards, {clockTime(score.drive.seconds)}</div>
                )}
              </div>
              <span className="stat-num whitespace-nowrap text-xs">
                <span className={awayLead ? "font-extrabold text-fg" : "text-faint"}>{score.away_score}</span>
                {"–"}
                <span className={awayLead ? "text-faint" : "font-extrabold text-fg"}>{score.home_score}</span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const LEADERS = 5;

function GameLeaders({ recap, game }) {
  const logos = logosOf(game);
  const column = (team) => {
    // recap.players arrives sorted by fantasy points.
    const rows = recap.players.filter((p) => p.team === team).slice(0, LEADERS);
    return (
      <div key={team} className="min-w-0">
        <div className="mb-1 flex items-center gap-2 text-[12.5px] font-bold text-fg">
          {logos[team] && <img src={logos[team]} alt="" className="h-5 w-5 object-contain" />}{team}
        </div>
        {rows.map((player) => (
          <div key={player.player_id} className="flex items-center gap-2.5 border-b border-line py-2 last:border-0">
            <Headshot url={player.headshot_url} name={player.name} size={38} />
            <div className="min-w-0 flex-1">
              <Link to={`/players/${player.player_id}`} className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-fg hover:text-accent">
                <span className="truncate">{player.name}</span><PositionTag position={player.position} variant="quiet" />
              </Link>
              <div className="truncate text-[11px] text-faint">{lineText(player)}</div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="stat-num text-[15px] font-extrabold text-fg">{num(player.fantasy_points)}</span>
              <FinishChip rank={player.position_rank} position={player.position} detail={`of ${player.pool_size} that week`} />
            </div>
          </div>
        ))}
      </div>
    );
  };
  return <div className="grid gap-5 sm:grid-cols-2">{sides(game).map(column)}</div>;
}

const SPLIT_ROWS = [
  ["Total yards", "yards", int, 1],
  ["Yards per play", "yards_per_play", num, 1],
  ["EPA per play", "epa_per_play", (v) => signed(v, 2), 1],
  ["Success rate", "success_rate", (v) => pct(v), 1],
  ["Third down", (b) => `${int(b.third_down_conversions)}/${int(b.third_down_attempts)}`, null, 1, (b) => (b.third_down_attempts ? b.third_down_conversions / b.third_down_attempts : 0)],
  ["Red zone TDs", (b) => `${int(b.red_zone_tds)}/${int(b.red_zone_trips)}`, null, 1, (b) => (b.red_zone_trips ? b.red_zone_tds / b.red_zone_trips : 0)],
  ["Explosive plays", "explosive_plays", int, 1],
  ["Turnovers", "turnovers", int, -1],
  ["Time of possession", "time_of_possession", clockTime, 1],
];

function TeamSplitBars({ recap, game, colors }) {
  const [a, h] = sides(game);
  const box = recap.team_box;
  if (!box[a] || !box[h]) return <p className="py-6 text-center text-sm text-muted">Team stats arrive with the weekly update.</p>;
  // Spread down the card, which is as tall as the game leaders beside it.
  return (
    <div className="grid flex-1 content-between gap-2.5">
      {SPLIT_ROWS.map(([label, key, format, better, compare]) => {
        const text = (b) => (typeof key === "function" ? key(b) : format(b[key]));
        const value = (b) => (compare ? compare(b) : b[key] ?? 0);
        const av = value(box[a]), hv = value(box[h]);
        const total = Math.abs(av) + Math.abs(hv);
        const share = total ? (Math.abs(av) / total) * 100 : 50;
        const awayWins = better > 0 ? av > hv : av < hv, homeWins = better > 0 ? hv > av : hv < av;
        return (
          <div key={label}>
            <div className="mb-1 flex justify-between text-xs">
              <span className={`stat-num ${awayWins ? "font-extrabold text-fg" : "text-muted"}`}>{text(box[a])}</span>
              <span className="font-semibold text-muted">{label}</span>
              <span className={`stat-num ${homeWins ? "font-extrabold text-fg" : "text-muted"}`}>{text(box[h])}</span>
            </div>
            <div className="flex h-1.5 gap-[3px]">
              <span className="rounded-sm" style={{ width: `${share}%`, background: colors.away }} />
              <span className="flex-1 rounded-sm" style={{ background: colors.home }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SummaryTab({ game, recap, colors }) {
  const [a, h] = sides(game);
  const hasPlays = game.has_plays && recap.win_probability.series.length > 0;
  return (
    <div className="grid gap-4">
      {hasPlays ? (
        <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_440px]">
          <Panel title="Win probability">
            <WinProbabilityChart winProbability={recap.win_probability} swings={recap.swings} scoring={recap.scoring_plays} away={a} home={h} colors={colors} />
            <div className="mt-3"><SwingList swings={recap.swings} game={game} colors={colors} /></div>
            <div className="mt-4 border-t border-line pt-3.5"><FlowFacts flow={recap.flow} game={game} /></div>
            <div className="mt-3.5">
              <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-faint">Possessions · top row {a}, bottom row {h}</div>
              <PossessionStrip drives={recap.drives} end={recap.win_probability.end} away={a} home={h} colors={colors} />
            </div>
          </Panel>
          <Panel title="Scoring summary"><ScoringSummary scoring={recap.scoring_plays} game={game} dense /></Panel>
        </div>
      ) : (
        <Waiting>The play-by-play for this game arrives with the weekly update: win probability, scoring plays and drives appear then.</Waiting>
      )}
      {game.has_stats && (
        <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_440px]">
          <Panel title="Game leaders" sub={`Fantasy points in ${recap.scoring?.rec === 1 ? "PPR" : recap.scoring?.rec === 0.5 ? "Half-PPR" : "standard scoring"}, with the finish at the position that week`}>
            <GameLeaders recap={recap} game={game} />
          </Panel>
          <Panel title="Team stats" className="flex flex-col" right={<TeamKey teams={[{ abbreviation: a, color: colors.away }, { abbreviation: h, color: colors.home }]} />}>
            <TeamSplitBars recap={recap} game={game} colors={colors} />
          </Panel>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- Box Score
const scoringName = (scoring) => (scoring?.te_rec ? "TE premium" : scoring?.rec === 1 ? "PPR" : scoring?.rec === 0.5 ? "Half-PPR" : "Standard");

// Every phase has eleven columns, the last three snap share, points and finish. The three
// tables share one column grid, so each column lines up down the card: the same width at a
// position in every table, sized for the widest label or value any table puts there
// ("Stuffed" in the seventh, the finish chip in the last). Weights, summing to 100.
const BOX_WIDTHS = [9, 7, 7, 9, 8, 9, 12, 10, 10, 8, 11];
const PLAYER_SHARE = 24;   // percent of the table for the player column
const TIGHT = "!px-1";

// Ten-plus and stuffed runs are over designed runs, so a quarterback's one designed run is
// not a count worth showing.
const designed = (p, value) => ((p.designed_runs ?? 0) >= 3 ? value : "—");

const BOX_PHASES = [
  {
    title: "Passing",
    rows: (players) => players.filter((p) => p.attempts > 0),
    columns: [
      ["C/Att", (p) => `${p.completions}/${p.attempts}`], ["Yds", (p) => p.passing_yards],
      ["Y/A", (p) => num(p.passing_yards / p.attempts)], ["TD", (p) => p.passing_tds], ["Int", (p) => p.interceptions],
      ["Sacks", (p) => p.sacks_suffered ?? 0], ["Rate", (p) => num(p.passer_rating)], ["EPA", (p) => signed(p.passing_epa, 1)],
    ],
  },
  {
    title: "Rushing",
    rows: (players) => players.filter((p) => p.carries > 0).sort((x, y) => y.rushing_yards - x.rushing_yards),
    columns: [
      ["Car", (p) => p.carries], ["Yds", (p) => p.rushing_yards], ["Avg", (p) => num(p.rushing_yards / p.carries)],
      ["TD", (p) => p.rushing_tds], ["IN10", (p) => p.rush_att_inside_10 ?? 0], ["10+", (p) => designed(p, p.explosive_runs)],
      ["Stuffed", (p) => designed(p, p.stuffed_runs)], ["Rush %", (p) => pct(p.rush_attempt_share)],
    ],
  },
  {
    title: "Receiving",
    rows: (players) => players.filter((p) => p.targets > 0).sort((x, y) => y.receiving_yards - x.receiving_yards),
    columns: [
      ["Tgt", (p) => p.targets], ["Rec", (p) => p.receptions], ["Yds", (p) => p.receiving_yards],
      ["Y/Rec", (p) => (p.receptions ? num(p.receiving_yards / p.receptions) : "—")], ["TD", (p) => p.receiving_tds],
      ["aDOT", (p) => num(p.adot)], ["RZ Tgt", (p) => p.red_zone_targets ?? 0], ["Tgt %", (p) => pct(p.target_share)],
    ],
  },
];

function BoxTable({ phase, players }) {
  const rows = phase.rows(players);
  if (!rows.length) return null;
  const columns = [
    ...phase.columns,
    ["Snap %", (p) => pct(p.snap_share)],
    ["FPTS", (p) => <span className="font-bold">{num(p.fantasy_points)}</span>],
    ["Finish", (p) => <FinishChip rank={p.position_rank} position={p.position} detail={`of ${p.pool_size} that week`} />],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] table-fixed border-collapse text-[12.5px]">
        <colgroup>
          <col style={{ width: `${PLAYER_SHARE}%` }} />
          {BOX_WIDTHS.map((weight, index) => <col key={index} style={{ width: `${(weight * (100 - PLAYER_SHARE)) / 100}%` }} />)}
        </colgroup>
        <thead>
          <tr className="border-b border-line">
            <th className={`${TH_LEFT} pin-col pl-0 text-muted`}>{phase.title}</th>
            {columns.map(([head]) => <th key={head} className={`${TH} ${TIGHT}`}>{head}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.player_id} className="border-b border-line last:border-0">
              <td className="pin-col overflow-hidden py-1.5 pr-2"><PlayerName player={p} /></td>
              {columns.map(([head, cell]) => <td key={head} className={`${TD} ${TIGHT} text-fg`}>{cell(p)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BoxTables({ players }) {
  return (
    <div className="grid gap-4">
      {BOX_PHASES.map((phase) => <BoxTable key={phase.title} phase={phase} players={players} />)}
    </div>
  );
}

function TeamTitle({ team }) {
  return <span className="flex items-center gap-2">{team.logo_url && <img src={team.logo_url} alt="" className="h-6 w-6 object-contain" />}{team.name}</span>;
}

// Both teams' cards share a row, so each team shows the same number of players and the
// pair ends level: the larger team's count of players who qualify, up to a cap, filled
// out with the next-highest scorers. Lists arrive sorted by fantasy points.
function evenRows(lists, qualifies, cap) {
  const count = Math.min(cap, Math.max(...lists.map((list) => list.filter(qualifies).length)));
  return lists.map((list) => list.slice(0, count));
}

function QuarterPoints({ players, game, max }) {
  const periods = Array.from({ length: Math.max(4, game.periods?.length ?? 4) }, (_, index) => index + 1);
  const cell = (value) => {
    if (Math.abs(value) < 0.05) return <span className="text-faint">·</span>;
    if (value < 0) return <span style={{ color: "color-mix(in srgb, var(--neg) 72%, var(--fg))" }}>{num(value)}</span>;
    return num(value);
  };
  const tint = (value) => (value > 0.05 ? { background: `color-mix(in srgb, var(--accent) ${Math.round(6 + (value / max) * 48)}%, transparent)` } : undefined);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-line">
            <th className={`${TH_LEFT} pin-col pl-0`}>Player</th>
            {periods.map((quarter) => <th key={quarter} className={TH_CENTER}>{periodName(quarter, game)}</th>)}
            <th className={TH}>Total</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.player_id} className="border-b border-line last:border-0">
              <td className="pin-col py-1.5 pr-2"><PlayerName player={p} /></td>
              {periods.map((quarter) => {
                const value = p.points_by_quarter?.[String(quarter)] ?? 0;
                return <td key={quarter} className="stat-num whitespace-nowrap px-2 py-1.5 text-center text-fg" style={tint(value)}>{cell(value)}</td>;
              })}
              <td className={`${TD} font-bold text-fg`}>{num(p.fantasy_points)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BoxScoreTab({ game, recap, colors }) {
  if (!game.has_stats) return <NoStats />;
  const scoring = scoringName(recap.scoring);
  const lists = ["away", "home"].map((side) => recap.players.filter((p) => p.team === game[side].abbreviation));
  const averages = evenRows(lists, (p) => p.fantasy_points >= 2 || (p.average_coming_in ?? 0) >= 5, 9);
  const quarters = evenRows(lists, (p) => p.fantasy_points >= 3, 8);
  // Plays stored before they named their players price to nothing, so an empty grid is hidden.
  const hasQuarters = game.has_plays && recap.players.some((p) => Object.keys(p.points_by_quarter ?? {}).length > 0);
  // One scale for both teams' average charts, and one heat scale for both quarter grids.
  const averageTop = Math.ceil(Math.max(10, ...averages.flat().map((p) => Math.max(p.fantasy_points, p.average_coming_in ?? 0))) / 10) * 10;
  const quarterMax = Math.max(1, ...quarters.flat().flatMap((p) => Object.values(p.points_by_quarter ?? {})));
  // Each team is a column, side by side only where half the page holds a box score. The
  // grid fills down the first column and then the second, so the two teams' cards share
  // rows and line up; below that width each team's cards stay together.
  return (
    <div className={`grid gap-4 2xl:grid-flow-col 2xl:grid-cols-2 ${hasQuarters ? "2xl:grid-rows-[repeat(3,auto)]" : "2xl:grid-rows-[repeat(2,auto)]"}`}>
      {["away", "home"].map((side, index) => {
        const abbr = game[side].abbreviation;
        return [
          <Panel key={`${side}-box`} title={<TeamTitle team={game[side]} />} right={<span className="text-xs font-semibold text-faint">{scoring}</span>}>
            <BoxTables players={lists[index]} />
          </Panel>,
          <Panel key={`${side}-average`} title={`${abbr} against his average`} sub="Bar: points this game. Tick: season average coming in">
            <AverageChart players={averages[index]} color={colors[side]} top={averageTop} />
          </Panel>,
          hasQuarters && (
            <Panel key={`${side}-quarters`} title={`${abbr} points by quarter`} sub={scoring}>
              <QuarterPoints players={quarters[index]} game={game} max={quarterMax} />
            </Panel>
          ),
        ].filter(Boolean);
      })}
    </div>
  );
}

// ------------------------------------------------------------------- Usage & Efficiency
// One table per phase, as on the Box Score: what each player was given (usage), then what
// he did with it (efficiency), each rate beside the volume it is a rate of. Every rate is
// that game's own numbers divided. The fantasy rates are in the page's scoring and count
// only that phase's points (points_by_phase), so a back's points per target are what he
// did as a receiver, not his rushing touchdowns over one target.
const ratio = (top, bottom) => (top === null || top === undefined || !bottom ? null : top / bottom);
const dropbacks = (p) => (p.attempts ?? 0) + (p.sacks_suffered ?? 0);
const count = (value) => (value ? value : <span className="text-faint">0</span>);
const share = (value, max) => <Heat value={value} max={max}>{pct(value)}</Heat>;
const fixed = (value, digits = 1) => (value === null || value === undefined ? <span className="text-faint">—</span> : num(value, digits));
const plus = (value, digits = 2) => (value === null || value === undefined ? <span className="text-faint">—</span> : signed(value, digits));

const PHASES = [
  {
    title: "Passing",
    rows: (players) => players.filter((p) => p.attempts > 0).sort((x, y) => dropbacks(y) - dropbacks(x)),
    usage: [
      ["DB", (p) => dropbacks(p), "Dropbacks: attempts plus sacks"],
      ["Air yds", (p) => p.pass_air_yards ?? "—"],
      ["aDOT", (p) => fixed(ratio(p.pass_air_yards, p.pass_depth_attempts))],
      ["20+ Att", (p) => count(p.deep_attempts)],
      ["RZ Att", (p) => count(p.red_zone_attempts)],
    ],
    efficiency: [
      ["Y/A", (p) => fixed(ratio(p.passing_yards, p.attempts))],
      ["CPOE", (p) => plus(p.cpoe, 1)],
      ["Sack %", (p) => pct(ratio(p.sacks_suffered ?? 0, dropbacks(p)))],
      ["EPA", (p) => plus(p.passing_epa, 1)],
      ["EPA/DB", (p) => plus(ratio(p.passing_epa, dropbacks(p)))],
      ["FP/DB", (p) => fixed(ratio(p.points_by_phase?.passing, dropbacks(p)), 2)],
    ],
  },
  {
    title: "Rushing",
    rows: (players) => players.filter((p) => p.carries > 0).sort((x, y) => y.carries - x.carries),
    usage: [
      ["Snap", (p) => share(p.snap_share, 1)],
      ["Car", (p) => p.carries],
      ["Rush %", (p) => share(p.rush_attempt_share, 0.8)],
      ["RZ Car", (p) => count(p.red_zone_rush_attempts)],
      ["IN10", (p) => count(p.rush_att_inside_10)],
      ["IN5", (p) => count(p.rush_att_inside_5)],
      ["IN2", (p) => count(p.rush_att_inside_2)],
    ],
    efficiency: [
      ["YPC", (p) => fixed(ratio(p.rushing_yards, p.carries))],
      // Over designed runs, so a quarterback's one designed run is not a rate.
      ["Success", (p) => ((p.designed_runs ?? 0) >= 3 ? pct(p.run_success_rate) : <span className="text-faint">—</span>)],
      ["EPA", (p) => plus(p.rushing_epa, 1)],
      ["EPA/Car", (p) => plus(ratio(p.rushing_epa, p.carries))],
      ["FP/Car", (p) => fixed(ratio(p.points_by_phase?.rushing, p.carries), 2)],
    ],
  },
  {
    title: "Receiving",
    rows: (players) => players.filter((p) => p.targets > 0 || p.routes_run > 0)
      .sort((x, y) => (y.routes_run ?? 0) - (x.routes_run ?? 0) || y.targets - x.targets),
    usage: [
      ["Snap", (p) => share(p.snap_share, 1)],
      ["Routes", (p) => p.routes_run ?? "—"],
      ["Route %", (p) => share(p.route_participation, 1)],
      ["Tgt", (p) => count(p.targets)],
      ["Tgt %", (p) => share(p.target_share, 0.45)],
      ["Air %", (p) => share(p.air_yards_share, 0.6)],
      ["aDOT", (p) => fixed(p.adot)],
      ["RZ Tgt", (p) => count(p.red_zone_targets)],
      ["WOPR", (p) => fixed(p.wopr, 2)],
    ],
    efficiency: [
      ["Catch %", (p) => pct(ratio(p.receptions, p.targets))],
      ["Y/Rec", (p) => fixed(ratio(p.receiving_yards, p.receptions))],
      ["Y/Tgt", (p) => fixed(ratio(p.receiving_yards, p.targets))],
      ["TPRR", (p) => pct(ratio(p.targets, p.routes_run))],
      ["YPRR", (p) => fixed(ratio(p.receiving_yards, p.routes_run), 2)],
      ["EPA", (p) => plus(p.receiving_epa, 1)],
      ["EPA/Tgt", (p) => plus(ratio(p.receiving_epa, p.targets))],
      ["FP/Tgt", (p) => fixed(ratio(p.points_by_phase?.receiving, p.targets), 2)],
      ["FP/RR", (p) => fixed(ratio(p.points_by_phase?.receiving, p.routes_run), 2)],
    ],
  },
];

// Every stat column is the same width in all three tables, the widest table filling the
// card, so the phases stack on one grid rather than each spreading its own columns.
const PLAYER_COLUMN = 250;
const WIDEST_PHASE = Math.max(...PHASES.map((phase) => phase.usage.length + phase.efficiency.length));

function PhaseTable({ phase, players }) {
  const rows = phase.rows(players);
  if (!rows.length) return null;
  const columns = [...phase.usage, ...phase.efficiency];
  const firstEfficiency = phase.usage.length;
  const group = "px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-faint";
  const width = `calc(${PLAYER_COLUMN}px + ${columns.length} * (100% - ${PLAYER_COLUMN}px) / ${WIDEST_PHASE})`;
  return (
    <div className="overflow-x-auto">
      <table className="table-fixed border-collapse text-[12.5px]" style={{ width, minWidth: 150 + columns.length * 72 }}>
        <colgroup>
          <col className="w-[150px] md:w-[250px]" />
          {columns.map(([head]) => <col key={head} />)}
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2} className={`${TH_LEFT} pin-col pl-0 align-bottom text-muted`}>{phase.title}</th>
            <th colSpan={phase.usage.length} className={`${group} border-b border-line text-left`}>Usage</th>
            <th colSpan={phase.efficiency.length} className={`${group} border-b border-l border-line text-left`}>Efficiency</th>
          </tr>
          <tr className="border-b border-line">
            {columns.map(([head, , title], index) => <th key={head} title={title} className={`${TH} ${index === firstEfficiency ? "border-l border-line" : ""}`}>{head}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.player_id} className="border-b border-line last:border-0">
              <td className="pin-col overflow-hidden py-1.5 pr-2"><PlayerName player={p} /></td>
              {columns.map(([head, cell], index) => (
                <td key={head} className={`${TD} text-fg ${index === firstEfficiency ? "border-l border-line" : ""}`}>{cell(p)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function UsageTab({ game, recap, colors }) {
  if (!game.has_stats) return <NoStats />;
  return (
    <div className="grid gap-4">
      {["away", "home"].map((side) => {
        const players = recap.players.filter((p) => p.team === game[side].abbreviation);
        return (
          <Panel key={side} title={<TeamTitle team={game[side]} />} sub="Shares are of the team's own snaps, routes, targets and carries">
            <div className="grid gap-5">
              {PHASES.map((phase) => <PhaseTable key={phase.title} phase={phase} players={players} />)}
            </div>
          </Panel>
        );
      })}
      {game.has_plays && recap.touches?.length > 0 && ["away", "home"].map((side) => {
        const players = recap.players.filter((p) => p.team === game[side].abbreviation);
        const ids = new Set(players.map((p) => p.player_id));
        return (
          <Panel key={`${side}-touches`} title={`${game[side].abbreviation}: who got the ball`} sub="Every target and carry on the game clock">
            <TouchTimeline touches={recap.touches.filter((touch) => ids.has(touch.player))} players={players} color={colors[side]}
              end={recap.win_probability?.end ?? 3600} periods={game.periods?.length} seasonType={game.season_type} />
            <TouchKey color={colors[side]} />
          </Panel>
        );
      })}
    </div>
  );
}

function TouchKey({ color }) {
  const item = "inline-flex items-center gap-1.5";
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
      <span className={item}><span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />Target, caught</span>
      <span className={item}><span className="h-2.5 w-2.5 rounded-full bg-[color:var(--surface-solid)]" style={{ boxShadow: `inset 0 0 0 1.6px ${color}` }} />Target, not caught</span>
      <span className={item}><span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: `color-mix(in srgb, ${color} 56%, var(--surface-solid))`, boxShadow: `inset 0 0 0 1.2px ${color}` }} />Carry</span>
      <span className={item}><span className="h-2.5 w-2.5 rounded-full" style={{ boxShadow: "inset 0 0 0 2px var(--accent)" }} />Touchdown</span>
    </div>
  );
}

// ------------------------------------------------------------------- Targets & Runs
function GameNetwork({ game, passerId, team }) {
  const phone = usePhone();
  const { data, isLoading } = useNetwork(
    { season: game.season, season_type: game.season_type, weeks: String(game.week), passer_id: passerId, team },
    { enabled: Boolean(passerId) },
  );
  const shape = useMemo(() => shapeNetwork(data, 7, 1), [data]);
  if (isLoading) return <Loading height={420} />;
  if (!data || !shape.shown.length) return null;
  const passer = data.passer;
  return (
    <Panel title={`${passer.name}'s targets`} sub={`${data.totals.targets} targets · ${passer.completions}/${passer.attempts}, ${passer.passing_yards} yards`}
      right={<Link to={`/explore/network?season=${game.season}&weeks=${game.week}&qb=${passerId}&team=${team}`} className="text-xs font-semibold text-muted transition hover:text-accent">Open in Explore →</Link>}>
      <NetworkChart passer={passer} shown={shape.shown} compact={phone} />
      <NetworkLegend layout="field" />
    </Panel>
  );
}

function RunLanes({ game, side }) {
  const team = game[side];
  const { data } = useTeamBreakdown(team.team_id, { season: game.season, season_type: game.season_type, weeks: String(game.week) });
  if (!data) return <Loading height={360} />;
  return <RunLaneColumns lanes={data.run_lanes} groups={data.run_groups} weeksLabel={`${team.name} · ${game.week_label} · ranks among that week's offenses`} />;
}

export function TargetsRunsTab({ game, recap }) {
  if (!recap.has_targets) return <NoStats />;
  return (
    <div className="grid gap-4">
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {["away", "home"].map((side) => {
          const team = game[side].abbreviation;
          const passer = recap.passers?.[team]?.[0];
          return passer ? <GameNetwork key={side} game={game} passerId={passer} team={team} /> : null;
        })}
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {["away", "home"].map((side) => (
          <TeamTargetCard key={side} teamId={game[side].team_id} teamName={game[side].name} season={game.season}
            seasonType={game.season_type} weeks={String(game.week)} weeksLabel={`${game[side].abbreviation} · ${game.week_label}`} />
        ))}
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {["away", "home"].map((side) => <RunLanes key={side} game={game} side={side} />)}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- Team Stats
const TEAM_TABLES = [
  ["Efficiency", [
    ["EPA per play", "epa_per_play", (v) => signed(v, 2), 1], ["Success rate", "success_rate", (v) => pct(v, 1), 1],
    ["EPA per dropback", "epa_per_dropback", (v) => signed(v, 2), 1], ["EPA per run", "epa_per_run", (v) => signed(v, 2), 1],
    ["Yards per play", "yards_per_play", num, 1], ["Total yards", "yards", int, 1], ["First downs", "first_downs", int, 1],
    ["Explosive plays", "explosive_plays", int, 1], ["Points per drive", "points_per_drive", (v) => num(v, 2), 1],
  ]],
  ["Situations", [
    ["Third down", "third", null, 1], ["Fourth down", "fourth", null, 1], ["Red zone TDs", "red_zone", null, 1],
    ["Average start", "average_start", (v) => (v === null ? "—" : `own ${Math.round(v)}`), 1],
    ["Three-and-outs", "three_and_outs", int, -1], ["Turnovers", "turnovers", int, -1], ["Sacks taken", "sacks", int, -1],
    ["Penalties", "penalties", null, -1], ["Time of possession", "time_of_possession", clockTime, 1],
  ]],
  ["Style", [
    ["Plays", "plays", int, 0], ["Pass rate", "pass_rate", (v) => pct(v), 0], ["Neutral pass rate", "neutral_pass_rate", (v) => pct(v), 0],
    ["Pass rate over expected", "pass_rate_over_expected", (v) => (v === null ? "—" : `${signed(v, 1)}%`), 0], ["Seconds per snap", "seconds_per_snap", num, 0],
    ["Average depth of throw", "adot", num, 0], ["Backs on the field", "backs_per_play", (v) => num(v, 2), 0],
    ["Tight ends on the field", "tight_ends_per_play", (v) => num(v, 2), 0], ["Receivers on the field", "receivers_per_play", (v) => num(v, 2), 0],
  ]],
];

function boxValue(box, key) {
  if (key === "third") return [box.third_down_attempts ? box.third_down_conversions / box.third_down_attempts : null, `${int(box.third_down_conversions)}/${int(box.third_down_attempts)}`];
  if (key === "fourth") return [box.fourth_down_attempts ? box.fourth_down_conversions / box.fourth_down_attempts : null, `${int(box.fourth_down_conversions)}/${int(box.fourth_down_attempts)}`];
  if (key === "red_zone") return [box.red_zone_trips ? box.red_zone_tds / box.red_zone_trips : null, `${int(box.red_zone_tds)}/${int(box.red_zone_trips)}`];
  if (key === "penalties") return [box.penalty_yards, `${int(box.penalties)}-${int(box.penalty_yards)}`];
  return [box[key], null];
}

function MirrorTable({ title, rows, game, recap }) {
  const [a, h] = sides(game);
  const box = recap.team_box;
  return (
    // The table fills its card, so beside a taller card its rows spread out rather than
    // leaving a gap at the bottom.
    <Panel title={title} className="flex flex-col">
      <table className="h-full w-full flex-1 border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-line">
            <th className={TH}><img src={game.away.logo_url} alt={a} className="ml-auto h-[18px] w-[18px] object-contain" /></th>
            <th className={`${TH_CENTER}`} />
            <th className={`${TH_LEFT}`}><img src={game.home.logo_url} alt={h} className="h-[18px] w-[18px] object-contain" /></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, key, format, better]) => {
            const [av, at] = boxValue(box[a], key), [hv, ht] = boxValue(box[h], key);
            const awayWins = better && av !== null && hv !== null ? (better > 0 ? av > hv : av < hv) : null;
            const homeWins = better && av !== null && hv !== null ? (better > 0 ? hv > av : hv < av) : null;
            return (
              <tr key={label} className="border-b border-line last:border-0">
                <td className={`${TD} ${awayWins ? "font-extrabold text-fg" : awayWins === false ? "text-faint" : "text-fg"}`}>{at ?? format(av)}</td>
                <td className="px-2 py-1.5 text-center text-[12px] font-semibold text-muted">{label}</td>
                <td className={`${TD} !text-left ${homeWins ? "font-extrabold text-fg" : homeWins === false ? "text-faint" : "text-fg"}`}>{ht ?? format(hv)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

const RANK_FORMATS = { suc: "pct1", explosive: "pct1", d3: "pct1", rz_td: "pct1", pts_drive: "num2", proe: "pp1" };
const WEEK_RANK_LABELS = [
  ["epa", "EPA per play"], ["suc", "Success rate"], ["p_epa", "EPA per dropback"], ["r_epa", "EPA per run"],
  ["explosive", "Explosive rate"], ["pts_drive", "Points per drive"], ["d3", "Third down rate"], ["rz_td", "Red zone TD rate"], ["proe", "Pass rate over expected"],
];

// One game's throws, ranked among every offense's regular season rather than that week's
// games: a week is one game per team, too few throws to a depth for a rank to settle.
function PassDepth({ game, side }) {
  const team = game[side];
  const { data } = useTeamBreakdown(team.team_id, { season: game.season, season_type: game.season_type, weeks: String(game.week), rank_against: "season" });
  if (!data) return <Loading height={420} />;
  return <PassDepthField depth={data.pass_depth} weeksLabel={`${team.name} · ${game.week_label} · ranked against each offense's season`} />;
}

/** A tint from bad to good around the league's rate: `spread` away from it is full strength. */
function rateTint(value, middle, spread) {
  if (value === null || value === undefined || middle === null || middle === undefined) return undefined;
  const strength = Math.min(1, Math.abs(value - middle) / spread);
  return { background: `color-mix(in srgb, ${value >= middle ? "var(--pos)" : "var(--neg)"} ${Math.round(6 + strength * 38)}%, transparent)` };
}

/** Each offense's EPA per play, success rate and plays, quarter by quarter and for the game. */
function QuarterGrid({ game, recap }) {
  const teams = sides(game);
  const periods = [...new Set(teams.flatMap((team) => (recap.epa_by_quarter[team] ?? []).map((row) => row.quarter)))].sort((x, y) => x - y);
  const league = recap.league ?? {};
  const rowFor = (team, quarter) => (recap.epa_by_quarter[team] ?? []).find((row) => row.quarter === quarter);
  const wholeGame = (team) => {
    const rows = recap.epa_by_quarter[team] ?? [];
    const plays = rows.reduce((total, row) => total + row.plays, 0);
    return {
      plays, epa: rows.reduce((total, row) => total + row.epa, 0),
      success_rate: plays ? rows.reduce((total, row) => total + (row.success_rate ?? 0) * row.plays, 0) / plays : null,
    };
  };
  const cells = (team) => [...periods.map((quarter) => rowFor(team, quarter)), wholeGame(team)];
  const perPlay = (row) => (row && row.plays ? row.epa / row.plays : null);
  const cell = "stat-num whitespace-nowrap px-2 py-1.5 text-center";
  return (
    <div className="flex-1 overflow-x-auto">
      <table className="h-full w-full min-w-[460px] border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-line">
            <th className={`${TH_LEFT} pl-0`} />
            {periods.map((quarter) => <th key={quarter} className={TH_CENTER}>{periodName(quarter, game)}</th>)}
            <th className={TH_CENTER}>Game</th>
          </tr>
        </thead>
        {teams.map((team, index) => {
          const side = index ? game.home : game.away;
          const rows = cells(team);
          return (
            <tbody key={team}>
              <tr>
                <td colSpan={rows.length + 1} className="pb-1 pt-3 text-[12.5px] font-bold text-fg">
                  <span className="flex items-center gap-2">{side.logo_url && <img src={side.logo_url} alt="" className="h-5 w-5 object-contain" />}{side.name}</span>
                </td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-1.5 pr-2 font-semibold text-muted">EPA per play</td>
                {rows.map((row, column) => <td key={column} className={`${cell} font-bold text-fg`} style={rateTint(perPlay(row), league.epa_per_play, 0.5)}>{perPlay(row) === null ? "—" : signed(perPlay(row), 2)}</td>)}
              </tr>
              <tr className="border-b border-line">
                <td className="py-1.5 pr-2 font-semibold text-muted">Success rate</td>
                {rows.map((row, column) => <td key={column} className={`${cell} text-fg`} style={rateTint(row?.success_rate, league.success_rate, 0.25)}>{pct(row?.success_rate)}</td>)}
              </tr>
              <tr className={index ? "" : "border-b border-line"}>
                <td className="py-1.5 pr-2 font-semibold text-muted">Plays</td>
                {rows.map((row, column) => <td key={column} className={`${cell} text-muted`}>{row ? row.plays : "—"}</td>)}
              </tr>
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

export function TeamStatsTab({ game, recap }) {
  if (!game.has_stats || !recap.team_box[game.away.abbreviation]) return <NoStats />;
  const [a, h] = sides(game);
  const ranks = recap.week_ranks;
  // Both rows are on four columns, so the second row's cards sit under the first row's.
  // A playoff week has no ranks, and its three tables share the row.
  return (
    <div className="grid gap-4">
      <div className={`grid gap-4 md:grid-cols-2 ${ranks ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
        {TEAM_TABLES.map(([title, rows]) => <MirrorTable key={title} title={title} rows={rows} game={game} recap={recap} />)}
        {ranks && (
          <Panel title={`${game.week_label} ranks`} sub={`Against the other ${ranks.teams - 1} offenses that week`}>
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-line"><th className={`${TH_LEFT} pl-0`} /><th className={TH}>{a}</th><th className={TH}>{h}</th></tr>
              </thead>
              <tbody>
                {WEEK_RANK_LABELS.map(([id, label]) => (
                  <tr key={id} className="border-b border-line last:border-0">
                    <td className="py-1.5 pr-2 font-semibold text-muted">{label}</td>
                    {[a, h].map((team) => {
                      const cell = ranks.metrics[id]?.[team];
                      return (
                        <td key={team} className="whitespace-nowrap py-1.5 pl-2 text-right">
                          {cell ? <span className="inline-flex items-center gap-1.5"><span className="stat-num text-fg">{formatTeamStat(cell[0], RANK_FORMATS[id] ?? "sgn2")}</span><RankChip rank={cell[1]} of={ranks.teams} /></span> : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {game.has_plays && (
          <Panel title="EPA by quarter"
            sub={`Offense. Tinted against the league this season: ${signed(recap.league?.epa_per_play ?? 0, 2)} EPA per play, ${pct(recap.league?.success_rate)} success`}
            className="flex flex-col md:col-span-2">
            <QuarterGrid game={game} recap={recap} />
          </Panel>
        )}
        {["away", "home"].map((side) => <PassDepth key={side} game={game} side={side} />)}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- Drives
export function DrivesTab({ game, recap, colors }) {
  if (!game.has_plays || !recap.drives.length) return <Waiting>The drives arrive with the play-by-play in the weekly update.</Waiting>;
  return (
    <Panel title="Drive chart" sub="Every possession from its own goal line toward the end zone on the right. Solid bars scored">
      <DriveChart drives={recap.drives} colors={colors} away={game.away.abbreviation} logos={logosOf(game)} periods={game.periods?.length} />
    </Panel>
  );
}

// ------------------------------------------------------------------- Play-by-Play
const FILTERS = [
  { id: "all", label: "All plays" },
  { id: "scoring", label: "Scoring" },
  { id: "turnovers", label: "Turnovers" },
  { id: "swings", label: "Big swings" },
];
const BIG_SWING = 0.08;

export function PlayByPlayTab({ game, recap, colors }) {
  const { data, isLoading } = useGamePlays(game.game_id, { enabled: game.has_plays });
  const [filter, setFilter] = useState("all");
  if (!game.has_plays) return <Waiting>The play-by-play arrives with the weekly update.</Waiting>;
  if (isLoading || !data) return <Loading height={600} />;
  const [a, h] = sides(game);
  const filters = [...FILTERS, { id: a, label: `${a} offense` }, { id: h, label: `${h} offense` }];
  const keep = (play) => {
    if (filter === "scoring") return Boolean(play.score_type);
    if (filter === "turnovers") return play.turnover;
    if (filter === "swings") return play.home_wp_delta !== null && Math.abs(play.home_wp_delta) >= BIG_SWING;
    if (filter === a || filter === h) return play.team === filter;
    return true;
  };
  const plays = data.plays.filter(keep);
  const drives = Object.fromEntries(recap.drives.map((drive) => [drive.drive, drive]));
  const logos = logosOf(game);
  let quarter = 0, drive = null;
  return (
    <Panel title="Play-by-play" sub="EPA is the expected points the play added for the offense. Win % is the swing in win probability, toward the team named">
      <div role="group" aria-label="Show" className="mb-3 flex flex-wrap gap-1.5">
        {filters.map((option) => (
          <button key={option.id} type="button" aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}
            className={`rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition ${filter === option.id ? "border-[color:var(--border-strong)] bg-surface-2 text-fg" : "border-edge text-muted hover:text-fg"}`}>
            {option.label}
          </button>
        ))}
      </div>
      <div className="hidden grid-cols-[52px_140px_minmax(0,1fr)_64px_80px] gap-2.5 border-b border-line pb-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-faint md:grid">
        <span>Clock</span><span>Down</span><span>Play</span><span className="text-right">EPA</span><span className="text-right">Win %</span>
      </div>
      {plays.length === 0 && <p className="py-8 text-center text-sm text-muted">No plays match.</p>}
      {plays.map((play) => {
        const parts = [];
        if (play.quarter !== quarter) {
          quarter = play.quarter;
          parts.push(<div key={`q${quarter}`} className="border-b border-line pb-1 pt-3.5 text-[10px] font-bold uppercase tracking-[0.1em] text-faint">{quarterHeading(quarter, game)}</div>);
        }
        if (filter === "all" && play.drive !== drive && play.team) {
          drive = play.drive;
          const info = drives[play.drive];
          if (info) {
            const good = info.result === "Touchdown" || info.result === "Field goal";
            const bad = info.result === "Turnover" || info.result === "Missed field goal" || info.result === "Turnover on downs";
            parts.push(
              <div key={`d${drive}`} className="flex flex-wrap items-center gap-2 pb-1.5 pt-2.5 text-xs font-bold text-fg">
                {logos[info.team] && <img src={logos[info.team]} alt="" className="h-[18px] w-[18px] object-contain" />}
                <span>{info.team} drive</span>
                <span className="font-medium text-faint">{info.plays} plays, {info.yards} yards, {clockTime(info.seconds)}</span>
                <span className="ml-auto rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                  style={good ? { borderColor: "color-mix(in srgb, var(--pos) 35%, transparent)", color: "color-mix(in srgb, var(--pos) 60%, var(--fg))", background: "color-mix(in srgb, var(--pos) 14%, transparent)" }
                    : bad ? { borderColor: "color-mix(in srgb, var(--neg) 35%, transparent)", color: "color-mix(in srgb, var(--neg) 70%, var(--fg))", background: "color-mix(in srgb, var(--neg) 14%, transparent)" }
                      : { borderColor: "var(--border)", color: "var(--muted)" }}>{info.result}</span>
              </div>,
            );
          }
        }
        const towards = play.home_wp_delta > 0 ? h : a;
        const big = play.home_wp_delta !== null && Math.abs(play.home_wp_delta) >= BIG_SWING;
        const situation = play.down ? `${ordinal(play.down)} & ${play.distance} · ${play.yardline ?? ""}` : play.type === "kickoff" ? "Kickoff" : "";
        parts.push(
          <div key={play.play_id}
            className={`grid grid-cols-[44px_minmax(0,1fr)_56px] gap-x-2.5 gap-y-0.5 border-b border-line py-1.5 text-[12.5px] md:grid-cols-[52px_140px_minmax(0,1fr)_64px_80px] ${play.score_type ? "bg-[color:color-mix(in_srgb,var(--accent)_7%,transparent)]" : ""}`}>
            <span className="stat-num text-faint">{shortClock(play.clock)}</span>
            <span className="stat-num hidden text-[11.5px] text-muted md:block">{situation}</span>
            <span className={`min-w-0 ${play.score_type || play.turnover ? "font-semibold text-fg" : "text-fg"}`}>
              <span className="stat-num mr-1.5 text-[11px] text-muted md:hidden">{situation}</span>{play.text}
            </span>
            <span className="stat-num text-right" style={{ color: play.epa === null ? "var(--faint)" : `color-mix(in srgb, ${play.epa >= 0 ? "var(--pos)" : "var(--neg)"} 70%, var(--fg))` }}>
              {play.epa === null ? "" : signed(play.epa, 2)}
            </span>
            <span className="stat-num col-start-3 text-right md:col-start-auto" style={big ? { fontWeight: 800, color: teamText(colorOf(game, colors, towards)) } : { color: "var(--faint)" }}>
              {play.home_wp_delta === null || Math.abs(play.home_wp_delta) < 0.005 ? "" : `${towards} +${Math.round(Math.abs(play.home_wp_delta) * 100)}%`}
            </span>
          </div>,
        );
        return parts;
      })}
    </Panel>
  );
}
