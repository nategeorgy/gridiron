// Air-yard distribution for receivers with real volume (October 2026), from Target
// Analysis: one curve per receiver, the line of scrimmage and 20 yards marked, a tick at
// his aDOT. It replaced the mockup's single-receiver target map because a home page
// question is "who is used deep and who underneath", which needs everyone at once.
//
// The 25-target floor is the Target Analysis minimum of the same name, so the link opens
// that page showing exactly this list. The curves share one height scale (`useDensities`),
// which is what makes their shapes comparable.
import { Link } from "react-router-dom";
import { Card, CardHead, CardLink, CardState } from "./primitives";
import { Headshot } from "../explore/common";
import { ExportImageButton } from "../explore/ExportImageButton";
import { AirYardRidge, TargetListChart, useDensities } from "../explore/TargetList";
import { lastName } from "../../utils/explore";

const SHOWN = 10;

export function AirYardsCard({ season, minTargets, players, isLoading, isError }) {
  const sorted = [...(players ?? [])].sort((a, b) => (b.adot ?? -99) - (a.adot ?? -99));
  const shown = sorted.slice(0, SHOWN);
  const densities = useDensities(shown);
  const link = `/explore/targets?season=${season}&positions=WR&min=${minTargets}&view=ridge&sort=adot`;

  return (
    <Card>
      <CardHead title="Air-Yard Distribution" sub={`WRs, ${minTargets}+ targets`} />
      <CardState isLoading={isLoading} isError={isError} isEmpty={shown.length === 0}
        empty={`No receiver has ${minTargets} targets yet.`} rows={6} />
      {shown.length > 0 && (
        <>
          <div className="mb-1 grid grid-cols-[minmax(0,118px)_34px_minmax(0,1fr)] gap-2 text-[9.5px] font-bold uppercase tracking-[0.07em] text-faint">
            <span>Receiver</span>
            <span className="text-right">aDOT</span>
            {/* The ridge runs -10 to +40 yards, so the line of scrimmage sits a fifth of
                the way across and +20 three fifths. */}
            <span className="relative h-3">
              <span className="absolute -translate-x-1/2" style={{ left: "20%" }}>LOS</span>
              <span className="absolute -translate-x-1/2" style={{ left: "60%" }}>+20</span>
              <span className="absolute right-0">+40</span>
            </span>
          </div>
          {shown.map((player) => (
            <div key={player.player_id} className="grid grid-cols-[minmax(0,118px)_34px_minmax(0,1fr)] items-center gap-2 border-t border-line py-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <Headshot url={player.headshot_url} name={player.name} size={22} />
                <Link to={`/players/${player.player_id}`} className="truncate text-[12px] font-semibold text-fg hover:text-accent">
                  {lastName(player.name)}
                </Link>
                <span className="stat-num text-[10px] text-faint">{player.targets}</span>
              </span>
              <span className="stat-num text-right text-[12px] font-bold text-fg">{player.adot?.toFixed(1) ?? "—"}</span>
              <AirYardRidge curve={densities.curves.get(player.player_id)} max={densities.max} adot={player.adot} />
            </div>
          ))}
          <p className="mt-2 text-[10.5px] text-faint">
            Deepest first. Tick: aDOT. Number beside the name: targets.
            {sorted.length > SHOWN ? ` ${sorted.length - SHOWN} more in Target Analysis.` : ""}
          </p>
        </>
      )}
      <div className="mt-auto flex flex-wrap items-end justify-between gap-2">
        <CardLink to={link}>Open in Target Analysis</CardLink>
        {shown.length > 0 && (
          <ExportImageButton
            title="Where receivers are targeted"
            subtitle={`${season} · WRs with ${minTargets}+ targets · deepest aDOT first`}
            render={() => <TargetListChart players={sorted.slice(0, 25)} view="ridge" />}
            sizes={["fit", "wide"]}
          />
        )}
      </div>
    </Card>
  );
}
