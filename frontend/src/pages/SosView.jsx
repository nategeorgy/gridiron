// Strength of schedule (M6.3) — the canonical team × week grid, one position at a time.
//
// A grid rather than a ranked list because strength of schedule is a property of a
// *sequence*: "CLE is 1st" is far less useful than seeing that their weeks 15–17 are
// NYG, BAL, IND. The teams are still ranked (easiest first, in the left column), so the
// ordered question is answered too — it just isn't the whole view.
//
// Difficulty is fantasy points allowed to this position, in your scoring, on a 0–100
// scale where **higher is harder**. Deliberately not a rank: "the number one defense
// against receivers" and "the number one schedule" point opposite ways, and a
// percentile also says how *much* harder rather than only which side of the median.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Select } from "../components/ui/Select";
import { ScoringControl } from "../components/ScoringControl";
import { ExportButton } from "../components/ExportButton";
import { SaveViewButton } from "../components/SaveViewButton";
import { useSos } from "../hooks/useDraftBoard";
import { useScoring } from "../hooks/useScoring";
import { useUrlState } from "../hooks/useUrlState";
import { useSeasons } from "../hooks/useSeasons";
import { formatStat } from "../utils/format";

const SOS_POSITIONS = [
  { value: "QB", label: "QB" },
  { value: "RB", label: "RB" },
  { value: "WR", label: "WR" },
  { value: "TE", label: "TE" },
];

const WINDOWS = [
  { value: "full", label: "Full season" },
  { value: "ros", label: "Rest of season" },
  { value: "next4", label: "Next 4 weeks" },
  { value: "playoffs", label: "Fantasy playoffs (15–17)" },
];
const WINDOW_KEYS = WINDOWS.map((entry) => entry.value);

// Easy is green, hard is red, and the strength of the tint is the distance from an
// average matchup. `--pos` / `--neg` are the right tokens here rather than a borrowed
// series colour: this scale *is* good-versus-bad, which is exactly what they encode.
function cellTint(difficulty) {
  if (difficulty === null || difficulty === undefined) return undefined;
  const distance = Math.min(Math.abs(difficulty - 50) / 50, 1);
  const strength = Math.round(distance * 55);
  const token = difficulty < 50 ? "--pos" : "--neg";
  return `color-mix(in srgb, var(${token}) ${strength}%, transparent)`;
}

function MatchupCell({ game, inWindow }) {
  if (!game) {
    return (
      <td className="px-1 py-1.5 text-center">
        <span className="text-[10px] text-faint">BYE</span>
      </td>
    );
  }
  const label = `${game.is_home ? "" : "@"}${game.opponent ?? "—"}`;
  const title =
    game.points_allowed_pg === null || game.points_allowed_pg === undefined
      ? `${game.opponent}: no data`
      : `${game.opponent} allowed ${formatStat(game.points_allowed_pg, 1)} pts/game to this position · difficulty ${formatStat(game.difficulty, 0)}/100`;

  return (
    <td className="px-1 py-1.5 text-center">
      <span
        title={title}
        style={{ backgroundColor: cellTint(game.difficulty) }}
        className={`stat-num inline-block w-full rounded px-1 py-1 text-[11px] ${
          inWindow ? "text-fg" : "text-faint opacity-40"
        }`}
      >
        {label}
      </span>
    </td>
  );
}

export function SosView({ board }) {
  const { seasonOptions, currentSeason } = useSeasons({ statsOnly: false });
  const [seasonChoice, setSeason] = useUrlState("season", "");
  const [position, setPosition] = useUrlState("position", "WR", ["QB", "RB", "WR", "TE"]);
  // Not `window`: that name is taken by the global, and shadowing it inside a component
  // is the kind of thing that works until something reaches for window.location.
  const [windowKey, setWindowKey] = useUrlState("window", "full", WINDOW_KEYS);
  const [scoring, setScoring] = useScoring();

  // The schedule season, which runs a year ahead of the newest season with stats — a
  // fixture list is about what is coming.
  const season = seasonChoice || String(seasonOptions[0]?.value ?? currentSeason);

  const params = useMemo(
    () => ({ season: Number(season), position, window: windowKey, scoring }),
    [season, position, windowKey, scoring],
  );
  const { data, isLoading, isError, error, isPlaceholderData } = useSos(params);

  const rows = data?.data ?? [];
  const weeks = data?.weeks ?? [];
  const inWindow = useMemo(() => new Set(data?.window_weeks ?? []), [data?.window_weeks]);

  const exportRows = useMemo(
    () =>
      rows.map((row) => ({
        rank: row.rank,
        team: row.abbreviation,
        difficulty: row.difficulty,
        games: row.games,
        ...Object.fromEntries(
          weeks.map((week) => {
            const game = row.schedule?.[weeks.indexOf(week)];
            return [`w${week}`, game ? `${game.is_home ? "" : "@"}${game.opponent}` : "BYE"];
          }),
        ),
      })),
    [rows, weeks],
  );

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent">Insight</div>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-fg">{board.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">{board.description}</p>
      </div>

      <div className="glass-card flex flex-wrap gap-3 p-4">
        <Select label="Season" value={season} onChange={setSeason} options={seasonOptions} />
        <Select label="Position" value={position} onChange={setPosition} options={SOS_POSITIONS} />
        <Select label="Window" value={windowKey} onChange={setWindowKey} options={WINDOWS} />
        <div className="ml-auto flex items-end gap-2">
          <SaveViewButton defaultName={board.title} />
          <ExportButton
            filename={`gridironiq-sos-${position}-${season}`}
            rows={exportRows}
            columns={[
              { key: "rank", label: "Rank" },
              { key: "team", label: "Team" },
              { key: "difficulty", label: "Difficulty" },
              { key: "games", label: "Games in window" },
              ...weeks.map((week) => ({ key: `w${week}`, label: `Wk ${week}` })),
            ]}
            context={[
              `GridironIQ — Strength of Schedule (${position})`,
              `${season} schedule · ${WINDOWS.find((w) => w.value === windowKey)?.label} · scoring: ${scoring}`,
              `Difficulty 0–100, higher is harder. Based on ${data?.basis?.season ?? "—"} fantasy points allowed.`,
            ]}
          />
        </div>
      </div>

      <ScoringControl scoring={scoring} onChange={setScoring} />

      <p className="max-w-3xl text-xs leading-relaxed text-muted">{board.lede}</p>

      <div className="glass-card overflow-x-auto">
        <table className="w-full min-w-[980px] border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-faint">
              <th className="sticky left-0 z-10 border-b border-line bg-surface px-3 py-3 text-right">#</th>
              <th className="border-b border-line px-3 py-3">Team</th>
              <th className="border-b border-line px-2 py-3 text-right" title="Average difficulty of the opponents in the selected window. 0–100, higher is harder.">
                Diff
              </th>
              {weeks.map((week) => (
                <th
                  key={week}
                  className={`border-b border-line px-1 py-3 text-center font-semibold ${
                    inWindow.has(week) ? "text-muted" : "text-faint"
                  }`}
                >
                  {week}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={isPlaceholderData ? "opacity-60 transition" : "transition"}>
            {isLoading && (
              <tr><td colSpan={weeks.length + 3} className="px-3 py-8 text-center text-muted">Loading…</td></tr>
            )}
            {isError && (
              <tr>
                <td colSpan={weeks.length + 3} className="px-3 py-8 text-center text-muted">
                  {error?.response?.data?.detail ?? "Could not load strength of schedule."}
                </td>
              </tr>
            )}
            {!isLoading && !isError && rows.length === 0 && (
              <tr><td colSpan={weeks.length + 3} className="px-3 py-8 text-center text-muted">No schedule for this season.</td></tr>
            )}
            {rows.map((row) => (
              <tr key={row.team_id} className="hover:bg-surface-2">
                <td className="sticky left-0 z-10 border-b border-line bg-surface px-3 py-1.5 text-right">
                  <span className="stat-num text-xs text-faint">{row.rank ?? "—"}</span>
                </td>
                <td className="whitespace-nowrap border-b border-line px-3 py-1.5">
                  <Link
                    to={`/teams/${row.team_id}`}
                    className="stat-num text-xs font-semibold text-fg hover:text-accent hover:underline"
                  >
                    {row.abbreviation}
                  </Link>
                </td>
                <td className="border-b border-line px-2 py-1.5 text-right">
                  <span
                    className="stat-num rounded px-1.5 py-0.5 text-xs text-fg"
                    style={{ backgroundColor: cellTint(row.difficulty) }}
                  >
                    {formatStat(row.difficulty, 0)}
                  </span>
                </td>
                {row.schedule?.map((game, index) => (
                  <MatchupCell
                    key={weeks[index]}
                    game={game}
                    inWindow={inWindow.has(weeks[index])}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-faint">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-6 rounded" style={{ backgroundColor: cellTint(0) }} />
          easier matchup
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-6 rounded" style={{ backgroundColor: cellTint(100) }} />
          harder matchup
        </span>
        <span>Weeks outside the selected window are dimmed. A blank week is a bye.</span>
      </div>

      {data?.basis && (
        <p className="max-w-3xl text-[11px] leading-relaxed text-faint">
          Difficulty is <span className="text-muted">fantasy points allowed per game</span> to{" "}
          {position}s, in your scoring, as a 0–100 percentile among the 32 defenses —
          higher is harder. Based on{" "}
          <span className="text-muted">
            {data.basis.kind === "prior_season"
              ? `the ${data.basis.season} season (${data.basis.weeks} weeks)`
              : `${data.basis.season} so far (${data.basis.weeks} weeks played)`}
          </span>
          {data.basis.kind === "prior_season" && (
            <>
              , because the {data.season} season has not played enough games to measure yet.
              Defenses change over an offseason, so treat an August rating as the last
              thing we know rather than a forecast
            </>
          )}
          . Byes are skipped rather than counted as easy weeks.
        </p>
      )}
    </div>
  );
}
