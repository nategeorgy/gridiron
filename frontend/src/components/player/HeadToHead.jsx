// Head to head (October 2026): the tweet kit's D6 card, on the player page and the home page.
//
// Two players at one position, the player card's numbers side by side: the headline stats
// with each one's finish at the position, then the percentile rows, each bar growing
// outward from the label between them. It replaced the margin table and the radar, on
// both surfaces, so a matchup reads the same wherever it is built.
//
// **The better number is bold, the other muted.** Not coloured: each side wears its team's
// colour on its ring, and a red team's colour would read as the worse value. Better is the
// better finish on a headline row and the higher percentile on a percentile row, both
// direction-corrected by the API, so the fewer interceptions win theirs.
//
// Both rows come from one `/stats/intelligence` request, so both players are ranked against
// identical pools.
import { Link } from "react-router-dom";
import { Headshot } from "../explore/common";
import { StatTooltip, useStatTooltip } from "../StatTooltip";
import { CARD_PERCENTILES, CARD_TILES, forPosition } from "../../constants/playerPage";
import { isMetricAvailable } from "../../utils/availability";
import { FinishChip } from "./FinishChip";
import { metricTip } from "./metricTip";
import { PercentileBar, cardValue, positionName, ringColors, statLabel, tint } from "./cardParts";

// The label column sits between the two sides from sm; below it the label takes its own
// line and the two sides split the width. `compact` is a card in a narrow column (the home
// page's, about 500px), where every pixel the label and gaps give up goes to the bars.
const ROW_STYLE = {
  full: "min-h-[36px] gap-x-3 grid-cols-[3.25rem_minmax(0,1fr)_minmax(0,1fr)_3.25rem] sm:grid-cols-[minmax(4rem,1fr)_minmax(0,19rem)_12.5rem_minmax(0,19rem)_minmax(4rem,1fr)]",
  compact: "min-h-[30px] gap-x-2 grid-cols-[3.25rem_minmax(0,1fr)_minmax(0,1fr)_3.25rem] sm:grid-cols-[2.75rem_minmax(0,1fr)_8.75rem_minmax(0,1fr)_2.75rem]",
};

function Side({ player, team, ring, right, compact }) {
  return (
    <div
      className={`flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:gap-3 ${
        right ? "sm:flex-row-reverse sm:text-right" : "sm:text-left"
      }`}
    >
      <Headshot
        url={player.headshot_url}
        name={player.name}
        className={`h-16 w-16 rounded-full ${compact ? "sm:h-[72px] sm:w-[72px]" : "sm:h-24 sm:w-24"}`}
        initialsClassName="text-xl"
        style={{ border: `3px solid ${ring}`, background: "var(--surface-2)" }}
      />
      <span className="min-w-0">
        <Link
          to={`/players/${player.player_id}`}
          className={`block font-extrabold leading-tight tracking-tight text-fg [overflow-wrap:anywhere] hover:text-accent ${
            compact ? "text-[15.5px] sm:text-[17px]" : "text-[16px] sm:text-[22px]"
          }`}
        >
          {player.name}
        </Link>
        <span className="mt-0.5 block text-[11.5px] text-muted">
          {player.position} · {team?.name ?? player.team_abbreviation}
        </span>
        <span className="block text-[11px] text-faint">
          {player.games_played} {player.games_played === 1 ? "game" : "games"}
        </span>
      </span>
    </div>
  );
}

/**
 * One row: the label between the two values, and whatever sits beside each value (a
 * finish chip, or a percentile bar growing outward). `better` is 0, 1 or null.
 */
function Row({ label, tip, values, beside, better, striped, grid, tooltip }) {
  const weight = (side) =>
    better === null ? "font-semibold text-fg" : better === side ? "font-extrabold text-fg" : "font-medium text-muted";
  return (
    <div
      className={`grid items-center gap-y-1 rounded-lg px-2.5 py-1.5 sm:py-0.5 ${grid}`}
      style={striped ? { background: tint(4) } : undefined}
    >
      <span
        className="col-span-4 text-center text-[12px] font-semibold leading-tight text-muted sm:col-span-1 sm:col-start-3 sm:row-start-1"
        onMouseEnter={tip ? (event) => tooltip.show(event.currentTarget, tip) : undefined}
        onMouseLeave={tip ? tooltip.hide : undefined}
      >
        {label}
      </span>
      <span className={`stat-num text-[14px] sm:text-[15px] ${weight(0)}`}>{values[0]}</span>
      <span className="flex min-w-0 justify-end">{beside[0]}</span>
      <span className="flex min-w-0 justify-start">{beside[1]}</span>
      <span className={`stat-num text-right text-[14px] sm:text-[15px] ${weight(1)}`}>{values[1]}</span>
    </div>
  );
}

/**
 * @param players two season rows from `/stats/intelligence` (with `percentiles` and
 *                `ranks`), each with `headshot_url` added
 * @param teams   the teams list keyed by abbreviation, for names and ring colours
 * @param kicker  an optional line above the faces ("Head to head · 2026 through Week 7 · PPR")
 */
export function HeadToHead({ players, teams, position, season, scoring, metrics, kicker, compact = false }) {
  const tooltip = useStatTooltip();
  const [left, right] = players;
  const rings = ringColors(teams?.[left.team_abbreviation], teams?.[right.team_abbreviation]);
  const grid = compact ? ROW_STYLE.compact : ROW_STYLE.full;
  const tiles = forPosition(CARD_TILES, position).flatMap((group) => group.stats);
  const percentiles = forPosition(CARD_PERCENTILES, position);
  const tipFor = (id) => metricTip(metrics?.[id] ?? {}, id, season);

  // The better of two numbers that both exist and differ; null when either is missing or they tie.
  const pick = (a, b, lowerWins) => {
    if (a == null || b == null || a === b) return null;
    return (a < b) === lowerWins ? 0 : 1;
  };

  return (
    // Capped near the tweet's own width: across a full page the two values ended up a
    // quarter of the screen from their bars.
    <div className={compact ? "" : "mx-auto max-w-[68rem]"}>
      {kicker && (
        <div className="mb-4 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-accent">{kicker}</div>
      )}
      <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <Side player={left} team={teams?.[left.team_abbreviation]} ring={rings[0]} compact={compact} />
        <span className="text-[13px] font-bold text-faint">vs</span>
        <Side player={right} team={teams?.[right.team_abbreviation]} ring={rings[1]} right compact={compact} />
      </div>

      {tiles.map((stat, index) => {
        const ranks = players.map((player) => player.ranks?.[stat.id] ?? null);
        return (
          <Row
            key={stat.id}
            label={stat.long}
            tip={tipFor(stat.id)}
            values={players.map((player) => cardValue(player[stat.id], stat))}
            beside={ranks.map((rank, side) => (
              <FinishChip key={side} rank={rank} position={position} />
            ))}
            better={pick(ranks[0], ranks[1], true)}
            striped={index % 2 === 0}
            grid={grid}
            tooltip={tooltip}
          />
        );
      })}

      <div className="mb-1 mt-4 text-center text-[10.5px] font-bold uppercase tracking-[0.14em] text-faint">
        Percentile among {positionName(position)}
      </div>
      {percentiles.map((stat, index) => {
        const metric = metrics?.[stat.id] ?? {};
        const available = isMetricAvailable(metric, season);
        const ranked = players.map((player) => player.percentiles?.[stat.id] ?? null);
        return (
          <Row
            key={stat.id}
            label={statLabel(stat, scoring)}
            tip={tipFor(stat.id)}
            values={players.map((player) => (available ? cardValue(player[stat.id], stat) : "-"))}
            beside={ranked.map((percentile, side) =>
              percentile == null ? (
                <span key={side} className="text-[10.5px] text-faint">
                  {available ? "Not ranked" : "Not recorded"}
                </span>
              ) : (
                <span key={side} className="block w-full">
                  <PercentileBar percentile={percentile} from={side === 0 ? "right" : "left"} size={compact ? 24 : 26} />
                </span>
              ),
            )}
            better={pick(ranked[0], ranked[1], false)}
            striped={index % 2 === 0}
            grid={grid}
            tooltip={tooltip}
          />
        );
      })}
      <StatTooltip tip={tooltip.tip} />
    </div>
  );
}
