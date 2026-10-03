// Target Analysis: how deep and to which side players are targeted, the whole position
// at once (depth mix or air-yard distributions) and one player in detail (zones,
// heatmap or every target, against his position's average).
//
// Filters live in the URL, so a link to "tight ends, last four weeks, sorted by aDOT"
// opens exactly that. The position average is every target thrown to the position in
// the same weeks, so it does not move with the minimum or the team filter.
import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Select } from "../components/ui/Select";
import { FilterBar, summarize } from "../components/ui/FilterBar";
import { ScrollRow } from "../components/ui/ScrollRow";
import { Segmented } from "../components/team/Segmented";
import { TeamFilter } from "../components/TeamFilter";
import { TimeframeFilter, formatWeeks } from "../components/TimeframeFilter";
import { ExportButton } from "../components/ExportButton";
import { PositionTag } from "../components/PositionTag";
import { ExportImageButton } from "../components/explore/ExportImageButton";
import { ChartTooltip, useChartTooltip } from "../components/explore/ChartTooltip";
import { CardTitle, ChartState, ExploreHeader, Headshot, Legend, PlayerLine } from "../components/explore/common";
import { AirYardRidge, DepthMixBar, TargetListChart, useDensities } from "../components/explore/TargetList";
import { TargetMap } from "../components/explore/TargetMap";
import { StatTile, TargetDepthTable } from "../components/explore/TargetDepthTable";
import { useGameWeeks } from "../hooks/useGames";
import { usePlayerTargets, useTargetBoard } from "../hooks/useExplore";
import { useSeasons } from "../hooks/useSeasons";
import { useUrlState } from "../hooks/useUrlState";
import { DEPTHS, DEPTH_COLORS, tallyRates } from "../utils/explore";

const GROUPS = [
  { value: "WR", label: "WR", noun: "receivers" },
  { value: "TE", label: "TE", noun: "tight ends" },
  { value: "RB", label: "RB", noun: "running backs" },
  { value: "WR,TE", label: "WR/TE", noun: "receivers and tight ends" },
  { value: "WR,TE,RB", label: "WR/TE/RB", noun: "receivers, tight ends and backs" },
];
const GROUP_VALUES = GROUPS.map((group) => group.value);
const MINIMUMS = [4, 8, 12, 25, 50, 75, 100];
const SORTS = {
  targets: { label: "targets", value: (player) => player.targets },
  adot: { label: "aDOT", value: (player) => player.adot ?? -99 },
  deep: { label: "deep share", value: (player) => tallyRates(player).deep },
  catch: { label: "catch rate", value: (player) => tallyRates(player).catchRate },
};

/** A sensible minimum for the weeks in view: about three targets a week (backs half that). */
function defaultMinimum(weekCount, group) {
  const wanted = weekCount * (group === "RB" ? 1.5 : 3);
  return [...MINIMUMS].reverse().find((option) => option <= wanted) ?? MINIMUMS[0];
}

export function TargetAnalysisView({ board }) {
  const { seasonOptions, currentSeason } = useSeasons();
  const [season, setSeason] = useUrlState("season", String(currentSeason));
  const [weeks, setWeeks] = useUrlState("weeks", "");
  const [group, setGroup] = useUrlState("positions", "WR", GROUP_VALUES);
  const [team, setTeam] = useUrlState("team", "");
  const [sort, setSort] = useUrlState("sort", "adot", Object.keys(SORTS));
  const [order, setOrder] = useUrlState("order", "desc", ["asc", "desc"]);
  const [view, setView] = useUrlState("view", "bars", ["bars", "ridge"]);
  const [selected, setSelected] = useUrlState("player", "");
  const tip = useChartTooltip();

  const { data: weekData } = useGameWeeks({ season: Number(season), season_type: "REG" }, { enabled: Boolean(season) });
  const playedWeeks = (weekData?.weeks ?? []).filter((entry) => entry.played > 0).length || 17;
  const weekCount = weeks ? weeks.split(",").filter(Boolean).length : playedWeeks;
  const [minimum, setMinimum] = useUrlState("min", String(defaultMinimum(weekCount, group)), MINIMUMS.map(String));

  const params = useMemo(
    () => ({ season: Number(season), weeks: weeks || undefined, positions: group, team: team || undefined, min_targets: Number(minimum) }),
    [season, weeks, group, team, minimum],
  );
  const { data, isLoading, isError, isPlaceholderData } = useTargetBoard(params);

  const players = useMemo(() => {
    const list = [...(data?.players ?? [])];
    const key = SORTS[sort].value;
    list.sort((a, b) => (order === "asc" ? key(a) - key(b) : key(b) - key(a)));
    return list;
  }, [data, sort, order]);
  const densities = useDensities(view === "ridge" ? players : []);

  const player = players.find((entry) => entry.player_id === selected) ?? players[0];
  useEffect(() => {
    if (player && player.player_id !== selected && selected && !players.some((entry) => entry.player_id === selected)) setSelected("");
  }, [player, players, selected, setSelected]);

  const groupInfo = GROUPS.find((entry) => entry.value === group);
  const when = `${season} · ${weeks ? formatWeeks(weeks.split(",").map(Number)) : "Full season"}`;
  const listSubtitle = `${when} · ${minimum}+ targets · sorted by ${SORTS[sort].label}`;

  const sortBy = (key) => {
    if (sort === key) setOrder(order === "desc" ? "asc" : "desc");
    else {
      setSort(key);
      setOrder("desc");
    }
  };
  const header = (key, label) => (
    <th
      className={`cursor-pointer whitespace-nowrap px-2 pb-2 text-right text-[10px] font-bold uppercase tracking-[0.07em] ${sort === key ? "text-fg" : "text-faint hover:text-fg"}`}
      onClick={() => sortBy(key)}
    >
      {label}{sort === key ? (order === "desc" ? " ↓" : " ↑") : ""}
    </th>
  );

  const csvColumns = [
    { key: "name", label: "Player" }, { key: "position", label: "Position" }, { key: "team", label: "Team" },
    { key: "targets", label: "Targets" }, { key: "receptions", label: "Catches" }, { key: "yards", label: "Yards" },
    { key: "touchdowns", label: "TD" }, { key: "adot", label: "aDOT" }, { key: "air_yards", label: "Air yards" },
    ...DEPTHS.map((depth, index) => ({ key: `depth_${index}`, label: `${depth.short} share` })),
    { key: "catch_rate", label: "Catch rate" },
  ];
  const csvRows = players.map((entry) => ({
    ...entry,
    ...Object.fromEntries(entry.depth.map((count, index) => [`depth_${index}`, entry.charted ? (count / entry.charted).toFixed(3) : ""])),
    catch_rate: entry.targets ? (entry.receptions / entry.targets).toFixed(3) : "",
  }));

  return (
    <div className="space-y-4">
      <ExploreHeader title={board.title} description={board.description} />

      {/* On a phone the position group stays out of the fold, as on the scatter. */}
      <FilterBar
        className="flex flex-wrap items-end gap-3 p-4"
        summary={summarize(
          season,
          weeks ? formatWeeks(weeks.split(",").map(Number)) : "Full season",
          team,
          `${minimum}+ targets`,
        )}
        footer={
          <div className="border-t border-line px-4 py-2.5 md:hidden">
            <ScrollRow className="max-w-full">
              <div className="inline-flex">
                <Segmented label="Position" value={group} onChange={(value) => { setGroup(value); setSelected(""); }}
                  options={GROUPS.map(({ value, label }) => ({ value, label }))} />
              </div>
            </ScrollRow>
          </div>
        }
      >
        <div className="flex flex-col gap-1 max-md:hidden">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Position</span>
          <Segmented label="Position" value={group} onChange={(value) => { setGroup(value); setSelected(""); }}
            options={GROUPS.map(({ value, label }) => ({ value, label }))} />
        </div>
        <Select label="Season" value={season} onChange={(value) => { setSeason(value); setWeeks(""); setSelected(""); }} options={seasonOptions} />
        <TimeframeFilter weeks={weeks} season={season} onChange={setWeeks} />
        <TeamFilter value={team} onChange={(value) => { setTeam(value); setSelected(""); }} />
        <Select label="Min targets" value={minimum} onChange={setMinimum}
          options={MINIMUMS.map((value) => ({ value: String(value), label: `${value}+` }))} />
        <div className="ml-auto">
          <ExportButton
            filename={`second-level-targets-${group.replace(/,/g, "-").toLowerCase()}-${season}${weeks ? `-wk${weeks.replace(/,/g, "-")}` : ""}`}
            rows={csvRows}
            columns={csvColumns}
            context={[`Second Level: Target Analysis · ${groupInfo.noun}`, listSubtitle]}
          />
        </div>
      </FilterBar>

      <div className="grid items-start gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_470px]">
        <section className={`glass-card min-w-0 p-4 transition ${isPlaceholderData ? "opacity-70" : ""}`}>
          <CardTitle title={`${players.length} ${groupInfo.noun}`} sub={listSubtitle}>
            <Segmented label="List view" value={view} onChange={setView}
              options={[{ value: "bars", label: "Depth mix" }, { value: "ridge", label: "Air-yard distribution" }]} />
            <ExportImageButton
              title={view === "bars" ? `Where ${groupInfo.noun} are targeted` : `Air yards per target, ${groupInfo.noun}`}
              subtitle={`Top ${Math.min(25, players.length)} of ${listSubtitle}`}
              render={() => <TargetListChart players={players.slice(0, 25)} view={view} />}
              sizes={["fit", "wide"]}
              disabled={!players.length}
            />
          </CardTitle>
          {view === "bars" ? (
            <div className="mb-2">
              <Legend items={DEPTHS.map((depth, index) => ({ key: depth.key, color: DEPTH_COLORS[index], label: `${depth.short} ${depth.range}`, size: 12 }))} />
            </div>
          ) : (
            <p className="mb-2 text-xs text-muted">Each curve is the share of his targets at each depth. The tick is his aDOT.</p>
          )}
          {isLoading || isError || !players.length ? (
            <ChartState isLoading={isLoading} isError={isError} isEmpty={!players.length} height={520}
              empty={`No ${groupInfo.noun} have ${minimum} targets in these weeks.`} />
          ) : (
            // On a phone the player is pinned (with his rank) while the rest scrolls.
            <div className="max-h-[760px] overflow-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm md:min-w-[640px]">
                <thead className="sticky top-0 z-[2]" style={{ background: "var(--surface-solid)" }}>
                  <tr>
                    <th className="hidden w-8 px-2 pb-2 text-left text-[10px] font-bold uppercase tracking-[0.07em] text-faint md:table-cell">#</th>
                    <th className="pin-col px-2 pb-2 text-left text-[10px] font-bold uppercase tracking-[0.07em] text-faint max-md:!bg-[color:var(--surface-solid)] max-md:pl-8">Player</th>
                    {header("targets", "TGT")}
                    {header("adot", "aDOT")}
                    <th className="px-2 pb-2 text-left text-[10px] font-bold uppercase tracking-[0.07em] text-faint">
                      {view === "ridge" ? (
                        <span className="stat-num flex justify-between font-medium">
                          {[-10, 0, 10, 20, 30, 40].map((yards) => <span key={yards}>{yards > 0 ? `+${yards}` : yards}</span>)}
                        </span>
                      ) : "Where his targets are thrown"}
                    </th>
                    {header("deep", "20+ %")}
                    {header("catch", "Catch %")}
                  </tr>
                </thead>
                <tbody>
                  {players.map((entry, index) => {
                    const rates = tallyRates(entry);
                    const active = entry.player_id === player?.player_id;
                    return (
                      <tr
                        key={entry.player_id}
                        onClick={() => setSelected(entry.player_id)}
                        className={`cursor-pointer border-t border-line transition ${active ? "bg-surface-2" : "hover:bg-surface-2/60"}`}
                        style={active ? { boxShadow: "inset 3px 0 0 var(--accent)" } : undefined}
                      >
                        <td className="stat-num hidden px-2 py-1.5 text-xs text-faint md:table-cell">{index + 1}</td>
                        <td className="pin-col px-2 py-1.5 max-md:max-w-[160px]">
                          <span className="flex items-center gap-1.5">
                            <span className="stat-num w-5 shrink-0 text-right text-[11px] text-faint md:hidden">{index + 1}</span>
                            <PlayerLine player={entry} size={24} />
                          </span>
                        </td>
                        <td className="stat-num px-2 py-1.5 text-right">{entry.targets}</td>
                        <td className="stat-num px-2 py-1.5 text-right font-semibold text-fg">{entry.adot?.toFixed(1) ?? "—"}</td>
                        <td className="w-[36%] px-2 py-1.5">
                          {view === "ridge"
                            ? <AirYardRidge curve={densities.curves.get(entry.player_id)} max={densities.max} adot={entry.adot} />
                            : <DepthMixBar player={entry} tip={tip} />}
                        </td>
                        <td className="stat-num px-2 py-1.5 text-right">{(rates.deep * 100).toFixed(0)}%</td>
                        <td className="stat-num px-2 py-1.5 text-right">{(rates.catchRate * 100).toFixed(0)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {player ? (
          <PlayerDetail
            player={player}
            average={data?.averages?.[player.position]}
            pool={players.filter((entry) => entry.position === player.position)}
            season={season}
            weeks={weeks}
            when={when}
          />
        ) : (
          <section className="glass-card p-6 text-center text-sm text-muted">
            {isLoading ? "Loading…" : "Pick a player from the list."}
          </section>
        )}
      </div>
      <ChartTooltip tip={tip} />
    </div>
  );
}

function PlayerDetail({ player, average, pool, season, weeks, when }) {
  const { data, isLoading, isError } = usePlayerTargets(player.player_id, { season: Number(season), weeks: weeks || undefined });
  const rates = tallyRates(player);
  const ranked = pool.filter((entry) => entry.adot !== null).sort((a, b) => b.adot - a.adot);
  const rank = ranked.findIndex((entry) => entry.player_id === player.player_id) + 1;
  return (
    <section className="glass-card grid min-w-0 gap-4 p-4">
      <div className="flex items-center gap-3">
        <Headshot url={player.headshot_url} name={player.name} size={56} ring={`var(--position-${player.position.toLowerCase()})`} />
        <div className="min-w-0">
          <Link to={`/players/${player.player_id}`} className="block truncate text-lg font-bold tracking-tight text-fg hover:text-accent">
            {player.name}
          </Link>
          <div className="stat-num mt-0.5 flex items-center gap-1.5 text-xs text-faint">
            <PositionTag position={player.position} variant="quiet" />
            {player.team} · {when}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 min-[1100px]:grid-cols-3">
        <StatTile label="Targets" value={player.targets} />
        <StatTile label="aDOT" value={player.adot?.toFixed(1) ?? "—"} note={rank ? `${player.position}${rank} of ${ranked.length}` : null} />
        <StatTile label="Air yards" value={player.air_yards.toLocaleString()} />
        <StatTile label="Deep 20+" value={`${(rates.deep * 100).toFixed(0)}%`}
          note={average ? `avg ${(average.depth_shares[3] * 100).toFixed(0)}%` : null} />
        <StatTile label="Catch %" value={`${(rates.catchRate * 100).toFixed(0)}%`}
          note={average?.catch_rate ? `avg ${(average.catch_rate * 100).toFixed(0)}%` : null} />
      </div>
      <TargetMap
        targets={data?.targets}
        average={average}
        position={player.position}
        subject={player.name}
        exportSubtitle={`${player.team} · ${when} · ${player.targets} targets · aDOT ${player.adot?.toFixed(1) ?? "—"}`}
        isLoading={isLoading}
        isError={isError}
      />
      <TargetDepthTable tally={player} average={average} versus={player.position} />
    </section>
  );
}
