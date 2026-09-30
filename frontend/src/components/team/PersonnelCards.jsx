// One card per offensive personnel grouping the team used (3% of plays or more): a small
// drawing of the grouping, how often it was used against the league, and the EPA per
// play and success rate in it.
import { formatTeamStat, rankText } from "../../utils/teamStats";
import { RankChip } from "./RankChip";

const describe = (grouping) => {
  const backs = Number(grouping[0]), ends = Number(grouping[1]);
  return `${backs} RB · ${ends} TE · ${5 - backs - ends} WR`;
};

function Formation({ grouping }) {
  const backs = Number(grouping[0]), ends = Number(grouping[1]), receivers = 5 - backs - ends;
  const W = 170, H = 80, los = 30, cx = 85;
  const dot = (x, y, position, key) => (
    <circle key={key} cx={x} cy={y} r="5.2" fill={`color-mix(in srgb, var(--position-${position}) 80%, var(--surface-solid))`} stroke="var(--surface-solid)" strokeWidth="1" />
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={describe(grouping)}>
      <line x1="4" x2={W - 4} y1={los - 8} y2={los - 8} stroke="color-mix(in srgb, var(--accent) 40%, transparent)" strokeWidth="1.2" />
      {[-24, -12, 0, 12, 24].map((dx) => <rect key={dx} x={cx + dx - 4.5} y={los - 4.5} width="9" height="9" rx="2" fill="color-mix(in srgb, var(--fg) 30%, transparent)" />)}
      {dot(cx, los + 14, "qb", "qb")}
      {backs === 1 && dot(cx, los + 29, "rb", "rb1")}
      {backs === 2 && [dot(cx, los + 25, "rb", "rb1"), dot(cx, los + 38, "rb", "rb2")]}
      {[[cx + 37, los], [cx - 37, los], [cx + 46, los + 10]].slice(0, ends).map(([x, y], i) => dot(x, y, "te", `te${i}`))}
      {[[12, los], [W - 12, los + 2], [30, los + 6], [W - 30, los + 6]].slice(0, receivers).map(([x, y], i) => dot(x, y, "wr", `wr${i}`))}
    </svg>
  );
}

export function PersonnelCards({ cards, season, weeksLabel, lagWeek }) {
  const maxShare = Math.max(...(cards ?? []).map((card) => Math.max(card.share ?? 0, card.league_share ?? 0)), 0.01);
  return (
    <section className="glass-card p-4">
      <h2 className="text-[15px] font-semibold tracking-tight text-fg">Personnel</h2>
      <p className="mb-3 text-[11.5px] text-faint">{lagWeek ? `Through Week ${lagWeek}` : weeksLabel} {"·"} usage, EPA and success in each grouping</p>
      {cards?.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5">
          {cards.map((card) => (
            <div key={card.grouping} className="grid gap-1.5 rounded-2xl border border-line p-3" style={{ background: "color-mix(in srgb, var(--fg) 4%, transparent)" }}>
              <div className="flex items-baseline gap-2">
                <b className="stat-num text-[22px] font-bold text-fg">{card.grouping}</b>
                <span className="text-[11px] text-faint">{describe(card.grouping)}</span>
              </div>
              <Formation grouping={card.grouping} />
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-muted">Usage</span>
                <span className="flex items-center gap-1.5"><span className="stat-num text-[15px] font-semibold text-fg">{formatTeamStat(card.share, "pct1")}</span><RankChip rank={card.share_rank} of={card.share_teams} /></span>
              </div>
              <div className="relative h-1.5 rounded-full" style={{ background: "color-mix(in srgb, var(--fg) 9%, transparent)" }}>
                <i className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${((card.share ?? 0) / maxShare) * 100}%`, background: "color-mix(in srgb, var(--fg) 50%, transparent)" }} />
                <span className="absolute -inset-y-[3px] w-0.5 rounded-sm" style={{ left: `${((card.league_share ?? 0) / maxShare) * 100}%`, background: "var(--plot-rule)" }} />
              </div>
              <div className="flex justify-between text-[11px] text-faint"><span>League {formatTeamStat(card.league_share, "pct1")}</span><span>{card.plays} plays</span></div>
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-muted">EPA/play</span>
                <span className="flex items-center gap-1.5"><span className="stat-num text-[15px] font-semibold" style={{ color: rankText(card.epa_rank, card.epa_teams) }}>{formatTeamStat(card.epa, "sgn2")}</span>{card.epa_rank && <RankChip rank={card.epa_rank} of={card.epa_teams} />}</span>
              </div>
              <div className="flex items-baseline justify-between text-xs"><span className="text-muted">Success</span><span className="stat-num text-[15px] font-semibold text-fg">{formatTeamStat(card.success, "pct0")}</span></div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-sm text-muted">
          {season >= 2016 ? "Personnel for this season is not loaded yet." : "Personnel data starts in 2016."}
        </p>
      )}
    </section>
  );
}
