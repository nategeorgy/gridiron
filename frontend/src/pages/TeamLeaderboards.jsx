// Teams > Team Leaderboards: all 32 teams on one of eight preset tabs or a Custom
// board, the same table the player leaderboards use with the rank of 32 under each
// value. Sided tabs switch between offense and defense; every stat has one home tab.
//
// Tab is the path, everything else is in the URL (season, weeks, side, sort, custom
// columns), so a link opens the same board. One /teams/stats request holds every stat
// for every team, so switching tab, side, sort or columns costs nothing.
//
// Laid out like the player leaderboards (November 2026, the "Table toolbar" mockup):
// tabs with the saved views beside them, one row of filter pills, and a card holding the
// table with its own toolbar. Headers and values are centred, and the rank under each
// value reads "#12". No shading here: the cells keep their rank-coloured number.
import { useMemo, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { FilterBar, summarize } from "../components/ui/FilterBar";
import { PillSelect } from "../components/ui/PillSelect";
import { ScrollRow } from "../components/ui/ScrollRow";
import { DEFAULT_SCORING, SCORING_PRESET_OPTIONS, normalizeScoring, scoringLabel } from "../constants/scoring";
import { TimeframeFilter, formatWeeks } from "../components/TimeframeFilter";
import { ExportButton } from "../components/ExportButton";
import { BoardViews } from "../components/leaderboard/BoardViews";
import { UNDERLINE_TRACK, underlineTab } from "../components/leaderboard/LeaderboardTabs";
import { Segmented } from "../components/team/Segmented";
import { TeamColumnEditor } from "../components/team/TeamColumnEditor";
import { DEFAULT_TEAM_CUSTOM, TEAM_BOARD_CUSTOM, TEAM_BOARD_TAB_IDS, TEAM_BOARD_TABS } from "../constants/teamStats";
import { useScoring } from "../hooks/useScoring";
import { useSeasons } from "../hooks/useSeasons";
import { useTeamStats } from "../hooks/useTeamStats";
import { useUrlState } from "../hooks/useUrlState";
import { formatTeamStat, personnelLagWeek, rankedCount, rankInk, recordText } from "../utils/teamStats";

// The card toolbar's quiet buttons, as on the player leaderboards.
const TOOL_BUTTON =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold text-fg transition hover:bg-surface-2 hover:text-accent disabled:opacity-40";

function DownloadIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M8 2.5v8M4.5 7.5L8 11l3.5-3.5M3 13.5h10" />
    </svg>
  );
}

function ColumnsIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
      <path d="M6 2.5v11M10.5 2.5v11" />
    </svg>
  );
}

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

  const scoringValue = normalizeScoring(scoring);
  const showsScoring = tab.id === "fantasy" || tab.id === "custom";
  const sideSwitch = tab.sided ? (
    <Segmented options={[{ value: "o", label: sideLabels[0] }, { value: "d", label: sideLabels[1] }]} value={side} onChange={setSide} label="Side" />
  ) : null;

  // What a CSV of this board holds: each column's value and its rank, in board order.
  const exportColumns = [
    { key: "rank", label: "Rank" },
    { key: "team", label: "Team" },
    ...flat.flatMap((column) => [
      { key: column.key, label: column.metric[column.side === "d" ? "label_d" : "label_o"] ?? column.header },
      { key: `${column.key}#`, label: `${column.header} rank` },
    ]),
  ];
  const exportRows = rows.map((team, index) => ({
    rank: index + 1,
    team: team.name,
    ...Object.fromEntries(
      flat.flatMap((column) => {
        const entry = board?.values?.[column.id]?.[column.side]?.[team.abbreviation];
        return [[column.key, column.id === "record" ? recordText(team.record) : entry?.[0]], [`${column.key}#`, entry?.[1]]];
      }),
    ),
  }));

  return (
    <div className="grid grid-cols-1 gap-4">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent">Team leaderboards</div>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-fg">{tab.label}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">{tab.description}</p>
      </div>

      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="w-full min-w-0 md:w-auto md:flex-1">
          <ScrollRow className="min-w-0 max-w-full">
            <div role="tablist" aria-label="Team leaderboard" className={UNDERLINE_TRACK}>
              {[...TEAM_BOARD_TABS, TEAM_BOARD_CUSTOM].map((entry) => (
                <Link
                  key={entry.id}
                  to={tabHref(entry.id)}
                  role="tab"
                  aria-selected={entry.id === tab.id}
                  onClick={() => { if (entry.id === "custom") setEditing(true); }}
                  className={underlineTab(entry.id === tab.id)}
                >
                  {entry.id === "custom" && customColumns.length ? `${entry.label} (${customColumns.length})` : entry.label}
                </Link>
              ))}
            </div>
          </ScrollRow>
        </div>
        <BoardViews
          defaultName={`Teams \u00b7 ${tab.label}${sideWord ? ` \u00b7 ${sideWord}` : ""}`}
          summary={summarize(`Teams \u00b7 ${tab.label}`, sideWord, season, weeksLabel, showsScoring && scoringLabel(scoring))}
        />
      </div>

      {/* One row of pills, no card, from md up. On a phone the side switch stays out of
          the fold, beside the summary: it decides which numbers the table shows, so it
          is closer to a tab than a filter. */}
      <FilterBar
        plain
        className="flex flex-wrap items-center gap-2 max-md:p-4"
        summary={summarize(season, weeksLabel, showsScoring && scoringLabel(scoring))}
        aside={sideSwitch}
      >
        {sideSwitch && <div className="max-md:hidden">{sideSwitch}</div>}
        {sideSwitch && <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-line md:block" />}
        <PillSelect label="Season" value={season} onChange={setSeason} options={seasonOptions} changed={season !== String(currentSeason)} />
        <TimeframeFilter variant="pill" weeks={weeks} season={season} onChange={setWeeks} />
        {showsScoring && (
          <PillSelect label="Scoring" value={scoringValue} onChange={setScoring} options={SCORING_PRESET_OPTIONS} changed={scoringValue !== DEFAULT_SCORING} />
        )}
      </FilterBar>

      <section className="glass-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-tight text-fg">{tab.label}{sideWord ? ` · ${sideWord}` : ""}</h2>
            <p className="text-[11.5px] text-faint">
              {season} {"·"} {weeksLabel} {"·"} click a column to sort; the # under each value is its rank of 32
              {notes.length ? `. ${notes.join(" ")}` : ""}
            </p>
          </div>
          <span className="flex-1" />
          {tab.id === "custom" && (
            <button type="button" onClick={() => setEditing(true)} className={TOOL_BUTTON}>
              <ColumnsIcon />
              Edit Columns
            </button>
          )}
          <ExportButton
            filename={`second-level-teams-${tab.id}${tab.sided ? `-${side === "o" ? "offense" : "defense"}` : ""}-${season}${weeks ? `-wk${weeks.replace(/,/g, "-")}` : ""}`}
            rows={exportRows}
            columns={exportColumns}
            label={
              <>
                <DownloadIcon />
                <span className="max-sm:hidden">Export</span>
              </>
            }
            className={TOOL_BUTTON}
            context={[`Second Level: Team leaderboards · ${tab.label}${sideWord ? ` · ${sideWord}` : ""}`, `${season} · ${weeksLabel}`]}
          />
        </div>
        <div className="px-3 pb-2 pt-1">
        {isError && <p className="py-8 text-center text-sm text-muted">Could not load team stats for this season.</p>}
        {isLoading && !board && <p className="py-8 text-center text-sm text-muted">Loading...</p>}
        {board && flat.length === 0 && <p className="py-8 text-center text-sm text-muted">No columns yet. Use Edit Columns to add some.</p>}
        {board && flat.length > 0 && (
          <div className="overflow-x-auto">
            {/* A phone pins the team (rank, logo, nickname) and lets the stats scroll. */}
            <table className="w-full border-collapse text-[12.5px] md:min-w-[var(--table-min)]" style={{ "--table-min": `${260 + flat.length * 78}px` }}>
              <thead>
                <tr className="text-[10.5px] uppercase tracking-[0.08em]">
                  <th colSpan={2} className="hidden md:table-cell" />
                  <th className="pin-col md:hidden" />
                  {sections.map(([name, columns]) => (
                    <th key={name} colSpan={columns.length} className="border-l border-line px-2 pb-1 text-center font-bold text-fg">{name}</th>
                  ))}
                </tr>
                <tr className="border-b border-line text-[11px]">
                  <th className="hidden w-8 px-2 py-1.5 text-center font-semibold text-faint md:table-cell">#</th>
                  <th className="pin-col px-2 py-1.5 text-left font-semibold text-faint max-md:pl-9">Team</th>
                  {flat.map((column) => {
                    const on = column.key === sortKey;
                    const unavailable = column.metric.first_season && seasonNumber < column.metric.first_season;
                    return (
                      <th
                        key={column.key}
                        onClick={() => clickSort(column.key)}
                        title={`${column.metric[column.side === "d" ? "label_d" : "label_o"]}${column.metric.desc ? `. ${column.metric.desc}` : ""}${unavailable ? `. Available from ${column.metric.first_season}.` : ""}`}
                        aria-sort={on ? (reversed ? "descending" : "ascending") : undefined}
                        className={`cursor-pointer select-none whitespace-nowrap px-2.5 py-1.5 text-center font-semibold ${on ? "text-accent" : "text-faint hover:text-muted"} ${firstOfSection.has(column.key) ? "border-l border-line" : ""} ${unavailable ? "opacity-50" : ""}`}
                      >
                        {/* The arrow hangs off the label so the label stays centred over
                            the column's numbers. */}
                        <span className="relative inline-block">
                          {column.header}
                          {on && <span className="absolute left-full top-0 pl-0.5 font-mono" aria-hidden="true">{reversed ? "\u2191" : "\u2193"}</span>}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((team, index) => (
                  <tr key={team.team_id} className="border-b border-line hover:bg-surface-2">
                    <td className="stat-num hidden px-2 py-1.5 text-center text-faint md:table-cell">{index + 1}</td>
                    <td className="pin-col px-2 py-1.5">
                      <Link to={`/teams/${team.team_id}${season !== String(currentSeason) ? `?season=${season}` : ""}`} className="flex items-center gap-2 whitespace-nowrap hover:text-accent">
                        <span className="stat-num w-5 shrink-0 text-right text-[11px] text-faint md:hidden">{index + 1}</span>
                        {team.logo_url && <img src={team.logo_url} alt="" className="h-6 w-6 object-contain" />}
                        <b className="text-fg">{team.name.split(" ").pop()}</b>
                        <small className="stat-num hidden text-[11px] text-faint md:inline">{recordText(team.record)}</small>
                      </Link>
                    </td>
                    {flat.map((column) => {
                      const entry = board.values?.[column.id]?.[column.side]?.[team.abbreviation];
                      const count = rankedCount(board, column.id, column.side);
                      const text = column.id === "record" ? recordText(team.record) : formatTeamStat(entry?.[0], column.metric.fmt);
                      return (
                        <td key={column.key} className={`px-2.5 py-1 text-center ${firstOfSection.has(column.key) ? "border-l border-line" : ""}`}>
                          <span className="inline-flex flex-col items-center leading-tight">
                            <span className="stat-num text-fg">{text}</span>
                            <small className="stat-num text-[10.5px] font-semibold" style={{ color: rankInk(entry?.[1], count) }}>
                              {entry?.[1] == null ? "\u2013" : `#${entry[1]}`}
                            </small>
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="text-muted">
                  <td className="hidden md:table-cell" />
                  <td className="pin-col px-2 py-2 text-left text-[12px] max-md:pl-9">League average</td>
                  {flat.map((column) => (
                    <td key={column.key} className={`stat-num px-2.5 py-2 text-center ${firstOfSection.has(column.key) ? "border-l border-line" : ""}`}>
                      {column.id === "record" ? "" : formatTeamStat(board.values?.[column.id]?.[`${column.side}_mean`], column.metric.fmt)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
        </div>
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
