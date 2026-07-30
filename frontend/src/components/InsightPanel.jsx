// Fantasy-intelligence panel for a player page (M3): the four scores, the badges they
// imply, and the component breakdown behind each one.
//
// The breakdown is the point. A rule-based signal is only better than a black-box
// projection if the user can see the rules, so every weighted input is shown with its
// value and its percentile in the player's position pool.
import { useState } from "react";
import { LeagueControl } from "./LeagueControl";
import { usePlayerIntelligence } from "../hooks/useInsight";
import { useLeague } from "../hooks/useLeague";
import { useMetrics } from "../hooks/useMetrics";
import { formatPercentile, formatSigned, formatStat } from "../utils/format";
import { leagueLabel } from "../constants/league";

// Score at or above which a signal is worth calling out on the page.
const STRONG_SIGNAL = 70;
const ELITE_OPPORTUNITY = 85;

function Badge({ children, tone = "neutral", title }) {
  const tones = {
    buy: "border-pos/40 text-pos",
    sell: "border-warn/40 text-warn",
    opportunity: "border-edge text-accent",
    caution: "border-edge text-muted",
  };
  return (
    <span
      title={title}
      className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tones[tone] ?? tones.caution}`}
    >
      {children}
    </span>
  );
}

// A 0–100 score with a meter, so "78" reads as a position on a scale.
function ScoreTile({ label, score, caption, description, accent = "accent" }) {
  const width = score === null || score === undefined ? 0 : Math.max(0, Math.min(100, score));
  const barColor = { accent: "bg-accent", pos: "bg-pos", warn: "bg-warn" }[accent] ?? "bg-accent";
  return (
    <div className="rounded-xl bg-surface-2/60 p-3" title={description}>
      <div className="text-[11px] uppercase tracking-wide text-faint">{label}</div>
      <div className="stat-num mt-1 text-2xl font-semibold leading-none text-fg">
        {formatStat(score, 1)}
      </div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-1">
        <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${width}%` }} />
      </div>
      {caption && <div className="mt-2 text-[11px] leading-snug text-muted">{caption}</div>}
    </div>
  );
}

function ComponentRow({ component }) {
  const percentile = component.percentile;
  const width = percentile === null ? 0 : Math.round(percentile * 100);
  return (
    <tr className="border-t border-line">
      <td className="py-2 pr-3 text-xs text-muted">
        {component.label}
        {component.invert && (
          <span className="ml-1.5 text-[10px] uppercase tracking-wide text-faint" title="Lower raw values score higher for this input">
            lower is better
          </span>
        )}
      </td>
      <td className="stat-num py-2 pr-3 text-right text-xs text-fg">
        {formatStat(component.value, component.format)}
      </td>
      <td className="py-2 pr-3">
        <div className="flex items-center gap-2">
          <div className="h-1 w-16 overflow-hidden rounded-full bg-surface-1">
            <div className="h-full rounded-full bg-accent" style={{ width: `${width}%` }} />
          </div>
          <span className="stat-num text-xs text-muted">{formatPercentile(percentile)}</span>
        </div>
      </td>
      <td className="stat-num py-2 text-right text-xs text-faint">
        {Math.round(component.weight * 100)}%
      </td>
    </tr>
  );
}

function Breakdown({ block }) {
  const [open, setOpen] = useState(false);
  if (block.score === null || block.score === undefined) return null;

  return (
    <div className="rounded-xl border border-line">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:text-accent"
      >
        <span className="text-xs font-semibold text-fg">{block.label}</span>
        <span className="flex items-center gap-2">
          <span className="stat-num text-xs font-semibold text-accent">
            {formatStat(block.score, 1)}
          </span>
          <span className="text-[10px] text-faint">{open ? "hide" : "why?"}</span>
        </span>
      </button>
      {open && (
        <div className="border-t border-line px-3 pb-3 pt-1">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-faint">
                <th className="py-1.5 font-semibold">Input</th>
                <th className="py-1.5 text-right font-semibold">Value</th>
                <th className="py-1.5 font-semibold">Percentile in position</th>
                <th className="py-1.5 text-right font-semibold">Weight</th>
              </tr>
            </thead>
            <tbody>
              {block.components.map((component) => (
                <ComponentRow key={component.key} component={component} />
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] leading-relaxed text-faint">
            The score is the weighted average of these percentiles. Inputs with no data
            drop out and the remaining weights are rescaled.
          </p>
        </div>
      )}
    </div>
  );
}

export function InsightPanel({ playerId, season, scoring }) {
  const [league, setLeague] = useLeague();
  const { metrics } = useMetrics();
  const { data, isLoading, isError, error } = usePlayerIntelligence(playerId, {
    season,
    season_type: "REG",
    scoring,
    league,
  });

  if (isLoading) {
    return (
      <div className="glass-card p-4 text-sm text-muted">Scoring against the position pool…</div>
    );
  }
  if (isError) {
    return (
      <div className="glass-card p-4 text-sm text-muted">
        Insight scores unavailable for {season}
        {error?.response?.status === 404 ? " — no games in this window." : "."}
      </div>
    );
  }
  if (!data) return null;

  const { scores, supporting, breakdown, replacement } = data;
  const badges = [];
  if (scores.positive_regression_index >= STRONG_SIGNAL) {
    badges.push(
      <Badge key="buy" tone="buy" title="Earning more than they're scoring — a buy-low candidate">
        Buy Low
      </Badge>,
    );
  }
  if (scores.sell_high_index >= STRONG_SIGNAL) {
    badges.push(
      <Badge key="sell" tone="sell" title="Scoring above what the usage supports — a sell-high candidate">
        Sell High
      </Badge>,
    );
  }
  if (scores.fantasy_opportunity_rating >= ELITE_OPPORTUNITY) {
    badges.push(
      <Badge key="opp" tone="opportunity" title="Top-tier share of their offense">
        Elite Opportunity
      </Badge>,
    );
  }
  if (scores.vorp_ppg !== null && scores.vorp_ppg < 0) {
    badges.push(
      <Badge key="repl" tone="caution" title="Scored below the last startable player at this position in your league">
        Below Replacement
      </Badge>,
    );
  }
  if (!data.qualified) {
    badges.push(
      <Badge key="sample" tone="caution" title={`Played ${data.games_played} games; ${data.min_games} needed to be ranked`}>
        Small Sample
      </Badge>,
    );
  }

  return (
    <div className="glass-card space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted">Fantasy Intelligence</span>
          <span className="text-xs text-faint">· {season} · {leagueLabel(league)}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">{badges}</div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl bg-surface-2/60 p-3" title={metrics.vorp?.description}>
          <div className="text-[11px] uppercase tracking-wide text-faint">Value Over Replacement</div>
          <div
            className={`stat-num mt-1 text-2xl font-semibold leading-none ${
              (scores.vorp ?? 0) >= 0 ? "text-pos" : "text-neg"
            }`}
          >
            {formatSigned(scores.vorp, 1)}
          </div>
          <div className="mt-2 text-[11px] leading-snug text-muted">
            {formatSigned(scores.vorp_ppg, 2)} / game vs a{" "}
            {formatStat(supporting.replacement_ppg, 2)} PPG replacement
            {replacement?.rank ? ` (${data.position}${replacement.rank})` : ""}
          </div>
        </div>
        <ScoreTile
          label="Opportunity Rating"
          score={scores.fantasy_opportunity_rating}
          description={metrics.fantasy_opportunity_rating?.description}
          caption={`${formatStat(supporting.expected_fantasy_ppg, 2)} expected PPG on this usage`}
        />
        <ScoreTile
          label="Buy Low"
          score={scores.positive_regression_index}
          accent="pos"
          description={metrics.positive_regression_index?.description}
          caption={`${formatSigned(supporting.fantasy_points_over_expected, 1)} pts vs expected`}
        />
        <ScoreTile
          label="Sell High"
          score={scores.sell_high_index}
          accent="warn"
          description={metrics.sell_high_index?.description}
          caption={`${formatSigned(supporting.tds_over_expected, 2)} TDs vs expected`}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {Object.entries(breakdown).map(([id, block]) => (
          <Breakdown key={id} block={block} />
        ))}
      </div>

      <LeagueControl league={league} onChange={setLeague} replacement={{ [data.position]: replacement }} />

      <p className="text-[11px] leading-relaxed text-faint">
        Scores are percentiles within this player's position pool
        {data.pool_size ? ` (${data.pool_size} qualified ${data.position}s)` : ""} over the{" "}
        {season} regular season, in your league scoring and lineup. The ones built on
        expected points use nflverse ffopportunity model estimates — descriptive, not a
        projection.
      </p>
    </div>
  );
}
