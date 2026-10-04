// Every player who played for the team in the selected weeks: usage, opportunity and
// fantasy output, filtered by position, per game or as totals. Rows come from the
// player leaderboard filtered to this team, so a traded player shows only what he did
// here.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PositionTag } from "../PositionTag";
import { formatStat, shortName } from "../../utils/format";
import { Segmented } from "./Segmented";

const col = (key, label, kind = "count") => ({ key, label, kind });
const USAGE = ["Usage", [col("snap_count", "Snaps"), col("snap_share", "Snap %", "pct"), col("routes_run", "Routes"), col("route_participation", "Route %", "pct")]];
const FANTASY = ["Fantasy", [col("fantasy_points", "Pts", "fantasy")]];
const COLUMNS = {
  ALL: [USAGE, ["Opportunity", [col("targets", "Tgt"), col("target_share", "Tgt %", "pct"), col("carries", "Car"), col("rush_attempt_share", "Rush %", "pct")]], FANTASY],
  QB: [
    ["Usage", [col("snap_count", "Snaps"), col("snap_share", "Snap %", "pct")]],
    ["Passing", [col("completions", "Cmp"), col("attempts", "Att"), col("passing_yards", "Yds"), col("passing_tds", "TD"), col("interceptions", "INT")]],
    ["Rushing", [col("carries", "Car"), col("rushing_yards", "Yds"), col("rushing_tds", "TD")]],
    ["Efficiency", [col("epa_per_play", "EPA/play", "rate")]],
    FANTASY,
  ],
  RB: [
    USAGE,
    ["Rushing", [col("carries", "Car"), col("rush_attempt_share", "Rush %", "pct"), col("rush_att_inside_5", "Inside 5"), col("rushing_yards", "Yds"), col("rushing_tds", "TD")]],
    ["Receiving", [col("targets", "Tgt"), col("target_share", "Tgt %", "pct"), col("receptions", "Rec"), col("receiving_yards", "Yds")]],
    FANTASY,
  ],
  WR: [
    USAGE,
    ["Receiving", [col("targets", "Tgt"), col("target_share", "Tgt %", "pct"), col("red_zone_targets", "RZ Tgt"), col("air_yards", "Air Yds"), col("receptions", "Rec"), col("receiving_yards", "Yds"), col("receiving_tds", "TD")]],
    FANTASY,
  ],
};
COLUMNS.TE = COLUMNS.WR;

const POSITION_OPTIONS = ["ALL", "QB", "RB", "WR", "TE"].map((value) => ({ value, label: value === "ALL" ? "All" : value }));
const VIEW_OPTIONS = [{ value: "pg", label: "Per game" }, { value: "tot", label: "Totals" }];

function cellValue(row, column, view) {
  const value = row[column.key];
  if (value === null || value === undefined) return null;
  if (column.kind === "pct" || column.kind === "rate") return value;
  return view === "pg" && row.games_played ? value / row.games_played : value;
}

function cellText(value, column, view) {
  if (value === null || value === undefined) return <span className="text-faint">{"—"}</span>;
  if (column.kind === "pct") return `${(value * 100).toFixed(1)}%`;
  if (column.kind === "rate") return formatStat(value, 2);
  if (column.kind === "fantasy" || view === "pg") return formatStat(value, 1);
  return formatStat(value, 0);
}

export function TeamPlayersTable({ rows, isLoading, season, weeksLabel, position, onPosition, view, onView }) {
  const [sort, setSort] = useState({ key: "fantasy_points", dir: -1 });
  const groups = COLUMNS[position] ?? COLUMNS.ALL;
  const columns = groups.flatMap(([, list]) => list);
  const firstOfGroup = new Set(groups.map(([, list]) => list[0].key));
  const byKey = Object.fromEntries(columns.map((column) => [column.key, column]));
  const activeKey = byKey[sort.key] || ["name", "games_played"].includes(sort.key) ? sort.key : "fantasy_points";

  const sorted = useMemo(() => {
    const list = (rows ?? []).filter((row) => position === "ALL" || row.position === position);
    const { dir } = sort;
    return [...list].sort((a, b) => {
      if (activeKey === "name") return dir * a.name.localeCompare(b.name);
      if (activeKey === "games_played") return dir * (a.games_played - b.games_played);
      const va = cellValue(a, byKey[activeKey], view), vb = cellValue(b, byKey[activeKey], view);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return dir * (va - vb);
    });
  }, [rows, position, sort, activeKey, view, byKey]);

  const sortBy = (key) => setSort((current) => (current.key === key ? { key, dir: -current.dir } : { key, dir: key === "name" ? 1 : -1 }));
  const arrow = (key) => (activeKey === key ? (sort.dir < 0 ? " ↓" : " ↑") : "");
  const headerClass = (key, extra = "", align = "text-right") => `cursor-pointer select-none whitespace-nowrap px-2 py-1.5 font-semibold ${align} ${activeKey === key ? "text-fg" : "text-faint hover:text-muted"} ${extra}`;
  const label = (column) => (column.kind === "fantasy" ? (view === "pg" ? "Pts/G" : "Pts") : column.label);

  return (
    <section className="glass-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-fg">Players</h2>
          <p className="text-[11.5px] text-faint">{season} {"·"} {weeksLabel} {"·"} shares are of the team's plays in the games each player played</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Segmented options={POSITION_OPTIONS} value={position} onChange={onPosition} label="Position" />
          <Segmented options={VIEW_OPTIONS} value={view} onChange={onView} label="Per game or totals" />
        </div>
      </div>
      {/* On a phone the player is pinned while the stats scroll. */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12.5px] md:min-w-[760px]">
          <thead>
            <tr className="text-[10.5px] uppercase tracking-[0.08em] text-faint">
              <th colSpan={2} className="hidden md:table-cell" />
              <th className="pin-col md:hidden" />
              <th className="md:hidden" />
              {groups.map(([name, list]) => (
                <th key={name} colSpan={list.length} className="border-l border-line px-2 pb-1 text-center font-bold text-fg">{name}</th>
              ))}
            </tr>
            <tr className="border-b border-line text-[11px]">
              <th className={headerClass("name", "pin-col", "text-left")} onClick={() => sortBy("name")}>Player{arrow("name")}</th>
              <th className={headerClass("games_played")} onClick={() => sortBy("games_played")}>G{arrow("games_played")}</th>
              {columns.map((column) => (
                <th key={column.key} className={headerClass(column.key, firstOfGroup.has(column.key) ? "border-l border-line" : "")} onClick={() => sortBy(column.key)}>
                  {label(column)}{arrow(column.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && !rows && (
              <tr><td colSpan={columns.length + 2} className="px-2 py-8 text-center text-muted">Loading...</td></tr>
            )}
            {!isLoading && sorted.length === 0 && (
              <tr><td colSpan={columns.length + 2} className="px-2 py-8 text-center text-muted">No players in these weeks.</td></tr>
            )}
            {sorted.map((row) => (
              <tr key={row.player_id} className="border-b border-line last:border-0 hover:bg-surface-2">
                <td className="pin-col px-2 py-1.5">
                  <Link to={`/players/${row.player_id}`} className="flex items-center gap-2 whitespace-nowrap font-medium text-fg hover:text-accent">
                    {/* shrink-0: a shrinkable image let the cell size itself 24px short of its contents. */}
                    {row.headshot_url ? <img src={row.headshot_url} alt="" className="h-6 w-6 shrink-0 rounded-full bg-surface-2 object-cover" /> : <span className="h-6 w-6 shrink-0 rounded-full bg-surface-2" />}
                    <span className="md:hidden">{shortName(row.name)}</span>
                    <span className="hidden md:inline">{row.name}</span>
                    <PositionTag position={row.position} variant="quiet" />
                  </Link>
                </td>
                <td className="stat-num px-2 py-1.5 text-right text-muted">{row.games_played}</td>
                {columns.map((column) => (
                  <td key={column.key} className={`stat-num px-2 py-1.5 text-right ${column.kind === "fantasy" ? "font-semibold text-fg" : "text-muted"} ${firstOfGroup.has(column.key) ? "border-l border-line" : ""}`}>
                    {cellText(cellValue(row, column, view), column, view)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
