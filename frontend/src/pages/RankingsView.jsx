// Rankings (M9) — the board you read before and during a draft.
//
// The default is the **market**, not us: a consensus ordering with our valuation as a
// column beside it, never a re-ranking of the consensus by our own numbers. The board
// that *is* our opinion already exists next door as the Value Board, and two pages
// both claiming to be "the ranking" is how a user stops trusting either.
//
// "Consensus" here means a blend of every expert board we hold, each re-ranked over
// the players it lists before averaging — so a 400-name board does not outvote a
// 150-name one. The blend is deliberately anonymous: it names no source and no row is
// attributable to one.
//
// Once the season starts the page becomes a **weekly** board rather than a draft one,
// driven by what the pipeline has ingested rather than by the calendar. There is no
// rest-of-season variant because no free source publishes one.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Select } from "../components/ui/Select";
import { ScoringControl } from "../components/ScoringControl";
import { LeagueControl } from "../components/LeagueControl";
import { TablePager } from "../components/StatTable";
import { FavoriteStar } from "../components/FavoriteStar";
import { ExportButton } from "../components/ExportButton";
import { WatchlistToggle, useWatchlistFilter } from "../components/WatchlistToggle";
import { SaveViewButton } from "../components/SaveViewButton";
import { BoardImportDialog } from "../components/BoardImportDialog";
import { useDraftSources, useRankings } from "../hooks/useRankings";
import { useAuth } from "../hooks/useAuth";
import { useScoring } from "../hooks/useScoring";
import { useLeague } from "../hooks/useLeague";
import { useUrlState } from "../hooks/useUrlState";
import { useSeasons } from "../hooks/useSeasons";
import { formatStat } from "../utils/format";
import { POSITIONS } from "../constants";

const PAGE_SIZE = 50;

const SORTS = [
  { value: "board", label: "Board order" },
  { value: "value", label: "Our valuation" },
  { value: "sos", label: "Easiest schedule" },
];

// Tied to the sort, so the board is never shown backwards: a board's own order only
// reads correctly ascending, and so does a rank.
const SORT_ORDER = { board: "asc", value: "asc", sos: "asc" };

/** The same easy-green / hard-red scale the SOS grid and the Value Board use. */
function sosTint(difficulty) {
  if (difficulty === null || difficulty === undefined) return undefined;
  const distance = Math.min(Math.abs(difficulty - 50) / 50, 1);
  const token = difficulty < 50 ? "--pos" : "--neg";
  return `color-mix(in srgb, var(${token}) ${Math.round(distance * 55)}%, transparent)`;
}

/**
 * How far apart the boards are on a player, as a word rather than a number.
 *
 * Dispersion is a standard deviation of ranks, which is not a thing anyone reads
 * fluently mid-draft. What matters is whether this is a player the experts agree
 * about — because that is exactly when a board's order is worth overriding.
 */
function agreement(dispersion) {
  if (dispersion === null || dispersion === undefined) return null;
  if (dispersion < 2) return { label: "Agreed", tone: "text-muted" };
  if (dispersion < 6) return { label: "Some spread", tone: "text-fg" };
  return { label: "Contested", tone: "text-accent" };
}

export function RankingsView({ board }) {
  const { isSignedIn } = useAuth();
  const { seasonOptions, currentSeason } = useSeasons();

  const [source, setSource] = useUrlState("source", "consensus");
  const [season, setSeason] = useUrlState("season", String(currentSeason));
  const [position, setPosition] = useUrlState("position", "");
  const [sort, setSort] = useUrlState("sort", "board", Object.keys(SORT_ORDER));
  const [offset, setOffset] = useState(0);
  const [scoring, setScoring] = useScoring();
  const [league, setLeague] = useLeague();
  const [newBoardOpen, setNewBoardOpen] = useState(false);
  const watchlist = useWatchlistFilter();

  const { data: sources } = useDraftSources({ league });
  const sourceOptions = useMemo(
    () =>
      (sources?.data ?? []).map((option) => ({
        value: option.id,
        label: option.kind === "user" ? `${option.label} (yours)` : option.label,
      })),
    [sources],
  );

  const params = useMemo(
    () => ({
      source,
      season: Number(season),
      ...(position ? { position } : {}),
      sort,
      order: SORT_ORDER[sort],
      scoring,
      league,
      ...watchlist.params,
      limit: PAGE_SIZE,
      offset,
    }),
    [source, season, position, sort, scoring, league, offset, watchlist.params.player_ids],
  );

  const { data, isLoading, isError, error, isPlaceholderData } = useRankings(params);
  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const isUserBoard = data?.board_kind === "user";
  const isWeekly = data?.context === "weekly";
  const boardId = isUserBoard ? String(source).replace(/^board:/, "") : null;

  const withReset = (setter) => (value) => {
    setter(value);
    setOffset(0);
  };

  const exportRows = useMemo(
    () =>
      rows.map((row) => ({
        rank: row.rank,
        name: row.name,
        position: row.position,
        team: row.team_abbreviation,
        tier: row.tier,
        age: row.age,
        sources: row.sources_count,
        dispersion: row.dispersion,
        best_rank: row.best_rank,
        worst_rank: row.worst_rank,
        sos: row.sos,
        value_rank: row.value_rank,
        expected_vorp_ppg: row.expected_vorp_ppg,
        expected_fantasy_ppg: row.expected_fantasy_ppg,
        fantasy_ppg: row.fantasy_ppg,
      })),
    [rows],
  );

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent">Draft</div>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-fg">
          {isWeekly ? `Week ${data?.week} Rankings` : board.title}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">{board.description}</p>
      </div>

      <div className="glass-card flex flex-wrap gap-3 p-4">
        <Select label="Board" value={source} onChange={withReset(setSource)} options={sourceOptions} />
        <Select label="Position" value={position} onChange={withReset(setPosition)} options={POSITIONS} />
        <Select label="Valued from" value={season} onChange={withReset(setSeason)} options={seasonOptions} />
        <Select label="Sort by" value={sort} onChange={withReset(setSort)} options={SORTS} />
        <WatchlistToggle filter={watchlist} onChange={() => setOffset(0)} />
        <div className="ml-auto flex items-end gap-2">
          {isUserBoard && (
            <Link to={`/draft/boards/${boardId}`} className="glass-pill px-3 py-1.5 text-sm !text-accent">
              Edit board
            </Link>
          )}
          {/* Disabled rather than hidden when signed out: it aids discovery, and it
              is never a prompt to sign up. Reading every board here works signed out;
              only keeping one of your own needs an account. */}
          <button
            type="button"
            onClick={() => setNewBoardOpen(true)}
            disabled={!isSignedIn}
            title={
              isSignedIn
                ? "Upload a CSV, or start from this board"
                : "Sign in to keep boards of your own — everything else on this page works signed out"
            }
            className="glass-pill px-3 py-1.5 text-sm disabled:opacity-50"
          >
            New board
          </button>
          <SaveViewButton defaultName={board.title} />
          <ExportButton
            filename={`gridironiq-rankings-${data?.board ?? "consensus"}`}
            rows={exportRows}
            columns={[
              { key: "rank", label: "#" },
              { key: "name", label: "Player" },
              { key: "position", label: "Pos" },
              { key: "team", label: "Team" },
              { key: "tier", label: "Tier" },
              { key: "age", label: "Age" },
              { key: "sources", label: "Boards" },
              { key: "dispersion", label: "Spread" },
              { key: "best_rank", label: "Best" },
              { key: "worst_rank", label: "Worst" },
              { key: "sos", label: "SOS" },
              { key: "value_rank", label: "Our rank" },
              { key: "expected_vorp_ppg", label: "xVORP/G" },
              { key: "expected_fantasy_ppg", label: "xFPPG" },
              { key: "fantasy_ppg", label: "FPPG" },
            ]}
            context={[
              `GridironIQ — ${data?.board_label ?? "Rankings"}`,
              data?.attribution ?? "A blend of every expert board held, each re-ranked before averaging.",
              `${data?.ranking_type ?? ""} for the ${data?.ranking_season ?? ""} season · valued from ${data?.valuation_season ?? season}`,
              `scoring: ${scoring} · league: ${league}`,
            ]}
          />
        </div>
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-2">
        <ScoringControl scoring={scoring} onChange={withReset(setScoring)} />
        <LeagueControl league={league} onChange={withReset(setLeague)} replacement={data?.replacement} />
      </div>

      <p className="max-w-3xl text-xs leading-relaxed text-muted">{board.lede}</p>

      <div className="glass-card overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-faint">
              <th className="px-3 py-3 text-right">#</th>
              {isUserBoard && <th className="px-3 py-3 text-right">Tier</th>}
              <th className="px-3 py-3">Player</th>
              <th className="px-3 py-3">Team</th>
              <th className="px-3 py-3 text-right" title="Age today, from the player's birth date">Age</th>
              {!isUserBoard && (
                <>
                  <th className="px-3 py-3" title="How much the expert boards disagree about this player">
                    Experts
                  </th>
                  <th className="px-3 py-3 text-right" title="The best and worst place any board gave them">
                    Range
                  </th>
                </>
              )}
              <th className="px-3 py-3 text-right" title="Their team's schedule difficulty at this position for the season ahead, 0-100. Higher is harder.">SOS</th>
              <th className="px-3 py-3 text-right" title="Our rank by expected VORP per game, over the players on this board we can value">Ours</th>
              <th className="px-3 py-3 text-right" title="Expected value over replacement per game, in your scoring and league">xVORP/G</th>
              <th className="px-3 py-3 text-right" title="Expected fantasy points per game — what last season's usage was worth in your scoring">xFPPG</th>
            </tr>
          </thead>
          <tbody className={isPlaceholderData ? "opacity-60 transition" : "transition"}>
            {isLoading && (
              <tr><td colSpan={11} className="px-3 py-8 text-center text-muted">Loading…</td></tr>
            )}
            {isError && (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-muted">
                  {error?.response?.data?.detail ?? "Could not load this board."}
                </td>
              </tr>
            )}
            {!isLoading && !isError && rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-muted">
                  {isUserBoard
                    ? "This board has no players yet."
                    : <>No rankings loaded yet — run <span className="stat-num">ingest_rankings.py</span>.</>}
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const spread = agreement(row.dispersion);
              return (
                <tr key={row.player_id} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="stat-num px-3 py-2.5 text-right text-faint">{row.rank}</td>
                  {isUserBoard && (
                    <td className="stat-num px-3 py-2.5 text-right text-muted">{row.tier ?? "—"}</td>
                  )}
                  <td className="px-3 py-2.5 font-medium">
                    <span className="flex items-center gap-1.5">
                      <FavoriteStar playerId={row.player_id} size="h-3.5 w-3.5" />
                      <Link to={`/players/${row.player_id}`} className="text-fg hover:text-accent hover:underline">
                        {row.name}
                      </Link>
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="stat-num text-xs text-muted">{row.team_abbreviation ?? "FA"}</span>
                    <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-faint">
                      {row.position}
                    </span>
                  </td>
                  <td className="stat-num px-3 py-2.5 text-right text-muted">{formatStat(row.age, 1)}</td>
                  {!isUserBoard && (
                    <>
                      <td className="px-3 py-2.5">
                        {spread ? (
                          <span
                            className={`text-xs ${spread.tone}`}
                            title={`Standard deviation of ${row.dispersion} across ${row.sources_count} board${row.sources_count === 1 ? "" : "s"}`}
                          >
                            {spread.label}
                          </span>
                        ) : (
                          <span className="text-xs text-faint">—</span>
                        )}
                      </td>
                      <td className="stat-num px-3 py-2.5 text-right text-faint">
                        {row.best_rank === null || row.worst_rank === null
                          ? "—"
                          : `${row.best_rank}–${row.worst_rank}`}
                      </td>
                    </>
                  )}
                  <td className="px-3 py-2.5 text-right">
                    <span
                      className="stat-num rounded px-1.5 py-0.5 text-xs text-fg"
                      style={{ backgroundColor: sosTint(row.sos) }}
                    >
                      {formatStat(row.sos, 0)}
                    </span>
                  </td>
                  <td className="stat-num px-3 py-2.5 text-right text-fg">
                    {row.value_rank === null ? "—" : row.value_rank}
                  </td>
                  <td className="stat-num px-3 py-2.5 text-right text-muted">
                    {formatStat(row.expected_vorp_ppg, 2)}
                  </td>
                  <td className="stat-num px-3 py-2.5 text-right text-muted">
                    {formatStat(row.expected_fantasy_ppg, 1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data && (
        <p className="max-w-3xl text-[11px] leading-relaxed text-faint">
          {data.board_kind === "user" ? (
            <>
              Your board, in the order you saved it. Our valuation columns read the{" "}
              <span className="text-muted">{data.valuation_season}</span> season in your
              scoring and league — {data.valued_players} of {data.ranked_players} players
              here could be valued.
            </>
          ) : data.board === "consensus" ? (
            <>
              A blend of <span className="text-muted">{data.sources_count}</span> expert
              board{data.sources_count === 1 ? "" : "s"} for the{" "}
              <span className="text-muted">{data.ranking_season}</span> season. Each board
              is re-ranked over the players it lists before averaging, so a deep board does
              not outvote a short one, and a player a board leaves off is placed below its
              last name rather than ignored. Rankings are opinions in someone else&apos;s
              scoring and are never rescored into yours — our own valuation is the column
              next to them, built on expected points from the{" "}
              <span className="text-muted">{data.valuation_season}</span> season.
            </>
          ) : (
            <>
              {data.attribution} {data.ranking_type} for the{" "}
              <span className="text-muted">{data.ranking_season}</span> season, scraped{" "}
              {data.scraped_at ?? "—"}, shown as published. Our valuation reads the{" "}
              <span className="text-muted">{data.valuation_season}</span> season in your
              scoring and league.
            </>
          )}
          {isWeekly && (
            <>
              {" "}
              These are <span className="text-muted">weekly</span> rankings, not
              rest-of-season: no free source publishes a rest-of-season consensus, and
              inventing one would be a projection wearing a ranking&apos;s clothes.
            </>
          )}
        </p>
      )}

      <TablePager offset={offset} pageSize={PAGE_SIZE} total={total} onOffsetChange={setOffset} />

      <BoardImportDialog
        open={newBoardOpen}
        onClose={() => setNewBoardOpen(false)}
        seedFrom={data?.board_label}
        seedParams={params}
        seedCount={total}
      />
    </div>
  );
}
