// The player card (October 2026): the tweet kit's D1 card, at the top of the player page.
//
// It replaced the season radar and the percentile panel, and then the page's own header:
// the card already says who he is, so it opens the page, with the season and scoring
// pickers and the watchlist star in its head. Top to bottom, the card's own order: who he
// is, the season's headline numbers in labelled groups with his finish at the position
// under each, his percentile among the position in the stats Nate picked per position
// (`CARD_TILES` and `CARD_PERCENTILES` in constants/playerPage.js), and his finish every
// week.
//
// The tweet is a portrait image; the page is wide. So from lg the card splits in two: the
// headline numbers and the weeks on the left, the percentile rows as one list on the right
// (picked over a two-column list and over a narrow card beside the target map, October
// 2026). Below lg it stacks back into the tweet's order. Every
// number still comes from the page's one `/stats/intelligence` request, so a rank here
// and the percentile beside it read from the same pool as everything else on the page.
import { Headshot } from "../explore/common";
import { FavoriteStar } from "../FavoriteStar";
import { PositionTag } from "../PositionTag";
import { StatTooltip, useStatTooltip } from "../StatTooltip";
import { scoringLabel } from "../../constants/scoring";
import { CARD_PERCENTILES, CARD_TILES, forPosition } from "../../constants/playerPage";
import { isMetricAvailable } from "../../utils/availability";
import { FinishChip } from "./FinishChip";
import { metricTip } from "./metricTip";
import { PercentileBar, cardValue, positionName, ringColors, statLabel, tint } from "./cardParts";

function heightText(inches) {
  return inches ? `${Math.floor(inches / 12)}-${inches % 12}` : "";
}

/** "Age 24 · 6-0, 197 · 2023 Round 1, Pick 20 · Ohio State", the tweet's bio line. */
function bioLine(player) {
  const draft = !player.draft_year
    ? "Undrafted"
    : player.draft_round
      ? `${player.draft_year} Round ${player.draft_round}, Pick ${player.draft_pick}`
      : `${player.draft_year} draft`;
  const build = [heightText(player.height), player.weight ? String(player.weight) : ""].filter(Boolean).join(", ");
  return [
    player.age != null ? `Age ${Math.floor(player.age)}` : "",
    build,
    draft,
    player.college_name?.split(";")[0],
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Who he is, with the page's controls to the right (below, on a phone). */
function Head({ player, team, position, ring, controls }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
      <div className="flex min-w-0 items-center gap-4">
        <Headshot
          url={player.headshot_url}
          name={player.name}
          className="h-[72px] w-[72px] rounded-full sm:h-24 sm:w-24"
          initialsClassName="text-2xl"
          style={{ border: `3px solid ${ring}`, background: "var(--surface-2)" }}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-fg [overflow-wrap:anywhere] sm:text-[30px]">
              {player.name}
            </h1>
            <FavoriteStar playerId={player.player_id} size="h-5 w-5" />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-semibold text-fg">
            <PositionTag position={position} />
            {team?.logo_url && <img src={team.logo_url} alt="" className="h-5 w-5 object-contain" />}
            <span>{team?.name ?? player.team_abbreviation ?? "Free agent"}</span>
            {player.jersey_number != null && <span className="stat-num text-muted">#{player.jersey_number}</span>}
          </div>
          <div className="mt-1 text-[12.5px] text-muted">{bioLine(player)}</div>
        </div>
      </div>
      {controls && <div className="flex flex-wrap items-end gap-3">{controls}</div>}
    </div>
  );
}

/** The headline numbers, one panel per group, each cell with his finish at the position. */
function Tiles({ groups, row, position }) {
  return (
    <div className="flex flex-wrap gap-3">
      {groups.map((group) => (
        <div
          key={group.name}
          className="min-w-0"
          // Wide in proportion to its cells, never narrower than they fit: a group too wide
          // for what is left of the row wraps whole onto the next one.
          style={{ flex: `${group.stats.length} 1 0`, minWidth: `${group.stats.length * 6}rem` }}
        >
          <div className="mb-1.5 pl-1 text-[10px] font-bold uppercase tracking-[0.12em] text-faint">{group.name}</div>
          <div
            className="grid rounded-2xl py-3"
            style={{ gridTemplateColumns: `repeat(${group.stats.length}, minmax(0, 1fr))`, background: tint(5) }}
          >
            {group.stats.map((stat, index) => (
              <div key={stat.id} className={`min-w-0 px-3 ${index ? "border-l border-line" : ""}`}>
                <div className="truncate text-[10px] font-bold uppercase tracking-[0.08em] text-faint">{stat.label}</div>
                <div className="stat-num mt-1 truncate text-[20px] font-extrabold leading-tight text-fg sm:text-[24px]">
                  {cardValue(row[stat.id], stat)}
                </div>
                <div className="mt-1.5">
                  <FinishChip rank={row.ranks?.[stat.id]} position={position} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PercentileRow({ stat, row, metrics, season, scoring, tooltip, striped }) {
  const metric = metrics[stat.id] ?? {};
  const available = isMetricAvailable(metric, season);
  const percentile = row.percentiles?.[stat.id];
  return (
    <div
      className="grid min-h-[36px] grid-cols-[minmax(0,1.4fr)_3.25rem_minmax(0,1fr)] items-center gap-2.5 rounded-lg px-2.5 py-1 sm:grid-cols-[minmax(0,1fr)_4.25rem_minmax(0,1.3fr)] sm:gap-3"
      style={striped ? { background: tint(4) } : undefined}
    >
      <span
        className="text-[12.5px] font-semibold leading-tight text-muted"
        onMouseEnter={(event) => tooltip.show(event.currentTarget, metricTip(metric, stat.id, season))}
        onMouseLeave={tooltip.hide}
      >
        {statLabel(stat, scoring)}
      </span>
      <span className="stat-num text-right text-[14px] font-extrabold text-fg">
        {available ? cardValue(row[stat.id], stat) : "-"}
      </span>
      {percentile == null ? (
        <span className="text-right text-[11px] text-faint">{available ? "Not ranked" : "Not recorded"}</span>
      ) : (
        <PercentileBar percentile={percentile} />
      )}
    </div>
  );
}

/** "vs SF" or "@ SF". A game id ends with the home team's code. */
function matchup(game) {
  if (!game.opponent_abbreviation) return null;
  const home = game.team_abbreviation && game.game_id?.endsWith(`_${game.team_abbreviation}`);
  return `Week ${game.week} ${home ? "vs" : "@"} ${game.opponent_abbreviation}`;
}

/** Weeks 1 to `lastWeek`, each with his game log row for it (played, bye or scheduled) if any. */
export function weekSlots(log, lastWeek) {
  const byWeek = new Map(log.map((game) => [game.week, game]));
  return Array.from({ length: lastWeek }, (_, index) => ({ week: index + 1, game: byWeek.get(index + 1) }));
}

/** Every week through the newest played: his finish and points, or his bye. */
function WeeklyFinish({ log, lastWeek, position }) {
  const slots = weekSlots(log, lastWeek);
  return (
    <div className="mt-5 border-t border-line pt-4">
      <h3 className="mb-3 text-[13px] font-bold text-fg">Weekly finish</h3>
      <div className="grid grid-cols-6 gap-x-1.5 gap-y-3 sm:grid-cols-9">
        {slots.map(({ week, game }) => (
          <div key={week} className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-bold text-faint">W{week}</span>
            {game?.row_kind === "played" ? (
              <>
                <FinishChip
                  rank={game.position_rank}
                  position={position}
                  detail={matchup(game)}
                />
                <span className="stat-num text-[11px] font-semibold text-muted">
                  {game.fantasy_points == null ? "-" : game.fantasy_points.toFixed(1)}
                </span>
              </>
            ) : (
              <span className="flex h-[22px] items-center text-[10.5px] font-bold text-faint">
                {game?.row_kind === "bye" ? "BYE" : game ? "DNP" : "-"}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * @param player   the profile (name, headshot, bio)
 * @param row      his season row from `/stats/intelligence`, with `percentiles` and `ranks`
 * @param team     the team he played for that season, from the teams list (name, logo, colours)
 * @param controls the page's season and scoring pickers, drawn in the card's head
 * @param empty    what the body says when there is no row to show
 * @param through  the newest week played, for a season still in progress; null otherwise
 * @param log      the season's game log rows (`buildSeasonLog`)
 * @param lastWeek how many weeks the finish strip covers
 * @param poolSize how many qualified players the percentiles rank him among
 * @param extra    a section under the weekly finish, in the left column from lg (after the
 *                 percentile list below it)
 */
export function PlayerCard({ player, row, team, position, season, through, scoring, log, lastWeek, metrics, poolSize, isLoading, controls, empty = "No stats for this season.", extra = null }) {
  const tooltip = useStatTooltip();
  const [ring] = ringColors(team);
  const percentiles = forPosition(CARD_PERCENTILES, position);

  return (
    <section className="glass-card p-4 sm:p-5">
      <Head player={player} team={team} position={position} ring={ring} controls={controls} />

      {isLoading ? (
        <div className="mt-5 space-y-3" aria-busy="true">
          <div className="h-28 animate-pulse rounded-2xl" style={{ background: tint(6) }} />
          <div className="h-64 animate-pulse rounded-2xl" style={{ background: tint(6) }} />
        </div>
      ) : !row ? (
        <p className="py-8 text-center text-xs text-muted">{empty}</p>
      ) : (
        <>
          <div className="mb-3 mt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
            {season}
            {through ? ` through Week ${through}` : ""} · {scoringLabel(scoring)} · {row.games_played}{" "}
            {row.games_played === 1 ? "game" : "games"}
          </div>
          {/* Explicit placement from lg: the left column holds the tiles and weeks (row 1) and
              the extra section (row 2), the list spans both rows on the right. Below lg the
              DOM order stacks them, so the extra section comes after the list. */}
          <div className="lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-8">
            <div className="lg:col-start-1 lg:row-start-1">
              <Tiles groups={forPosition(CARD_TILES, position)} row={row} position={position} />
              {lastWeek > 0 && <WeeklyFinish log={log} lastWeek={lastWeek} position={position} />}
            </div>
            <div className="mt-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h3 className="text-[15px] font-bold tracking-tight text-fg">Percentile among {positionName(position)}</h3>
                <span className="text-[11px] text-muted">
                  {poolSize ? `${poolSize} qualified players, ${season}` : `Qualified players, ${season}`}
                </span>
              </div>
              <div className="mt-2">
                {percentiles.map((stat, index) => (
                  <PercentileRow
                    key={stat.id}
                    stat={stat}
                    row={row}
                    metrics={metrics}
                    season={season}
                    scoring={scoring}
                    tooltip={tooltip}
                    striped={index % 2 === 0}
                  />
                ))}
              </div>
            </div>
            {extra && <div className="mt-5 border-t border-line pt-4 lg:col-start-1 lg:row-start-2">{extra}</div>}
          </div>
        </>
      )}
      <StatTooltip tip={tooltip.tip} />
    </section>
  );
}
