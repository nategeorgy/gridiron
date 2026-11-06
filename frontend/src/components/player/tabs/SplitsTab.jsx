// Splits (round five): by situation, then by kind of game.
//
// By situation is every target he got (a back: every carry and target; a quarterback:
// every dropback and run) by down and distance, score, field position and, from FTN's
// charting, play type and formation, with points per play against his own overall rate.
// It reads play-by-play, so it starts in 2025 like the game pages. Game splits are points
// per game in each kind of game: home or away, favoured or not, indoors or out.
import { usePlayerSplits } from "../../../hooks/usePlayer";
import { scoringLabel } from "../../../constants/scoring";
import { Panel } from "../page/common";

const UNIT = {
  QB: { unit: "Plays", one: "play", noun: "dropback and run", share: false },
  RB: { unit: "Touches", one: "touch", noun: "carry and target", share: true, shareOf: "of the team's carries and targets" },
  WR: { unit: "Targets", one: "target", noun: "target", share: true, shareOf: "of the team's targets" },
};
UNIT.TE = UNIT.WR;

const signed = (value, digits = 2) => `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;

function SituationCard({ group, base, max, unit }) {
  const columns = unit.share ? "minmax(0,1.5fr) 3rem 3rem minmax(0,1.3fr) 3.25rem" : "minmax(0,1.5fr) 3rem minmax(0,1.5fr) 3.25rem";
  return (
    <div className="rounded-2xl border border-line p-3" style={{ background: "color-mix(in srgb, var(--fg) 3%, transparent)" }}>
      <div className="mb-2 flex items-baseline gap-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-fg">
        {group.title}
        {(group.title === "Play type" || group.title === "Formation") && <span className="font-medium normal-case tracking-normal text-faint">from FTN charting</span>}
      </div>
      <div className="grid gap-2 border-b border-line pb-1 text-[9.5px] font-bold uppercase tracking-[0.08em] text-faint" style={{ gridTemplateColumns: columns }}>
        <span />
        <span className="text-right">{unit.unit}</span>
        {unit.share && <span className="text-right">Share</span>}
        <span>Points per {unit.one}</span>
        <span className="text-right">EPA</span>
      </div>
      {group.rows.map((row) => {
        if (!row.n) {
          return (
            <div key={row.label} className="grid items-center gap-2 py-1 text-[12px] text-faint" style={{ gridTemplateColumns: columns }}>
              <span>{row.label}</span>
              <span className="stat-num text-right">0</span>
              {unit.share && <span />}
              <span className="text-[11px]">None</span>
              <span />
            </div>
          );
        }
        const perPlay = row.pts / row.n;
        const diff = perPlay - base;
        const epa = row.epa / row.n;
        const small = row.n < 5;
        const fill = small
          ? "color-mix(in srgb, var(--fg) 22%, transparent)"
          : diff >= 0.15 * base
            ? "color-mix(in srgb, var(--pos) 70%, transparent)"
            : diff <= -0.15 * base
              ? "color-mix(in srgb, var(--neg) 60%, transparent)"
              : "color-mix(in srgb, var(--fg) 30%, transparent)";
        return (
          <div
            key={row.label}
            className={`grid items-center gap-2 py-1 text-[12px] ${small ? "text-muted" : "text-fg"}`}
            style={{ gridTemplateColumns: columns }}
            title={`${row.label}: ${row.n} ${unit.unit.toLowerCase()}${unit.share ? ` of ${row.team} (${Math.round((row.n / (row.team || 1)) * 100)}%)` : ""}\n${row.yds} yards, ${row.td} TD\n${perPlay.toFixed(2)} points per ${unit.one}${small ? "\nSmall sample" : ""}`}
          >
            <span className="truncate">{row.label}</span>
            <span className="stat-num text-right">{row.n}</span>
            {unit.share && <span className="stat-num text-right text-muted">{Math.round((row.n / (row.team || 1)) * 100)}%</span>}
            <span className="relative flex h-[18px] items-center">
              <span className="relative h-[14px] flex-1 overflow-visible rounded-[5px]" style={{ background: "color-mix(in srgb, var(--fg) 6%, transparent)" }}>
                <i className="absolute inset-y-0 left-0 rounded-[5px]" style={{ width: `${Math.min(100, (perPlay / max) * 100)}%`, background: fill }} />
                <b className="absolute -inset-y-[3px] w-[2px]" style={{ left: `${(base / max) * 100}%`, background: "var(--fg)" }} />
              </span>
              <em className="stat-num ml-2 w-9 text-right text-[11px] font-bold not-italic">{perPlay.toFixed(2)}</em>
            </span>
            <span className="stat-num text-right font-bold" style={{ color: epa >= 0.15 ? "var(--pos)" : epa < -0.05 ? "var(--neg)" : "var(--muted)" }}>
              {signed(epa)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function BySituation({ data, position, season }) {
  const unit = UNIT[position] ?? UNIT.WR;
  if (!data.available) {
    return (
      <Panel title="By situation" sub={`${season} · play-by-play splits start in 2025`}>
        <p className="py-6 text-center text-sm text-muted">Pick 2025 or later in the season menu for splits by down, score and play type.</p>
      </Panel>
    );
  }
  const base = data.overall?.n ? data.overall.pts / data.overall.n : 0;
  const max = Math.max(base, ...data.groups.flatMap((group) => group.rows.filter((row) => row.n >= 3).map((row) => row.pts / row.n))) * 1.1 || 1;
  return (
    <Panel
      title="By situation"
      sub={`${season} · every ${unit.noun}, by the situation it came in. ${unit.share ? `Share is the player's part ${unit.shareOf} in that situation. ` : ""}The tick is the overall ${base.toFixed(2)} points per ${unit.one}; grey rows have under five`}
    >
      {data.groups.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.groups.map((group) => <SituationCard key={group.title} group={group} base={base} max={max} unit={unit} />)}
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-muted">No plays this season.</p>
      )}
      {!data.charted && data.groups.length > 0 && <p className="mt-2 text-[11.5px] text-faint">Play type and formation appear once FTN's charting for the season is loaded.</p>}
    </Panel>
  );
}

function GameSplits({ data, season, scoring }) {
  const overall = data.overall?.ppg ?? 0;
  const max = Math.max(overall, ...data.groups.flatMap((group) => group.rows.map((row) => row.ppg ?? 0))) * 1.1 || 1;
  return (
    <Panel title="Game splits" sub={`${season} · ${scoringLabel(scoring)} points per game in each kind of game. The tick on each bar is the overall ${overall.toFixed(1)} PPG`}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.groups.map((group) => (
          <div key={group.title} className="rounded-2xl border border-line p-3" style={{ background: "color-mix(in srgb, var(--fg) 3%, transparent)" }}>
            <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-fg">{group.title}</div>
            {group.rows.map((row) => {
              const diff = row.g ? row.ppg - overall : null;
              const tone = diff == null ? null : diff >= 2 ? "var(--pos)" : diff <= -2 ? "var(--neg)" : null;
              return (
                <div
                  key={row.label}
                  className="grid grid-cols-[minmax(0,1.3fr)_1.75rem_minmax(0,1fr)_2.5rem_2.5rem] items-center gap-2 py-1 text-[12px]"
                  title={row.g ? `${row.label}: ${row.g} games, ${row.ppg.toFixed(1)} PPG\nBest ${row.best.toFixed(1)}, worst ${row.worst.toFixed(1)}` : `${row.label}: no games`}
                >
                  <span className={`truncate ${row.g ? "text-fg" : "text-faint"}`}>{row.label}</span>
                  <span className="stat-num text-right text-[11px] text-faint">{row.g} G</span>
                  {row.g ? (
                    <span className="relative h-[12px] rounded-[4px]" style={{ background: "color-mix(in srgb, var(--fg) 6%, transparent)" }}>
                      <i className="absolute inset-y-0 left-0 rounded-[4px]" style={{ width: `${(row.ppg / max) * 100}%`, background: tone ? `color-mix(in srgb, ${tone} 65%, transparent)` : "color-mix(in srgb, var(--fg) 30%, transparent)" }} />
                      <b className="absolute -inset-y-[3px] w-[2px]" style={{ left: `${(overall / max) * 100}%`, background: "var(--fg)" }} />
                    </span>
                  ) : (
                    <span className="text-[11px] text-faint">No games</span>
                  )}
                  <span className="stat-num text-right font-bold text-fg">{row.g ? row.ppg.toFixed(1) : ""}</span>
                  <span className="stat-num text-right text-[11px] font-bold" style={{ color: tone ?? "var(--muted)" }}>
                    {diff == null ? "" : signed(diff, 1)}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function SplitsTab({ page }) {
  const { playerId, position, season, scoring } = page;
  const { data, isLoading } = usePlayerSplits(playerId, season, scoring);
  if (isLoading) {
    return (
      <div className="space-y-4">
        <section className="glass-card h-96 animate-pulse" />
        <section className="glass-card h-64 animate-pulse" />
      </div>
    );
  }
  if (!data) return null;
  return (
    <div className="space-y-4">
      <BySituation data={data.situations} position={position} season={season} />
      <GameSplits data={data.games} season={season} scoring={scoring} />
    </div>
  );
}
