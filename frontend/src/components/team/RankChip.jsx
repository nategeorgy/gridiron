// A rank ("3rd") tinted by the player boards' percentile colour: green toward 1st, red
// toward last, neutral in the middle.
import { ordinal } from "../../utils/format";
import { rankFill, rankText } from "../../utils/teamStats";

export function RankChip({ rank, of = 32 }) {
  if (!rank) return <span className="stat-num rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-faint">{"—"}</span>;
  return (
    <span
      className="stat-num inline-block rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-none"
      style={{ background: `color-mix(in srgb, ${rankFill(rank, of, 34)}, color-mix(in srgb, var(--fg) 7%, transparent))`, color: rankText(rank, of) }}
      title={`${ordinal(rank)} of ${of}`}
    >
      {ordinal(rank)}
    </span>
  );
}
