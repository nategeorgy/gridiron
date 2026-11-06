// A quarterback's passing network (round five): Explore's network drawn on the field,
// and where his targets went as a list beside it.
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useNetwork } from "../../../hooks/useExplore";
import { usePhone } from "../../../hooks/useMediaQuery";
import { NetworkChart, NetworkLegend, shapeNetwork } from "../../explore/NetworkChart";
import { Headshot } from "../../explore/common";
import { positionColor, signed } from "../../../utils/explore";
import { Panel } from "./common";

function useQbNetwork(page) {
  const { playerId, season, row } = page;
  const query = useNetwork({ season, passer_id: playerId, team: row?.team_abbreviation });
  const shape = useMemo(() => shapeNetwork(query.data, 9, 3), [query.data]);
  return { query, shape };
}

export function NetworkField({ page }) {
  const { query, shape } = useQbNetwork(page);
  const compact = usePhone();
  const data = query.data;
  return (
    <Panel
      title="Passing network"
      sub="Receivers sit at the average depth and side of their targets; size and line width are targets. Explore's network, on the page"
      controls={<Link to={`/explore/network?season=${page.season}&qb=${page.playerId}`} className="text-xs font-semibold text-muted transition hover:text-accent">Passing Network →</Link>}
    >
      {query.isLoading ? (
        <div className="h-[420px] animate-pulse rounded-xl bg-surface-2" />
      ) : !data?.passer ? (
        <p className="py-10 text-center text-sm text-muted">No targets this season.</p>
      ) : (
        <>
          <NetworkChart layout="field" passer={data.passer} shown={shape.shown} compact={compact} />
          <NetworkLegend layout="field" />
        </>
      )}
    </Panel>
  );
}

export function NetworkList({ page }) {
  const { query, shape } = useQbNetwork(page);
  const data = query.data;
  if (query.isLoading) return <section className="glass-card h-[420px] animate-pulse p-5" />;
  if (!data?.passer) return null;
  const rows = [...shape.all.slice(0, 10)];
  const top = Math.max(...rows.map((receiver) => receiver.share), 0.01);
  return (
    <Panel title="Targets by receiver" sub={`${data.totals.targets} targets in ${page.season}. The passing network from Explore, as a list`}>
      <div className="space-y-1">
        {rows.map((receiver) => (
          <Link
            key={receiver.player_id}
            to={`/players/${receiver.player_id}`}
            className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,0.9fr)_2.5rem_3rem] items-center gap-2 rounded-lg px-1.5 py-1 transition hover:bg-surface-2"
          >
            <Headshot url={receiver.headshot_url} name={receiver.name} className="h-7 w-7 rounded-full" style={{ background: "var(--surface-2)" }} />
            <span className="truncate text-[12.5px] font-semibold text-fg">
              {receiver.name} <span className="text-[10.5px] text-faint">{receiver.position}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 rounded-full" style={{ width: `${(receiver.share / top) * 100}%`, background: positionColor(receiver.position) }} />
              <span className="stat-num text-[11.5px] text-fg">{receiver.targets}</span>
            </span>
            <span className="stat-num text-right text-[11.5px] text-muted">{Math.round(receiver.share * 100)}%</span>
            <span className="stat-num text-right text-[11.5px] font-bold" style={{ color: receiver.epa_per_target >= 0 ? "var(--pos)" : "var(--neg)" }}>
              {signed(receiver.epa_per_target, 2)}
            </span>
          </Link>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-[28px_minmax(0,1fr)_minmax(0,0.9fr)_2.5rem_3rem] gap-2 px-1.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-faint">
        <span /><span /><span>Targets</span><span className="text-right">Share</span><span className="text-right">EPA/T</span>
      </div>
    </Panel>
  );
}
