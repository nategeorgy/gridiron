// Teams > Team Leaderboards: all 32 teams on one of eight preset tabs or a Custom
// board, the same table the player leaderboards use with the rank of 32 under each
// value. Sided tabs switch between offense and defense; every stat has one home tab.
//
// Tab is the path, everything else is in the URL (season, weeks, side, sort, custom
// columns), so a link opens the same board. One /teams/stats request holds every stat
// for every team, so switching tab, side, sort or columns costs nothing.
import { useMemo, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { Select } from "../components/ui/Select";
import { ScoringPill } from "../components/ScoringPill";
import { TimeframeFilter, formatWeeks } from "../components/TimeframeFilter";
import { Segmented } from "../components/team/Segmented";
import { TeamColumnEditor } from "../components/team/TeamColumnEditor";
import { DEFAULT_TEAM_CUSTOM, TEAM_BOARD_CUSTOM, TEAM_BOARD_TAB_IDS, TEAM_BOARD_TABS } from "../constants/teamStats";
import { useScoring } from "../hooks/useScoring";
import { useSeasons } from "../hooks/useSeasons";
import { useTeamStats } from "../hooks/useTeamStats";
import { useUrlState } from "../hooks/useUrlState";
import { formatTeamStat, personnelLagWeek, rankedCount, rankInk, recordText } from "../utils/teamStats";

const ACTIVE_STYLE = {
  background: "var(--surface-solid)",
  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.18), inset 0 0 0 1px color-mix(in srgb, var(--accent) 60%, transparent)",
};

const parseCustom = (raw) =>
  raw.split(",").filter(Boolean).map((entry) => entry.split(".")).filter(([id, side]) => id && (side === "o" || side === "d"));
const writeCustom = (columns) => columns.map(([id, side]) => `${id}.${side}`).join(",");

/**
 * Resolve a tab's sections into columns: { id, side, header, key }. On a preset tab, a
 * personnel column with nothing in it this season (the 11/12/13 split for the season in
 * progress) is left out rather than shown as a column of dashes.
 */
function resolveColumns(tab, metrics, side, values) {
  return tab.sections.map(([name, columns]) => [
    name,
    columns
      .map((column) => {
        const [id, pinned, header] = Array.isArray(column) ? column : [column, null, null];
        const metric = metrics[id];
        if (!metric) return null;
        const resolved = metric.single ? "o" : pinned ?? (tab.sided ? side : "o");
        const tag = tab.id === "custom" && !metric.single ? (resolved === "o" ? " O" : " D") : "";
        return { id, side: resolved, metric, header: (header ?? metric.short) + tag, key: `${id}.${resolved}` };
      })
      .filter(Boolean)
      .filter((column) => tab.id === "custom" || column.metric.group !== "pers" || Object.keys(values?.[column.id]?.[column.side] ?? {}).length > 0),
  ]).filter(([, columns]) => columns.length);
}

export function TeamLeaderboards() {
  const { tab: tabId } = useParams();
  const { search } = useLocation();
  const { seasonOptions, currentSeason } = useSeasons();
  const [season, setSeason] = useUrlState("season", String(currentSeason));
  const [weeks, setWeeks] = useUrlState("weeks", "");
  const [side, setSide] = useUrlState("side", "o", ["o", "d"]);
  const [sort, setSort] = useUrlState("sort", "");
  const [custom, setCustom] = useUrlState("cols", DEFAULT_TEAM_CUSTOM);
  const [scoring, setScoring] = useScoring();
  const [editing, setEditing] = useState(false);

  const seasonNumber = Number(season);
  const weeksLabel = weeks ? formatWeeks(weeks.split(",").map(Number)) : "Full season";
  const { data: board, isLoading, isError } = useTeamStats({ season: seasonNumber, weeks: weeks || undefined, scoring });
  const metrics = useMemo(() => Object.fromEntries((board?.metrics ?? []).map((metric) => [metric.id, metric])), [board]);

  const customColumns = parseCustom(custom);
  const preset = TEAM_BOARD_TABS.find((entry) => entry.id === tabId);
  const tab = preset ?? {
    ...TEAM_BOARD_CUSTOM,
    sided: false,
    sort: customColumns[0] ?? ["epa", "o"],
    description: "Pick any team stat, on either side of the ball.",
    sections: [["Your columns", customColumns.map(([id, columnSide]) => [id, columnSide, null])]],
  };
  const sections = resolveColumns(tab, metrics, side, board?.values);
  const flat = sections.flatMap(([, columns]) => columns);
  const firstOfSection = new Set(sections.map(([, columns]) => columns[0].key));

  // Sort by rank: rank 1 is the best (or, for a tendency, the most), so ascending rank
  // is the natural order for every stat and nothing here needs a direction. A leading
  // "-" reverses it.
  const defaultSort = Array.isArray(tab.sort) ? `${tab.sort[0]}.${metrics[tab.sort[0]]?.single ? "o" : tab.sort[1] ?? side}` : `${tab.sort}.${metrics[tab.sort]?.single ? "o" : side}`;
  const reversed = sort.startsWith("-");
  const sortKey = flat.some((column) => column.key === sort.replace(/^-/, "")) ? sort.replace(/^-/, "") : defaultSort;
  const sortColumn = flat.find((column) => column.key === sortKey) ?? flat[0];

  const rows = useMemo(() => {
    const teams = board?.teams ?? [];
    if (!sortColumn) return teams;
    const byTeam = board?.values?.[sortColumn.id]?.[sortColumn.side] ?? {};
    return [...teams].sort((a, b) => {
      const ra = byTeam[a.abbreviation]?.[1], rb = byTeam[b.abbreviation]?.[1];
      if (ra == null && rb == null) return a.name.localeCompare(b.name);
      if (ra == null) return 1;
      if (rb == null) return -1;
      return reversed ? rb - ra : ra - rb;
    });
  }, [board, sortColumn, reversed]);

  const clickSort = (key) => setSort(key === sortKey ? (reversed ? key : `-${key}`) : key);
  const sideLabels = tab.sideLabels ?? ["Offense", "Defense"];
  const sideWord = tab.sided ? sideLabels[side === "o" ? 0 : 1].toLowerCase() : "";
  const sideNote = tab.sided && side === "d"
    ? tab.id === "fantasy" ? "What each defense allowed. 1st allowed the fewest." : "What opponents did against each team. 1st is the best defense."
    : "";
  const personnelLag = flat.some((column) => column.metric.group === "pers") ? personnelLagWeek(board?.personnel_through_week, board?.weeks) : null;
  const notes = [sideNote, personnelLag && `Personnel runs through Week ${personnelLag}.`].filter(Boolean);
  const tabHref = (id) => `/teams/leaderboards/${id}${search}`;
  if (!TEAM_BOARD_TAB_IDS.includes(tabId)) return <Navigate to={tabHref("overview")} replace />;

  return (
    <div className="grid grid-cols-1 gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">Team leaderboards</h1>
        <p className="mt-1 text-sm text-muted">{tab.description}</p>
      </div>

      <div role="tablist" aria-label="Team leaderboard" className="inline-flex flex-wrap items-center gap-0.5 self-start rounded-full border border-edge bg-surface-2 p-1">
        {[...TEAM_BOARD_TABS, TEAM_BOARD_CUSTOM].map((entry, index) => {
          const on = entry.id === tab.id;
          return [
            index === TEAM_BOARD_TABS.length && <span key="divider" aria-hidden="true" className="mx-1 h-5 w-px bg-line" />,
            <Link
              key={entry.id}
              to={tabHref(entry.id)}
              role="tab"
              aria-selected={on}
              onClick={() => { if (entry.id === "custom") setEditing(true); }}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${on ? "text-fg" : "text-muted hover:text-fg"}`}
              style={on ? ACTIVE_STYLE : undefined}
            >
              {entry.id === "custom" && customColumns.length ? `${entry.label} (${customColumns.length})` : entry.label}
            </Link>,
          ];
        })}
      </div>

      <div className="glass-card flex flex-wrap items-end gap-3 px-4 py-3">
        {tab.sided && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-faint">Side</span>
            <Segmented options={[{ value: "o", label: sideLabels[0] }, { value: "d", label: sideLabels[1] }]} value={side} onChange={setSide} label="Side" />
          </div>
        )}
        <Select label="Season" value={season} onChange={setSeason} options={seasonOptions} />
        <TimeframeFilter weeks={weeks} season={season} onChange={setWeeks} />
        <span className="flex-1" />
        {tab.id === "custom" && (
          <button type="button" onClick={() => setEditing(true)} className="glass-pill px-3.5 py-1.5 text-sm font-semibold text-fg">Edit Columns</button>
        )}
        {(tab.id === "fantasy" || tab.id === "custom") && <ScoringPill scoring={scoring} onChange={setScoring} />}
      </div>

      <section className="glass-card p-4">
        <div className="mb-3">
          <h2 className="text-[15px] font-semibold tracking-tight text-fg">{tab.label}{sideWord ? ` · ${sideWord}` : ""}</h2>
          <p className="text-[11.5px] text-faint">
            {season} {"·"} {weeksLabel} {"·"} click a column to sort; the number under each value is its rank of 32
            {notes.length ? `. ${notes.join(" ")}` : ""}
          </p>
        </div>
        {isError && <p className="py-8 text-center text-sm text-muted">Could not load team stats for this season.</p>}
        {isLoading && !board && <p className="py-8 text-center text-sm text-muted">Loading...</p>}
        {board && flat.length === 0 && <p className="py-8 text-center text-sm text-muted">No columns yet. Use Edit Columns to add some.</p>}
        {board && flat.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]" style={{ minWidth: 260 + flat.length * 78 }}>
              <thead>
                <tr className="text-[10.5px] uppercase tracking-[0.08em]">
                  <th colSpan={2} />
                  {sections.map(([name, columns]) => (
                    <th key={name} colSpan={columns.length} className="border-l border-line px-2 pb-1 text-center font-bold text-fg">{name}</th>
                  ))}
                </tr>
                <tr className="border-b border-line text-[11px]">
                  <th className="w-8 px-2 py-1.5 text-right font-semibold text-faint">#</th>
                  <th className="px-2 py-1.5 text-left font-semibold text-faint">Team</th>
                  {flat.map((column) => {
                    const on = column.key === sortKey;
                    const unavailable = column.metric.first_season && seasonNumber < column.metric.first_season;
                    return (
                      <th
                        key={column.key}
                        onClick={() => clickSort(column.key)}
                        title={`${column.metric[column.side === "d" ? "label_d" : "label_o"]}${column.metric.desc ? `. ${column.metric.desc}` : ""}${unavailable ? `. Available from ${column.metric.first_season}.` : ""}`}
                        className={`cursor-pointer select-none whitespace-nowrap px-2 py-1.5 text-right font-semibold ${on ? "text-fg" : "text-faint hover:text-muted"} ${firstOfSection.has(column.key) ? "border-l border-line" : ""} ${unavailable ? "opacity-50" : ""}`}
                      >
                        {column.header}{on ? (reversed ? " ↑" : " ↓") : ""}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((team, index) => (
                  <tr key={team.team_id} className="border-b border-line hover:bg-surface-2">
                    <td className="stat-num px-2 py-1.5 text-right text-faint">{index + 1}</td>
                    <td className="px-2 py-1.5">
                      <Link to={`/teams/${team.team_id}${season !== String(currentSeason) ? `?season=${season}` : ""}`} className="flex items-center gap-2 whitespace-nowrap hover:text-accent">
                        {team.logo_url && <img src={team.logo_url} alt="" className="h-6 w-6 object-contain" />}
                        <b className="text-fg">{team.name.split(" ").pop()}</b>
                        <small className="stat-num text-[11px] text-faint">{recordText(team.record)}</small>
                      </Link>
                    </td>
                    {flat.map((column) => {
                      const entry = board.values?.[column.id]?.[column.side]?.[team.abbreviation];
                      const count = rankedCount(board, column.id, column.side);
                      const text = column.id === "record" ? recordText(team.record) : formatTeamStat(entry?.[0], column.metric.fmt);
                      return (
                        <td key={column.key} className={`px-2 py-1 text-right ${firstOfSection.has(column.key) ? "border-l border-line" : ""}`}>
                          <span className="inline-flex flex-col items-end leading-tight">
                            <span className="stat-num text-fg">{text}</span>
                            <small className="stat-num text-[10.5px] font-semibold" style={{ color: rankInk(entry?.[1], count) }}>{entry?.[1] ?? "—"}</small>
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="text-muted">
                  <td />
                  <td className="px-2 py-2 text-left text-[12px]">League average</td>
                  {flat.map((column) => (
                    <td key={column.key} className={`stat-num px-2 py-2 text-right ${firstOfSection.has(column.key) ? "border-l border-line" : ""}`}>
                      {column.id === "record" ? "" : formatTeamStat(board.values?.[column.id]?.[`${column.side}_mean`], column.metric.fmt)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && tab.id === "custom" && board && (
        <TeamColumnEditor
          columns={customColumns}
          metrics={metrics}
          onChange={(columns) => setCustom(writeCustom(columns))}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
