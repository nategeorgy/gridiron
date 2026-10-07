// Passing Network: where one quarterback's targets go, receiver by receiver. How much
// of the volume each one gets, how deep, to which side, and what it returns in EPA.
//
// A quarterback who shared a season with another passer on the same team can be set
// beside him: both networks then cover only that team's games, so the comparison is
// the same room of receivers with a different thrower. Everything is in the URL.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Select } from "../components/ui/Select";
import { FilterBar, summarize } from "../components/ui/FilterBar";
import { Segmented } from "../components/team/Segmented";
import { TimeframeFilter, formatWeeks } from "../components/TimeframeFilter";
import { ExportButton } from "../components/ExportButton";
import { PositionTag } from "../components/PositionTag";
import { ExportImageButton } from "../components/explore/ExportImageButton";
import { CardTitle, ChartState, ExploreHeader, Field, Foot, Headshot } from "../components/explore/common";
import { NETWORK_SIZE, NetworkChart, NetworkLegend, shapeNetwork } from "../components/explore/NetworkChart";
import { useNetwork, usePassers } from "../hooks/useExplore";
import { useSeasons } from "../hooks/useSeasons";
import { useUrlState } from "../hooks/useUrlState";
import { usePhone } from "../hooks/useMediaQuery";
import { DEPTHS, SIDES, lastName, signed } from "../utils/explore";

const SITUATIONS = [
  { value: "all", label: "All" },
  { value: "red_zone", label: "Red zone" },
  { value: "late_downs", label: "3rd & 4th down" },
];
const SITUATION_NOTE = { all: "", red_zone: " · red zone", late_downs: " · 3rd and 4th down" };
const TOPS = ["6", "9", "12"];

export function PassingNetworkView({ board }) {
  const phone = usePhone();
  const { seasonOptions, currentSeason } = useSeasons();
  const [season, setSeason] = useUrlState("season", String(currentSeason));
  const [weeks, setWeeks] = useUrlState("weeks", "");
  const [passerId, setPasserId] = useUrlState("qb", "");
  const [passerTeam, setPasserTeam] = useUrlState("team", "");
  const [situation, setSituation] = useUrlState("situation", "all", SITUATIONS.map((option) => option.value));
  const [top, setTop] = useUrlState("top", "6", TOPS);
  const [layout, setLayout] = useUrlState("view", "field", ["field", "radial"]);
  const [versusId, setVersusId] = useUrlState("vs", "");
  const [selected, setSelected] = useUrlState("receiver", "");

  const { data: passerData } = usePassers({ season: Number(season) });
  const passers = passerData?.data ?? [];
  // Default to the season's busiest passer; a link may name one, and his team.
  const passer = passers.find((entry) => entry.player_id === passerId && (!passerTeam || entry.team === passerTeam))
    ?? passers.find((entry) => entry.player_id === passerId)
    ?? [...passers].sort((a, b) => b.targets - a.targets)[0];

  const common = { season: Number(season), weeks: weeks || undefined, situation };
  const main = useNetwork({ ...common, passer_id: passer?.player_id, team: passer?.team });
  // A changed season empties the quarterback list until the new one loads, while the
  // query above still holds the old season's network. Show nothing until both agree.
  const mainNetwork = passer ? main.data : undefined;
  const teammates = mainNetwork?.teammates ?? [];
  const versus = teammates.find((entry) => entry.player_id === versusId) ? versusId : "";
  const other = useNetwork({ ...common, passer_id: versus || undefined, team: passer?.team }, { enabled: Boolean(versus && passer) });

  const floor = situation === "all" && !weeks && (mainNetwork?.totals.games ?? 0) >= 8 ? 3 : 1;
  const mainShape = useMemo(() => shapeNetwork(mainNetwork, Number(top), floor), [mainNetwork, top, floor]);
  const otherShape = useMemo(() => shapeNetwork(versus ? other.data : null, Number(top), floor), [other.data, versus, top, floor]);

  const choosePasser = (entry) => {
    setPasserId(entry.player_id);
    setPasserTeam(entry.team);
    setVersusId("");
    setSelected("");
  };

  const weeksLabel = weeks ? formatWeeks(weeks.split(",").map(Number)) : "Full season";
  const subtitle = `${passer?.team ?? ""} · ${season} · ${weeksLabel}${SITUATION_NOTE[situation]}`;
  const secondPasser = versus ? teammates.find((entry) => entry.player_id === versus) : null;

  const exportChart = () => {
    if (!secondPasser || !other.data) {
      return <NetworkChart layout={layout} passer={mainNetwork.passer} shown={mainShape.shown} interactive={false} />;
    }
    const width = 1300;
    const height = 700;
    return (
      <svg className="chart" viewBox={`0 0 ${width} ${height}`}>
        {[[mainNetwork, mainShape], [other.data, otherShape]].map(([network, shape], index) => (
          <g key={network.passer.player_id}>
            <text x={index * 660 + 20} y={28} style={{ fontSize: 18, fontWeight: 700, fill: "var(--fg)" }}>
              {network.passer.name} · {network.totals.targets} targets in {network.totals.games} games
            </text>
            <NetworkChart layout={layout} passer={network.passer} shown={shape.shown} interactive={false}
              nested={{ x: index * 660, y: 44, width: NETWORK_SIZE, height: NETWORK_SIZE }} />
          </g>
        ))}
      </svg>
    );
  };

  const csvRows = [...mainShape.shown, ...(mainShape.others ? [mainShape.others] : [])].map((receiver) => ({
    ...receiver,
    share: receiver.share.toFixed(3),
    adot: receiver.adot === null ? "" : receiver.adot.toFixed(2),
    epa_per_target: receiver.epa_per_target === null ? "" : receiver.epa_per_target.toFixed(3),
  }));

  return (
    <div className="space-y-4">
      <ExploreHeader title={board.title} description={board.description} />

      {/* On a phone the quarterback stays out of the fold: he is what the page is about. */}
      <FilterBar
        className="flex flex-wrap items-end gap-3 p-4"
        summary={summarize(
          season,
          weeksLabel,
          situation === "all" ? "All plays" : SITUATIONS.find((entry) => entry.value === situation)?.label,
          `Top ${top}`,
        )}
        footer={
          <div className="border-t border-line px-4 py-3 md:hidden">
            <Field label="Quarterback">
              <PasserPicker passers={passers} value={passer} onChange={choosePasser} />
            </Field>
          </div>
        }
      >
        <div className="max-md:hidden">
          <Field label="Quarterback">
            <PasserPicker passers={passers} value={passer} onChange={choosePasser} />
          </Field>
        </div>
        <Select label="Season" value={season} options={seasonOptions}
          onChange={(value) => { setSeason(value); setWeeks(""); setPasserId(""); setPasserTeam(""); setVersusId(""); setSelected(""); }} />
        <TimeframeFilter weeks={weeks} season={season} onChange={setWeeks} />
        <Field label="Situation">
          <Segmented label="Situation" value={situation} onChange={setSituation} options={SITUATIONS} />
        </Field>
        <Select label="Receivers" value={top} onChange={setTop} options={TOPS.map((value) => ({ value, label: `Top ${value}` }))} />
        <div className="ml-auto">
          <ExportButton
            filename={`second-level-network-${passer ? lastName(passer.name) : "qb"}-${season}`}
            rows={csvRows}
            columns={[
              { key: "name", label: "Receiver" }, { key: "position", label: "Position" }, { key: "targets", label: "Targets" },
              { key: "share", label: "Target share" }, { key: "receptions", label: "Catches" }, { key: "yards", label: "Yards" },
              { key: "touchdowns", label: "TD" }, { key: "adot", label: "aDOT" }, { key: "epa_per_target", label: "EPA per target" },
            ]}
            context={[`Second Level: ${passer?.name ?? ""} passing network`, subtitle]}
          />
        </div>
      </FilterBar>

      {mainNetwork && (
        <QuarterbackCard
          network={mainNetwork}
          season={season}
          weeksLabel={weeksLabel}
          teammates={teammates}
          versus={versus}
          onVersus={(id) => { setVersusId(versus === id ? "" : id); setSelected(""); }}
        />
      )}

      <div className={`grid items-start gap-4 ${secondPasser ? "" : "min-[1100px]:grid-cols-[minmax(0,1fr)_470px]"}`}>
        <section className={`glass-card min-w-0 p-4 transition ${main.isPlaceholderData ? "opacity-70" : ""}`}>
          <CardTitle title="Targets by receiver">
            <Segmented label="Layout" value={layout} onChange={setLayout}
              options={[{ value: "field", label: "Field" }, { value: "radial", label: "Radial" }]} />
            {mainNetwork && (
              <ExportImageButton
                title={secondPasser ? `${passer.team} targets: ${lastName(passer.name)} and ${lastName(secondPasser.name)}` : `${passer.name}'s passing network`}
                subtitle={subtitle}
                render={exportChart}
                sizes={secondPasser ? ["fit", "wide"] : ["fit", "square", "wide"]}
              />
            )}
          </CardTitle>
          {!mainNetwork ? (
            <ChartState isLoading={main.isLoading || !passers.length} isError={main.isError} height={560} />
          ) : secondPasser ? (
            <div className="grid gap-4 min-[900px]:grid-cols-2">
              {[[mainNetwork, mainShape], [other.data, otherShape]].map(([network, shape], index) => (
                <div key={index} className="min-w-0">
                  {network ? (
                    <>
                      <div className="mb-1.5 flex items-center gap-2">
                        <Headshot url={network.passer.headshot_url} name={network.passer.name} size={30} ring="var(--position-qb)" />
                        <div>
                          <div className="text-[13px] font-semibold text-fg">{network.passer.name}</div>
                          <div className="stat-num text-[11px] text-faint">{network.totals.targets} targets · {network.totals.games} games for {passer.team}</div>
                        </div>
                      </div>
                      <NetworkChart layout={layout} passer={network.passer} shown={shape.shown} selected={selected}
                        onSelect={(id) => setSelected(selected === id ? "" : id)} compact={phone} />
                    </>
                  ) : (
                    <ChartState isLoading height={480} />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="mx-auto max-w-[760px]">
              <NetworkChart layout={layout} passer={mainNetwork.passer} shown={mainShape.shown} selected={selected}
                onSelect={(id) => setSelected(selected === id ? "" : id)} compact={phone} />
            </div>
          )}
          {mainNetwork && <NetworkLegend layout={layout} />}
        </section>

        {mainNetwork && (
          <div className="grid min-w-0 gap-4">
            {secondPasser && other.data ? (
              <PairTable first={mainNetwork} firstShape={mainShape} second={other.data} secondShape={otherShape} team={passer.team} />
            ) : (
              <>
                <ReceiverTable network={mainNetwork} shape={mainShape} selected={selected}
                  onSelect={(id) => setSelected(selected === id ? "" : id)} />
                <ZoneCard network={mainNetwork} shape={mainShape} selected={selected} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** A searchable list of the season's passers, grouped by team. Portalled, like every popover here. */
function PasserPicker({ passers, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [anchor, setAnchor] = useState(null);
  const button = useRef(null);
  const menu = useRef(null);

  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const rect = button.current.getBoundingClientRect();
    // Kept on screen: the 300px menu from the trigger's left edge can overrun a phone.
    const viewport = document.documentElement.clientWidth || window.innerWidth || 1280;
    setAnchor({ top: rect.bottom + 4, left: Math.min(rect.left, Math.max(12, viewport - 312)) });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (button.current?.contains(event.target) || menu.current?.contains(event.target)) return;
      setOpen(false);
    };
    const escape = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const needle = query.trim().toLowerCase();
  const matches = passers.filter((entry) => !needle || entry.name.toLowerCase().includes(needle) || entry.team?.toLowerCase().includes(needle));

  return (
    <>
      <button ref={button} type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open}
        className="glass-input flex min-w-[250px] items-center gap-2 px-2.5 py-1.5 text-left text-sm max-md:w-full max-md:min-w-0">
        {value ? (
          <>
            <Headshot url={value.headshot_url} name={value.name} size={22} />
            <b className="truncate font-semibold text-fg">{value.name}</b>
            <span className="stat-num text-xs text-faint">{value.team}</span>
          </>
        ) : (
          <span className="text-muted">Loading quarterbacks…</span>
        )}
        <svg viewBox="0 0 10 10" className="ml-auto h-2.5 w-2.5 text-faint" aria-hidden="true">
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {open && anchor && createPortal(
        <div ref={menu} className="glass-popover fixed z-50 w-[300px] p-1.5" style={{ top: anchor.top, left: anchor.left }}>
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search quarterbacks"
            className="glass-input mb-1 w-full px-2.5 py-1.5 text-sm" />
          <div className="max-h-[360px] overflow-y-auto">
            {matches.map((entry) => {
              const current = value && entry.player_id === value.player_id && entry.team === value.team;
              return (
                <button key={`${entry.player_id}-${entry.team}`} type="button"
                  onClick={() => { onChange(entry); setOpen(false); setQuery(""); }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition ${current ? "bg-surface-2" : "hover:bg-surface-2"}`}>
                  <Headshot url={entry.headshot_url} name={entry.name} size={28} />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[13px] font-semibold text-fg">{entry.name}</b>
                    <small className="stat-num text-[11px] text-faint">{entry.team} · {entry.targets} targets · {entry.games} g</small>
                  </span>
                </button>
              );
            })}
            {!matches.length && <p className="px-2 py-3 text-xs text-muted">No quarterbacks match.</p>}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function Stat({ label, value }) {
  return (
    <div className="min-w-0 sm:min-w-[70px]">
      <div className="text-[10px] font-bold uppercase tracking-[0.07em] text-faint">{label}</div>
      <div className="stat-num text-base font-semibold text-fg">{value}</div>
    </div>
  );
}

function QuarterbackCard({ network, season, weeksLabel, teammates, versus, onVersus }) {
  const { passer, totals } = network;
  return (
    <section className="glass-card flex flex-wrap items-center gap-x-5 gap-y-3 p-4">
      <span className="contents max-sm:hidden">
        <Headshot url={passer.headshot_url} name={passer.name} size={64} ring="var(--position-qb)" />
      </span>
      <div className="grid min-w-0 flex-1 gap-2.5">
        {/* On a phone the face sits beside the name, so the stats get the card's width. */}
        <div className="flex items-center gap-3 sm:block">
          <span className="sm:hidden">
            <Headshot url={passer.headshot_url} name={passer.name} size={48} ring="var(--position-qb)" />
          </span>
          <div className="min-w-0">
            <Link to={`/players/${passer.player_id}`} className="text-xl font-bold tracking-tight text-fg hover:text-accent">{passer.name}</Link>
            <div className="stat-num mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-faint">
              <PositionTag position="QB" variant="quiet" />
              {passer.team} · {passer.games} games · {season} · {weeksLabel}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-x-3 gap-y-2 sm:flex sm:flex-wrap sm:gap-x-5">
          <Stat label="Cmp/Att" value={`${passer.completions}/${passer.attempts}`} />
          <Stat label="Pass yds" value={passer.passing_yards.toLocaleString()} />
          <Stat label="TD" value={passer.passing_tds} />
          <Stat label="INT" value={passer.interceptions} />
          <Stat label="aDOT" value={totals.adot?.toFixed(1) ?? "—"} />
          <Stat label="EPA/target" value={signed(totals.epa_per_target, 2)} />
          <Stat label="CPOE" value={signed(passer.cpoe, 1)} />
        </div>
      </div>
      {teammates.length > 0 && (
        <div className="grid gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.07em] text-faint">Also started for {passer.team}</span>
          <div className="flex flex-wrap gap-1.5">
            {teammates.map((mate) => (
              <button key={mate.player_id} type="button" onClick={() => onVersus(mate.player_id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                  versus === mate.player_id ? "text-fg" : "border-edge text-muted hover:text-fg"}`}
                style={versus === mate.player_id ? { borderColor: "color-mix(in srgb, var(--accent) 55%, transparent)", background: "var(--surface-solid)" } : undefined}>
                <Headshot url={mate.headshot_url} name={mate.name} size={20} />
                {versus === mate.player_id ? `Comparing with ${lastName(mate.name)}` : `Compare with ${lastName(mate.name)}`}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

const epaStyle = (value) => ({ color: value === null || value === undefined ? undefined : value >= 0 ? "var(--pos)" : "var(--neg)" });

function ReceiverTable({ network, shape, selected, onSelect }) {
  const rows = [...shape.shown, ...(shape.others ? [shape.others] : [])];
  const totals = network.totals;
  const head = ["Receiver", "TGT", "TGT%", "REC", "YDS", "TD", "aDOT", "EPA/T"];
  return (
    <section className="glass-card min-w-0 p-4">
      <CardTitle title="Receivers" sub={`${totals.targets} targets from ${lastName(network.passer.name)}`} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[430px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              {head.map((label, index) => (
                <th key={label} className={`pb-1.5 text-[10px] font-bold uppercase tracking-[0.07em] text-faint ${index ? "text-right" : "pin-col text-left"}`}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.player_id ?? "others"} onClick={row.others ? undefined : () => onSelect(row.player_id)}
                className={`border-t border-line ${row.others ? "text-muted" : "cursor-pointer hover:bg-surface-2/60"} ${row.player_id && row.player_id === selected ? "bg-surface-2" : ""}`}>
                <td className="pin-col py-1.5 text-left max-md:pr-2">
                  {row.others ? row.name : (
                    <span className="flex items-center gap-2">
                      <Headshot url={row.headshot_url} name={row.name} size={24} />
                      <span className="truncate font-semibold text-fg">{row.name.split(" ")[0][0]}. {lastName(row.name)}</span>
                      <PositionTag position={row.position} variant="quiet" className="max-sm:hidden" />
                    </span>
                  )}
                </td>
                <td className="stat-num py-1.5 text-right">{row.targets}</td>
                <td className="stat-num py-1.5 text-right">{(row.share * 100).toFixed(1)}%</td>
                <td className="stat-num py-1.5 text-right">{row.receptions}</td>
                <td className="stat-num py-1.5 text-right">{row.yards.toLocaleString()}</td>
                <td className="stat-num py-1.5 text-right">{row.touchdowns}</td>
                <td className="stat-num py-1.5 text-right">{row.adot === null ? "—" : row.adot.toFixed(1)}</td>
                <td className="stat-num py-1.5 text-right" style={epaStyle(row.epa_per_target)}>{signed(row.epa_per_target, 2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line font-semibold text-fg">
              <td className="pin-col py-1.5 text-left">All targets</td>
              <td className="stat-num py-1.5 text-right">{totals.targets}</td>
              <td className="stat-num py-1.5 text-right">100%</td>
              <td className="stat-num py-1.5 text-right">{totals.receptions}</td>
              <td className="stat-num py-1.5 text-right">{totals.yards.toLocaleString()}</td>
              <td className="stat-num py-1.5 text-right">{totals.touchdowns}</td>
              <td className="stat-num py-1.5 text-right">{totals.adot?.toFixed(1) ?? "—"}</td>
              <td className="stat-num py-1.5 text-right" style={epaStyle(totals.epa_per_target)}>{signed(totals.epa_per_target, 2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

/** The chosen receiver's twelve zones, as shares of his charted targets. */
function ZoneCard({ network, shape, selected }) {
  const receiver = shape.shown.find((entry) => entry.player_id === selected) ?? shape.shown[0];
  if (!receiver) return null;
  const total = receiver.zones.reduce((sum, value) => sum + value, 0) || 1;
  const max = Math.max(...receiver.zones) / total;
  return (
    <section className="glass-card min-w-0 p-4">
      <CardTitle title={`Where ${lastName(network.passer.name)} throws to ${lastName(receiver.name)}`} sub="Click another receiver to switch" />
      <div className="grid grid-cols-[84px_repeat(3,minmax(0,1fr))] gap-[3px] text-[11px]">
        <div />
        {SIDES.map((side) => (
          <div key={side} className="p-0.5 text-center text-[10px] font-semibold uppercase tracking-[0.04em] text-faint">{side}</div>
        ))}
        {[3, 2, 1, 0].map((depth) => (
          <FragmentRow key={depth} depth={depth} receiver={receiver} total={total} max={max} />
        ))}
      </div>
      <Foot>Share of his {receiver.charted} targets with a charted depth and side. The line of scrimmage sits between Short and Behind.</Foot>
    </section>
  );
}

function FragmentRow({ depth, receiver, total, max }) {
  return (
    <>
      <div className="flex items-center text-left text-[11px] text-muted">{DEPTHS[depth].short}</div>
      {[0, 1, 2].map((side) => {
        const share = receiver.zones[depth * 3 + side] / total;
        const level = share / (max || 1);
        return (
          <div key={side} className="stat-num rounded-md px-1 py-1.5 text-center"
            style={{
              background: `color-mix(in srgb, var(--accent) ${Math.round(level * 55)}%, color-mix(in srgb, var(--fg) 4%, transparent))`,
              color: level > 0.6 ? "var(--fg)" : "var(--muted)",
              fontWeight: level > 0.6 ? 700 : 500,
            }}>
            {Math.round(share * 100)}%
          </div>
        );
      })}
    </>
  );
}

/** Target share, depth and EPA per target for each receiver with one passer and with the other. */
function PairTable({ first, firstShape, second, secondShape, team }) {
  const ids = [...new Set([...firstShape.shown, ...secondShape.shown].map((receiver) => receiver.player_id))];
  const find = (shape, id) => shape.all.find((receiver) => receiver.player_id === id);
  const rows = ids.map((id) => {
    const a = find(firstShape, id);
    const b = find(secondShape, id);
    return { id, person: a ?? b, a, b, shareA: a ? a.share : 0, shareB: b ? b.share : 0 };
  }).sort((x, y) => y.shareA + y.shareB - (x.shareA + x.shareB));
  const firstName = lastName(first.passer.name);
  const secondName = lastName(second.passer.name);
  const points = (value) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value * 100).toFixed(1)}`;
  return (
    <section className="glass-card min-w-0 p-4">
      <CardTitle title={`Target share with ${firstName} and with ${secondName}`} sub={`${team} games only`} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
          <thead>
            <tr className="text-[10px] font-bold uppercase tracking-[0.07em] text-faint">
              <th />
              <th colSpan={3} className="pb-1 text-center">Target share</th>
              <th colSpan={2} className="pb-1 text-center">aDOT</th>
              <th colSpan={2} className="pb-1 text-center">EPA per target</th>
            </tr>
            <tr className="text-[10px] font-bold uppercase tracking-[0.07em] text-faint">
              <th className="pb-1.5 text-left">Receiver</th>
              <th className="pb-1.5 text-right">{firstName}</th>
              <th className="pb-1.5 text-right">{secondName}</th>
              <th className="pb-1.5 text-right">Change (pp)</th>
              <th className="pb-1.5 text-right">{firstName}</th>
              <th className="pb-1.5 text-right">{secondName}</th>
              <th className="pb-1.5 text-right">{firstName}</th>
              <th className="pb-1.5 text-right">{secondName}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const change = row.shareB - row.shareA;
              return (
                <tr key={row.id} className="border-t border-line">
                  <td className="py-1.5 text-left">
                    <span className="flex items-center gap-2">
                      <Headshot url={row.person.headshot_url} name={row.person.name} size={24} />
                      <span className="font-semibold text-fg">{row.person.name}</span>
                      <PositionTag position={row.person.position} variant="quiet" />
                    </span>
                  </td>
                  <td className="stat-num py-1.5 text-right">{(row.shareA * 100).toFixed(1)}%</td>
                  <td className="stat-num py-1.5 text-right">{(row.shareB * 100).toFixed(1)}%</td>
                  <td className="stat-num py-1.5 text-right font-semibold"
                    style={{ color: Math.abs(change) < 0.02 ? undefined : change > 0 ? "var(--pos)" : "var(--neg)" }}>{points(change)}</td>
                  <td className="stat-num py-1.5 text-right">{row.a?.adot?.toFixed(1) ?? "—"}</td>
                  <td className="stat-num py-1.5 text-right">{row.b?.adot?.toFixed(1) ?? "—"}</td>
                  <td className="stat-num py-1.5 text-right" style={epaStyle(row.a?.epa_per_target)}>{row.a ? signed(row.a.epa_per_target, 2) : "—"}</td>
                  <td className="stat-num py-1.5 text-right" style={epaStyle(row.b?.epa_per_target)}>{row.b ? signed(row.b.epa_per_target, 2) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Foot>Change is the second quarterback's share minus the first's, in percentage points.</Foot>
    </section>
  );
}
