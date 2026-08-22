// The Vegas board (M6.4) — game environment as a fantasy input.
//
// The market prices every game twice: a spread (who wins, by how much) and a total
// (how many points). Split them and you get each team's **implied total** — the points
// the market expects that offense to score, and the best forward-looking read on how
// many fantasy points are going to exist. A back in a 27-point offense has a different
// job from the same back in a 17-point one.
//
// Two views on one toggle, players first: this board sits beside VORP and Buy Low, and
// those rank players. The games view is the same week read as a slate.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Select } from "../components/ui/Select";
import { ScoringControl } from "../components/ScoringControl";
import { FavoriteStar } from "../components/FavoriteStar";
import { TablePager } from "../components/StatTable";
import { ExportButton } from "../components/ExportButton";
import { SaveViewButton } from "../components/SaveViewButton";
import { useVegas } from "../hooks/useDraftBoard";
import { useScoring } from "../hooks/useScoring";
import { useUrlState } from "../hooks/useUrlState";
import { useSeasons } from "../hooks/useSeasons";
import { formatStat } from "../utils/format";
import { POSITIONS } from "../constants";

const PAGE_SIZE = 50;
const VIEWS = [
  { value: "players", label: "Players" },
  { value: "games", label: "Games" },
];

// Implied totals live roughly between 15 and 30 points. Tinting across that range
// rather than from zero is what makes the difference between a 21 and a 27 visible;
// `--pos` is the right token because more points is unambiguously better here.
const LOW_TOTAL = 17;
const HIGH_TOTAL = 28;

function impliedTint(implied) {
  if (implied === null || implied === undefined) return undefined;
  const scaled = Math.max(0, Math.min(1, (implied - LOW_TOTAL) / (HIGH_TOTAL - LOW_TOTAL)));
  return `color-mix(in srgb, var(--pos) ${Math.round(scaled * 55)}%, transparent)`;
}

/** "−3.5" when favoured, "+3.5" when not. */
function spreadLabel(spread) {
  if (spread === null || spread === undefined) return "—";
  if (spread === 0) return "PK";
  return spread > 0 ? `−${formatStat(spread, 1)}` : `+${formatStat(Math.abs(spread), 1)}`;
}

function NotPriced() {
  return (
    <span
      className="text-[11px] text-faint"
      title="The market has not posted a line for this game yet. Lines appear a few weeks out, with look-ahead numbers on a handful of games beyond that."
    >
      no line
    </span>
  );
}

export function VegasView({ board }) {
  const { seasonOptions, currentSeason } = useSeasons({ statsOnly: false });
  const [seasonChoice, setSeason] = useUrlState("season", "");
  const [view, setView] = useUrlState("view", "players", ["players", "games"]);
  const [week, setWeek] = useUrlState("week", "");
  const [position, setPosition] = useUrlState("position", "");
  const [offset, setOffset] = useState(0);
  const [scoring, setScoring] = useScoring();

  const season = seasonChoice || String(seasonOptions[0]?.value ?? currentSeason);

  const params = useMemo(
    () => ({
      season: Number(season),
      ...(week ? { week: Number(week) } : {}),
      view,
      ...(view === "players" && position ? { position } : {}),
      scoring,
      limit: PAGE_SIZE,
      offset,
    }),
    [season, week, view, position, scoring, offset],
  );

  const { data, isLoading, isError, error, isPlaceholderData } = useVegas(params);
  const rows = data?.data ?? [];
  const total = data?.total ?? 0;

  const withReset = (setter) => (value) => {
    setter(value);
    setOffset(0);
  };

  // Weeks the season actually has, labelled with whether the market has priced them —
  // otherwise picking week 12 looks like a broken page rather than an honest one.
  const weekOptions = useMemo(() => {
    const summary = data?.weeks ?? [];
    if (summary.length === 0) return [{ value: "", label: "Next week" }];
    return [
      { value: "", label: "Next week" },
      ...summary.map((entry) => ({
        value: String(entry.week),
        label:
          entry.priced === 0
            ? `Week ${entry.week} · no lines`
            : entry.priced < entry.games
              ? `Week ${entry.week} · ${entry.priced}/${entry.games} priced`
              : `Week ${entry.week}`,
      })),
    ];
  }, [data?.weeks]);

  const exportRows = useMemo(
    () =>
      view === "players"
        ? rows.map((row) => ({
            name: row.name, position: row.position, team: row.team_abbreviation,
            matchup: `${row.is_home ? "vs " : "@ "}${row.opponent ?? ""}`,
            implied_total: row.implied_total, team_spread: row.team_spread,
            total_line: row.total_line, fantasy_ppg: row.fantasy_ppg,
          }))
        : rows.map((row) => ({
            matchup: `${row.away} @ ${row.home}`, game_date: row.game_date,
            spread_line: row.spread_line, total_line: row.total_line,
            away_implied: row.away_implied, home_implied: row.home_implied,
          })),
    [rows, view],
  );

  const exportColumns =
    view === "players"
      ? [
          { key: "name", label: "Player" }, { key: "position", label: "Pos" },
          { key: "team", label: "Team" }, { key: "matchup", label: "Matchup" },
          { key: "implied_total", label: "Implied total" },
          { key: "team_spread", label: "Spread" }, { key: "total_line", label: "Game total" },
          { key: "fantasy_ppg", label: "PPG" },
        ]
      : [
          { key: "matchup", label: "Game" }, { key: "game_date", label: "Date" },
          { key: "spread_line", label: "Spread (home)" }, { key: "total_line", label: "Total" },
          { key: "away_implied", label: "Away implied" }, { key: "home_implied", label: "Home implied" },
        ];

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent">Insight</div>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-fg">{board.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">{board.description}</p>
      </div>

      <div className="glass-card flex flex-wrap gap-3 p-4">
        <Select label="Season" value={season} onChange={withReset(setSeason)} options={seasonOptions} />
        <Select label="Week" value={week} onChange={withReset(setWeek)} options={weekOptions} />
        <Select label="View" value={view} onChange={withReset(setView)} options={VIEWS} />
        {view === "players" && (
          <Select label="Position" value={position} onChange={withReset(setPosition)} options={POSITIONS} />
        )}
        <div className="ml-auto flex items-end gap-2">
          <SaveViewButton defaultName={board.title} />
          <ExportButton
            filename={`gridironiq-vegas-${season}-wk${data?.week ?? ""}`}
            rows={exportRows}
            columns={exportColumns}
            context={[
              "GridironIQ — Vegas Board",
              `${data?.season ?? season} week ${data?.week ?? ""} · ${view} view · scoring: ${scoring}`,
              "Implied total = game total / 2 +/- spread / 2. Blank lines are games the market has not priced.",
            ]}
          />
        </div>
      </div>

      {view === "players" && <ScoringControl scoring={scoring} onChange={withReset(setScoring)} />}

      <p className="max-w-3xl text-xs leading-relaxed text-muted">{board.lede}</p>

      <div className="glass-card overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-faint">
              {view === "players" ? (
                <>
                  <th className="px-3 py-3 text-right">#</th>
                  <th className="px-3 py-3">Player</th>
                  <th className="px-3 py-3">Matchup</th>
                  <th className="px-3 py-3 text-right" title="Points the market expects this offense to score: the game total split by the spread">Implied</th>
                  <th className="px-3 py-3 text-right" title="The spread from this team's point of view">Line</th>
                  <th className="px-3 py-3 text-right">Total</th>
                  <th className="px-3 py-3 text-right" title="Fantasy points per game in the production season, in your scoring">PPG</th>
                </>
              ) : (
                <>
                  <th className="px-3 py-3">Game</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3 text-right">Spread</th>
                  <th className="px-3 py-3 text-right">Total</th>
                  <th className="px-3 py-3 text-right">Away implied</th>
                  <th className="px-3 py-3 text-right">Home implied</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className={isPlaceholderData ? "opacity-60 transition" : "transition"}>
            {isLoading && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted">Loading…</td></tr>
            )}
            {isError && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted">
                  {error?.response?.data?.detail ?? "Could not load the Vegas board."}
                </td>
              </tr>
            )}
            {!isLoading && !isError && rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted">No games this week.</td></tr>
            )}

            {view === "players" &&
              rows.map((row, index) => (
                <tr key={row.player_id} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="stat-num px-3 py-2.5 text-right text-faint">{offset + index + 1}</td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-1.5">
                      <FavoriteStar playerId={row.player_id} size="h-3.5 w-3.5" />
                      <Link to={`/players/${row.player_id}`} className="font-medium text-fg hover:text-accent hover:underline">
                        {row.name}
                      </Link>
                      <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-faint">
                        {row.position}
                        {row.pos_rank ?? ""}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <Link to={`/teams/${row.team_id}`} className="stat-num text-xs text-fg hover:text-accent">
                      {row.team_abbreviation}
                    </Link>
                    <span className="stat-num ml-1.5 text-xs text-muted">
                      {row.is_home ? "vs" : "@"} {row.opponent ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {row.priced ? (
                      <span
                        className="stat-num rounded px-1.5 py-0.5 text-xs font-semibold text-fg"
                        style={{ backgroundColor: impliedTint(row.implied_total) }}
                      >
                        {formatStat(row.implied_total, 1)}
                      </span>
                    ) : (
                      <NotPriced />
                    )}
                  </td>
                  <td className="stat-num px-3 py-2.5 text-right text-muted">
                    {row.priced ? spreadLabel(row.team_spread) : "—"}
                  </td>
                  <td className="stat-num px-3 py-2.5 text-right text-muted">
                    {formatStat(row.total_line, 1)}
                  </td>
                  <td className="stat-num px-3 py-2.5 text-right text-muted">
                    {formatStat(row.fantasy_ppg, 1)}
                  </td>
                </tr>
              ))}

            {view === "games" &&
              rows.map((row) => (
                <tr key={row.game_id} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="px-3 py-2.5">
                    <Link to={`/teams/${row.away_team_id}`} className="stat-num text-fg hover:text-accent">
                      {row.away}
                    </Link>
                    <span className="mx-1.5 text-muted">@</span>
                    <Link to={`/teams/${row.home_team_id}`} className="stat-num text-fg hover:text-accent">
                      {row.home}
                    </Link>
                    {row.div_game && (
                      <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-faint">DIV</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted">{row.game_date ?? "—"}</td>
                  <td className="stat-num px-3 py-2.5 text-right text-muted">
                    {row.priced ? formatStat(row.spread_line, 1) : <NotPriced />}
                  </td>
                  <td className="stat-num px-3 py-2.5 text-right text-fg">
                    {formatStat(row.total_line, 1)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span
                      className="stat-num rounded px-1.5 py-0.5 text-xs text-fg"
                      style={{ backgroundColor: impliedTint(row.away_implied) }}
                    >
                      {formatStat(row.away_implied, 1)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span
                      className="stat-num rounded px-1.5 py-0.5 text-xs text-fg"
                      style={{ backgroundColor: impliedTint(row.home_implied) }}
                    >
                      {formatStat(row.home_implied, 1)}
                    </span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {data && (
        <p className="max-w-3xl text-[11px] leading-relaxed text-faint">
          Implied total is the game total split by the spread — what the market expects
          each offense to score. Lines come from the nflverse schedule feed, the same one
          the fixtures do, so there is no odds provider behind this and no intraday
          movement: they update when the feed does.{" "}
          {view === "players" && (
            <>
              The player list is each team's depth chart to third at a position, with
              points per game from the{" "}
              <span className="text-muted">{data.production_season}</span> season in your
              scoring.{" "}
            </>
          )}
          Games the market has not priced show <span className="text-muted">no line</span>{" "}
          and sort last, because no line is not a low total.
        </p>
      )}

      <TablePager offset={offset} pageSize={PAGE_SIZE} total={total} onOffsetChange={setOffset} />
    </div>
  );
}
