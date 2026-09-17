// Week standouts — the top of the Command Center.
//
// A handful of hand-picked players (constants/signals.js) and one week of how they were
// used, in three groups read left to right: **on the field** (snap share, routes, route
// participation), **usage** (targets, target share, air yards) and **efficiency** (yards,
// targets and fantasy points per route run).
//
// **Each value carries its rank at the position, as a `FinishChip`.** The same five steps
// the player page colours a finish with — from how deep the reader's league starts the
// position, never a percentile of the pool — so "WR11" in routes reads as starter-level
// usage in a 12-team league and a darker red as usage no manager could start. The mockup's
// literal-share meters and per-value sub-line were dropped in favour of the rank alone.
//
// Every number is scoped to the one week (`weeks=`), so the card keeps describing Week 1
// after Week 2 has been played. Fantasy points are left to Last Week's Scoring directly
// below; this card is the usage behind them.
import { Link } from "react-router-dom";
import { PositionTag } from "../PositionTag";
import { FinishChip } from "../player/FinishChip";
import { Card, CardHead, CardLink, CardState } from "./primitives";
import { formatStat } from "../../utils/format";

export const STANDOUT_GROUPS = [
  {
    label: "On the field",
    stats: [
      { id: "snap_share", label: "Snap%", format: "share" },
      { id: "routes_run", label: "Routes", format: "int" },
      { id: "route_participation", label: "Route%", format: "share" },
    ],
  },
  {
    label: "Usage",
    stats: [
      { id: "targets", label: "Targets", format: "int" },
      { id: "target_share", label: "Tgt%", format: "share" },
      { id: "air_yards", label: "Air yds", format: "int" },
    ],
  },
  {
    label: "Efficiency",
    stats: [
      { id: "yards_per_route_run", label: "YPRR", format: 2 },
      { id: "targets_per_route_run", label: "TPRR", format: "pct" },
      { id: "fantasy_points_per_route_run", label: "FP/RR", format: 2 },
    ],
  },
];

export const STANDOUT_METRICS = STANDOUT_GROUPS.flatMap((group) => group.stats.map((stat) => stat.id));

/** A share as a whole percent: "76%" fits a cell that "76.0%" does not. */
function display(value, format) {
  if (value === null || value === undefined) return "—";
  if (format === "share") return `${Math.round(value * 100)}%`;
  return formatStat(value, format);
}

/** "@ MIN · L 22–39" from the player's side of the week's game, or "@ MIN" before it. */
function gameLine(team, games) {
  const game = games.find((entry) => entry.home_abbreviation === team || entry.away_abbreviation === team);
  if (!game) return null;
  const home = game.home_abbreviation === team;
  const opponent = home ? game.away_abbreviation : game.home_abbreviation;
  const matchup = `${home ? "vs" : "@"} ${opponent}`;
  if (!game.played) return matchup;
  const ours = home ? game.home_score : game.away_score;
  const theirs = home ? game.away_score : game.home_score;
  const result = ours > theirs ? "W" : ours < theirs ? "L" : "T";
  return `${matchup} · ${result} ${ours}–${theirs}`;
}

function StandoutRow({ row, headshot, games, league }) {
  const context = gameLine(row.team_abbreviation, games);
  return (
    <div className="grid gap-2.5 border-b border-dashed border-line py-3 last:border-0 xl:grid-cols-[168px_1fr] xl:items-center xl:gap-3.5">
      <div className="flex min-w-0 items-center gap-2.5">
        {headshot ? (
          <img
            src={headshot}
            alt=""
            className="h-11 w-11 shrink-0 rounded-xl border border-edge bg-surface-2 object-cover object-top"
          />
        ) : (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-edge bg-surface-2 text-sm font-bold text-muted">
            {row.name?.[0]}
          </span>
        )}
        <div className="min-w-0">
          <Link
            to={`/players/${row.player_id}`}
            className="block truncate text-[13.5px] font-bold tracking-tight text-fg transition hover:text-accent"
          >
            {row.name}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10.5px] text-faint">
            <PositionTag position={row.position} variant="quiet" />
            <span>{row.team_abbreviation}</span>
            {context && <span>{context}</span>}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 sm:gap-2">
        {STANDOUT_GROUPS.map((group, index) => (
          <div
            key={group.label}
            className={`grid grid-cols-3 gap-1.5 ${index > 0 ? "sm:border-l sm:border-line sm:pl-2" : ""}`}
          >
            {/* Wide screens name the groups once, above every row; narrow ones here. */}
            <span className="col-span-3 text-[9px] font-bold uppercase tracking-[0.1em] text-faint xl:hidden">
              {group.label}
            </span>
            {group.stats.map((stat) => (
              <div key={stat.id} className="min-w-0 text-center">
                <div className="stat-num text-[15px] font-semibold leading-tight text-fg">
                  {display(row[stat.id], stat.format)}
                </div>
                <div className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-[0.06em] text-faint">
                  {stat.label}
                </div>
                <div className="mt-1">
                  <FinishChip rank={row.ranks?.[stat.id]} position={row.position} league={league} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function StandoutsCard({ week, rows, headshots, games = [], league, isLoading, isError }) {
  return (
    <Card>
      <CardHead title={`Week ${week} Standouts`} />
      <CardState isLoading={isLoading} isError={isError} isEmpty={rows.length === 0} empty="No standouts picked for this week." rows={5} />

      {rows.length > 0 && (
        <div>
          <div className="hidden border-b border-line pb-1.5 xl:grid xl:grid-cols-[168px_1fr] xl:gap-3.5">
            <span />
            <div className="grid grid-cols-3 gap-2">
              {STANDOUT_GROUPS.map((group, index) => (
                <span
                  key={group.label}
                  className={`text-center text-[9.5px] font-bold uppercase tracking-[0.1em] text-faint ${index > 0 ? "pl-2" : ""}`}
                >
                  {group.label}
                </span>
              ))}
            </div>
          </div>
          {rows.map((row) => (
            <StandoutRow
              key={row.player_id}
              row={row}
              headshot={headshots?.[row.player_id]}
              games={games}
              league={league}
            />
          ))}
        </div>
      )}

      <CardLink to={`/nfl/receiving-advanced?weeks=${week}`}>Full receiving board for the week</CardLink>
    </Card>
  );
}
