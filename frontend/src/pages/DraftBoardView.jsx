// The Draft Value Board (M6.1) — the consensus ranking against our own valuation.
//
// Every other Insight board ranks players by a number we computed. This one puts two
// *orderings* side by side and shows where they disagree: expert consensus rank, our
// expected-VORP rank, and the gap. A positive gap means we rate a player above the
// market.
//
// Its own page rather than an InsightView board because the columns are not registry
// metrics — a rank, a rank, and the distance between them are properties of the
// comparison, not of the player — and because a row can legitimately have no value at
// all (a rookie the market ranks and we have never seen play).
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
import { useDraftBoard } from "../hooks/useDraftBoard";
import { useScoring } from "../hooks/useScoring";
import { useLeague } from "../hooks/useLeague";
import { useUrlState } from "../hooks/useUrlState";
import { useSeasons } from "../hooks/useSeasons";
import { formatSigned, formatStat } from "../utils/format";
import { POSITIONS } from "../constants";

const PAGE_SIZE = 50;

const SORTS = [
  { value: "consensus", label: "Consensus order" },
  { value: "gap", label: "Biggest value" },
  { value: "value", label: "Our valuation" },
];

// "Biggest value" only reads correctly descending, and consensus order only ascending;
// tying direction to the sort keeps the board from ever showing its own list backwards.
const SORT_ORDER = { consensus: "asc", gap: "desc", value: "asc" };

// The consensus variants worth offering. The default follows the league config — a
// superflex league gets the superflex board without being asked — so this is an
// override, not a required choice.
const RANKING_TYPES = [
  { value: "", label: "Match my league" },
  { value: "redraft-overall", label: "Redraft" },
  { value: "redraft-op", label: "Superflex" },
  { value: "dynasty-overall", label: "Dynasty" },
  { value: "best-overall", label: "Best ball" },
];

const MISSING_LABEL = {
  no_history: "No NFL history",
  small_sample: "Too few games",
};

// The same easy-green / hard-red scale the SOS grid uses.
function sosTint(difficulty) {
  if (difficulty === null || difficulty === undefined) return undefined;
  const distance = Math.min(Math.abs(difficulty - 50) / 50, 1);
  const token = difficulty < 50 ? "--pos" : "--neg";
  return `color-mix(in srgb, var(${token}) ${Math.round(distance * 55)}%, transparent)`;
}

/** The gap cell: the headline number, tinted by direction. */
function GapCell({ row }) {
  if (row.gap === null) {
    return (
      <span
        className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-faint"
        title={
          row.missing_reason === "no_history"
            ? "Ranked by the consensus, but has never played an NFL snap we hold stats for — so there is nothing to value them against."
            : "Played too few games last season to be valued against the position pool."
        }
      >
        {MISSING_LABEL[row.missing_reason] ?? "—"}
      </span>
    );
  }
  const tone = row.gap > 0 ? "text-pos" : row.gap < 0 ? "text-neg" : "text-muted";
  return <span className={`stat-num font-semibold ${tone}`}>{formatSigned(row.gap, 0)}</span>;
}

export function DraftBoardView({ board }) {
  const { seasonOptions, currentSeason } = useSeasons();
  const [season, setSeason] = useUrlState("season", String(currentSeason));
  const [position, setPosition] = useUrlState("position", "");
  const [sort, setSort] = useUrlState("sort", "consensus", Object.keys(SORT_ORDER));
  const [rankingType, setRankingType] = useUrlState("ranking_type", "");
  const [offset, setOffset] = useState(0);
  const [scoring, setScoring] = useScoring();
  const [league, setLeague] = useLeague();
  const watchlist = useWatchlistFilter();

  const params = useMemo(
    () => ({
      season: Number(season),
      ...(position ? { position } : {}),
      ...(rankingType ? { ranking_type: rankingType } : {}),
      sort,
      order: SORT_ORDER[sort],
      scoring,
      league,
      ...watchlist.params,
      limit: PAGE_SIZE,
      offset,
    }),
    [season, position, rankingType, sort, scoring, league, offset, watchlist.params.player_ids],
  );

  const { data, isLoading, isError, error, isPlaceholderData } = useDraftBoard(params);
  const rows = data?.data ?? [];
  const total = data?.total ?? 0;

  const withReset = (setter) => (value) => {
    setter(value);
    setOffset(0);
  };

  const exportRows = useMemo(
    () =>
      rows.map((row) => ({
        consensus_rank: row.consensus_rank,
        name: row.name,
        position: row.position,
        team: row.team_abbreviation,
        age: row.age,
        ecr: row.ecr,
        ecr_best: row.ecr_best,
        ecr_worst: row.ecr_worst,
        sos: row.sos,
        market_rank: row.market_rank,
        value_rank: row.value_rank,
        gap: row.gap,
        expected_vorp_ppg: row.expected_vorp_ppg,
        vorp: row.vorp,
        note: row.missing_reason ? MISSING_LABEL[row.missing_reason] : "",
      })),
    [rows],
  );

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent">Insight</div>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-fg">{board.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">{board.description}</p>
      </div>

      <div className="glass-card flex flex-wrap gap-3 p-4">
        <Select label="Valued from" value={season} onChange={withReset(setSeason)} options={seasonOptions} />
        <Select label="Position" value={position} onChange={withReset(setPosition)} options={POSITIONS} />
        <Select label="Consensus" value={rankingType} onChange={withReset(setRankingType)} options={RANKING_TYPES} />
        <Select label="Sort by" value={sort} onChange={withReset(setSort)} options={SORTS} />
        <WatchlistToggle filter={watchlist} onChange={() => setOffset(0)} />
        <div className="ml-auto flex items-end gap-2">
          <SaveViewButton defaultName={board.title} />
          <ExportButton
            filename={`gridironiq-draft-board-${data?.ranking_season ?? season}`}
            rows={exportRows}
            columns={[
              { key: "consensus_rank", label: "#" },
              { key: "name", label: "Player" },
              { key: "position", label: "Pos" },
              { key: "team", label: "Team" },
              { key: "age", label: "Age" },
              { key: "ecr", label: "ECR" },
              { key: "ecr_best", label: "Best" },
              { key: "ecr_worst", label: "Worst" },
              { key: "sos", label: "SOS" },
              { key: "market_rank", label: "Market rank" },
              { key: "value_rank", label: "Our rank" },
              { key: "gap", label: "Gap" },
              { key: "expected_vorp_ppg", label: "xVORP/G" },
              { key: "vorp", label: "VORP" },
              { key: "note", label: "Note" },
            ]}
            context={[
              "GridironIQ — Draft Value Board",
              `${data?.ranking_type ?? ""} consensus (${data?.source ?? ""}), scraped ${data?.scraped_at ?? "—"}`,
              `valued from the ${data?.valuation_season ?? season} season · scoring: ${scoring} · league: ${league}`,
              "Gap = market rank − our rank, both ranked over the players we can value. Positive = we rate them higher.",
            ]}
          />
        </div>
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-2">
        <ScoringControl scoring={scoring} onChange={withReset(setScoring)} />
        <LeagueControl league={league} onChange={withReset(setLeague)} replacement={data?.replacement} />
      </div>

      <p className="max-w-3xl text-xs leading-relaxed text-muted">
        {board.lede}
      </p>

      <div className="glass-card overflow-x-auto">
        <table className="w-full min-w-[940px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-faint">
              <th className="px-3 py-3 text-right">#</th>
              <th className="px-3 py-3">Player</th>
              <th className="px-3 py-3">Team</th>
              <th className="px-3 py-3 text-right" title="Age today, from the player's birth date">Age</th>
              <th className="px-3 py-3 text-right" title="Expert consensus rank — the market's opinion, as published">ECR</th>
              <th className="px-3 py-3 text-right" title="How far apart the experts are: the best and worst rank any of them gave">Range</th>
              <th className="px-3 py-3 text-right" title="Their team's schedule difficulty at this position for the season ahead, 0-100. Higher is harder.">SOS</th>
              <th className="px-3 py-3 text-right" title="Our rank by expected VORP per game, over the same players the market rank is counted over">Ours</th>
              <th className="px-3 py-3 text-right" title="Market rank minus our rank. Positive = we rate this player above the consensus">Gap</th>
              <th className="px-3 py-3 text-right" title="Expected value over replacement per game — what their usage was worth above a startable replacement, in your scoring and league">xVORP/G</th>
            </tr>
          </thead>
          <tbody className={isPlaceholderData ? "opacity-60 transition" : "transition"}>
            {isLoading && (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-muted">Loading…</td></tr>
            )}
            {isError && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-muted">
                  {error?.response?.data?.detail ?? "Could not load the draft board."}
                </td>
              </tr>
            )}
            {!isLoading && !isError && rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-muted">
                  No consensus rankings loaded yet — run <span className="stat-num">ingest_rankings.py</span>.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.player_id} className="border-b border-line last:border-0 hover:bg-surface-2">
                <td className="stat-num px-3 py-2.5 text-right text-faint">{row.consensus_rank}</td>
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
                <td className="stat-num px-3 py-2.5 text-right text-fg">{formatStat(row.ecr, 1)}</td>
                <td className="stat-num px-3 py-2.5 text-right text-faint">
                  {row.ecr_best === null || row.ecr_worst === null
                    ? "—"
                    : `${row.ecr_best}–${row.ecr_worst}`}
                </td>
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
                <td className="px-3 py-2.5 text-right"><GapCell row={row} /></td>
                <td className="stat-num px-3 py-2.5 text-right text-muted">
                  {formatStat(row.expected_vorp_ppg, 2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && (
        <p className="max-w-3xl text-[11px] leading-relaxed text-faint">
          Consensus:{" "}
          <span className="text-muted">
            {data.ranking_type} ({data.source}), scraped {data.scraped_at}
          </span>{" "}
          for the {data.ranking_season} season — the market's opinion, in its own scoring,
          shown as published. Our side values the{" "}
          <span className="text-muted">{data.valuation_season}</span> season in your
          scoring and league: {data.valued_players} of the top {data.depth} could be
          valued. Both ranks are counted over those same players, so the gap measures
          positions rather than populations. Expected VORP is built on model estimates
          (nflverse ffopportunity), not projections — it reads last season's opportunity,
          so a player whose situation has changed since will show a gap that is news
          about the offseason rather than a mispricing.
        </p>
      )}

      <TablePager offset={offset} pageSize={PAGE_SIZE} total={total} onOffsetChange={setOffset} />
    </div>
  );
}
