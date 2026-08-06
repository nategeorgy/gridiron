// Scatter builder (M4) — a curated set of charts, not a blank axis picker.
//
// Users choose a *question* (a preset), not two metrics. Arbitrary axis pairs mostly
// produce meaningless clouds, and the curation is the product: every preset in
// constants/scatters.js answers something a fantasy manager actually asks, scoped to
// the position where that question makes sense.
//
// Everything is in the user's own scoring and league context, and the whole view is
// reconstructible from the URL, so a chart can be shared as a link.
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Select } from "../components/ui/Select";
import { ScoringControl } from "../components/ScoringControl";
import { LeagueControl } from "../components/LeagueControl";
import { ExportButton } from "../components/ExportButton";
import { SaveViewButton } from "../components/SaveViewButton";
import { MetricScatter } from "../components/charts/MetricScatter";
import { useScatter } from "../hooks/useExplore";
import { useScoring } from "../hooks/useScoring";
import { useLeague } from "../hooks/useLeague";
import { useMetrics } from "../hooks/useMetrics";
import { DENSITY_OPTIONS, SCATTER_GROUPS, findGroup } from "../constants/scatters";
import { INSIGHT_TIMEFRAMES, SEASONS, SEASON_TYPES } from "../constants";

const seasonOptions = SEASONS.map((year) => ({ value: String(year), label: String(year) }));

// Games needed to appear. Deliberately not a user control — each preset is a ranked
// top-N, and a 1-game sample in a rate-stat plot is noise dressed as an outlier.
const MIN_GAMES_FULL_SEASON = 4;
const MIN_GAMES_WINDOW = 2;

export function ScatterView({ board }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [season, setSeason] = useState(String(SEASONS[0]));
  const [lastWeeks, setLastWeeks] = useState("");
  const [seasonType, setSeasonType] = useState("REG");
  const [density, setDensity] = useState("50");
  const [scoring, setScoring] = useScoring();
  const [league, setLeague] = useLeague();
  const { metrics } = useMetrics();

  // Group + preset live in the URL so a chart is shareable.
  const groupId = searchParams.get("group") ?? SCATTER_GROUPS[0].id;
  const group = findGroup(groupId);
  const presetId = searchParams.get("chart") ?? group.presets[0].id;
  const preset = group.presets.find((item) => item.id === presetId) ?? group.presets[0];

  const setUrl = (next) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(next)) {
          if (value) params.set(key, value);
          else params.delete(key);
        }
        return params;
      },
      { replace: true },
    );
  };

  // Switching position group resets to that group's first chart.
  const changeGroup = (nextGroupId) => {
    const nextGroup = findGroup(nextGroupId);
    setUrl({ group: nextGroupId, chart: nextGroup.presets[0].id });
  };

  const params = useMemo(
    () => ({
      season: Number(season),
      x: preset.x,
      y: preset.y,
      ...(preset.size ? { size: preset.size } : {}),
      mode: "season",
      rank_by: preset.rankBy ?? "fantasy_points",
      ...(lastWeeks ? { last_weeks: Number(lastWeeks) } : {}),
      season_type: seasonType,
      ...(group.position ? { position: group.position } : {}),
      scoring,
      league,
      min_games: preset.minGames ?? (lastWeeks ? MIN_GAMES_WINDOW : MIN_GAMES_FULL_SEASON),
      limit: Number(density),
    }),
    [season, preset, group, lastWeeks, seasonType, scoring, league, density],
  );

  const { data, isLoading, isError, error } = useScatter(params);

  const points = data?.data ?? [];
  const axes = data?.axes;

  const exportColumns = [
    { key: "name", label: "Player" },
    { key: "position", label: "Position" },
    { key: "team_abbreviation", label: "Team" },
    { key: "games_played", label: "Games" },
    { key: "x", label: axes?.x?.label ?? preset.x },
    { key: "y", label: axes?.y?.label ?? preset.y },
    ...(preset.size ? [{ key: "size", label: axes?.size?.label ?? preset.size }] : []),
  ];

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent">Explore</div>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-fg">{board.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">{board.description}</p>
      </div>

      {/* Position group — tabs, because the group decides which questions are even
          askable, and that is the first choice a user makes. */}
      <div className="glass-card p-2">
        <div className="flex flex-wrap gap-1">
          {SCATTER_GROUPS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => changeGroup(item.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                item.id === group.id ? "glass-pill !text-accent" : "text-muted hover:text-fg"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart picker — each option is a question, not a pair of metrics. */}
      <div className="glass-card p-4">
        <div className="flex flex-wrap gap-2">
          {group.presets.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setUrl({ chart: item.id })}
              // The semantic colour tokens are bare CSS variables, so Tailwind's
              // `/opacity` modifier can't apply to them — use the token as-is.
              className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                item.id === preset.id
                  ? "border-accent bg-surface-2 text-fg"
                  : "border-edge text-muted hover:text-fg"
              }`}
            >
              <div className="font-semibold">{item.label}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-faint">
                {metrics[item.y]?.short ?? item.y} vs {metrics[item.x]?.short ?? item.x}
                {item.size ? ` · size = ${metrics[item.size]?.short ?? item.size}` : ""}
              </div>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">{group.blurb}</p>
      </div>

      <div className="glass-card flex flex-wrap gap-3 p-4">
        <Select label="Season" value={season} onChange={setSeason} options={seasonOptions} />
        <Select label="Timeframe" value={lastWeeks} onChange={setLastWeeks} options={INSIGHT_TIMEFRAMES} />
        <Select label="Type" value={seasonType} onChange={setSeasonType} options={SEASON_TYPES} />
        <Select label="Players" value={density} onChange={setDensity} options={DENSITY_OPTIONS} />
        <div className="ml-auto flex items-end gap-2">
          <SaveViewButton defaultName={preset.label} />
          <ExportButton
            filename={`gridironiq-${preset.id}-${season}`}
            rows={points}
            columns={exportColumns}
            context={[
              `GridironIQ scatter — ${preset.label} (${group.label})`,
              preset.question,
              `${season} ${seasonType}${lastWeeks ? ` · last ${lastWeeks} weeks` : ""} · top ${density} by fantasy points`,
              `scoring: ${scoring} · league: ${league}`,
            ]}
          />
        </div>
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-2">
        <ScoringControl scoring={scoring} onChange={setScoring} />
        <LeagueControl league={league} onChange={setLeague} replacement={undefined} />
      </div>

      <div className="glass-card p-4">
        <div className="mb-1 text-sm font-semibold text-fg">{preset.label}</div>
        <p className="mb-3 text-xs text-muted">{preset.question}</p>

        {isLoading && <div className="p-16 text-center text-sm text-muted">Loading…</div>}
        {isError && (
          <div className="p-16 text-center text-sm text-neg">
            {error?.response?.data?.detail ?? error?.message ?? "Failed to load."}
          </div>
        )}
        {!isLoading && !isError && points.length === 0 && (
          <div className="p-16 text-center text-sm text-muted">
            Nothing to plot for these filters.
          </div>
        )}
        {!isLoading && !isError && points.length > 0 && axes && (
          <>
            <MetricScatter
              points={points}
              axes={axes}
              medians={data.medians}
              preset={preset}
              onSelect={(point) => point?.player_id && navigate(`/players/${point.player_id}`)}
            />
            <div className="mt-2 border-t border-line pt-3 text-xs text-faint">
              Dashed lines are the medians
              {preset.identity ? "; the diagonal is where actual equals expected" : ""} · click a
              player to open their page
            </div>
          </>
        )}
      </div>

      {data && (
        <p className="text-[11px] leading-relaxed text-faint">
          Showing the top <span className="text-muted">{points.length}</span> by fantasy points
          {data.total != null && data.truncated && (
            <> of <span className="text-muted">{data.total}</span> qualified</>
          )}{" "}
          over{" "}
          <span className="text-muted">
            {data.window.last_weeks
              ? `the last ${data.window.last_weeks} played weeks`
              : `the full ${data.window.season} season`}{" "}
            (weeks {data.window.week_from}–{data.window.week_to})
          </span>
          , among players with at least{" "}
          <span className="text-muted">{data.min_games} games</span>.
          {(axes?.x?.modelled || axes?.y?.modelled) &&
            " An axis uses expected points — a model estimate (nflverse ffopportunity), not a projection."}{" "}
          Players missing a value on either axis are left out rather than plotted at zero.
        </p>
      )}
    </div>
  );
}
