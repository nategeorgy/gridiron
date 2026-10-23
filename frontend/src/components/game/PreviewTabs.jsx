// The preview's tabs: Matchup, Fantasy, Usage Trends, Tale of the Tape, Depth Charts and
// History. Every number describes the season before this game (or the last season, for a
// Week 1 game), priced in the page's scoring.
import { Link } from "react-router-dom";
import { FinishChip } from "../player/FinishChip";
import { RankChip } from "../team/RankChip";
import { DepthChartField } from "../team/DepthChartField";
import { CoachingStaff } from "../team/CoachingStaff";
import { Headshot } from "../explore/common";
import { useTeam } from "../../hooks/useTeamStats";
import { formatTeamStat, rankInk } from "../../utils/teamStats";
import { ordinal } from "../../utils/format";
import { GameTrendChart } from "./GameCharts";
import { TeamKey } from "./GameHeader";
import { teamText } from "./colors";
import { Heat, Loading, Panel, PlayerName, TD, TH, TH_CENTER, TH_LEFT, num, pct } from "./parts";

const sides = (game) => [game.away.abbreviation, game.home.abbreviation];
const logosOf = (game) => ({ [game.away.abbreviation]: game.away.logo_url, [game.home.abbreviation]: game.home.logo_url });
const opponentOf = (game, team) => (team === game.away.abbreviation ? game.home.abbreviation : game.away.abbreviation);
const basisLabel = (preview, game) => (preview.basis_season === game.season ? `${game.season} so far` : `${preview.basis_season} season`);
const metric = (preview, id) => preview.tape.find((row) => row.id === id);

function TeamLabel({ game, team, children }) {
  const logo = logosOf(game)[team];
  return (
    <span className="inline-flex items-center gap-1.5">
      {logo && <img src={logo} alt="" className="h-4 w-4 object-contain" />}
      {children ?? team}
    </span>
  );
}

// ------------------------------------------------------------------- Matchup
const KEY_UNITS = ["p_epa", "r_epa", "explosive", "pts_drive", "sack_rate"];

function KeyMatchups({ game, preview }) {
  const unit = (offense) => {
    const defense = opponentOf(game, offense);
    return (
      <div key={offense} className="min-w-0">
        <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.07em] text-faint">{offense} offense vs {defense} defense</h3>
        {KEY_UNITS.map((id) => {
          const row = metric(preview, id);
          if (!row) return null;
          const off = row.o[offense], def = row.d[defense];
          return (
            <div key={id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-line py-1.5 text-xs last:border-0">
              <span className="font-semibold text-muted">{row.label}</span>
              <span className="inline-flex items-center gap-1.5"><TeamLabel game={game} team={offense}><span className="stat-num text-fg">{formatTeamStat(off?.[0], row.fmt)}</span></TeamLabel><RankChip rank={off?.[1]} of={preview.teams_ranked} /></span>
              <span className="inline-flex items-center gap-1.5"><TeamLabel game={game} team={defense}><span className="stat-num text-fg">{formatTeamStat(def?.[0], row.fmt)}</span></TeamLabel><RankChip rank={def?.[1]} of={preview.teams_ranked} /></span>
            </div>
          );
        })}
      </div>
    );
  };
  return <div className="grid gap-5 md:grid-cols-2">{sides(game).map(unit)}</div>;
}

function PointsAllowedGrid({ game, preview }) {
  const defenses = sides(game);
  const data = preview.points_allowed;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-line">
            <th className={`${TH_LEFT} pl-0`}>Position</th>
            {defenses.map((team) => <th key={team} className={`${TH_CENTER}`}><TeamLabel game={game} team={team}>{team} defense</TeamLabel></th>)}
            <th className={TH}>League</th>
          </tr>
        </thead>
        <tbody>
          {["QB", "RB", "WR", "TE"].map((position) => (
            <tr key={position} className="border-b border-line last:border-0">
              <td className="py-1.5 pr-2 font-semibold text-muted">{position}</td>
              {defenses.map((team) => {
                const cell = data.defenses?.[team]?.[position];
                return (
                  <td key={team} className="px-2 py-1.5 text-center">
                    {cell ? <span className="inline-flex items-center gap-1.5"><span className="stat-num font-bold text-fg">{num(cell.points_allowed)}</span><RankChip rank={cell.rank} of={cell.teams} /></span> : "—"}
                  </td>
                );
              })}
              <td className={`${TD} text-faint`}>{num(data.league?.[position])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FormStrip({ results, game }) {
  if (!results.length) return <p className="text-xs text-faint">No games yet this season.</p>;
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {results.slice(-5).map((result) => (
        <Link key={result.game_id} to={`/games/${result.game_id}`}
          className="flex min-w-0 flex-col items-center gap-1 rounded-[10px] border border-edge px-1 py-2 transition hover:border-[color:var(--border-strong)]"
          style={{ background: "color-mix(in srgb, var(--surface-2) 70%, transparent)" }}>
          <span className="text-[10px] font-bold text-faint">{result.season_type === "POST" ? "PO" : `W${result.week}`} {result.home ? "vs" : "@"}</span>
          <span className="text-[11px] font-bold text-fg">{result.opponent}</span>
          <span className="stat-num whitespace-nowrap text-[11px] font-bold"
            style={{ color: result.result === "W" ? "color-mix(in srgb, var(--pos) 70%, var(--fg))" : result.result === "L" ? "color-mix(in srgb, var(--neg) 75%, var(--fg))" : "var(--muted)" }}>
            {result.result} {result.points_for}-{result.points_against}
          </span>
          {result.cover && <span className="stat-num whitespace-nowrap text-[10px] text-faint">ATS {result.cover} · {result.over_under}</span>}
        </Link>
      ))}
    </div>
  );
}

function LineCard({ game, preview }) {
  const [a, h] = sides(game);
  const slate = preview.slate;
  const rows = [
    ["Spread", game.favorite ? `${game.favorite} −${Math.abs(game.spread_line)}` : game.spread_line === 0 ? "Pick'em" : "—"],
    ["Total", game.total_line != null ? `${game.total_line}${slate.total_rank ? ` · ${ordinal(slate.total_rank)} highest of ${slate.games}` : ""}` : "—"],
    ["Win chance", game.home_win_chance != null ? `${h} ${Math.round(game.home_win_chance * 100)}% · ${a} ${Math.round((1 - game.home_win_chance) * 100)}%` : "—"],
    [`${a} implied`, game.away_implied != null ? `${num(game.away_implied)}${slate.implied_rank?.[a] ? ` · ${ordinal(slate.implied_rank[a])} of ${slate.offenses}` : ""}` : "—"],
    [`${h} implied`, game.home_implied != null ? `${num(game.home_implied)}${slate.implied_rank?.[h] ? ` · ${ordinal(slate.implied_rank[h])} of ${slate.offenses}` : ""}` : "—"],
  ];
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[12.5px]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-faint">{label}</dt>
          <dd className="m-0 text-right font-semibold text-fg">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function InjuryList({ game, preview }) {
  const logos = logosOf(game);
  const rows = preview.injuries.filter((row) => row.status || ["QB", "RB", "WR", "TE"].includes(row.position));
  if (!rows.length) {
    return <p className="py-3 text-sm text-muted">No report published for {game.week_label} yet. Teams post them through the week before the game.</p>;
  }
  return (
    <div>
      {rows.slice(0, 14).map((row) => (
        <div key={`${row.team}-${row.player_id}`} className="flex items-center gap-2.5 border-b border-line py-2 last:border-0">
          {logos[row.team] && <img src={logos[row.team]} alt="" className="h-[18px] w-[18px] flex-none object-contain" />}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-semibold text-fg">{row.name} <span className="text-[11px] font-medium text-faint">{row.position}</span></div>
            <div className="truncate text-[11px] text-faint">{[row.injury, row.practice?.replace(" in Practice", "").replace("Participation", "practice")].filter(Boolean).join(" · ")}</div>
          </div>
          {injuryLabel(row) && <StatusTag status={injuryLabel(row)} />}
        </div>
      ))}
    </div>
  );
}

/** A game status when the team has declared one, otherwise what practice said: before
 *  Friday's statuses, "limited Wednesday" is the news. Full practice is no tag at all. */
function injuryLabel(injury) {
  if (!injury) return null;
  if (injury.status) return injury.status;
  if (/did not/i.test(injury.practice ?? "")) return "Did not practice";
  if (/limited/i.test(injury.practice ?? "")) return "Limited practice";
  return null;
}

function StatusTag({ status }) {
  const out = status.startsWith("Out");
  const tone = out ? "var(--neg)" : "var(--warn)";
  return (
    <span className="whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold"
      style={{ borderColor: `color-mix(in srgb, ${tone} 35%, transparent)`, background: `color-mix(in srgb, ${tone} 16%, transparent)`, color: `color-mix(in srgb, ${tone} 70%, var(--fg))` }}>
      {status}
    </span>
  );
}

export function MatchupTab({ game, preview, colors }) {
  const [a, h] = sides(game);
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="grid min-w-0 gap-4">
        <Panel title="Where the game will be decided" sub={`${basisLabel(preview, game)}. Rank among 32: 1st is the best offense, or the stingiest defense`}>
          <KeyMatchups game={game} preview={preview} />
        </Panel>
        <Panel title="EPA per play, game by game" sub="Net: offense minus defense. Grey band: the league's middle half each week"
          right={<TeamKey teams={[{ abbreviation: a, color: colors.away }, { abbreviation: h, color: colors.home }]} />}>
          <GameTrendChart trend={preview.trend} away={a} home={h} colors={colors} />
        </Panel>
        <Panel title="Points allowed to each position" sub={`Per game, ${preview.points_allowed.basis?.season ?? ""}. 1st allows the most, the softest matchup`}>
          <PointsAllowedGrid game={game} preview={preview} />
        </Panel>
      </div>
      <div className="grid min-w-0 gap-4">
        <Panel title="The line"><LineCard game={game} preview={preview} /></Panel>
        <Panel title="Form" sub="This season, oldest first">
          <div className="grid gap-3">
            {sides(game).map((team) => {
              const results = preview.form[team] ?? [];
              const ats = { w: results.filter((r) => r.cover === "W").length, l: results.filter((r) => r.cover === "L").length };
              const over = { o: results.filter((r) => r.over_under === "O").length, u: results.filter((r) => r.over_under === "U").length };
              return (
                <div key={team}>
                  <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs font-bold text-fg">
                    <TeamLabel game={game} team={team} />
                    <span className="font-medium text-faint">{ats.w}-{ats.l} against the spread · {over.o}-{over.u} over</span>
                  </div>
                  <FormStrip results={results} game={game} />
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel title="Injury report" sub={game.week_label}><InjuryList game={game} preview={preview} /></Panel>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- Fantasy
function matchupTone(matchup) {
  if (!matchup) return null;
  if (matchup.rank <= 8) return { label: "Soft", tone: "var(--pos)" };
  if (matchup.rank >= 25) return { label: "Tough", tone: "var(--neg)" };
  return { label: "Neutral", tone: null };
}

function MatchupTag({ matchup, position }) {
  const tone = matchupTone(matchup);
  if (!tone) return <span className="text-faint">—</span>;
  const style = tone.tone
    ? { borderColor: `color-mix(in srgb, ${tone.tone} 32%, transparent)`, background: `color-mix(in srgb, ${tone.tone} 15%, transparent)`, color: `color-mix(in srgb, ${tone.tone} 62%, var(--fg))` }
    : { borderColor: "var(--border)", color: "var(--muted)" };
  return (
    <span className="whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold" style={style}
      title={`${matchup.points_allowed.toFixed(1)} ${position} points allowed per game, ${ordinal(matchup.rank)} most of ${matchup.teams}`}>
      {tone.label} · {ordinal(matchup.rank)}
    </span>
  );
}

function WeekChips({ player }) {
  return (
    <div className="flex gap-1">
      {player.weeks.map((week) => (week.bye || !week.played ? (
        <span key={week.week} className="stat-num inline-block min-w-[42px] rounded-md border border-dashed border-line px-1 py-px text-center text-[10.5px] text-faint">{week.bye ? "BYE" : "—"}</span>
      ) : (
        <FinishChip key={week.week} rank={week.position_rank} position={player.position} detail={`Week ${week.week}: ${num(week.fantasy_points)} points`} />
      )))}
    </div>
  );
}

function PreviewFantasyTable({ game, preview, team }) {
  const players = (preview.players[team] ?? []).filter((p) => p.position !== "QB" || p.games >= 2).slice(0, 10);
  const weeks = players[0]?.weeks?.map((week) => week.week) ?? [];
  if (!players.length) return <p className="py-6 text-center text-sm text-muted">No games played yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-line">
            <th className={`${TH_LEFT} pin-col pl-0`}>Player</th>
            <th className={`${TH_CENTER}`}>{game.week_label} rank</th>
            <th className={TH}>PPG</th><th className={TH}>xPPG</th>
            <th className={`${TH_CENTER}`}>{weeks.length ? `Weeks ${weeks[0]}–${weeks[weeks.length - 1]}` : "Weeks"}</th>
            <th className={TH}>Tgt %</th><th className={TH}>Car %</th>
            <th className={`${TH_LEFT}`}>vs {opponentOf(game, team)}</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.player_id} className="border-b border-line align-middle last:border-0">
              <td className="pin-col py-1.5 pr-2">
                <PlayerName player={p} size={24} />
                {injuryLabel(p.injury) && <div className="ml-8 mt-1"><StatusTag status={`${injuryLabel(p.injury)}${p.injury.injury ? ` · ${p.injury.injury}` : ""}`} /></div>}
              </td>
              <td className="px-2 py-1.5 text-center">
                {p.consensus ? <b className="stat-num text-fg" title={`Consensus ${p.consensus.ecr?.toFixed(1)}, best ${p.consensus.best ?? "—"}, worst ${p.consensus.worst ?? "—"}`}>{p.consensus.label}</b> : <span className="text-faint">—</span>}
              </td>
              <td className={`${TD} font-bold text-fg`}>{num(p.fantasy_ppg)}</td>
              <td className={`${TD} text-muted`}>{num(p.expected_fantasy_ppg)}</td>
              <td className="px-2 py-1.5"><WeekChips player={p} /></td>
              <td className={`${TD} text-muted`}>{p.target_share ? pct(p.target_share) : "—"}</td>
              <td className={`${TD} text-muted`}>{p.rush_attempt_share ? pct(p.rush_attempt_share) : "—"}</td>
              <td className="px-2 py-1.5"><MatchupTag matchup={p.matchup} position={p.position} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PreviewFantasyTab({ game, preview }) {
  const ranked = Object.values(preview.players).flat().some((p) => p.consensus);
  return (
    <div className="grid gap-4">
      {sides(game).map((team) => (
        <Panel key={team} title={<TeamLabel game={game} team={team}>{team === game.away.abbreviation ? game.away.name : game.home.name}</TeamLabel>}
          sub={`${game.week_label} consensus position rank, scoring ${basisLabel(preview, game)}, and the matchup with ${opponentOf(game, team)}'s defense (1st allows the most)${ranked ? "" : `. No consensus ranks published for ${game.week_label} yet`}`}>
          <PreviewFantasyTable game={game} preview={preview} team={team} />
        </Panel>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------- Usage Trends
const USAGE = [
  { key: "target_share", label: "Target share", season: "target_share", max: 0.35 },
  { key: "rush_attempt_share", label: "Carry share", season: "rush_attempt_share", max: 0.8 },
  { key: "snap_share", label: "Snap share", season: "snap_share", max: 1 },
];

function UsageGrid({ players, usage }) {
  const rows = players.filter((p) => p.position !== "QB" && p.weeks.some((week) => (week[usage.key] ?? 0) > 0.04)).slice(0, 8);
  if (!rows.length) return null;
  const weeks = rows[0].weeks.map((week) => week.week);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-line">
            <th className={`${TH_LEFT} pin-col pl-0`}>{usage.label}</th>
            {weeks.map((week) => <th key={week} className={`${TH_CENTER}`}>W{week}</th>)}
            <th className={TH}>Season</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.player_id} className="border-b border-line last:border-0">
              <td className="pin-col py-1.5 pr-2"><PlayerName player={p} /></td>
              {p.weeks.map((week) => (
                <td key={week.week} className="stat-num px-1 py-1.5 text-center">
                  {week.bye ? <span className="text-[10px] text-faint">BYE</span> : !week.played ? <span className="text-faint">—</span> : <Heat value={week[usage.key]} max={usage.max}>{pct(week[usage.key])}</Heat>}
                </td>
              ))}
              <td className={`${TD} font-bold text-fg`}>{pct(p[usage.season])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function UsageTrendsTab({ game, preview }) {
  return (
    <div className="grid items-start gap-4 xl:grid-cols-2">
      {sides(game).map((team) => (
        <Panel key={team} title={<TeamLabel game={game} team={team}>{team === game.away.abbreviation ? game.away.name : game.home.name} by week</TeamLabel>}
          sub="Each share is of the team's own targets, carries or snaps that week">
          <div className="grid gap-5">
            {USAGE.map((usage) => <UsageGrid key={usage.key} players={preview.players[team] ?? []} usage={usage} />)}
          </div>
        </Panel>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------- Tale of the Tape
function TapeTable({ game, preview, offense }) {
  const defense = opponentOf(game, offense);
  const color = (team) => teamText(team === game.away.abbreviation ? "var(--away)" : "var(--home)");
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[460px] border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-line">
            <th className={`${TH_LEFT} pl-0`}>When {offense} has the ball</th>
            <th className={TH}><TeamLabel game={game} team={offense} /></th>
            <th className={TH}><TeamLabel game={game} team={defense} /></th>
            <th className={TH}>Edge</th>
          </tr>
        </thead>
        <tbody>
          {preview.tape.map((row) => {
            const off = row.o[offense], def = row.d[defense];
            const edge = off && def ? (off[1] < def[1] ? offense : def[1] < off[1] ? defense : null) : null;
            return (
              <tr key={row.id} className="border-b border-line last:border-0">
                <td className="py-1.5 pr-2 font-semibold text-muted">{row.label}</td>
                <td className={TD}><span className="inline-flex items-center gap-1.5 text-fg">{formatTeamStat(off?.[0], row.fmt)}<RankChip rank={off?.[1]} of={preview.teams_ranked} /></span></td>
                <td className={TD}><span className="inline-flex items-center gap-1.5 text-fg">{formatTeamStat(def?.[0], row.fmt)}<RankChip rank={def?.[1]} of={preview.teams_ranked} /></span></td>
                <td className={`${TD} font-extrabold`} style={{ color: edge ? color(edge) : undefined }}>{edge ?? ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TendencyTable({ game, rows, side, preview }) {
  const [a, h] = sides(game);
  return (
    <table className="w-full border-collapse text-[12.5px]">
      <thead>
        <tr className="border-b border-line">
          <th className={`${TH_LEFT} pl-0`} />
          <th className={TH}><TeamLabel game={game} team={a} /></th>
          <th className={TH}><TeamLabel game={game} team={h} /></th>
          <th className={TH}>League</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-b border-line last:border-0">
            <td className="py-1.5 pr-2 font-semibold text-muted">{row.label}</td>
            {[a, h].map((team) => {
              const cell = row[side][team];
              return (
                <td key={team} className={`${TD} text-fg`}>
                  {cell ? <>{formatTeamStat(cell[0], row.fmt)} <span className="text-[10.5px]" style={{ color: rankInk(cell[1], preview.teams_ranked) }}>{ordinal(cell[1])}</span></> : "—"}
                </td>
              );
            })}
            <td className={`${TD} text-faint`}>{formatTeamStat(row[`${side}_mean`], row.fmt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TapeTab({ game, preview }) {
  return (
    <div className="grid gap-4">
      <div className="grid items-start gap-4 xl:grid-cols-2">
        {sides(game).map((team) => <Panel key={team} sub={basisLabel(preview, game)}><TapeTable game={game} preview={preview} offense={team} /></Panel>)}
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Panel title="Offensive tendencies" sub="A tendency's rank is 1st for the most, not the best">
          <TendencyTable game={game} rows={preview.tendencies} side="o" preview={preview} />
        </Panel>
        <Panel title="Defensive tendencies">
          <TendencyTable game={game} rows={preview.defense_tendencies} side="d" preview={preview} />
          <h3 className="mb-1.5 mt-5 text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Passing by depth, share of throws</h3>
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-line">
                <th className={`${TH_LEFT} pl-0`} />
                {["Behind", "0–9", "10–19", "20+"].map((label) => <th key={label} className={TH}>{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {sides(game).map((team) => (
                <tr key={team} className="border-b border-line last:border-0">
                  <td className="py-1.5 pr-2 font-semibold text-muted"><TeamLabel game={game} team={team} /></td>
                  {(preview.pass_depth[team] ?? []).map((zone) => (
                    <td key={zone.key} className={`${TD} text-fg`}>{pct(zone.share)} <span className="text-[10px]" style={{ color: rankInk(zone.epa_rank, zone.epa_teams) }}>{formatTeamStat(zone.epa, "sgn2")}</span></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- Depth Charts
function TeamDepth({ game, side, preview }) {
  const team = game[side];
  const { data } = useTeam(team.team_id, { season: game.season });
  if (!data) return <Loading height={360} />;
  const stats = Object.fromEntries((preview.players[team.abbreviation] ?? []).map((p) => [p.player_id, p]));
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2 text-[13px] font-bold text-fg">{team.logo_url && <img src={team.logo_url} alt="" className="h-5 w-5 object-contain" />}{team.name}</div>
      <DepthChartField chart={data.depth_chart} asOf={data.depth_chart_as_of} stats={stats} season={preview.basis_season} weeksLabel="so far" />
      {preview.staff?.[team.abbreviation] && <CoachingStaff staff={[{ season: game.season, ...preview.staff[team.abbreviation] }]} season={game.season} />}
    </div>
  );
}

export function DepthTab({ game, preview }) {
  return (
    <div className="grid items-start gap-4 xl:grid-cols-2">
      {["away", "home"].map((side) => <TeamDepth key={side} game={game} side={side} preview={preview} />)}
    </div>
  );
}

// ------------------------------------------------------------------- History
function lineResult(meeting) {
  const result = meeting.line_result;
  if (!result || meeting.spread_line === null) return null;
  const favorite = meeting.spread_line > 0 ? meeting.home : meeting.away;
  return `${favorite} −${Math.abs(meeting.spread_line)} · ${result.covered ? `${result.covered} covered` : "push"}`;
}

export function HistoryTab({ game, preview }) {
  const [a, h] = sides(game);
  const logos = logosOf(game);
  const wins = { [a]: 0, [h]: 0, ties: 0 };
  preview.meetings.forEach((m) => { if (m.winner) wins[m.winner] += 1; else wins.ties += 1; });
  const leader = wins[a] === wins[h] ? null : wins[a] > wins[h] ? a : h;
  const record = leader ? `${leader} leads ${wins[leader]}-${wins[leader === a ? h : a]}${wins.ties ? `-${wins.ties}` : ""}` : `Series tied ${wins[a]}-${wins[h]}${wins.ties ? `-${wins.ties}` : ""}`;
  if (!preview.meetings.length) return <Panel title="Head to head"><p className="py-6 text-center text-sm text-muted">These teams have not met since 2009.</p></Panel>;
  return (
    <Panel title="Head to head since 2009" sub={`${record}. The top three fantasy scorers in each meeting`}>
      {preview.meetings.map((m) => (
        <div key={m.game_id} className="flex flex-wrap items-start gap-x-5 gap-y-2 border-b border-line py-2.5 last:border-0">
          <Link to={`/games/${m.game_id}`} className="w-[84px] flex-none hover:text-accent">
            <div className="stat-num font-bold text-fg">{m.season}</div>
            <div className="text-[11px] text-faint">{m.season_type === "POST" ? m.week_label : `Week ${m.week}`}</div>
          </Link>
          <div className="stat-num flex w-[150px] flex-none items-center gap-2">
            {logos[m.away] && <img src={logos[m.away]} alt="" className="h-[18px] w-[18px] object-contain" />}
            <span className={m.winner === m.away ? "font-extrabold text-fg" : "text-faint"}>{m.away_score}</span>
            <span className="text-faint">@</span>
            <span className={m.winner === m.home ? "font-extrabold text-fg" : "text-faint"}>{m.home_score}</span>
            {logos[m.home] && <img src={logos[m.home]} alt="" className="h-[18px] w-[18px] object-contain" />}
          </div>
          <div className="w-[170px] flex-none text-[11.5px] text-muted">{lineResult(m)}</div>
          <div className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-1.5">
            {m.top_scorers.map((p) => (
              <Link key={p.player_id} to={`/players/${p.player_id}`} className="inline-flex items-center gap-1.5 text-xs hover:text-accent">
                <Headshot url={p.headshot_url} name={p.name} size={20} />
                <span className="font-semibold text-fg">{p.name}</span>
                <span className="stat-num text-faint">{num(p.fantasy_points)}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </Panel>
  );
}
