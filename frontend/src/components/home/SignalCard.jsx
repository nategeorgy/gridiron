// Underperformers / Regression Candidates (M10).
//
// Each row is a dumbbell between what the opportunity was worth and what the player
// actually scored, with the gap shaded between them. The direction of the dumbbell is
// the signal: filled dot left of hollow means he is behind his usage, right means
// ahead of it.
//
// **Not red and green, on purpose.** "Below expected" is a *buy* — colouring it red
// would tell the reader the opposite of what the card means, and colouring it green
// would make a deficit look like an achievement. Blue reads cold, amber reads hot, and
// neither borrows the meaning `--pos` / `--neg` carry everywhere else in the app.
import { Link } from "react-router-dom";
import { PositionTag } from "../PositionTag";
import { Card, CardHead, CardLink, CardState } from "./primitives";
import { formatStat, formatSigned } from "../../utils/format";

const TONE = {
  under: { color: "var(--series-1)", title: "Underperformers", link: "/insight/buy-low" },
  over: { color: "var(--warn)", title: "Regression Candidates", link: "/insight/sell-high" },
};

const BLURB = {
  under: "Scoring below what was expected, given the opportunity.",
  over: "Scored far above expectations given the usage.",
};

function GapRow({ row, tone, scale }) {
  const expected = row.expected_fantasy_points;
  const actual = row.fantasy_points;
  if (expected == null || actual == null) return null;

  const from = (expected / scale) * 100;
  const to = (actual / scale) * 100;
  const [low, high] = from < to ? [from, to] : [to, from];

  return (
    <Link
      to={`/players/${row.player_id}`}
      className="grid grid-cols-[minmax(0,1fr)_66px] items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2 transition hover:border-edge hover:bg-surface-2/70"
    >
      <span className="block min-w-0">
        <span className="block text-[12.5px] font-semibold text-fg">
          {row.name}
          <PositionTag position={row.position} variant="quiet" className="ml-1.5" />
          <span className="ml-1.5 text-[10.5px] font-normal text-faint">{row.team_abbreviation}</span>
        </span>

        <span className="relative mt-2 block h-3.5">
          <i className="absolute inset-x-0 top-1.5 h-0.5 rounded bg-line" />
          <i
            className="absolute top-[5.5px] h-[3px] rounded"
            style={{ left: `${low}%`, width: `${high - low}%`, background: tone.color }}
          />
          <i
            className="absolute top-0.5 h-2.5 w-2.5 -translate-x-1/2 rounded-full border-2 border-faint bg-surface-solid"
            style={{ left: `${from}%` }}
            title={`expected ${formatStat(expected, 1)}`}
          />
          <i
            className="absolute top-0.5 h-2.5 w-2.5 -translate-x-1/2 rounded-full"
            style={{
              left: `${to}%`,
              background: tone.color,
              boxShadow: `0 0 0 3px color-mix(in srgb, ${tone.color} 20%, transparent)`,
            }}
            title={`actual ${formatStat(actual, 1)}`}
          />
        </span>

        <span className="stat-num mt-1 block text-[10px] text-faint">
          {formatStat(expected, 1)} expected · {formatStat(actual, 1)} actual
        </span>
        {row.note && (
          <span className="mt-1 block text-[10px] leading-snug" style={{ color: "var(--warn)" }}>
            {row.note}
          </span>
        )}
      </span>

      <span className="block text-right">
        <b className="stat-num block text-[12.5px] font-bold" style={{ color: tone.color }}>
          {formatSigned(row.fantasy_points_over_expected, 1)}
        </b>
      </span>
    </Link>
  );
}

export function SignalCard({ kind, season, rows, isLoading, isError }) {
  const tone = TONE[kind];
  // One scale for the card, so the rows are comparable with each other rather than
  // each stretching to fill its own track.
  const scale =
    Math.max(
      ...rows.flatMap((row) => [row.expected_fantasy_points ?? 0, row.fantasy_points ?? 0]),
      1,
    ) * 1.06;

  return (
    <Card>
      <CardHead title={tone.title} sub={`${season} · your scoring`} />
      <p className="mb-1 text-[11.5px] leading-relaxed text-muted">{BLURB[kind]}</p>
      <p className="mb-2.5 flex items-center gap-3 text-[9.5px] font-semibold uppercase tracking-[0.04em] text-faint">
        <span>
          <i className="mr-1 inline-block h-2 w-2 -translate-y-px rounded-full border-2 border-faint bg-surface-solid align-middle" />
          Expected
        </span>
        <span>
          <i
            className="mr-1 inline-block h-2 w-2 -translate-y-px rounded-full align-middle"
            style={{ background: tone.color }}
          />
          Actual
        </span>
      </p>

      <CardState isLoading={isLoading} isError={isError} isEmpty={rows.length === 0} rows={3} />
      <div className="flex-1">
        {rows.map((row) => (
          <GapRow key={row.player_id} row={row} tone={tone} scale={scale} />
        ))}
      </div>
      <CardLink to={tone.link}>Full {kind === "under" ? "buy-low" : "sell-high"} board</CardLink>
    </Card>
  );
}
