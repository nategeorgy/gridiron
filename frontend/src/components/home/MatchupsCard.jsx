// Week N Matchups (October 2026): the coming week's softest and toughest fantasy
// matchups at each position, read from the strength-of-schedule board for that one week.
//
// Difficulty is the SOS board's own 0-100 scale, where **higher is harder** and 0 is the
// defense allowing the most points to the position. It is never a rank, for the reason
// the SOS page gives: "the number one defense" and "the number one matchup" point
// opposite ways. The tint is the board's too (green easy, red hard, stronger with
// distance from an average matchup), and the basis is stated, since in the first weeks
// of a season the defensive numbers are last season's.
import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardHead, CardLink, CardState, FillBox, Tabs } from "./primitives";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { PositionTag } from "../PositionTag";
import { formatStat } from "../../utils/format";

// Four teams a list at the least. When the band stretches the card (the tale of the tape
// beside it is taller), each list takes as many more as fit. A position's column is 76.5px
// of tag and labels plus two lists of 33.5px rows, measured; the columns sit four across
// from 1,280px, two across from 640px, and one at a time on a phone.
const SHOWN = 4;
const COLUMN_FIXED = 76.5, ROW = 33.5, GRID_GAP = 16;
export const MATCHUP_POSITIONS = ["QB", "RB", "WR", "TE"];

/** How many teams each list shows in `height`, with `gridRows` rows of position columns. */
function listLength(height, gridRows, teams) {
  const column = (height - (gridRows - 1) * GRID_GAP) / gridRows;
  const fits = Math.floor((column - COLUMN_FIXED) / (2 * ROW));
  // Never so many that a team is both easiest and toughest.
  return Math.max(SHOWN, Math.min(fits, Math.floor(teams / 2)));
}

function tint(difficulty) {
  const distance = Math.min(Math.abs(difficulty - 50) / 50, 1);
  const token = difficulty < 50 ? "--pos" : "--neg";
  return `color-mix(in srgb, var(${token}) ${Math.round(distance * 55)}%, transparent)`;
}

/** Every team's game in `week`, with its difficulty, softest first. */
export function weekMatchups(board, week) {
  const index = (board?.weeks ?? []).indexOf(week);
  if (index < 0) return [];
  return (board.data ?? [])
    .map((row) => ({ team: row.abbreviation, teamId: row.team_id, game: row.schedule?.[index] }))
    .filter((entry) => entry.game && entry.game.difficulty !== null && entry.game.difficulty !== undefined)
    .sort((a, b) => a.game.difficulty - b.game.difficulty);
}

function Row({ entry, logos }) {
  const { game } = entry;
  return (
    <div className="grid grid-cols-[18px_34px_minmax(0,1fr)_auto_30px] items-center gap-1.5 border-t border-line py-1.5">
      {logos[entry.team] ? <img src={logos[entry.team]} alt="" className="h-[18px] w-[18px] object-contain" /> : <span />}
      <Link to={`/teams/${entry.teamId}`} className="text-[12px] font-bold text-fg hover:text-accent">{entry.team}</Link>
      <span className="flex min-w-0 items-center gap-1 text-[11px] text-faint">
        {game.is_home ? "vs" : "@"}
        {logos[game.opponent] && <img src={logos[game.opponent]} alt="" className="h-3.5 w-3.5 object-contain" />}
        {game.opponent}
      </span>
      <span className="stat-num text-right text-[11px] text-muted" title="Points allowed per game to the position">
        {formatStat(game.points_allowed_pg, 1)}
      </span>
      <span className="stat-num rounded-md py-0.5 text-center text-[11px] font-bold text-fg" style={{ background: tint(game.difficulty) }}
        title={`Difficulty ${Math.round(game.difficulty)} of 100`}>
        {Math.round(game.difficulty)}
      </span>
    </div>
  );
}

function basisText(basis, scheduleSeason) {
  if (!basis?.season) return "";
  if (basis.season === scheduleSeason) return `Defenses from ${basis.season}, ${basis.weeks} weeks`;
  return `Defenses from ${basis.season} until ${scheduleSeason} has ${basis.min_weeks ?? 4} weeks`;
}

const POSITION_TABS = MATCHUP_POSITIONS.map((value) => ({ value, label: value }));

export function MatchupsCard({ week, season, boards, logos, isLoading, isError }) {
  const lists = MATCHUP_POSITIONS.map((position) => ({ position, rows: weekMatchups(boards[position], week) }));
  const ready = lists.some((list) => list.rows.length);
  const basis = boards.WR?.basis ?? boards.RB?.basis;
  // A phone shows one position at a time: all four stacked ran about 1,100px.
  const [phonePosition, setPhonePosition] = useState("WR");
  const fourAcross = useMediaQuery("(min-width: 1280px)");
  const twoAcross = useMediaQuery("(min-width: 640px)") && !fourAcross;
  const gridRows = twoAcross ? 2 : 1;
  const teams = Math.min(...lists.map((list) => list.rows.length).filter(Boolean));

  return (
    <Card>
      <CardHead title={week ? `Week ${week} Matchups` : "Matchups"} sub="Strength of schedule, this week only">
        {ready && (
          <span className="sm:hidden">
            <Tabs options={POSITION_TABS} value={phonePosition} onChange={setPhonePosition} label="Position" />
          </span>
        )}
      </CardHead>
      <CardState isLoading={isLoading} isError={isError} isEmpty={!ready} empty="No priced matchups for this week yet." rows={6} />
      {ready && (
        <FillBox minHeight={gridRows * (COLUMN_FIXED + 2 * SHOWN * ROW) + (gridRows - 1) * GRID_GAP}>
          {({ height }) => {
            const shown = listLength(height, gridRows, teams);
            return (
        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
          {lists.map(({ position, rows }) => (
            <div key={position} className={`min-w-0 ${position === phonePosition ? "" : "max-sm:hidden"}`}>
              <PositionTag position={position} />
              {[["Easiest", rows.slice(0, shown), "--pos"], ["Toughest", rows.slice(-shown).reverse(), "--neg"]].map(([label, entries, token]) => (
                <div key={label} className="mt-2">
                  <div className="pb-1 text-[9.5px] font-bold uppercase tracking-[0.07em]" style={{ color: `color-mix(in srgb, var(${token}) 60%, var(--fg))` }}>
                    {label}
                  </div>
                  {entries.map((entry) => <Row key={entry.team} entry={entry} logos={logos} />)}
                </div>
              ))}
            </div>
          ))}
        </div>
            );
          }}
        </FillBox>
      )}
      {ready && (
        <p className="mt-3 text-[10.5px] text-faint">
          Points allowed per game to the position, then difficulty from 0 (easiest) to 100 (toughest). {basisText(basis, season)}.
        </p>
      )}
      <CardLink to="/insight/sos">Strength of schedule</CardLink>
    </Card>
  );
}
