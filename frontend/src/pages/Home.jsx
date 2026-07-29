// Command Center — the app's home. A Bento dashboard that opens on the fantasy
// question: who's leading in *your* league scoring. Live panels (fantasy leaders,
// the leader spotlight) use the real leaderboard API; roadmap panels (Buy-Low,
// Sell-High, expected points) are labeled teasers until their milestone ships.
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useLeaderboard } from "../hooks/useLeaderboard";
import { useScoring } from "../hooks/useScoring";
import { useMetrics } from "../hooks/useMetrics";
import { formatStat } from "../utils/format";
import { scoringLabel } from "../constants/scoring";
import { SEASONS } from "../constants";

// Same fixed-PPR fallback the leaderboard uses when the backend can't score yet.
const FANTASY_FALLBACK = { fantasy_points: "fantasy_points_ppr", fantasy_ppg: "fantasy_ppg_ppr" };
const SEASON = SEASONS[0];

function Card({ children, className = "" }) {
  return <section className={`glass-card p-4 ${className}`}>{children}</section>;
}

function CardHead({ title, badge }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold tracking-tight text-fg">{title}</h3>
      {badge}
    </div>
  );
}

function Badge({ children, tone = "live" }) {
  const tones = {
    live: "text-accent",
    m2: "text-[#5aa9ff]",
    m3: "text-warn",
  };
  return (
    <span className={`rounded-md border border-edge px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  );
}

function PosTag({ pos }) {
  return (
    <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-faint">{pos}</span>
  );
}

// A frosted entry tile linking to another page.
function LinkTile({ to, icon, title, desc }) {
  return (
    <Link to={to} className="glass-card group flex flex-col gap-2 p-4 transition hover:-translate-y-0.5">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-accent">{icon}</span>
      <div>
        <div className="text-sm font-semibold text-fg group-hover:text-accent">{title}</div>
        <div className="text-xs text-muted">{desc}</div>
      </div>
    </Link>
  );
}

// A roadmap teaser — communicates a coming feature without faking data.
function TeaserCard({ title, badge, blurb, examples }) {
  return (
    <Card className="relative overflow-hidden">
      <CardHead title={title} badge={badge} />
      <p className="text-xs text-muted">{blurb}</p>
      <div className="mt-3 space-y-1.5" aria-hidden="true">
        {examples.map((label) => (
          <div key={label} className="flex items-center justify-between rounded-lg bg-surface-2/60 px-2.5 py-1.5">
            <span className="text-xs font-medium text-faint">{label}</span>
            <span className="text-[11px] font-semibold text-faint">— soon</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function Home() {
  const [scoring] = useScoring();
  const { metrics, supportsScoring } = useMetrics();
  const pointsKey = supportsScoring ? "fantasy_points" : FANTASY_FALLBACK.fantasy_points;
  const ppgKey = supportsScoring ? "fantasy_ppg" : FANTASY_FALLBACK.fantasy_ppg;

  const params = useMemo(
    () => ({
      season: SEASON,
      season_type: "REG",
      metric: pointsKey,
      scoring,
      order: "desc",
      limit: 6,
      offset: 0,
    }),
    [scoring, pointsKey],
  );

  const { data, isLoading, isError } = useLeaderboard(params);
  const rows = data?.data ?? [];
  const leader = rows[0];

  return (
    <div className="space-y-5">
      {/* Greeting + scoring context (a feature, not the headline). */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">Command Center</h1>
          <p className="mt-1 text-sm text-muted">
            The fastest way to a confident fantasy call — {SEASON} season.
          </p>
        </div>
        <Link
          to="/leaderboard"
          className="glass-pill inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold transition hover:!text-accent"
          title="Adjust your league scoring on the leaderboard"
        >
          <span className="text-muted">Scored in</span>
          <span className="text-accent">{scoringLabel(scoring)}</span>
          <span className="text-faint">·</span>
          <span className="text-muted">Edit →</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Spotlight — the current fantasy points leader (live). */}
        <Card className="flex flex-col justify-between sm:col-span-2">
          {isError ? (
            <div className="py-8 text-center text-sm text-muted">
              Couldn't load leaders. Is the API running?
            </div>
          ) : (
            <>
              <div className="flex items-start gap-4">
                <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-surface-2 text-2xl font-bold text-accent">
                  {leader?.name?.[0] ?? "—"}
                </div>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent">
                    ◈ Fantasy Points Leader · {SEASON}
                  </div>
                  <h2 className="mt-1 text-xl font-bold tracking-tight text-fg">
                    {isLoading ? "Loading…" : leader?.name ?? "No data yet"}
                  </h2>
                  <div className="mt-1 text-sm text-muted">
                    {leader ? (
                      <>Leads every position in your league scoring.<PosTag pos={leader.position} /></>
                    ) : (
                      "Rankings will appear once stats load."
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-end justify-between gap-3">
                {leader && (
                  <Link to={`/players/${leader.player_id}`} className="btn-accent px-4 py-2 text-sm">
                    View player →
                  </Link>
                )}
                {leader && (
                  <div className="text-right">
                    <div className="text-[11px] uppercase tracking-wide text-faint">Fantasy points</div>
                    <div className="stat-num text-3xl font-bold leading-none text-accent">
                      {formatStat(leader[pointsKey], 1)}
                    </div>
                    <div className="stat-num mt-1 text-xs text-muted">
                      {formatStat(leader[ppgKey], 2)} / game
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </Card>

        {/* Fantasy leaders (live). */}
        <Card className="sm:col-span-2">
          <CardHead title="Fantasy Leaders" badge={<Badge tone="live">Live</Badge>} />
          {isError ? (
            <div className="py-6 text-center text-sm text-muted">Couldn't load leaders.</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-faint">
                  <th className="pb-2 font-semibold">Player</th>
                  <th className="pb-2 text-right font-semibold">G</th>
                  <th className="pb-2 text-right font-semibold">FPTS</th>
                  <th className="pb-2 text-right font-semibold">FPPG</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={4} className="py-6 text-center text-muted">Loading…</td></tr>
                )}
                {!isLoading && rows.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-muted">No results.</td></tr>
                )}
                {rows.map((row, i) => (
                  <tr key={row.player_id} className="border-t border-line">
                    <td className="py-2">
                      <span className="stat-num mr-1.5 text-faint">{i + 1}</span>
                      <Link to={`/players/${row.player_id}`} className="font-semibold text-fg hover:text-accent">
                        {row.name}
                      </Link>
                      <PosTag pos={row.position} />
                    </td>
                    <td className="stat-num py-2 text-right text-muted">{row.games_played}</td>
                    <td className="stat-num py-2 text-right font-semibold text-accent">
                      {formatStat(row[pointsKey], 1)}
                    </td>
                    <td className="stat-num py-2 text-right text-muted">{formatStat(row[ppgKey], 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Scoring explainer (span 2) + two entry tiles. */}
        <Card className="flex flex-col justify-between sm:col-span-2">
          <CardHead title="Your League Scoring" badge={<Badge tone="live">Live</Badge>} />
          <p className="text-sm text-muted">
            Every leaderboard and metric recomputes to your exact scoring. Currently{" "}
            <span className="font-semibold text-accent">{scoringLabel(scoring)}</span>.
          </p>
          <Link to="/leaderboard" className="btn-ghost mt-3 inline-flex w-fit px-3.5 py-2 text-sm font-semibold transition hover:!text-accent">
            Adjust scoring on the leaderboard →
          </Link>
        </Card>
        <LinkTile
          to="/leaderboard"
          icon={<span className="text-base">🏆</span>}
          title="Player Leaderboard"
          desc="Ranked in your scoring"
        />
        <LinkTile
          to="/teams"
          icon={<span className="text-base">🛡️</span>}
          title="Team Leaderboard"
          desc="Offensive production"
        />

        {/* Roadmap teasers — honest placeholders, no fabricated picks. */}
        <TeaserCard
          title="Buy-Low · Positive Regression"
          badge={<Badge tone="m3">M3</Badge>}
          blurb="Players whose opportunity (air yards, target share, red-zone usage) is outrunning their fantasy finishes — buy before the points catch up."
          examples={["Positive-Regression Index", "Fantasy Opportunity Rating"]}
        />
        <TeaserCard
          title="Sell-High Watch"
          badge={<Badge tone="m3">M3</Badge>}
          blurb="Players riding an unsustainable touchdown rate or efficiency above their baseline — sell while the value is inflated."
          examples={["Sell-High Index", "Expected vs actual (M2)"]}
        />
      </div>
    </div>
  );
}
