// Weekly Finishes (October 2026): where each of a position's top scorers finished, week
// by week, on a green-to-yellow-to-red scale.
//
// The grid answers what a season total hides: whether a player's points came every week
// or in two big games. Each cell is the finish the player's game log shows (the endpoint
// reads the Query Builder's ranking, pinned to the game log in tests).
//
// The scale is anchored on how deep a league starts the position, not on the pool: green
// at the week's best finish, yellow at the last rank a league starts (RB28 in a 12-team
// league), red from one league's worth of ranks past that, which is also where Duds start
// counting. So QB15 is already orange and WR15 still green, which is how a manager reads
// them.
//
// Byes come from the schedule, so a hatched cell is a bye, a dot is a game missed, and a
// blank cell is a game not played yet: the rest of the season, and Monday night on a Monday.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Card, CardHead, CardLink, CardState, Tabs } from "./primitives";
import { Headshot } from "../explore/common";
import { startingDepth } from "../player/FinishChip";
import { formatStat, shortName } from "../../utils/format";
import { scoringLabel } from "../../constants/scoring";

export const FINISH_POSITIONS = ["QB", "RB", "WR", "TE"];
/** Rows per position: the deep positions get more, since a league starts more of them. */
export const FINISH_LIMITS = { QB: 20, RB: 30, WR: 30, TE: 20 };
const TABS = FINISH_POSITIONS.map((value) => ({ value, label: value }));

// The sortable columns on the right, and the direction each one is best in.
const SORTS = {
  total: { label: "Total", descending: true },
  ppg: { label: "PPG", descending: true },
  top: { label: "Top", descending: true },
  duds: { label: "Duds", descending: false },
};

const CELL = "stat-num grid h-6 w-[38px] place-items-center rounded-md text-[11.5px] font-semibold";

/** The three anchors of the scale: the top tier, the last started rank, and the dud line. */
function anchors(position, league) {
  const depth = startingDepth(position, league);
  return { top: depth.top, start: depth.flex, dud: depth.flex + league.teams };
}

/** The scale's hue at a rank: green to yellow up to the last started rank, then to red. */
function finishHue(rank, position, league) {
  const { start, dud } = anchors(position, league);
  if (rank <= start) {
    const share = start > 1 ? (rank - 1) / (start - 1) : 1;
    return `color-mix(in srgb, var(--scale-mid) ${Math.round(share * 100)}%, var(--pos))`;
  }
  const share = Math.min(1, (rank - start) / (dud - start));
  return `color-mix(in srgb, var(--neg) ${Math.round(share * 100)}%, var(--scale-mid))`;
}

/** A tinted fill with its text mixed toward the foreground, as FinishChip does. */
function finishStyle(rank, position, league) {
  const hue = finishHue(rank, position, league);
  return {
    background: `color-mix(in srgb, ${hue} 44%, transparent)`,
    color: `color-mix(in srgb, ${hue} 26%, var(--fg))`,
  };
}

/** Weeks inside the top tier, and games past the dud line. */
function summarize(row, position, league) {
  const { top, dud } = anchors(position, league);
  const ranks = Object.values(row.finishes);
  return { top: ranks.filter((rank) => rank <= top).length, duds: ranks.filter((rank) => rank > dud).length };
}

function WeekCell({ week, row, position, league }) {
  const rank = row.finishes[week];
  if (rank != null) {
    return (
      <span
        className={CELL}
        style={finishStyle(rank, position, league)}
        title={`Week ${week}: ${position}${rank}, ${formatStat(row.points[week], 1)} points`}
      >
        {rank}
      </span>
    );
  }
  if (row.byes.includes(week)) {
    return (
      <span
        className={`${CELL} text-[8.5px] font-bold tracking-wide text-faint`}
        style={{
          background:
            "repeating-linear-gradient(135deg, color-mix(in srgb, var(--fg) 9%, transparent) 0 3px, transparent 3px 7px)",
        }}
        title={`Week ${week}: bye`}
      >
        BYE
      </span>
    );
  }
  if (row.upcoming.includes(week)) {
    return <span className={CELL} style={{ background: "color-mix(in srgb, var(--fg) 3%, transparent)" }} />;
  }
  return (
    <span
      className={`${CELL} text-faint`}
      style={{ background: "color-mix(in srgb, var(--fg) 6%, transparent)" }}
      title={`Week ${week}: did not play`}
    >
      ·
    </span>
  );
}

/** The key: the scale as a bar, labelled at its three anchors. */
function ScaleKey({ position, league }) {
  const { start, dud } = anchors(position, league);
  const stop = (rank) => finishStyle(rank, position, league).background;
  const middle = ((start - 1) / (dud - 1)) * 100;
  return (
    <div className="flex items-center gap-2 text-[10.5px] font-semibold text-muted">
      <span className="stat-num">{position}1</span>
      <span className="relative h-2.5 w-44 rounded-full sm:w-56">
        <span
          className="absolute inset-0 rounded-full"
          style={{ background: `linear-gradient(90deg, ${stop(1)}, ${stop(start)} ${middle}%, ${stop(dud)})` }}
        />
        <span
          className="stat-num absolute top-full mt-0.5 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-faint"
          style={{ left: `${middle}%` }}
        >
          {position}
          {start}
        </span>
      </span>
      <span className="stat-num">
        {position}
        {dud}+
      </span>
    </div>
  );
}

export function WeeklyFinishesCard({ season, scoring, league, position, onPositionChange, minGames, result, isLoading, isError }) {
  const [sort, setSort] = useState({ key: "total", descending: true });
  const weeks = result?.weeks ?? [];
  const { top } = anchors(position, league);

  const rows = useMemo(() => {
    const withSummary = (result?.data ?? []).map((row) => ({ ...row, ...summarize(row, position, league) }));
    const value = (row) => ({ total: row.fantasy_points, ppg: row.fantasy_ppg, top: row.top, duds: row.duds })[sort.key];
    // Ties keep the endpoint's order, which is total points.
    return withSummary
      .map((row, index) => ({ row, index }))
      .sort((a, b) => (sort.descending ? value(b.row) - value(a.row) : value(a.row) - value(b.row)) || a.index - b.index)
      .map(({ row }) => row);
  }, [result, position, league, sort]);

  const onSort = (key) =>
    setSort((current) =>
      current.key === key ? { key, descending: !current.descending } : { key, descending: SORTS[key].descending },
    );

  const sortHeader = (key, label) => (
    <th className="whitespace-nowrap px-1.5 pb-2 text-right">
      <button
        type="button"
        onClick={() => onSort(key)}
        className={`text-[9.5px] font-bold uppercase tracking-[0.07em] transition hover:text-fg ${
          sort.key === key ? "text-fg" : "text-faint"
        }`}
      >
        {label}
        {sort.key === key && <span className="ml-0.5">{sort.descending ? "▾" : "▴"}</span>}
      </button>
    </th>
  );

  const sub = [season, scoringLabel(scoring), `${league.teams}-team league`, `most points, ${minGames}+ games`]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card>
      <CardHead title="Weekly Finishes" sub={sub}>
        <Tabs options={TABS} value={position} onChange={onPositionChange} label="Position" />
      </CardHead>
      <CardState isLoading={isLoading} isError={isError} isEmpty={rows.length === 0} empty="No games played yet this season." rows={8} />
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-separate border-spacing-y-[3px] text-left text-sm">
            <thead>
              <tr>
                <th className="pin-col w-px whitespace-nowrap pb-2 pl-1 text-[9.5px] font-bold uppercase tracking-[0.07em] text-faint">Player</th>
                {weeks.map((week) => (
                  <th
                    key={week}
                    className={`stat-num pb-2 text-center text-[10px] font-semibold ${
                      week <= (result?.last_week ?? 0) ? "text-muted" : "text-faint"
                    }`}
                  >
                    {week}
                  </th>
                ))}
                {sortHeader("total", SORTS.total.label)}
                {sortHeader("ppg", SORTS.ppg.label)}
                {sortHeader("top", `Top ${top}`)}
                {sortHeader("duds", SORTS.duds.label)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.player_id}>
                  <td className="pin-col max-w-[270px] py-px pl-1 pr-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="stat-num w-4 shrink-0 text-right text-[10.5px] text-faint">{index + 1}</span>
                      <Headshot url={row.headshot_url} name={row.name} size={22} />
                      <Link to={`/players/${row.player_id}`} className="truncate text-[13px] font-semibold text-fg hover:text-accent">
                        <span className="hidden md:inline">{row.name}</span>
                        <span className="md:hidden">{shortName(row.name)}</span>
                      </Link>
                      <span className="shrink-0 text-[10.5px] text-faint">{row.team}</span>
                    </div>
                  </td>
                  {weeks.map((week) => (
                    <td key={week} className="px-[1.5px] py-px">
                      <div className="flex justify-center">
                        <WeekCell week={week} row={row} position={position} league={league} />
                      </div>
                    </td>
                  ))}
                  <td className="stat-num px-1.5 text-right text-[12.5px] text-muted">{formatStat(row.fantasy_points, 1)}</td>
                  <td className="stat-num px-1.5 text-right text-[13px] font-bold text-fg">{formatStat(row.fantasy_ppg, 1)}</td>
                  <td className="stat-num px-1.5 text-right text-[12.5px] text-muted">{row.top}</td>
                  <td className="stat-num px-1.5 text-right text-[12.5px] text-muted">{row.duds}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && (
        <div className="mt-3 pb-3">
          <ScaleKey position={position} league={league} />
        </div>
      )}
      <CardLink to={`/leaderboards/fantasy?positions=${position}`}>Full fantasy board</CardLink>
    </Card>
  );
}
