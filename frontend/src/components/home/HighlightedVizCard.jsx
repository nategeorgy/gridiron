// Highlighted Viz of the Week (October 2026): one Explore chart, large, at the top of the page.
//
// The pick is `HIGHLIGHTED_VIZ` in constants/signals.js. Only the selection is written
// down: the headline, the lede and every number beside the chart are read from the same
// `/explore/network` response the Passing Network page draws, so the card cannot say
// something the chart does not show. The chart is Explore's own `NetworkChart`, and it
// exports through the same branded-image dialog.
import { Link } from "react-router-dom";
import { Card, CardState } from "./primitives";
import { PositionTag } from "../PositionTag";
import { Headshot } from "../explore/common";
import { NetworkChart, NetworkLegend } from "../explore/NetworkChart";
import { ExportImageButton } from "../explore/ExportImageButton";
import { lastName, signed } from "../../utils/explore";

const shortName = (name) => `${name.split(" ")[0][0]}. ${lastName(name)}`;

// The Passing Network page's receiver columns, so the two read the same.
const COLUMNS = ["Receiver", "TGT", "TGT%", "REC", "YDS", "TD", "aDOT", "EPA/T"];
const epaStyle = (value) => ({ color: value === null || value === undefined ? undefined : value >= 0 ? "var(--pos)" : "var(--neg)" });

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-edge px-3.5 py-2.5" style={{ background: "color-mix(in srgb, var(--surface-2) 60%, transparent)" }}>
      <div className="text-[10px] font-bold uppercase tracking-[0.07em] text-faint">{label}</div>
      <div className="stat-num mt-1 text-[22px] font-bold text-fg">{value}</div>
    </div>
  );
}

/** "JSN took 14 of them, 32% of the throws. Barner was next with 9, 1.1 yards downfield on average." */
function lede(shown, total) {
  const [first, second] = shown;
  if (!first) return null;
  const share = Math.round((first.targets / total) * 100);
  let text = `${first.name} took ${first.targets} of them, ${share}% of the throws.`;
  if (second) {
    text += ` ${second.name} was next with ${second.targets}`;
    text += second.adot === null ? "." : `, ${second.adot.toFixed(1)} yards downfield on average.`;
  }
  return text;
}

export function HighlightedVizCard({ pick, network, shape, isLoading, isError }) {
  const ready = network && shape.shown.length > 0;
  const passer = network?.passer;
  const totals = network?.totals;
  const weekLabel = pick.weeks ? `Week ${pick.weeks} · ${pick.season}` : `${pick.season} season`;
  const subtitle = passer ? `${passer.team} · ${weekLabel}` : weekLabel;
  const exploreLink = `/explore/network?season=${pick.season}${pick.weeks ? `&weeks=${pick.weeks}` : ""}&qb=${pick.passerId}${pick.team ? `&team=${pick.team}` : ""}`;
  const rows = [...shape.shown, ...(shape.others ? [shape.others] : [])];

  return (
    <Card className="!p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-accent">Highlighted viz of the week</span>
          <span className="text-[12px] text-faint">Passing Network {"·"} {subtitle}</span>
        </div>
        {ready && (
          <div className="flex flex-wrap items-center gap-2">
            <ExportImageButton
              title={`${passer.name}'s passing network`}
              subtitle={subtitle}
              render={() => <NetworkChart passer={passer} shown={shape.shown} interactive={false} />}
            />
            <Link
              to={exploreLink}
              className="rounded-[10px] border px-3 py-1.5 text-[12.5px] font-semibold text-accent transition hover:text-fg"
              style={{ borderColor: "color-mix(in srgb, var(--accent) 55%, transparent)", background: "color-mix(in srgb, var(--accent) 8%, transparent)" }}
            >
              Open in Explore {"→"}
            </Link>
          </div>
        )}
      </div>

      <CardState isLoading={isLoading} isError={isError} isEmpty={!ready} empty="No targets for this pick yet." rows={8} />

      {ready && (
        // The chart is square, so its width is also its height. Two fifths of the card
        // (about 590px at full width), with the type on the right sized up to match it.
        <div className="grid items-start gap-6 min-[1100px]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="min-w-0">
            <NetworkChart passer={passer} shown={shape.shown} />
            <NetworkLegend layout="field" />
          </div>

          <div className="grid min-w-0 gap-5">
            <div>
              <h2 className="text-[28px] font-bold leading-tight tracking-tight text-fg [text-wrap:balance]">
                Where {passer.name}&apos;s {totals.targets} targets went
              </h2>
              <p className="mt-2 max-w-[70ch] text-[15px] leading-relaxed text-muted">{lede(shape.shown, totals.targets)}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Targets" value={totals.targets} />
              <Stat label="Cmp/Att" value={`${passer.completions}/${passer.attempts}`} />
              <Stat label="aDOT" value={totals.adot?.toFixed(1) ?? "—"} />
              <Stat label="EPA/target" value={signed(totals.epa_per_target, 2)} />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[460px] border-collapse text-[14px]">
                <thead>
                  <tr>
                    {COLUMNS.map((label, index) => (
                      <th key={label} className={`pb-2 text-[10.5px] font-bold uppercase tracking-[0.07em] text-faint ${index ? "text-right" : "text-left"}`}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.player_id ?? "others"} className={`border-t border-line ${row.others ? "text-muted" : ""}`}>
                      <td className="py-2.5 text-left">
                        {row.others ? row.name : (
                          <span className="flex items-center gap-2">
                            <Headshot url={row.headshot_url} name={row.name} size={30} />
                            <Link to={`/players/${row.player_id}`} className="truncate font-semibold text-fg hover:text-accent">{shortName(row.name)}</Link>
                            {row.position && <PositionTag position={row.position} variant="quiet" />}
                          </span>
                        )}
                      </td>
                      <td className="stat-num py-2.5 text-right font-semibold">{row.targets}</td>
                      <td className="stat-num py-2.5 text-right">{(row.share * 100).toFixed(1)}%</td>
                      <td className="stat-num py-2.5 text-right">{row.receptions}</td>
                      <td className="stat-num py-2.5 text-right">{row.yards.toLocaleString()}</td>
                      <td className="stat-num py-2.5 text-right">{row.touchdowns}</td>
                      <td className="stat-num py-2.5 text-right">{row.adot === null ? "—" : row.adot.toFixed(1)}</td>
                      <td className="stat-num py-2.5 text-right" style={epaStyle(row.epa_per_target)}>{signed(row.epa_per_target, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
