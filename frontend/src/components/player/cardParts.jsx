// Pieces the player card and the head-to-head share (October 2026).
//
// Both are the tweet kit's cards (D1 and D6 in tools/tweetkit/src/player.js) brought onto
// the page, so their marks are the tweet's: a percentile is a line to a ringed bubble
// holding the number, coloured red through yellow to green, on a faint full-length track.
import { scoringLabel } from "../../constants/scoring";
import { formatSigned, formatStat } from "../../utils/format";
import { gameColors } from "../game/colors";

const POSITION_NAMES = { QB: "quarterbacks", RB: "running backs", WR: "receivers", TE: "tight ends" };

/** "receivers", for "Percentile among receivers". */
export const positionName = (position) => POSITION_NAMES[position] ?? `${position}s`;

/** A faint fill for a row stripe or a tile panel: ink on the surface, so both themes get one. */
export const tint = (amount) => `color-mix(in srgb, var(--fg) ${amount}%, transparent)`;

/** A card stat's label, with "{scoring}" read as the preset's name ("PPR points per game"). */
export const statLabel = (stat, scoring) => stat.label.replace("{scoring}", scoringLabel(scoring));

/** A card stat's value. "pct0" is a share to the whole percent; a dash when missing. */
export function cardValue(value, stat) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  if (stat.format === "pct0") return `${Math.round(value * 100)}%`;
  return stat.signed ? formatSigned(value, stat.format) : formatStat(value, stat.format);
}

/**
 * A percentile's colour: red at 0, the scale's yellow at 50, green at 100. The tweet
 * card's own scale, where the rest of the page fades its tints to grey at the median.
 */
export function percentileScale(percentile) {
  if (percentile === null || percentile === undefined) return "var(--faint)";
  return percentile >= 50
    ? `color-mix(in srgb, var(--pos) ${Math.round(((percentile - 50) / 50) * 100)}%, var(--scale-mid))`
    : `color-mix(in srgb, var(--neg) ${Math.round(((50 - percentile) / 50) * 100)}%, var(--scale-mid))`;
}

/** Each team's ring colour, two that differ when both are on screen (`gameColors`). */
export function ringColors(leftTeam, rightTeam) {
  const { away, home } = gameColors(leftTeam, rightTeam);
  return [away, home];
}

/**
 * A percentile as a line from one end of its track, ending in a bubble with the number.
 * `from` is the end the line starts at: the card reads left to right, while each side of
 * the head-to-head grows outward from the label between them.
 */
export function PercentileBar({ percentile, from = "left", size = 26 }) {
  const color = percentileScale(percentile);
  const half = size / 2;
  // How far the bubble's centre travels from the track's first end: none at 0, all of it at 100.
  const travel = `calc((100% - ${size}px) * ${percentile / 100})`;
  const anchor = from === "left" ? "left" : "right";
  return (
    <span className="relative block" style={{ height: size }}>
      <i
        className="absolute top-1/2 block h-1.5 -translate-y-1/2 rounded-full"
        style={{ left: half, right: half, background: tint(12) }}
      />
      <i
        className="absolute top-1/2 block h-1.5 -translate-y-1/2 rounded-full"
        style={{ [anchor]: half, width: travel, background: color }}
      />
      <span
        className="stat-num absolute top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full font-extrabold text-fg"
        style={{
          [anchor]: travel,
          width: size,
          height: size,
          fontSize: size * 0.42,
          border: `2px solid ${color}`,
          background: `color-mix(in srgb, ${color} 30%, var(--surface-solid))`,
        }}
      >
        {percentile}
      </span>
    </span>
  );
}
