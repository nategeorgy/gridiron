// The Personnel card. On top, from snap counts (2013+): the five skill spots split into
// backs, tight ends and receivers against the league, then the 2-back rate and tight ends
// and receivers per play with their ranks. These are exact as averages, which is why they
// are drawn as a split of five spots and never as a formation: a part-filled second tight
// end would claim a grouping split the snap counts do not have.
//
// Below, where the season has them (participation, or a hand-supplied season total), one
// card per grouping the team used (3% of plays or more): a drawing of it, how often it was
// used against the league, and the EPA per play and success rate in it.
import { TEAM_STAT_LABEL } from "../../constants/teamStats";
import { formatTeamStat, rankText } from "../../utils/teamStats";
import { RankChip } from "./RankChip";

const LINEUP = [
  { id: "back_play", position: "rb", short: "RB", name: "Backs" },
  { id: "te_play", position: "te", short: "TE", name: "Tight ends" },
  { id: "wr_play", position: "wr", short: "WR", name: "Receivers" },
];
const LINEUP_ROWS = ["two_back", "te_play", "wr_play"];

function LineupBar({ values, league = false }) {
  const total = LINEUP.reduce((sum, spot) => sum + (values[spot.id] ?? 0), 0) || 5;
  return (
    <div className="relative flex overflow-hidden rounded-[9px]" style={{ height: league ? 18 : 30, background: "color-mix(in srgb, var(--fg) 8%, transparent)" }}>
      {LINEUP.map((spot) => {
        const value = values[spot.id] ?? 0;
        return (
          <div
            key={spot.id}
            className="stat-num flex items-center justify-center overflow-hidden whitespace-nowrap font-semibold"
            style={{ flex: `0 0 ${(value / total) * 100}%`, fontSize: league ? 10 : 11.5, background: `color-mix(in srgb, var(--position-${spot.position}) 58%, var(--surface-solid))`, color: league ? "color-mix(in srgb, var(--fg) 80%, transparent)" : "var(--fg)" }}
            title={`${spot.name} per play: ${formatTeamStat(value, "num2")}`}
          >
            {value >= 0.45 && formatTeamStat(value, "num2")}
            {value >= 0.45 && !league && <span className="hidden sm:inline">{"\u00a0"}{spot.short}</span>}
          </div>
        );
      })}
      <span className="pointer-events-none absolute inset-0">
        {[1, 2, 3, 4].map((i) => <i key={i} className="absolute inset-y-0 -ml-px w-0.5" style={{ left: `${i * 20}%`, background: "var(--surface-solid)", opacity: 0.55 }} />)}
      </span>
    </div>
  );
}

function Lineup({ board, abbreviation }) {
  const values = board.values;
  const metrics = Object.fromEntries((board.metrics ?? []).map((metric) => [metric.id, metric]));
  const mine = Object.fromEntries(LINEUP.map((spot) => [spot.id, values[spot.id]?.o?.[abbreviation]?.[0]]));
  const league = Object.fromEntries(LINEUP.map((spot) => [spot.id, values[spot.id]?.o_mean]));
  const label = "w-[52px] shrink-0 text-[11.5px] font-semibold text-muted";
  return (
    <>
      <div className="grid gap-2">
        <div className="flex items-center gap-2.5"><span className={label}>{abbreviation}</span><div className="min-w-0 flex-1"><LineupBar values={mine} /></div></div>
        <div className="flex items-center gap-2.5"><span className={label}>League</span><div className="min-w-0 flex-1"><LineupBar values={league} league /></div></div>
        <div className="flex gap-2.5"><span className="w-[52px] shrink-0" /><div className="stat-num flex flex-1 justify-between text-[10px] text-faint">{[0, 1, 2, 3, 4, 5].map((n) => <span key={n}>{n}</span>)}</div></div>
        <div className="flex flex-wrap gap-3 text-[11px] text-muted">
          {LINEUP.map((spot) => (
            <span key={spot.id} className="flex items-center gap-1.5"><i className="inline-block h-[9px] w-[9px] rounded-[3px]" style={{ background: `var(--position-${spot.position})` }} />{spot.name}</span>
          ))}
        </div>
      </div>
      <div className="mt-3.5 border-t border-line">
        {LINEUP_ROWS.map((id) => {
          const metric = metrics[id];
          const entry = values[id]?.o?.[abbreviation];
          const count = Object.keys(values[id]?.o ?? {}).length || 32;
          return (
            <div key={id} className="grid grid-cols-[minmax(0,1fr)_auto_auto_64px] items-center gap-2.5 border-b border-line py-2 text-[12.5px]">
              <span className="cursor-help text-muted" title={metric?.desc ?? ""}>{TEAM_STAT_LABEL[id]}</span>
              <span className="stat-num text-[15px] font-semibold" style={{ color: rankText(entry?.[1], count) }}>{formatTeamStat(entry?.[0], metric?.fmt)}</span>
              <RankChip rank={entry?.[1]} of={count} />
              <span className="stat-num text-right text-[11.5px] text-faint">Lg {formatTeamStat(values[id]?.o_mean, metric?.fmt)}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

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

export function PersonnelCards({ cards, season, weeksLabel, lagWeek, board, abbreviation }) {
  const maxShare = Math.max(...(cards ?? []).map((card) => Math.max(card.share ?? 0, card.league_share ?? 0)), 0.01);
  const hasLineup = board?.values?.te_play?.o?.[abbreviation] != null;
  const hasCards = cards?.length > 0;
  return (
    <section className="glass-card p-4">
      <h2 className="text-[15px] font-semibold tracking-tight text-fg">Personnel</h2>
      {hasLineup && (
        <>
          <p className="mb-3 text-[11.5px] text-faint">{weeksLabel} {"·"} average on the field per play</p>
          <Lineup board={board} abbreviation={abbreviation} />
        </>
      )}
      {hasCards && <p className={`mb-3 text-[11.5px] text-faint ${hasLineup ? "mt-4" : ""}`}>{lagWeek ? `Through Week ${lagWeek}` : weeksLabel} {"·"} usage, EPA and success in each grouping</p>}
      {hasCards ? (
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
      ) : !hasLineup && (
        <p className="mt-3 rounded-xl border border-dashed border-line px-3 py-6 text-center text-sm text-muted">
          {season >= 2013 ? "Personnel for this season is not loaded yet." : "Personnel data starts in 2013."}
        </p>
      )}
    </section>
  );
}
