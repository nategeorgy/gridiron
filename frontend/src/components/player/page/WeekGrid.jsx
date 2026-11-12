// A weeks-by-stats heat grid (round ten): "Usage by week" on Opportunity and "Every week,
// ranked" on Stats share it.
//
// Each cell is one game's number, shaded by where it ranked among every player at the
// position with a stat line that week (`/players/{id}/weekly-ranks`): green at the top,
// then yellow, orange and red, the scale every percentile on the site uses. The last
// column is his season, an average a game for a count and the season rate for a rate,
// shaded by his percentile among the qualified players.
import { usePlayerWeeklyRanks } from "../../../hooks/usePlayer";
import { formatSigned, formatStat } from "../../../utils/format";
import { StatTooltip, useStatTooltip } from "../../StatTooltip";
import { forPosition } from "../../../constants/playerPage";
import { positionName } from "../cardParts";
import { Panel, heatFill, isHomeGame, pctColor } from "./common";
import { isAsIf } from "../../../utils/qualifiers";

/** The stat tooltip wants a heading and a line beneath it. */
const tipOf = (heading, line) => ({ label: heading, description: line });

function cellText(row, value) {
  if (value == null || Number.isNaN(value)) return "-";
  if (row.format === "pct0") return `${Math.round(Math.min(value, 1) * 100)}%`;
  if (row.signed) return formatSigned(value, row.format);
  return formatStat(value, row.format);
}

export function WeekGrid({ page, rows: rowsByPosition, title, sub, showRank = false }) {
  const { playerId, position, season, scoring, seasonLog, row: seasonRow, teams, lastWeek, through } = page;
  const rows = forPosition(rowsByPosition, position);
  const query = usePlayerWeeklyRanks(playerId, season, rows.map((entry) => entry.id), scoring);
  const tooltip = useStatTooltip();
  const weeks = query.data?.weeks ?? {};

  // The season's slate up to the newest week played: games, byes and games he missed.
  const last = through || lastWeek || Math.max(0, ...Object.keys(weeks).map(Number));
  const slots = seasonLog.filter((slot) => slot.week <= last);
  const games = seasonRow?.games_played || 1;

  const seasonCell = (entry) => {
    if (!seasonRow) return { text: "-", pct: null };
    const id = entry.season ?? entry.id;
    const value = seasonRow[id];
    const perGame = entry.perGame && !entry.season;
    const pct = seasonRow.percentiles?.[id] ?? null;
    return { text: cellText(entry, perGame && value != null ? value / games : value), pct, open: pct != null && isAsIf(seasonRow, id) };
  };

  const columns = `112px repeat(${Math.max(1, slots.length)}, minmax(54px, 1fr)) 70px`;
  return (
    <Panel title={title} sub={sub}>
      {query.isLoading ? (
        <div className="h-72 animate-pulse rounded-xl bg-surface-2" />
      ) : !slots.length ? (
        <p className="py-10 text-center text-sm text-muted">No games this season.</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="grid gap-1" style={{ gridTemplateColumns: columns, minWidth: 112 + slots.length * 58 + 70 }}>
            <div />
            {slots.map((slot) => {
              const opponent = slot.opponent_abbreviation;
              const home = slot.row_kind === "played" ? isHomeGame(slot.game_id, slot.team_abbreviation) : slot.home;
              return (
                <div key={slot.week} className="text-center">
                  <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint">W{slot.week}</div>
                  <div className="mt-1 flex items-center justify-center gap-1 text-[10.5px] font-bold text-muted">
                    {slot.row_kind === "bye" ? (
                      "BYE"
                    ) : (
                      <>
                        {home ? "vs" : "@"}
                        {teams[opponent]?.logo_url ? <img src={teams[opponent].logo_url} alt={opponent} className="h-4 w-4 object-contain" /> : opponent}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="self-end text-center text-[10px] font-bold uppercase tracking-[0.08em] text-faint">Season</div>

            {rows.map((entry) => {
              const season = seasonCell(entry);
              return [
                <div key={`${entry.id}-label`} className="self-center text-[12px] font-semibold text-fg">{entry.label}</div>,
                ...slots.map((slot) => {
                  const cell = weeks[slot.week]?.stats?.[entry.id];
                  if (slot.row_kind === "bye") return <div key={`${entry.id}-${slot.week}`} className="rounded-lg" style={{ background: "color-mix(in srgb, var(--fg) 3%, transparent)" }} />;
                  if (!weeks[slot.week]) {
                    return (
                      <div key={`${entry.id}-${slot.week}`} className="flex items-center justify-center rounded-lg text-[10px] text-faint" style={{ background: "color-mix(in srgb, var(--fg) 3%, transparent)" }}>
                        {slot.row_kind === "scheduled" && slot.final ? "Out" : ""}
                      </div>
                    );
                  }
                  const tip = cell
                    ? tipOf(`Week ${slot.week}: ${entry.label} ${cellText(entry, cell.v)}`, `${position}${cell.rank} of ${cell.n} that week, ${cell.pct} percentile`)
                    : tipOf(`Week ${slot.week}`, `No ${entry.label.toLowerCase()} recorded`);
                  return (
                    <div
                      key={`${entry.id}-${slot.week}`}
                      className="rounded-lg px-0.5 py-1.5 text-center"
                      style={{ background: heatFill(cell?.pct ?? null) }}
                      onMouseEnter={(event) => tooltip.show(event.currentTarget, tip)}
                      onMouseLeave={tooltip.hide}
                    >
                      <div className="stat-num text-[12px] font-bold text-fg">{cell ? cellText(entry, cell.v) : "-"}</div>
                      {showRank && cell && <div className="stat-num text-[9.5px] font-semibold text-muted">{position}{cell.rank}</div>}
                    </div>
                  );
                }),
                <div
                  key={`${entry.id}-season`}
                  className="rounded-lg px-1 py-1.5 text-center"
                  // As if qualified (below the minimum): a dashed outline instead of the shade.
                  style={season.open ? { outline: `1.5px dashed ${pctColor(season.pct)}`, outlineOffset: "-2px" } : { background: heatFill(season.pct) }}
                  onMouseEnter={(event) => tooltip.show(event.currentTarget, tipOf(`${entry.label}: ${season.text} ${entry.perGame ? "a game" : "for the season"}`, `${season.pct ?? "-"} percentile among qualified ${positionName(position)}${season.open ? ", as if qualified" : ""}`))}
                  onMouseLeave={tooltip.hide}
                >
                  <div className="stat-num text-[12px] font-extrabold text-fg">{season.text}</div>
                  {showRank && <div className="stat-num text-[9.5px] font-semibold text-muted">{season.pct != null ? `${season.pct} pct` : ""}</div>}
                </div>,
              ];
            })}
          </div>
        </div>
      )}
      <StatTooltip tip={tooltip.tip} />
    </Panel>
  );
}
