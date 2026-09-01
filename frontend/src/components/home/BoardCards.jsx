// The four ranked tables on the Command Center (M10).
//
// All four are the leaderboard endpoint with a different column set, which is the
// point: the boards a manager checks every week should not be a second implementation
// of the boards they can open in full. Each card links through to its own board with
// the same filters already applied.
import { useState } from "react";
import { Card, CardHead, CardLink, CardState, PlayerCell, ScrollTable, Tabs, Th } from "./primitives";
import { formatStat, formatSigned } from "../../utils/format";

const POSITION_TABS = ["ALL", "QB", "RB", "WR", "TE"].map((value) => ({
  value,
  label: value,
}));

/** The stat line under a weekly score, shaped for the position that earned it. */
function statLine(row) {
  if (row.position === "QB") {
    return `${formatStat(row.passing_yards, "int")} pass · ${formatStat(row.rushing_yards, "int")} rush`;
  }
  if (row.position === "RB") {
    return `${formatStat(row.carries, "int")} car · ${formatStat(row.rushing_yards, "int")} yd · ${formatStat(row.receptions, "int")} rec`;
  }
  return `${formatStat(row.receptions, "int")}/${formatStat(row.targets, "int")} · ${formatStat(row.receiving_yards, "int")} yd`;
}

export function WeeklyScoringCard({ week, position, onPositionChange, result, isLoading, isError }) {
  const rows = result?.data ?? [];
  return (
    <Card>
      <CardHead title="Last Week's Scoring" sub={week ? `Week ${week} · your scoring` : "your scoring"}>
        <Tabs options={POSITION_TABS} value={position} onChange={onPositionChange} label="Position" />
      </CardHead>
      <CardState isLoading={isLoading} isError={isError} isEmpty={rows.length === 0} empty="No games scored in this week." rows={6} />
      {rows.length > 0 && (
        <ScrollTable minWidth={400}>
          <thead>
            <tr>
              <Th align="left">Player</Th>
              <Th>Stat line</Th>
              <Th>FPTS</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.player_id} className="border-t border-line">
                <td className="py-2">
                  <PlayerCell
                    playerId={row.player_id}
                    name={row.name}
                    position={row.position}
                    team={row.team_abbreviation}
                    rank={index + 1}
                  />
                </td>
                <td className="stat-num py-2 text-right text-[11px] text-muted">{statLine(row)}</td>
                <td className="stat-num py-2 text-right font-semibold text-accent">
                  {formatStat(row.fantasy_points, 1)}
                </td>
              </tr>
            ))}
          </tbody>
        </ScrollTable>
      )}
      <CardLink to="/fantasy/leaders">Full weekly board</CardLink>
    </Card>
  );
}

// The opportunity columns, per position. A back's job is carries and goal-line work; a
// receiver's is routes and targets — so these are different questions, not one table
// with a position filter.
export const OPPORTUNITY_COLUMNS = {
  RB: [
    ["carries", "CAR", "int"],
    ["rush_attempt_share", "RUSH%", "pct"],
    ["target_share", "TGT%", "pct"],
    ["opportunity_share", "OPP%", "pct"],
    ["rush_att_inside_10", "IN10", "int"],
    ["snap_share", "SNAP%", "pct"],
  ],
  WR: [
    ["targets", "TGT", "int"],
    ["target_share", "TGT%", "pct"],
    ["red_zone_targets", "RZ TGT", "int"],
    ["routes_run", "RTS", "int"],
    ["route_participation", "RTE%", "pct"],
    ["snap_share", "SNAP%", "pct"],
  ],
};
OPPORTUNITY_COLUMNS.TE = OPPORTUNITY_COLUMNS.WR;

const OPPORTUNITY_TABS = ["RB", "WR", "TE"].map((value) => ({ value, label: value }));

export function OpportunityCard({ season, position, onPositionChange, result, isLoading, isError }) {
  const rows = result?.data ?? [];
  const columns = OPPORTUNITY_COLUMNS[position];
  const sortedBy = position === "RB" ? "carries" : "targets";

  return (
    <Card>
      <CardHead title="Opportunity Leaders" sub={`${season} · sorted by ${sortedBy}`}>
        <Tabs options={OPPORTUNITY_TABS} value={position} onChange={onPositionChange} label="Position" />
      </CardHead>
      <CardState isLoading={isLoading} isError={isError} isEmpty={rows.length === 0} rows={6} />
      {rows.length > 0 && (
        <ScrollTable minWidth={480}>
          <thead>
            <tr>
              <Th align="left">Player</Th>
              {columns.map(([, label]) => (
                <Th key={label}>{label}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.player_id} className="border-t border-line">
                <td className="py-2">
                  <PlayerCell
                    playerId={row.player_id}
                    name={row.name}
                    team={row.team_abbreviation}
                    rank={index + 1}
                  />
                </td>
                {columns.map(([metric, label, format], column) => (
                  <td
                    key={label}
                    className={`stat-num py-2 text-right ${column === 0 ? "font-semibold text-accent" : "text-muted"}`}
                  >
                    {formatStat(row[metric], format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </ScrollTable>
      )}
      <CardLink to={`/nfl/all?position=${position}`}>Full {position} usage board</CardLink>
    </Card>
  );
}

export function QuarterbackCard({ season, result, isLoading, isError }) {
  const rows = result?.data ?? [];
  return (
    <Card>
      <CardHead title="Quarterbacks · EPA & CPOE" sub={`${season} · sorted by EPA`} />
      <CardState isLoading={isLoading} isError={isError} isEmpty={rows.length === 0} rows={6} />
      {rows.length > 0 && (
        <ScrollTable minWidth={470}>
          <thead>
            <tr>
              <Th align="left">Player</Th>
              <Th>EPA</Th>
              <Th>EPA/Play</Th>
              <Th>CPOE</Th>
              <Th>Yds</Th>
              <Th>TD</Th>
              <Th>Int</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.player_id} className="border-t border-line">
                <td className="py-2">
                  <PlayerCell
                    playerId={row.player_id}
                    name={row.name}
                    team={row.team_abbreviation}
                    rank={index + 1}
                  />
                </td>
                <td className="stat-num py-2 text-right font-semibold text-accent">{formatStat(row.epa, 1)}</td>
                <td className="stat-num py-2 text-right text-muted">{formatStat(row.epa_per_play, 3)}</td>
                <td
                  className="stat-num py-2 text-right"
                  style={{ color: row.cpoe >= 0 ? "var(--pos)" : "var(--neg)" }}
                >
                  {formatSigned(row.cpoe, 1)}
                </td>
                <td className="stat-num py-2 text-right text-muted">{formatStat(row.passing_yards, "int")}</td>
                <td className="stat-num py-2 text-right text-muted">{formatStat(row.passing_tds, "int")}</td>
                <td className="stat-num py-2 text-right text-muted">{formatStat(row.interceptions, "int")}</td>
              </tr>
            ))}
          </tbody>
        </ScrollTable>
      )}
      {/* EPA is passing + rushing, so the per-play rate is the one that credits a
          quarterback's legs instead of diluting him for having them. */}
      <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
        EPA is passing plus rushing. <b className="font-semibold text-muted">EPA/play</b> divides it by
        attempts and carries, so a running quarterback's legs count toward the rate.
      </p>
      <CardLink to="/nfl/passing">Full QB board</CardLink>
    </Card>
  );
}

export function MyPlayersCard({ season, count, result, isLoading, isError }) {
  const rows = result?.data ?? [];
  return (
    <Card>
      <CardHead title="My Players" sub={`${count} starred · ${season}`} />
      <CardState isLoading={isLoading} isError={isError} isEmpty={rows.length === 0} empty={`No ${season} stats yet for your watchlist.`} rows={5} />
      {rows.length > 0 && (
        <ScrollTable minWidth={430}>
          <thead>
            <tr>
              <Th align="left">Player</Th>
              <Th>G</Th>
              <Th>FPTS</Th>
              <Th>PPG</Th>
              <Th>Snap%</Th>
              <Th>Opp%</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.player_id} className="border-t border-line">
                <td className="py-2">
                  <PlayerCell
                    playerId={row.player_id}
                    name={row.name}
                    position={row.position}
                    team={row.team_abbreviation}
                  />
                </td>
                <td className="stat-num py-2 text-right text-muted">{row.games_played}</td>
                <td className="stat-num py-2 text-right font-semibold text-accent">
                  {formatStat(row.fantasy_points, 1)}
                </td>
                <td className="stat-num py-2 text-right text-muted">{formatStat(row.fantasy_ppg, 1)}</td>
                <td className="stat-num py-2 text-right text-muted">{formatStat(row.snap_share, "pct")}</td>
                <td className="stat-num py-2 text-right text-muted">{formatStat(row.opportunity_share, "pct")}</td>
              </tr>
            ))}
          </tbody>
        </ScrollTable>
      )}
      <CardLink to="/fantasy/leaders?watchlist=1">Manage watchlist</CardLink>
    </Card>
  );
}
