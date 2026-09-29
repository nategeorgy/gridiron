// "Where he's targeted" on a player page, "Where he throws" for a quarterback, and
// "Where the offense throws" on a team page: the target map (every target by default)
// beside the season's depth split. A player page's card links to Target Analysis for the
// rest of his position.
import { Link } from "react-router-dom";
import { CardTitle } from "./common";
import { StatTile, TargetDepthTable } from "./TargetDepthTable";
import { TargetMap } from "./TargetMap";
import { usePlayerTargets, useTeamTargets } from "../../hooks/useExplore";
import { tallyRates } from "../../utils/explore";

function Body({ data, isLoading, isError, role, position, subject, exportSubtitle, versus, stacked = false }) {
  const summary = data?.summary;
  const rates = tallyRates(summary);
  const average = data?.average;
  return (
    <div className={`grid items-start gap-5 ${stacked ? "" : "min-[1000px]:grid-cols-[minmax(0,560px)_minmax(0,1fr)]"}`}>
      <TargetMap targets={data?.targets} average={average} position={position} role={role} subject={subject}
        exportSubtitle={exportSubtitle} initialMode="dots" isLoading={isLoading} isError={isError} />
      {summary && summary.targets > 0 && (
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <StatTile label={role === "passer" ? "Throws" : "Targets"} value={summary.targets} />
            <StatTile label="aDOT" value={summary.adot?.toFixed(1) ?? "—"} note={average?.adot ? `avg ${average.adot.toFixed(1)}` : null} />
            <StatTile label="Air yards" value={summary.air_yards.toLocaleString()} />
            <StatTile label="Deep 20+" value={`${(rates.deep * 100).toFixed(0)}%`}
              note={average ? `avg ${(average.depth_shares[3] * 100).toFixed(0)}%` : null} />
            <StatTile label="Catch %" value={`${(rates.catchRate * 100).toFixed(0)}%`}
              note={average?.catch_rate ? `avg ${(average.catch_rate * 100).toFixed(0)}%` : null} />
            <StatTile label="EPA/target" value={summary.epa_per_target === null ? "—" : summary.epa_per_target.toFixed(2)}
              note={average?.epa_per_target !== undefined && average?.epa_per_target !== null ? `avg ${average.epa_per_target.toFixed(2)}` : null} />
          </div>
          <TargetDepthTable tally={summary} average={average} versus={versus} />
        </div>
      )}
    </div>
  );
}

export function PlayerTargetCard({ player, season }) {
  const role = player.position === "QB" ? "passer" : "receiver";
  const { data, isLoading, isError } = usePlayerTargets(player.player_id, { season, role });
  const title = role === "passer" ? "Where he throws" : "Where he's targeted";
  return (
    <section className="glass-card min-w-0 p-4">
      <CardTitle title={title} sub={`${season} · regular season`}>
        {role === "receiver" && (
          <Link to={`/explore/targets?season=${season}&positions=${player.position}&player=${player.player_id}`}
            className="text-xs font-semibold text-muted transition hover:text-accent">
            Target Analysis →
          </Link>
        )}
      </CardTitle>
      <Body data={data} isLoading={isLoading} isError={isError} role={role}
        position={role === "receiver" ? player.position : undefined} subject={player.name}
        exportSubtitle={`${season} · ${data?.summary?.targets ?? 0} ${role === "passer" ? "throws" : "targets"} · aDOT ${data?.summary?.adot?.toFixed(1) ?? "—"}`}
        versus={role === "receiver" ? player.position : "league"} />
    </section>
  );
}

export function TeamTargetCard({ teamId, teamName, season, weeks, weeksLabel }) {
  const { data, isLoading, isError } = useTeamTargets(teamId, { season, weeks: weeks || undefined });
  return (
    <section className="glass-card min-w-0 p-4">
      <CardTitle title="Where the offense throws" sub={`Every targeted pass · ${weeksLabel}`} />
      <Body data={data} isLoading={isLoading} isError={isError} role="team" subject={teamName}
        exportSubtitle={`${season} · ${weeksLabel} · ${data?.summary?.targets ?? 0} targets`} versus="league" stacked />
    </section>
  );
}
