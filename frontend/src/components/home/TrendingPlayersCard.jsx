// Trending Players — the top of the Command Center (renamed from Week Standouts,
// September 2026).
//
// A handful of hand-picked players (`TRENDING_PLAYERS` in constants/signals.js) and
// four stats each, with **the change stated underneath rather than drawn**. An earlier
// build put a dot-and-track dumbbell in every cell, showing both the move and where the
// player sat league-wide; the second job is already done by the rank beside his points,
// so the track was spending a third of the row on a fact the row already carried.
//
// **Each pick names its own four stats and its own basis for the change** (see
// `TRENDING_BASIS`). One receiver is measured against his own last week, a back against
// the teammate he took the carries from, a quarterback against the position for the
// whole season. That is deliberate: the card holds one question ("why is this player
// worth a look this week?") and the evidence for it is not the same shape every time.
//
// Stats are metric ids, so the label, the format and the direction all come from the
// registry rather than being repeated here.
import { Link } from "react-router-dom";
import { PositionTag } from "../PositionTag";
import { FinishChip } from "../player/FinishChip";
import { Card, CardHead, CardLink, CardState } from "./primitives";
import { TRENDING_BASIS } from "../../constants/signals";
import { formatDelta, formatStat } from "../../utils/format";

/** "vs MIN · L 22-39" from the player's side of the week's game, or "vs MIN" before it. */
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
  return `${matchup} · ${result} ${ours}-${theirs}`;
}

/**
 * One stat: the value, and underneath it either the change or the rank.
 *
 * Direction comes from the registry's `higher_is_better`, so a fall in something a
 * player wants less of still reads as green.
 */
function StatCell({ metricId, metric, value, previous, rank, position, league, showRank }) {
  const label = metric?.short || metric?.label || metricId;
  const change = value == null || previous == null ? null : value - previous;
  const improved = change == null ? null : metric?.higherIsBetter === false ? change < 0 : change >= 0;

  return (
    <div className="min-w-0">
      <div className="truncate text-[9px] font-bold uppercase tracking-[0.06em] text-faint">{label}</div>
      <div className="stat-num mt-1 text-[16.5px] font-semibold leading-none text-fg">
        {formatStat(value, metric?.format)}
      </div>
      <div className="mt-1.5 h-[17px]">
        {showRank ? (
          <FinishChip rank={rank} position={position} league={league} />
        ) : change == null ? null : (
          <span
            className="stat-num text-[11px] font-bold"
            style={{ color: improved ? "var(--accent)" : "var(--neg)" }}
          >
            {improved ? "▲" : "▼"} {formatDelta(change, metric?.format)}
          </span>
        )}
      </div>
    </div>
  );
}

function TrendingRow({ pick, row, previousRow, seasonRow, headshot, games, league, metrics }) {
  const context = gameLine(row.team_abbreviation, games);
  const basis = pick.basis ?? TRENDING_BASIS.LAST_WEEK;
  const seasonRanks = basis === TRENDING_BASIS.SEASON_RANK;
  // A season-rank row shows the season's numbers, not the week's.
  const source = seasonRanks ? seasonRow : row;

  // What the change is measured against differs by pick, so say so on the rows where
  // it is not simply "last week" — otherwise the arrows are comparing to nothing the
  // reader can name.
  const note = seasonRanks
    ? `Season ranks at ${row.position}`
    : basis === TRENDING_BASIS.TEAMMATE && previousRow
      ? `vs ${previousRow.name.split(" ").slice(-1)[0]}, same week`
      : null;

  if (!source) return null;

  return (
    <div className="grid gap-2.5 border-b border-dashed border-line py-3 last:border-0 xl:grid-cols-[215px_1fr] xl:items-center xl:gap-3.5">
      <div className="flex min-w-0 items-center gap-2.5">
        {headshot ? (
          <img
            src={headshot}
            alt=""
            className="h-14 w-14 shrink-0 rounded-xl border border-edge bg-surface-2 object-cover object-top"
          />
        ) : (
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-edge bg-surface-2 text-base font-bold text-muted">
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
          {/* Omitted on a season-rank row: its cells are the season, and a week's points
              beside them reads as a contradiction (24.1 FP over 55.5 FPTS). The first
              cell carries the season total there instead. */}
          {!seasonRanks && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="stat-num text-[12px] font-semibold text-fg">
                {formatStat(row.fantasy_points, 1)} FP
              </span>
              <FinishChip rank={row.ranks?.fantasy_points} position={row.position} league={league} />
            </div>
          )}
          {note && (
            <div className="mt-1 text-[9.5px] font-semibold uppercase tracking-[0.05em] text-faint">{note}</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-2.5">
        {pick.stats.map((metricId) => (
          <StatCell
            key={metricId}
            metricId={metricId}
            metric={metrics[metricId]}
            value={source[metricId]}
            previous={seasonRanks ? null : previousRow?.[metricId]}
            rank={source.ranks?.[metricId]}
            position={row.position}
            league={league}
            showRank={seasonRanks}
          />
        ))}
      </div>
    </div>
  );
}

export function TrendingPlayersCard({
  picks,
  rows,
  previousRows,
  seasonRows,
  headshots,
  games = [],
  league,
  metrics,
  week,
  isLoading,
  isError,
}) {
  const visible = picks.filter((pick) => rows[pick.playerId]);

  return (
    <Card>
      <CardHead title="Trending Players" />
      <CardState
        isLoading={isLoading}
        isError={isError}
        isEmpty={visible.length === 0}
        empty="No players picked for this week."
        rows={5}
      />

      {visible.length > 0 && (
        <div>
          {visible.map((pick) => (
            <TrendingRow
              key={pick.playerId}
              pick={pick}
              row={rows[pick.playerId]}
              // The teammate basis compares against another player in the SAME week,
              // so the two bases read from different maps on purpose.
              previousRow={
                pick.basis === TRENDING_BASIS.TEAMMATE
                  ? rows[pick.against]
                  : previousRows[pick.playerId]
              }
              seasonRow={seasonRows[pick.playerId]}
              headshot={headshots?.[pick.playerId]}
              games={games}
              league={league}
              metrics={metrics}
            />
          ))}
        </div>
      )}

      <CardLink to={`/nfl/receiving-advanced?weeks=${week}`}>Full receiving board for the week</CardLink>
    </Card>
  );
}
