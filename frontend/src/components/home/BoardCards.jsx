// The four ranked tables on the Command Center (M10).
//
// All four are the leaderboard endpoint with a different column set, which is the
// point: the boards a manager checks every week should not be a second implementation
// of the boards they can open in full. Each card links through to its own board with
// the same filters already applied.
import { useState } from "react";
import { Card, CardHead, CardLink, CardState, PlayerCell, ScrollTable, Tabs, Th } from "./primitives";
import { formatStat, formatSigned } from "../../utils/format";
import { percentileColor } from "../player/percentile";
import { scoringLabel } from "../../constants/scoring";

const POSITION_TABS = ["ALL", "QB", "RB", "WR", "TE", "FLEX"].map((value) => ({
  value,
  label: value,
}));

/** The positions each tab asks for. FLEX is every position a flex slot can start. */
export const WEEKLY_TAB_POSITIONS = { QB: "QB", RB: "RB", WR: "WR", TE: "TE", FLEX: "RB,WR,TE" };

/** " · 2 TD", or nothing — a zero would be noise on every line that scored none. */
function touchdowns(count, label = "TD") {
  return count > 0 ? ` · ${count} ${label}` : "";
}

/** The stat line under a weekly score, shaped for the position that earned it. */
function statLine(row) {
  if (row.position === "QB") {
    // Passing touchdowns sit beside the passing yards; a rushing score says so, since
    // "2 TD" after a rushing total would read as passing ones.
    return (
      `${formatStat(row.passing_yards, "int")} pass${touchdowns(row.passing_tds)}` +
      ` · ${formatStat(row.rushing_yards, "int")} rush${touchdowns(row.rushing_tds, "rush TD")}`
    );
  }
  // For a back or a pass catcher the scores are one number, however they came.
  const scores = touchdowns((row.rushing_tds ?? 0) + (row.receiving_tds ?? 0));
  if (row.position === "RB") {
    return `${formatStat(row.carries, "int")} car · ${formatStat(row.rushing_yards, "int")} yd · ${formatStat(row.receptions, "int")} rec${scores}`;
  }
  return `${formatStat(row.receptions, "int")}/${formatStat(row.targets, "int")} · ${formatStat(row.receiving_yards, "int")} yd${scores}`;
}

export function WeeklyScoringCard({ week, scoring, position, onPositionChange, result, isLoading, isError }) {
  const rows = result?.data ?? [];
  const scoredIn = scoringLabel(scoring);
  return (
    <Card>
      <CardHead title="Last Week's Scoring" sub={week ? `Week ${week} · ${scoredIn}` : scoredIn}>
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
      <CardLink to="/fantasy/all">Full weekly board</CardLink>
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

// The starred players, with the usage behind their scoring.
//
// ⚠️ Served by `/stats/intelligence`, not the leaderboard: **FOR** is a query-time
// Insight score with no stored column, which is the same reason six of the boards set
// `insight: true`. The watchlist is applied there as an output filter *after* scoring,
// so a starred player's FOR still means "against every back in the league" rather than
// "against the six players you happened to star" — narrowing the pool would quietly
// redefine the number.
//
// A player's own card should never hide him, so the request passes
// `include_unqualified`: a starred player who has missed games is exactly the one you
// are checking on, and dropping him below a games threshold would look like a bug.
// Columns that do not apply to a position render as a dash rather than a zero — a
// quarterback has no route participation, and 0% would be a claim.
/**
 * A value with its percentile beneath it, the same pairing the boards use.
 *
 * Deliberately small and tinted rather than a second column: the rank is context for the
 * number above it, and a card in the reading column cannot spend seven more columns on
 * it. A missing percentile is a dash, so "not ranked at this position" (a quarterback's
 * target share) stays visibly different from a zero.
 */
function PercentileCell({ value, format, percentile, position, tone = "text-muted" }) {
  return (
    <td className="stat-num py-2 text-right align-top">
      <span className="flex flex-col items-end leading-tight">
        <span className={tone}>{formatStat(value, format)}</span>
        {percentile === null || percentile === undefined ? (
          <span className="text-[9.5px] font-semibold text-faint" aria-hidden="true">
            &ndash;
          </span>
        ) : (
          <span
            className="text-[9.5px] font-semibold"
            style={{ color: percentileColor(percentile) }}
            title={`${percentile}th percentile among ${position}s this season`}
          >
            {percentile}
          </span>
        )}
      </span>
    </td>
  );
}

export function MyPlayersCard({ season, count, result, isLoading, isError }) {
  const rows = result?.data ?? [];
  return (
    <Card>
      <CardHead title="My Players" sub={`${count} starred · ${season}`} />
      <CardState isLoading={isLoading} isError={isError} isEmpty={rows.length === 0} empty={`No ${season} stats yet for your watchlist.`} rows={5} />
      {rows.length > 0 && (
        <ScrollTable minWidth={620}>
          <thead>
            <tr>
              <Th align="left">Player</Th>
              <Th>FPTS</Th>
              <Th>FPPG</Th>
              <Th>FOR</Th>
              <Th>OPP%</Th>
              <Th>TGT%</Th>
              <Th>RTE%</Th>
              <Th>RUSH%</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const cell = (id, format, tone) => (
                <PercentileCell
                  value={row[id]}
                  format={format}
                  percentile={row.percentiles?.[id]}
                  position={row.position}
                  tone={tone}
                />
              );
              return (
                <tr key={row.player_id} className="border-t border-line">
                  <td className="py-2 align-top">
                    <PlayerCell
                      playerId={row.player_id}
                      name={row.name}
                      position={row.position}
                      team={row.team_abbreviation}
                    />
                  </td>
                  {cell("fantasy_points", 1, "font-semibold text-accent")}
                  {cell("fantasy_ppg", 1, "text-fg")}
                  {cell("fantasy_opportunity_rating", 1, "text-fg")}
                  {cell("opportunity_share", "pct", "text-muted")}
                  {cell("target_share", "pct", "text-muted")}
                  {cell("route_participation", "pct", "text-muted")}
                  {cell("rush_attempt_share", "pct", "text-muted")}
                </tr>
              );
            })}
          </tbody>
        </ScrollTable>
      )}
      <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
        <b className="font-semibold text-muted">FOR</b> is Fantasy Opportunity Rating:
        0-100 on how much of an offense runs through a player, ranked against everyone
        at their position. The shares beneath it are what it is built from. The small
        number under each value is its percentile at that position this season.
      </p>
      <CardLink to="/fantasy/all?watchlist=1">Manage watchlist</CardLink>
    </Card>
  );
}
