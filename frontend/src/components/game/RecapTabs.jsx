// The recap's tabs: Summary, Box Score, Fantasy, Usage, Targets & Runs, Team Stats,
// Drives and Play-by-Play. Each takes the game header, the recap response and the two
// team colours; Targets & Runs and Team Stats also read the Explore and team-breakdown
// endpoints for the game's week, so their charts are the same ones the rest of the site
// draws.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FinishChip } from "../player/FinishChip";
import { RankChip } from "../team/RankChip";
import { PassDepthField } from "../team/PassDepthField";
import { RunLaneColumns } from "../team/RunLaneColumns";
import { NetworkChart, NetworkLegend, shapeNetwork } from "../explore/NetworkChart";
import { TeamTargetCard } from "../explore/TargetCard";
import { Headshot, Legend } from "../explore/common";
import { useNetwork } from "../../hooks/useExplore";
import { useGamePlays } from "../../hooks/useGames";
import { useLeague } from "../../hooks/useLeague";
import { useTeamBreakdown } from "../../hooks/useTeamStats";
import { usePhone } from "../../hooks/useMediaQuery";
import { parseLeague } from "../../constants/league";
import { formatTeamStat } from "../../utils/teamStats";
import { lastName, signed } from "../../utils/explore";
import { ordinal } from "../../utils/format";
import { BREAKDOWN_PARTS, DriveChart, EpaByQuarterChart, ExpectedDumbbell, PointsBreakdownChart, PossessionStrip, WinProbabilityChart } from "./GameCharts";
import { TeamKey } from "./GameHeader";
import { inkOn, teamText } from "./colors";
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

function GameLeaders({ recap, game }) {
  const league = parseLeague(useLeague()[0]);
  const logos = logosOf(game);
  const column = (team) => {
    const players = recap.players.filter((p) => p.team === team);
    const passer = players.filter((p) => p.attempts > 0).sort((a, b) => b.passing_yards - a.passing_yards)[0];
    const rusher = players.filter((p) => p.carries > 0 && p !== passer).sort((a, b) => b.rushing_yards - a.rushing_yards)[0];
    const receiver = players.filter((p) => p.targets > 0).sort((a, b) => b.receiving_yards - a.receiving_yards)[0];
    const rows = [
      ["Pass", passer, passer && `${passer.completions}/${passer.attempts}, ${passer.passing_yards} yds, ${passer.passing_tds} TD${passer.interceptions ? `, ${passer.interceptions} INT` : ""}`],
      ["Rush", rusher, rusher && `${rusher.carries}-${rusher.rushing_yards}, ${rusher.rushing_tds} TD`],
      ["Rec", receiver, receiver && `${receiver.receptions}-${receiver.receiving_yards} on ${receiver.targets} tgt${receiver.receiving_tds ? `, ${receiver.receiving_tds} TD` : ""}`],
    ].filter(([, player]) => player);
    return (
      <div key={team} className="min-w-0">
        <div className="mb-1 flex items-center gap-2 text-[12.5px] font-bold text-fg">
          {logos[team] && <img src={logos[team]} alt="" className="h-5 w-5 object-contain" />}{team}
        </div>
        {rows.map(([label, player, text]) => (
          <div key={label} className="flex items-center gap-2.5 border-b border-line py-2 last:border-0">
            <Headshot url={player.headshot_url} name={player.name} size={38} />
            <div className="min-w-0 flex-1">
              <Link to={`/players/${player.player_id}`} className="block truncate text-[13px] font-semibold text-fg hover:text-accent">{player.name}</Link>
              <div className="truncate text-[11px] text-faint"><span className="font-bold tracking-wide">{label.toUpperCase()}</span> {text}</div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="stat-num text-[15px] font-extrabold text-fg">{num(player.fantasy_points)}</span>
              <FinishChip rank={player.position_rank} position={player.position} league={league} detail={`of ${player.pool_size} that week`} />
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
  return (
    <div className="grid gap-2.5">
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
          <Panel title="Win probability" sub="After every play, from the market's view at kickoff. Numbered: the biggest swings. Triangles: every score">
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
          <Panel title="Team stats" right={<TeamKey teams={[{ abbreviation: a, color: colors.away }, { abbreviation: h, color: colors.home }]} />}>
            <TeamSplitBars recap={recap} game={game} colors={colors} />
          </Panel>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- Box Score
function BoxTables({ players, logo }) {
  const league = parseLeague(useLeague()[0]);
  const passers = players.filter((p) => p.attempts > 0);
  const rushers = players.filter((p) => p.carries > 0).sort((x, y) => y.rushing_yards - x.rushing_yards);
  const receivers = players.filter((p) => p.targets > 0).sort((x, y) => y.receiving_yards - x.receiving_yards);
  const fantasy = (p) => (
    <>
      <td className={`${TD} font-bold text-fg`}>{num(p.fantasy_points)}</td>
      <td className="py-1.5 pl-2 text-right"><FinishChip rank={p.position_rank} position={p.position} league={league} detail={`of ${p.pool_size} that week`} /></td>
    </>
  );
  const table = (title, heads, rows, cells) => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-line">
            <th className={`${TH_LEFT} pin-col pl-0 text-muted`}>{title}</th>
            {heads.map((head) => <th key={head} className={TH}>{head}</th>)}
            <th className={TH}>FPTS</th><th className={TH} />
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.player_id} className="border-b border-line last:border-0">
              <td className="pin-col py-1.5 pr-2"><PlayerName player={p} /></td>
              {cells(p).map((cell, index) => <td key={index} className={`${TD} text-fg`}>{cell}</td>)}
              {fantasy(p)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="grid gap-4">
      {passers.length > 0 && table("Passing", ["C/Att", "Yds", "TD", "Int", "Sck", "CPOE", "EPA"], passers, (p) => [
        `${p.completions}/${p.attempts}`, p.passing_yards, p.passing_tds, p.interceptions, p.sacks_suffered ?? 0, signed(p.cpoe, 1), signed(p.epa, 1),
      ])}
      {rushers.length > 0 && table("Rushing", ["Car", "Yds", "Avg", "TD", "Success", "10+", "Stuffed"], rushers, (p) => [
        p.carries, p.rushing_yards, num(p.rushing_yards / p.carries), p.rushing_tds,
        // Success and the rest are over designed runs, so a quarterback's one designed run is not a rate.
        (p.designed_runs ?? 0) >= 3 ? pct(p.run_success_rate) : "—", (p.designed_runs ?? 0) >= 3 ? p.explosive_runs : "—", (p.designed_runs ?? 0) >= 3 ? p.stuffed_runs : "—",
      ])}
      {receivers.length > 0 && table("Receiving", ["Tgt", "Rec", "Yds", "TD", "aDOT", "YAC", "Tgt %"], receivers, (p) => [
        p.targets, p.receptions, p.receiving_yards, p.receiving_tds, num(p.adot), int(p.yards_after_catch), pct(p.target_share),
      ])}
    </div>
  );
}

export function BoxScoreTab({ game, recap }) {
  if (!game.has_stats) return <NoStats />;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {["away", "home"].map((side) => (
        <Panel key={side} title={<span className="flex items-center gap-2">{game[side].logo_url && <img src={game[side].logo_url} alt="" className="h-6 w-6 object-contain" />}{game[side].name}</span>}>
          <BoxTables players={recap.players.filter((p) => p.team === game[side].abbreviation)} />
        </Panel>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------- Fantasy
const scoringName = (scoring) => (scoring?.te_rec ? "TE premium" : scoring?.rec === 1 ? "PPR" : scoring?.rec === 0.5 ? "Half-PPR" : "Standard");

export function FantasyTab({ game, recap }) {
  const league = parseLeague(useLeague()[0]);
  if (!game.has_stats) return <NoStats />;
  const logos = logosOf(game);
  const players = recap.players.filter((p) => p.fantasy_points >= 1 || (p.expected_fantasy_points ?? 0) >= 2);
  const charted = recap.players.filter((p) => p.expected_fantasy_points !== null && (p.fantasy_points >= 3 || p.expected_fantasy_points >= 4));
  return (
    <div className="grid gap-4">
      <Panel title="Fantasy box score" sub={`${scoringName(recap.scoring)}. Finish is the rank at the position among everyone who played that week. xFP is expected points from the volume and where it came`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-line">
                <th className={`${TH_LEFT} pin-col pl-0`}>Player</th>
                <th className={TH}>FPTS</th><th className={`${TH_CENTER}`}>Finish</th><th className={TH}>xFP</th><th className={TH}>+/−</th>
                <th className={TH}>Snap</th><th className={TH}>Tgt %</th><th className={TH}>Opp</th><th className={`${TH_LEFT}`}>Line</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => {
                const diff = p.expected_fantasy_points === null ? null : p.fantasy_points - p.expected_fantasy_points;
                return (
                  <tr key={p.player_id} className="border-b border-line last:border-0">
                    <td className="pin-col py-1.5 pr-2"><PlayerName player={p} logo={logos[p.team]} size={24} /></td>
                    <td className={`${TD} font-bold text-fg`}>{num(p.fantasy_points)}</td>
                    <td className="px-2 py-1.5 text-center"><FinishChip rank={p.position_rank} position={p.position} league={league} detail={`of ${p.pool_size} that week`} /></td>
                    <td className={`${TD} text-muted`}>{num(p.expected_fantasy_points)}</td>
                    <td className={`${TD} font-bold`} style={{ color: diff === null ? undefined : `color-mix(in srgb, ${diff >= 0 ? "var(--pos)" : "var(--neg)"} 72%, var(--fg))` }}>{diff === null ? "—" : signed(diff, 1)}</td>
                    <td className={`${TD} text-muted`}>{pct(p.snap_share)}</td>
                    <td className={`${TD} text-muted`}>{p.target_share ? pct(p.target_share) : "—"}</td>
                    <td className={`${TD} text-muted`}>{(p.targets ?? 0) + (p.carries ?? 0)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-left text-[11.5px] text-muted">{lineText(p)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Panel title="Points against expected" sub="The gap is touchdowns and efficiency: expected points come from the volume and where it came">
          <ExpectedDumbbell players={recap.players} logos={logos} />
          <Legend items={[
            { label: "Expected", color: "var(--muted)", round: true },
            { label: "Scored more", color: "var(--pos)", round: true },
            { label: "Scored less", color: "var(--neg)", round: true },
          ]} />
        </Panel>
        <Panel title="Where the points came from" sub={scoringName(recap.scoring)}>
          <PointsBreakdownChart players={charted} />
          <div className="mt-2"><Legend items={[...BREAKDOWN_PARTS.map((part) => ({ label: part.label, color: part.color })), { label: "Turnovers", color: "var(--neg)" }]} /></div>
        </Panel>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- Usage
function UsageTable({ players }) {
  const rows = players.filter((p) => (p.snap_share ?? 0) >= 0.08 || (p.targets ?? 0) + (p.carries ?? 0) > 0)
    .sort((x, y) => (y.expected_fantasy_points ?? 0) - (x.expected_fantasy_points ?? 0));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-line">
            <th className={`${TH_LEFT} pin-col pl-0`}>Player</th>
            {["Snap", "Route", "Tgt", "Tgt %", "Air %", "aDOT", "Car", "Car %", "RZ opp", "xFP"].map((head) => <th key={head} className={TH}>{head}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.player_id} className="border-b border-line last:border-0">
              <td className="pin-col py-1.5 pr-2"><PlayerName player={p} /></td>
              <td className={TD}><Heat value={p.snap_share} max={1}>{pct(p.snap_share)}</Heat></td>
              <td className={TD}><Heat value={p.route_participation} max={1}>{pct(p.route_participation)}</Heat></td>
              <td className={`${TD} text-fg`}>{p.targets || "—"}</td>
              <td className={TD}><Heat value={p.target_share} max={0.45}>{pct(p.target_share)}</Heat></td>
              <td className={TD}><Heat value={p.air_yards_share} max={0.6}>{pct(p.air_yards_share)}</Heat></td>
              <td className={`${TD} text-muted`}>{p.adot === null ? "—" : num(p.adot)}</td>
              <td className={`${TD} text-fg`}>{p.carries || "—"}</td>
              <td className={TD}><Heat value={p.rush_attempt_share} max={0.8}>{pct(p.rush_attempt_share)}</Heat></td>
              <td className={`${TD} text-fg`}>{(p.red_zone_targets ?? 0) + (p.rush_att_inside_10 ?? 0) || "—"}</td>
              <td className={`${TD} font-bold text-fg`}>{num(p.expected_fantasy_points)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WorkSplit({ players, color, field, label }) {
  const rows = players.filter((p) => (p[field] ?? 0) > 0).sort((x, y) => y[field] - x[field]);
  const total = rows.reduce((sum, p) => sum + p[field], 0);
  if (!total) return null;
  const shades = [100, 78, 60, 46, 34, 24, 16];
  const shade = (index) => `color-mix(in srgb, ${color} ${shades[Math.min(index, 6)]}%, var(--surface-2))`;
  return (
    <div className="grid gap-1.5">
      <div className="flex justify-between text-[11.5px]"><b className="font-semibold text-fg">{label}</b><span className="stat-num text-faint">{total}</span></div>
      <div className="flex h-[26px] gap-0.5 overflow-hidden rounded-md">
        {rows.map((p, index) => (
          <span key={p.player_id} title={`${p.name}: ${p[field]}`} className="stat-num flex items-center justify-center overflow-hidden text-[10.5px] font-bold"
            style={{ width: `${(p[field] / total) * 100}%`, background: shade(index), color: index < 2 ? inkOn(color) : "var(--fg)" }}>
            {p[field] / total >= 0.09 ? p[field] : ""}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
        {rows.slice(0, 6).map((p, index) => (
          <span key={p.player_id} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: shade(index) }} />
            {lastName(p.name)} {Math.round((p[field] / total) * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}

export function UsageTab({ game, recap, colors }) {
  if (!game.has_stats) return <NoStats />;
  return (
    <div className="grid gap-4">
      {["away", "home"].map((side) => (
        <Panel key={side} title={`${game[side].abbreviation} usage`} sub="Shares are of the team's own snaps, routes, targets and carries">
          <UsageTable players={recap.players.filter((p) => p.team === game[side].abbreviation)} />
        </Panel>
      ))}
      <div className="grid gap-4 lg:grid-cols-2">
        {["away", "home"].map((side) => {
          const players = recap.players.filter((p) => p.team === game[side].abbreviation);
          return (
            <Panel key={side} title={`${game[side].abbreviation} split of the work`}>
              <div className="grid gap-4">
                <WorkSplit players={players} color={colors[side]} field="targets" label="Targets" />
                <WorkSplit players={players} color={colors[side]} field="carries" label="Carries" />
              </div>
            </Panel>
          );
        })}
      </div>
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
    ["Yards per play", "yards_per_play", num, 1], ["Explosive plays", "explosive_plays", int, 1], ["Points per drive", "points_per_drive", (v) => num(v, 2), 1],
  ]],
  ["Situations", [
    ["Third down", "third", null, 1], ["Red zone TDs", "red_zone", null, 1], ["Average start", "average_start", (v) => (v === null ? "—" : `own ${Math.round(v)}`), 1],
    ["Three-and-outs", "three_and_outs", int, -1], ["Turnovers", "turnovers", int, -1], ["Sacks taken", "sacks", int, -1], ["Penalties", "penalties", null, -1],
  ]],
  ["Style", [
    ["Pass rate", "pass_rate", (v) => pct(v), 0], ["Neutral pass rate", "neutral_pass_rate", (v) => pct(v), 0],
    ["Pass rate over expected", "pass_rate_over_expected", (v) => (v === null ? "—" : `${signed(v, 1)}%`), 0], ["Seconds per snap", "seconds_per_snap", num, 0],
    ["Average depth of throw", "adot", num, 0], ["Backs on the field", "backs_per_play", (v) => num(v, 2), 0], ["Tight ends on the field", "tight_ends_per_play", (v) => num(v, 2), 0],
  ]],
];

function boxValue(box, key) {
  if (key === "third") return [box.third_down_attempts ? box.third_down_conversions / box.third_down_attempts : null, `${int(box.third_down_conversions)}/${int(box.third_down_attempts)}`];
  if (key === "red_zone") return [box.red_zone_trips ? box.red_zone_tds / box.red_zone_trips : null, `${int(box.red_zone_tds)}/${int(box.red_zone_trips)}`];
  if (key === "penalties") return [box.penalty_yards, `${int(box.penalties)}-${int(box.penalty_yards)}`];
  return [box[key], null];
}

function MirrorTable({ title, rows, game, recap }) {
  const [a, h] = sides(game);
  const box = recap.team_box;
  return (
    <Panel title={title}>
      <table className="w-full border-collapse text-[12.5px]">
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

function PassDepth({ game, side }) {
  const team = game[side];
  const { data } = useTeamBreakdown(team.team_id, { season: game.season, season_type: game.season_type, weeks: String(game.week) });
  if (!data) return <Loading height={420} />;
  return <PassDepthField depth={data.pass_depth} weeksLabel={`${team.name} · ${game.week_label} · ranks among that week's offenses`} />;
}

export function TeamStatsTab({ game, recap, colors }) {
  if (!game.has_stats || !recap.team_box[game.away.abbreviation]) return <NoStats />;
  const [a, h] = sides(game);
  const ranks = recap.week_ranks;
  return (
    <div className="grid gap-4">
      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
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
      <div className="grid items-start gap-4 lg:grid-cols-3">
        {game.has_plays && (
          <Panel title="EPA by quarter" sub="Total EPA on offense">
            <EpaByQuarterChart data={recap.epa_by_quarter} away={a} home={h} colors={colors} periods={game.periods?.length} />
            <div className="mt-2"><TeamKey teams={[{ abbreviation: a, color: colors.away }, { abbreviation: h, color: colors.home }]} /></div>
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
      <div className="hidden grid-cols-[52px_140px_minmax(0,1fr)_64px_80px] gap-2.5 border-b border-line pb-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-faint md:grid">
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
