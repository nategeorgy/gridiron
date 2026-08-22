// Command Center — the app's home. A Bento dashboard that opens on the fantasy
// question: who's leading in *your* league scoring. Every panel is live: fantasy
// leaders and the leader spotlight come from the leaderboard API, the Insight tile
// from the M3 intelligence API.
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useLeaderboard } from "../hooks/useLeaderboard";
import { useIntelligence } from "../hooks/useInsight";
import { useAuth } from "../hooks/useAuth";
import { useFavorites } from "../hooks/useAccount";
import { useScoring } from "../hooks/useScoring";
import { useLeague } from "../hooks/useLeague";
import { useMetrics } from "../hooks/useMetrics";
import { formatSigned, formatStat } from "../utils/format";
import { scoringLabel } from "../constants/scoring";
import { useSeasons } from "../hooks/useSeasons";

// Same fixed-PPR fallback the leaderboard uses when the backend can't score yet.
const FANTASY_FALLBACK = { fantasy_points: "fantasy_points_ppr", fantasy_ppg: "fantasy_ppg_ppr" };

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

// One ranked signal row inside the Insight tile.
function SignalRow({ row, score, detail, to }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between gap-2 rounded-lg bg-surface-2/60 px-2.5 py-1.5 transition hover:bg-surface-2"
    >
      <span className="min-w-0 truncate text-xs font-medium text-fg">
        {row.name}
        <PosTag pos={row.position} />
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="stat-num text-[11px] text-muted">{detail}</span>
        <span className="stat-num text-xs font-semibold text-accent">{formatStat(score, 0)}</span>
      </span>
    </Link>
  );
}

// A live buy-low / sell-high tile (M3). Sorted by the index, in the user's own
// scoring and league — the same numbers the Insight boards show.
function SignalCard({ title, blurb, boardPath, metric, detailFor, params, cta }) {
  const { data, isLoading, isError } = useIntelligence({ ...params, metric, limit: 4 });
  const rows = data?.data ?? [];

  return (
    <Card className="flex flex-col">
      <CardHead title={title} badge={<Badge tone="live">Live</Badge>} />
      <p className="text-xs text-muted">{blurb}</p>
      <div className="mt-3 flex-1 space-y-1.5">
        {isLoading && <div className="py-4 text-center text-xs text-muted">Loading…</div>}
        {isError && <div className="py-4 text-center text-xs text-muted">Couldn't load signals.</div>}
        {!isLoading && !isError && rows.length === 0 && (
          <div className="py-4 text-center text-xs text-muted">No signals for this season yet.</div>
        )}
        {rows.map((row) => (
          <SignalRow
            key={row.player_id}
            row={row}
            score={row[metric]}
            detail={detailFor(row)}
            to={`/players/${row.player_id}`}
          />
        ))}
      </div>
      <Link
        to={boardPath}
        className="btn-ghost mt-3 inline-flex w-fit px-3 py-1.5 text-xs font-semibold transition hover:!text-accent"
      >
        {cta} →
      </Link>
    </Card>
  );
}

// "My Players" (M5) — the watchlist, ranked in the user's own scoring. Rendered
// only when signed in *and* something is starred: an empty card on the home page
// would be a permanent ad for a feature rather than a useful panel.
function WatchlistCard({ params, pointsKey, ppgKey }) {
  const { currentSeason: season } = useSeasons();
  const { isSignedIn } = useAuth();
  const { favorites } = useFavorites();
  const playerIds = favorites.map((favorite) => favorite.player.player_id);

  const watchlistParams = useMemo(
    () => ({ ...params, metric: pointsKey, limit: 6, player_ids: playerIds.join(",") }),
    [params, pointsKey, playerIds.join(",")],
  );
  const { data, isLoading } = useLeaderboard(watchlistParams, {
    enabled: isSignedIn && playerIds.length > 0,
  });

  if (!isSignedIn || playerIds.length === 0) return null;
  const rows = data?.data ?? [];

  return (
    <Card className="sm:col-span-2">
      <CardHead title="My Players" badge={<Badge tone="live">Live</Badge>} />
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
            <tr>
              <td colSpan={4} className="py-6 text-center text-muted">
                No {season} stats yet for your watchlist.
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.player_id} className="border-t border-line">
              <td className="py-2">
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
      {playerIds.length > rows.length && rows.length > 0 && (
        <p className="mt-2 text-xs text-faint">
          Showing {rows.length} of {playerIds.length} watchlisted players.
        </p>
      )}
    </Card>
  );
}

export function Home() {
  const [scoring] = useScoring();
  const { currentSeason: season } = useSeasons();
  const { supportsScoring } = useMetrics();
  const pointsKey = supportsScoring ? "fantasy_points" : FANTASY_FALLBACK.fantasy_points;
  const ppgKey = supportsScoring ? "fantasy_ppg" : FANTASY_FALLBACK.fantasy_ppg;

  const params = useMemo(
    () => ({
      season,
      season_type: "REG",
      metric: pointsKey,
      scoring,
      order: "desc",
      limit: 6,
      offset: 0,
    }),
    [season, scoring, pointsKey],
  );

  const { data, isLoading, isError } = useLeaderboard(params);
  const rows = data?.data ?? [];
  const leader = rows[0];

  const [league] = useLeague();
  const insightParams = useMemo(
    () => ({ season, season_type: "REG", scoring, league, order: "desc" }),
    [season, scoring, league],
  );

  return (
    <div className="space-y-5">
      {/* Greeting + scoring context (a feature, not the headline). */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">Command Center</h1>
          <p className="mt-1 text-sm text-muted">
            The fastest way to a confident fantasy call — {season} season.
          </p>
        </div>
        <Link
          to="/fantasy/leaders"
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
                    ◈ Fantasy Points Leader · {season}
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

        {/* Watchlist (M5) — only present once the user has starred someone. */}
        <WatchlistCard params={params} pointsKey={pointsKey} ppgKey={ppgKey} />

        {/* Scoring explainer (span 2) + two entry tiles. */}
        <Card className="flex flex-col justify-between sm:col-span-2">
          <CardHead title="Your League Scoring" badge={<Badge tone="live">Live</Badge>} />
          <p className="text-sm text-muted">
            Every leaderboard and metric recomputes to your exact scoring. Currently{" "}
            <span className="font-semibold text-accent">{scoringLabel(scoring)}</span>.
          </p>
          <Link to="/fantasy/leaders" className="btn-ghost mt-3 inline-flex w-fit px-3.5 py-2 text-sm font-semibold transition hover:!text-accent">
            Adjust scoring on the leaderboard →
          </Link>
        </Card>
        <LinkTile
          to="/fantasy/leaders"
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

        {/* Insight signals (M3) — live, in the user's scoring and league. */}
        <SignalCard
          title="Buy Low · Positive Regression"
          blurb="Real opportunity, points haven't caught up. Buy before they do."
          boardPath="/insight/buy-low"
          cta="Full buy-low board"
          metric="positive_regression_index"
          params={insightParams}
          detailFor={(row) => `${formatSigned(row.fantasy_points_over_expected, 0)} vs xFP`}
        />
        <SignalCard
          title="Sell High · Regression Risk"
          blurb="Outscoring the usage on touchdown luck and efficiency that rarely holds."
          boardPath="/insight/sell-high"
          cta="Full sell-high board"
          metric="sell_high_index"
          params={insightParams}
          detailFor={(row) => `${formatSigned(row.tds_over_expected, 1)} TD vs xTD`}
        />
      </div>
    </div>
  );
}
