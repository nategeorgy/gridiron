// Weekly Finishes (October 2026): where each of a position's top scorers finished, week
// by week, in the finish chips' five bands from green to red.
//
// The grid answers what a season total hides: whether a player's points came every week
// or in two big games. Each cell is the finish the player's game log shows (the endpoint
// reads the Query Builder's ranking, pinned to the game log in tests).
//
// Each cell is coloured exactly as a finish chip is (`finishTier` in FinishChip.jsx, bands
// set per position), so a week reads the same here as on the player's page. Top counts
// the weeks in the best band and Duds the weeks in the worst. It was a continuous scale
// anchored on how deep a 12-team league starts the position until October 2026.
//
// Byes come from the schedule, so a hatched cell is a bye, a dot is a game missed, and a
// blank cell is a game not played yet: the rest of the season, and Monday night on a Monday.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Card, CardHead, CardLink, CardState, Tabs } from "./primitives";
import { Headshot } from "../explore/common";
import { finishBand, finishBands, finishTier } from "../player/FinishChip";
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

/** Weeks in the best band, and weeks in the worst. */
function summarize(row, position) {
  const bands = Object.values(row.finishes).map((rank) => finishBand(rank, position));
  return { top: bands.filter((band) => band === 0).length, duds: bands.filter((band) => band === 4).length };
}

function WeekCell({ week, row, position }) {
  const rank = row.finishes[week];
  if (rank != null) {
    const tier = finishTier(rank, position);
    return (
      <span
        className={CELL}
        style={{ background: tier.background, color: tier.color }}
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

/** The key: the five bands, coloured as the cells are. */
function ScaleKey({ position }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10.5px] font-semibold text-muted">
      {finishBands(position).map((band) => {
        const { background, color } = finishTier(band.from, position);
        return (
          <span key={band.label} className="stat-num rounded-md px-1.5 py-px" style={{ background, color }}>
            {band.label}
          </span>
        );
      })}
    </div>
  );
}

export function WeeklyFinishesCard({ season, scoring, position, onPositionChange, minGames, result, isLoading, isError }) {
  const [sort, setSort] = useState({ key: "total", descending: true });
  const weeks = result?.weeks ?? [];
  const top = finishBands(position)[0].to;

  const rows = useMemo(() => {
    const withSummary = (result?.data ?? []).map((row) => ({ ...row, ...summarize(row, position) }));
    const value = (row) => ({ total: row.fantasy_points, ppg: row.fantasy_ppg, top: row.top, duds: row.duds })[sort.key];
    // Ties keep the endpoint's order, which is total points.
    return withSummary
      .map((row, index) => ({ row, index }))
      .sort((a, b) => (sort.descending ? value(b.row) - value(a.row) : value(a.row) - value(b.row)) || a.index - b.index)
      .map(({ row }) => row);
  }, [result, position, sort]);

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

  const sub = [season, scoringLabel(scoring), `most points, ${minGames}+ games`]
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
                        <WeekCell week={week} row={row} position={position} />
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
          <ScaleKey position={position} />
        </div>
      )}
      <CardLink to={`/leaderboards/fantasy?positions=${position}`}>Full fantasy board</CardLink>
    </Card>
  );
}
