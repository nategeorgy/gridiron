// The player page's header (November 2026): "Team banner", picked in round five.
//
// The header in his team's colours with his number behind him, the season in a frosted
// bar along the bottom (the old player card's stat tiles, each with his finish at the
// position), and the six tabs under it. The season and scoring pickers sit in the banner
// because they govern every tab.
import { Headshot } from "../../explore/common";
import { FavoriteStar } from "../../FavoriteStar";
import { PositionTag } from "../../PositionTag";
import { scoringLabel } from "../../../constants/scoring";
import { BANNER_STATS, PLAYER_TABS } from "../../../constants/playerTabs";
import { forPosition } from "../../../constants/playerPage";
import { FinishChip } from "../FinishChip";
import { cardValue, ringColors } from "../cardParts";
import { ScrollRow } from "../../ui/ScrollRow";
import { mix } from "./common";

function heightText(inches) {
  return inches ? `${Math.floor(inches / 12)}-${inches % 12}` : "";
}

/** "Age 24 · 6-0, 197 · 2023 Round 1, Pick 20 · Ohio State". */
export function bioLine(player) {
  const draft = !player.draft_year
    ? "Undrafted"
    : player.draft_round
      ? `${player.draft_year} Round ${player.draft_round}, Pick ${player.draft_pick}`
      : `${player.draft_year} draft`;
  const build = [heightText(player.height), player.weight ? String(player.weight) : ""].filter(Boolean).join(", ");
  return [player.age != null ? `Age ${Math.floor(player.age)}` : "", build, draft, player.college_name?.split(";")[0]]
    .filter(Boolean)
    .join(" · ");
}

export function PlayerBanner({ player, team, row, position, season, through, scoring, controls, tab, onTab, isLoading }) {
  const [ring] = ringColors(team);
  // The team colour that reads on the theme (`gameColors` swaps a navy for its second colour).
  const color = ring;
  const stats = forPosition(BANNER_STATS, position);
  const kicker = [
    `${season ?? ""}${through ? ` through Week ${through}` : ""}`,
    scoringLabel(scoring),
    row ? `${row.games_played} ${row.games_played === 1 ? "game" : "games"}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <section className="glass-card overflow-hidden p-0">
      <div
        className="relative overflow-hidden px-4 pb-5 pt-5 sm:px-6 sm:pt-6"
        style={{ background: `linear-gradient(115deg, ${mix(color, 62)}, ${mix(color, 22)} 52%, transparent 88%)` }}
      >
        {player.jersey_number != null && (
          <span
            aria-hidden="true"
            className="stat-num pointer-events-none absolute -top-6 right-4 select-none text-[110px] font-extrabold leading-none opacity-10 sm:-top-8 sm:text-[168px]"
          >
            {player.jersey_number}
          </span>
        )}
        <div className="relative flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 items-center gap-4">
            <Headshot
              url={player.headshot_url}
              name={player.name}
              className="h-[76px] w-[76px] shrink-0 rounded-full sm:h-[116px] sm:w-[116px]"
              initialsClassName="text-2xl"
              style={{ border: `3px solid ${ring}`, background: "var(--surface-2)" }}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <h1 className="text-[24px] font-extrabold leading-tight tracking-tight text-fg [overflow-wrap:anywhere] sm:text-[34px]">
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
          {controls && <div className="relative flex flex-wrap items-end gap-3">{controls}</div>}
        </div>
      </div>

      <div
        className="flex flex-wrap items-center gap-y-2.5 border-y border-line px-4 py-3 sm:px-6"
        style={{ background: "color-mix(in srgb, var(--surface-solid) 55%, transparent)" }}
      >
        <span className="mr-5 basis-full text-[11px] font-bold uppercase tracking-[0.14em] text-accent sm:basis-auto">{kicker}</span>
        {isLoading ? (
          <span className="h-6 w-64 animate-pulse rounded-md" style={{ background: "var(--surface-2)" }} />
        ) : row ? (
          stats.map((stat, index) => (
            <div
              key={stat.id}
              className={`flex items-center gap-1.5 pr-3 sm:px-3 ${index ? "sm:border-l sm:border-line" : ""}`}
            >
              <span className="stat-num text-[18px] font-extrabold tracking-tight text-fg sm:text-[20px]">{cardValue(row[stat.id], stat)}</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint">{stat.label}</span>
              <FinishChip rank={row.ranks?.[stat.id]} position={position} />
            </div>
          ))
        ) : (
          <span className="text-xs text-muted">No stats for this season.</span>
        )}
      </div>

      <div className="px-2 sm:px-4">
        <ScrollRow>
          <div role="tablist" aria-label="Player page" className="flex w-max gap-0.5">
            {PLAYER_TABS.map((entry) => {
              const on = entry.id === tab;
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => onTab(entry.id)}
                  className={`-mb-px whitespace-nowrap border-b-2 px-3.5 pb-2.5 pt-3 text-[13.5px] font-semibold transition ${
                    on ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"
                  }`}
                >
                  {entry.label}
                </button>
              );
            })}
          </div>
        </ScrollRow>
      </div>
    </section>
  );
}
